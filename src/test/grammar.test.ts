// 语法高亮生成物测试（docs/prd/023-语法高亮功能.md §8）：
// 1. 结构校验：12 份语法文件存在、scopeName 唯一、include 与 repository 双向一致
// 2. golden 再生成：buildGrammar 输出与磁盘文件一致，防止关键字更新后语法文件漂移
// 3. package.json 一致性：grammars 贡献点 ↔ languages 注册 ↔ 磁盘文件
// 4. tokenize 冒烟：用 VSCode 自身的 TextMate 引擎（vscode-textmate + oniguruma WASM）
//    验证规则顺序（注释优先于操作符）、词边界、跨行结构等真实着色行为。
//    样例为行内形式（每方言多行输入），覆盖 PRD §8.2 要求的典型竞争场景。

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as oniguruma from "vscode-oniguruma";
import { INITIAL, Registry, parseRawGrammar, type IGrammar } from "vscode-textmate";
import { buildGrammar } from "../grammar/grammarBuilder";
import { dialectGrammarConfigs } from "../grammar/dialectGrammarConfigs";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const SYNTAXES_DIR = path.join(PROJECT_ROOT, "syntaxes");

interface Tok {
    text: string;
    scopes: string[];
}

type RuleStack = ReturnType<IGrammar["tokenizeLine"]>["ruleStack"];

// oniguruma WASM 每进程只能加载一次，模块级单例（mocha 全部测试共享同一进程）
const wasmBin = fs.readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm"));
const wasmBuffer = wasmBin.buffer.slice(wasmBin.byteOffset, wasmBin.byteOffset + wasmBin.byteLength) as ArrayBuffer;
const onigLibPromise = oniguruma.loadWASM(wasmBuffer).then(() => ({
    createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
    createOnigString: (s: string) => new oniguruma.OnigString(s),
}));

const scopeToFile = new Map<string, string>(
    dialectGrammarConfigs.map((c) => [c.scopeName, path.join(SYNTAXES_DIR, `${c.fileName}.tmLanguage.json`)] as const),
);

const registry = new Registry({
    onigLib: onigLibPromise,
    loadGrammar: async (scopeName: string) => {
        const file = scopeToFile.get(scopeName);
        if (!file) return null;
        return parseRawGrammar(fs.readFileSync(file, "utf8"), file);
    },
});

// 懒加载缓存（避免依赖特定 mocha hook 接口）
let grammarsPromise: Promise<Map<string, IGrammar>> | undefined;
function getGrammars(): Promise<Map<string, IGrammar>> {
    if (!grammarsPromise) {
        grammarsPromise = (async () => {
            const map = new Map<string, IGrammar>();
            for (const config of dialectGrammarConfigs) {
                const grammar = await registry.loadGrammar(config.scopeName);
                assert.ok(grammar, `无法加载语法 ${config.scopeName}`);
                map.set(config.langId, grammar);
            }
            return map;
        })();
    }
    return grammarsPromise;
}

// ----------------------------------------------------------------------------
// 断言辅助
// ----------------------------------------------------------------------------

function tokenizeLines(grammar: IGrammar, lines: string[]): Tok[][] {
    let stack: RuleStack = INITIAL;
    const result: Tok[][] = [];
    for (const line of lines) {
        const r = grammar.tokenizeLine(line, stack);
        stack = r.ruleStack;
        result.push(r.tokens.map((t) => ({ text: line.substring(t.startIndex, t.endIndex), scopes: t.scopes.slice() })));
    }
    return result;
}

async function tokenize(langId: string, lines: string[]): Promise<Tok[][]> {
    const grammars = await getGrammars();
    const grammar = grammars.get(langId);
    assert.ok(grammar, `语法未加载: ${langId}`);
    return tokenizeLines(grammar, lines);
}

function tokenWithText(toks: Tok[], text: string): Tok {
    // TextMate 会把未匹配文本连同前后空白合并为默认 token，故按裁剪后文本匹配
    const tok = toks.find((t) => t.text.trim() === text);
    assert.ok(tok, `未找到 token "${text}"，实际 token: ${toks.map((t) => JSON.stringify(t.text)).join(" ")}`);
    return tok;
}

