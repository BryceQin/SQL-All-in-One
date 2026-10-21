// 语言配置生成物测试（docs/prd/025-语言配置.md §5）：
// 1. 结构校验：12 份语言配置文件存在、覆盖全部注册语言
// 2. golden 再生成：buildLanguageConfiguration 输出与磁盘文件一致，防止方言配置更新后漂移
// 3. package.json 一致性：languages 贡献点 configuration 字段 ↔ 约定路径 ↔ 磁盘文件
// 4. 派生规则断言：注释符 / 括号 / 自动闭合对的方言差异
//    （方括号来自 extraParens/identTypes，引号来自 stringTypes/identTypes 的实际使用）

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { buildLanguageConfiguration, type LanguageConfiguration } from "../grammar/languageConfigBuilder";
import { dialectGrammarConfigs } from "../grammar/dialectGrammarConfigs";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_DIR = path.join(PROJECT_ROOT, "language-configurations");

interface PkgLanguage {
    id: string;
    configuration?: string;
}

function readConfigFile(langId: string): LanguageConfiguration {
    return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, `${langId}.language-configuration.json`), "utf8")) as LanguageConfiguration;
}

function autoCloseOpens(config: LanguageConfiguration): string[] {
    return config.autoClosingPairs.map((pair) => pair.open);
}

function bracketOpens(config: LanguageConfiguration): string[] {
    return config.brackets.map(([open]) => open);
}

// ----------------------------------------------------------------------------
// 1-3. 生成物结构与一致性
// ----------------------------------------------------------------------------

suite("Language Configuration Generation", () => {
    test("12 份语言配置文件存在且覆盖全部注册语言", () => {
        assert.strictEqual(dialectGrammarConfigs.length, 12);
        for (const config of dialectGrammarConfigs) {
            const file = path.join(CONFIG_DIR, `${config.langId}.language-configuration.json`);
            assert.ok(fs.existsSync(file), `缺失 ${file}`);
        }
    });

    test("golden：磁盘文件与 buildLanguageConfiguration 输出一致（防漂移）", () => {
        for (const config of dialectGrammarConfigs) {
            const file = path.join(CONFIG_DIR, `${config.langId}.language-configuration.json`);
            const expected = JSON.stringify(buildLanguageConfiguration(config), null, 4) + "\n";
            const actual = fs.readFileSync(file, "utf8");
            assert.strictEqual(actual, expected, `${config.langId}: 语言配置与生成器输出不一致，请运行 npm run generate-language-configs`);
        }
    });

    test("package.json languages 贡献点均挂接 configuration 且路径与磁盘一致", () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")) as {
            contributes: { languages: PkgLanguage[] };
        };
        const expectedLangIds = new Set(dialectGrammarConfigs.map((c) => c.langId));
        assert.strictEqual(pkg.contributes.languages.length, 12);
        for (const entry of pkg.contributes.languages) {
            assert.ok(expectedLangIds.has(entry.id), `package.json 语言 ${entry.id} 未在 dialectGrammarConfigs 注册`);
            const expectedPath = `./language-configurations/${entry.id}.language-configuration.json`;
            assert.strictEqual(entry.configuration, expectedPath, `语言 ${entry.id} 的 configuration 路径不符合约定`);
            assert.ok(fs.existsSync(path.join(PROJECT_ROOT, entry.configuration)), `configuration 文件不存在: ${entry.configuration}`);
        }
    });

    // ----------------------------------------------------------------------------
    // 4. 派生规则
    // ----------------------------------------------------------------------------

    test("全部方言：行注释 --、块注释 /* */、圆括号与闭合对的 notIn", () => {
        for (const config of dialectGrammarConfigs) {
            const c = readConfigFile(config.langId);
            assert.strictEqual(c.comments.lineComment, "--", `${config.langId}: 行注释符应为 --`);
            assert.deepStrictEqual(c.comments.blockComment, ["/*", "*/"], `${config.langId}: 块注释符应为 /* */`);
            assert.ok(bracketOpens(c).includes("("), `${config.langId}: brackets 缺少圆括号`);
            for (const pair of c.autoClosingPairs) {
                assert.deepStrictEqual(pair.notIn, ["string", "comment"], `${config.langId}: 自动闭合对 ${pair.open} 缺少 notIn`);
            }
        }
    });

    test("方言差异：方括号与引号种的派生快照", () => {
        // 方括号：extraParens（Hive/Spark/PG/BigQuery/SQLite）或 identTypes（SQL Server）任一使用 [] 即启用
        for (const langId of ["hive", "spark", "postgresql", "bigquery", "sqlite", "sqlserver"]) {
            assert.ok(bracketOpens(readConfigFile(langId)).includes("["), `${langId}: 应派生方括号`);
        }
        for (const langId of ["sql", "mysql", "flinksql", "starrocks", "plsql", "dameng"]) {
            assert.ok(!bracketOpens(readConfigFile(langId)).includes("["), `${langId}: 不应派生方括号`);
        }
        // 反引号：identTypes 含 `` 的方言
        for (const langId of ["sql", "hive", "mysql", "spark", "flinksql", "bigquery", "sqlite", "starrocks"]) {
            assert.ok(autoCloseOpens(readConfigFile(langId)).includes("`"), `${langId}: 应派生反引号闭合`);
        }
        for (const langId of ["sqlserver", "plsql", "dameng"]) {
            assert.ok(!autoCloseOpens(readConfigFile(langId)).includes("`"), `${langId}: 不应派生反引号闭合`);
        }
        // 单引号与双引号：全部方言的 stringTypes 均含引号字符串
        for (const config of dialectGrammarConfigs) {
            const opens = autoCloseOpens(readConfigFile(config.langId));
            assert.ok(opens.includes("'"), `${config.langId}: 应派生单引号闭合`);
            assert.ok(opens.includes('"'), `${config.langId}: 应派生双引号闭合`);
        }
    });
});