function assertScope(tok: Tok, scope: string): void {
    assert.ok(tok.scopes.includes(scope), `token "${tok.text}" 期望 scope ${scope}，实际: ${tok.scopes.join(" ")}`);
}

function refuteScopeFamily(tok: Tok, scopePrefix: string): void {
    assert.ok(
        !tok.scopes.some((s) => s.startsWith(scopePrefix)),
        `token "${tok.text}" 不应具有 ${scopePrefix}* scope，实际: ${tok.scopes.join(" ")}`,
    );
}

function readGrammarFile(fileName: string): Record<string, unknown> {
    const file = path.join(SYNTAXES_DIR, `${fileName}.tmLanguage.json`);
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// 1-3. 生成物结构与一致性
// ----------------------------------------------------------------------------

suite("Grammar Generation", () => {
    test("12 份方言语法文件存在且与配置一致，scopeName 唯一", () => {
        assert.strictEqual(dialectGrammarConfigs.length, 12);
        const scopeNames = new Set<string>();
        for (const config of dialectGrammarConfigs) {
            const file = path.join(SYNTAXES_DIR, `${config.fileName}.tmLanguage.json`);
            assert.ok(fs.existsSync(file), `缺失 ${file}`);
            const g = readGrammarFile(config.fileName);
            assert.strictEqual(g.name, config.name, `${config.langId}: name 不一致`);
            assert.strictEqual(g.scopeName, config.scopeName, `${config.langId}: scopeName 不一致`);
            assert.ok(Array.isArray(g.patterns) && (g.patterns as unknown[]).length > 0, `${config.langId}: patterns 为空`);
            assert.ok(g.repository && typeof g.repository === "object", `${config.langId}: repository 缺失`);
            assert.ok(!scopeNames.has(config.scopeName), `scopeName 重复: ${config.scopeName}`);
            scopeNames.add(config.scopeName);
        }
    });

    test("golden：磁盘文件与 buildGrammar 输出一致（防漂移）", () => {
        for (const config of dialectGrammarConfigs) {
            const file = path.join(SYNTAXES_DIR, `${config.fileName}.tmLanguage.json`);
            const expected = JSON.stringify(buildGrammar(config), null, 4) + "\n";
            const actual = fs.readFileSync(file, "utf8");
            assert.strictEqual(actual, expected, `${config.langId}: 语法文件与生成器输出不一致，请运行 npm run generate-grammars`);
        }
    });

    test("patterns include 与 repository 规则双向一致", () => {
        for (const config of dialectGrammarConfigs) {
            const g = readGrammarFile(config.fileName);
            const includes = new Set<string>((g.patterns as { include: string }[]).map((p) => p.include));
            const repoKeys = new Set<string>(Object.keys(g.repository as Record<string, unknown>));
            for (const inc of includes) {
                assert.ok(inc.startsWith("#") && repoKeys.has(inc.slice(1)), `${config.langId}: include ${inc} 无对应 repository 规则`);
            }
            for (const key of repoKeys) {
                assert.ok(includes.has(`#${key}`), `${config.langId}: repository 规则 ${key} 未被引用`);
            }
        }
    });

    test("package.json grammars 贡献点与 languages 注册、磁盘文件一致", () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")) as {
            contributes: { grammars: { language: string; scopeName: string; path: string }[]; languages: { id: string }[] };
        };
        const grammarEntries = pkg.contributes.grammars;
        const languageIds = new Set(pkg.contributes.languages.map((l) => l.id));
        const entryLangs = new Set<string>();
        for (const entry of grammarEntries) {
            assert.ok(languageIds.has(entry.language), `grammar 语言 ${entry.language} 未注册在 contributes.languages`);
            entryLangs.add(entry.language);
            const file = path.join(PROJECT_ROOT, entry.path);
            assert.ok(fs.existsSync(file), `grammar 路径不存在: ${entry.path}`);
            const g = readGrammarFile(path.basename(entry.path, ".tmLanguage.json"));
            assert.strictEqual(g.scopeName, entry.scopeName, `${entry.path}: scopeName 与 package.json 声明不一致`);
        }
        for (const config of dialectGrammarConfigs) {
            assert.ok(entryLangs.has(config.langId), `语言 ${config.langId} 缺少 grammar 贡献点`);
        }
    });
});

// ----------------------------------------------------------------------------
// 4. tokenize 冒烟（真实 oniguruma 引擎）
// ----------------------------------------------------------------------------

suite("Grammar Tokenization", () => {
    test("hive: 词边界、注释优先于操作符", async () => {
        const [line] = await tokenize("hive", ["select x, selection from t -- not-an-operator"]);
        assertScope(tokenWithText(line, "select"), "keyword.other.sql");
        assertScope(tokenWithText(line, "from"), "keyword.other.sql");
        refuteScopeFamily(tokenWithText(line, "selection"), "keyword.other.sql");
        assertScope(tokenWithText(line, "-- not-an-operator"), "comment.line.double-dash.sql");
    });

    test("hive: 跨行块注释结束后恢复着色", async () => {
        const lines = await tokenize("hive", ["/* first line", "second line */ select 1"]);
        const closeTok = lines[1].find((t) => t.text.includes("*/"));
        assert.ok(closeTok, "未找到块注释结束 token");
        assertScope(closeTok, "comment.block.sql");
        assertScope(tokenWithText(lines[1], "select"), "keyword.other.sql");
        assertScope(tokenWithText(lines[1], "1"), "constant.numeric.sql");
    });

    test("hive: 多词短语 GROUP BY 容忍多空格、LATERAL VIEW、函数需后跟括号", async () => {
        const [line] = await tokenize("hive", ["select a from t group   by b"]);
        assertScope(tokenWithText(line, "group   by"), "keyword.other.sql");

        const [line2] = await tokenize("hive", ["SELECT movie, category FROM movies LATERAL VIEW explode(categories) t AS category"]);
        assertScope(tokenWithText(line2, "LATERAL VIEW"), "keyword.other.sql");
        assertScope(tokenWithText(line2, "explode"), "support.function.sql");
        assertScope(tokenWithText(line2, "AS"), "keyword.other.sql");
    });

    test("sql: 大小写不敏感、常量、数字（十六进制/科学计数）", async () => {
        const [line] = await tokenize("sql", ["SeLeCt NULL, TRUE, FALSE, 1.5e10, 0xFF FROM t"]);
        assertScope(tokenWithText(line, "SeLeCt"), "keyword.other.sql");
        assertScope(tokenWithText(line, "NULL"), "constant.language.sql");
        assertScope(tokenWithText(line, "TRUE"), "constant.language.sql");
        assertScope(tokenWithText(line, "FALSE"), "constant.language.sql");
        assertScope(tokenWithText(line, "1.5e10"), "constant.numeric.sql");
        assertScope(tokenWithText(line, "0xFF"), "constant.numeric.sql");
    });

    test("sql: 函数名后跟括号才着色（避免列名误报）", async () => {
        const [withParen] = await tokenize("sql", ["SELECT count(*) FROM t"]);
        assertScope(tokenWithText(withParen, "count"), "support.function.sql");
        const [withoutParen] = await tokenize("sql", ["SELECT count FROM t"]);
        refuteScopeFamily(tokenWithText(withoutParen, "count"), "support.function.sql");
    });

    test("mysql: # 行注释、反引号标识符、@ 变量", async () => {
        const [line] = await tokenize("mysql", ["SELECT `my col`, @total FROM t # trailing"]);
        assertScope(tokenWithText(line, "`my col`"), "string.quoted.other.backtick.sql");
        assertScope(tokenWithText(line, "@total"), "variable.other.sql");
        assertScope(tokenWithText(line, "# trailing"), "comment.line.number-sign.sql");
    });

    test("spark: ${} 变量", async () => {
        const [line] = await tokenize("spark", ["SELECT ${conf.val} FROM t"]);
        assertScope(tokenWithText(line, "${conf.val}"), "variable.other.sql");
    });

    test("postgresql: 跨行美元引号字符串、:: 操作符、:name 参数、双引号标识符、类型", async () => {
        const lines = await tokenize("postgresql", ["SELECT $$ first", "second $$ AS x"]);
        const dollarTok = lines[0].find((t) => t.text.includes("$$"));
        assert.ok(dollarTok, "未找到美元引号 token");
        assertScope(dollarTok, "string.quoted.other.dollar.sql");
        assertScope(tokenWithText(lines[1], "AS"), "keyword.other.alias.sql");

        const [line] = await tokenize("postgresql", ['SELECT "quoted col", x::int, :name FROM t']);
        assertScope(tokenWithText(line, '"quoted col"'), "string.quoted.double.sql");
        assertScope(tokenWithText(line, "::"), "keyword.operator.sql");
        assertScope(tokenWithText(line, "int"), "storage.type.sql");
        assertScope(tokenWithText(line, ":name"), "variable.parameter.sql");
    });

    test("bigquery: 三引号字符串、@param 参数、# 注释", async () => {
        const [line] = await tokenize("bigquery", ["SELECT '''triple''' AS x, @param FROM t # note"]);
        assertScope(tokenWithText(line, "triple"), "string.quoted.triple.single.sql");
        assertScope(tokenWithText(line, "@param"), "variable.parameter.sql");
        assertScope(tokenWithText(line, "# note"), "comment.line.number-sign.sql");
    });

    test("sqlite: 双引号标识符", async () => {
        const [line] = await tokenize("sqlite", ['SELECT "quoted col" FROM t']);
        assertScope(tokenWithText(line, '"quoted col"'), "string.quoted.double.sql");
    });

    test("starrocks: # 注释、@ 变量、? 位置参数", async () => {
        const [line] = await tokenize("starrocks", ["SELECT a FROM t WHERE b = ? AND c = @var # note"]);
        assertScope(tokenWithText(line, "?"), "variable.parameter.sql");
        assertScope(tokenWithText(line, "@var"), "variable.other.sql");
        assertScope(tokenWithText(line, "# note"), "comment.line.number-sign.sql");
    });

    test("sqlserver: 方括号标识符、N'' 字符串、@@ 系统变量", async () => {
        const [line] = await tokenize("sqlserver", ["SELECT [my table], @@ROWCOUNT, @id, N'str' FROM t"]);
        assertScope(tokenWithText(line, "[my table]"), "string.quoted.other.brackets.sql");
        assertScope(tokenWithText(line, "@@ROWCOUNT"), "variable.other.sql");
        assertScope(tokenWithText(line, "@id"), "variable.other.sql");
        assertScope(tokenWithText(line, "N'str'"), "string.quoted.single.sql");
    });

    test("plsql: q'' 字符串、:bind 参数、& 替换变量", async () => {
        const [line] = await tokenize("plsql", ["SELECT q'[it's]' AS x, :emp_id, &run FROM t"]);
        const qTok = line.find((t) => t.text.includes("q'") && t.scopes.some((s) => s.startsWith("string.")));
        assert.ok(qTok, "未找到 q'' 字符串 token");
        assertScope(tokenWithText(line, ":emp_id"), "variable.parameter.sql");
        assertScope(tokenWithText(line, "&run"), "variable.other.sql");
    });

    test("dameng: :emp_id 命名参数、:1 编号（经变量规则）", async () => {
        const [line] = await tokenize("dameng", ["SELECT :emp_id, :1 FROM t"]);
        assertScope(tokenWithText(line, ":emp_id"), "variable.parameter.sql");
        const bind = tokenWithText(line, ":1");
        assert.ok(
            bind.scopes.some((s) => s.startsWith("variable.")),
            `token ":1" 期望 variable.* scope，实际: ${bind.scopes.join(" ")}`,
        );
    });

    test("操作符与分隔符着色（含方言特有 <=>）", async () => {
        const [hiveLine] = await tokenize("hive", ["a <=> b, c <= d; (e)"]);
        assertScope(tokenWithText(hiveLine, "<=>"), "keyword.operator.sql");
        assertScope(tokenWithText(hiveLine, "<="), "keyword.operator.sql");
        assertScope(tokenWithText(hiveLine, ","), "punctuation.separator.comma.sql");
        assertScope(tokenWithText(hiveLine, ";"), "punctuation.terminator.statement.sql");
        assertScope(tokenWithText(hiveLine, "("), "punctuation.section.parens.begin.sql");
    });
});
