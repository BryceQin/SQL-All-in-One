// TextMate 语法生成器：把方言的 tokenizer 配置转译为 .tmLanguage.json 结构。
//
// 转译原则（见 docs/prd/023-语法高亮功能.md §4）：
// 1. 数据单一来源：直接消费 DialectOptions.tokenizerOptions（关键字分类、引号规则、
//    注释配置均来自各方言 formatter，不维护第二份清单）。
// 2. 规则顺序 = src/lexer/Tokenizer.ts 的规则数组顺序（经过实战检验的优先级序列），
//    TextMate 的 first-match-wins 语义与之同构。
// 3. 正则片段复用 src/lexer 的 quotePatterns / prefixesPattern / escapeRegExp /
//    sortByLengthDesc（均为纯字符串工具，oniguruma 兼容）。
//
// 与 tokenizer 的有意差异（视觉优先，均有明确理由）：
// - 函数名要求后跟 `(`（零宽前瞻）才着色，避免与列名冲突（如 left/count/date）；
//   与 VSCode 内置 SQL 语法惯例一致。
// - 块注释、PG 美元引号串、BigQuery 三引号串用 begin/end 结构以支持跨行。
// - 属性访问符 `.` 不着色（主题噪声，内置语法同样不着色）。
// - 关键字增加前导 \b（tokenizer 仅靠后置 \b + 标识符先行吞掉，编辑器场景需要显式边界）。

import type { IdentChars, QuoteType, TokenizerOptions, VariableType } from "../lexer/TokenizerOptions";
import { quotePatterns } from "../lexer/regexFactory";
import { escapeRegExp, prefixesPattern } from "../lexer/regexUtil";
import { sortByLengthDesc } from "../lexer/utils";
import type { DialectGrammarConfig } from "./dialectGrammarConfigs";

// ----------------------------------------------------------------------------
// TextMate 规则类型（仅覆盖本生成器用到的字段）
// ----------------------------------------------------------------------------

export interface TmMatchRule {
    name?: string;
    match: string;
}

export interface TmBeginEndRule {
    name?: string;
    begin: string;
    end: string;
}

export type TmRule = TmMatchRule | TmBeginEndRule;

export interface TmGrammar {
    name: string;
    scopeName: string;
    patterns: { include: string }[];
    repository: Record<string, { patterns: TmRule[] }>;
}

// ----------------------------------------------------------------------------
// 基础工具
// ----------------------------------------------------------------------------

/** tokenizer 的标准运算符集合（Tokenizer.ts buildRulesAfterParams）+ 星号 */
const STANDARD_OPERATORS = ["+", "-", "/", ">", "<", "=", "<>", "<=", ">=", "!="];

/** 从 reservedKeywords 中提取为 constant.language 的布尔/空值字面量 */
const CONSTANT_WORDS = ["TRUE", "FALSE", "NULL"];

/** CASE 系列控制流关键字（Tokenizer.ts 的专用规则，所有方言硬编码） */
const CASE_CONTROL_WORDS = ["CASE", "WHEN", "THEN", "ELSE", "END", "BETWEEN"];

/** 词表清洗：剔除重复项；空串/前后空白为数据错误，直接抛出 */
function validateWords(words: string[], context: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const word of words) {
        if (word === "") {
            throw new Error(`${context}: 存在空字符串条目`);
        }
        if (word !== word.trim()) {
            throw new Error(`${context}: 条目含前后空白 "${word}"`);
        }
        if (!seen.has(word)) {
            seen.add(word);
            out.push(word);
        }
    }
    return out;
}

/** 复刻 regexFactory.rejectIdentCharsPattern：防止关键字吞掉含 $ 等扩展字符的标识符前缀 */
function rejectIdentCharsPattern(identChars?: IdentChars): string {
    const rest = identChars?.rest;
    const dashes = identChars?.dashes;
    return rest || dashes ? `(?![${rest || ""}${dashes ? "-" : ""}])` : "";
}

/** 关键字列表 → `(?i)\b(?:A|B C)\b` 形式的大小写不敏感词边界正则（多词空白匹配 \s+） */
function keywordPattern(words: string[], identChars: IdentChars | undefined, context: string): string | null {
    const cleaned = validateWords(words, context);
    if (cleaned.length === 0) return null;
    // sortByLengthDesc 就地排序，传入副本
    const sorted = sortByLengthDesc([...cleaned]);
    const body = sorted.map((w) => escapeRegExp(w).replace(/ /g, "\\s+")).join("|");
    return `(?i)\\b(?:${body})\\b${rejectIdentCharsPattern(identChars)}`;
}

/** 单条关键字类规则（列表为空时返回 null，调用方跳过该 include） */
function keywordRule(words: string[], scope: string, identChars: IdentChars | undefined, context: string): TmMatchRule | null {
    const match = keywordPattern(words, identChars, context);
    return match ? { match, name: scope } : null;
}

/** QuoteType → 正则字符串（复用 lexer 的 quotePatterns / prefixesPattern） */
function quoteEntryToPattern(entry: QuoteType): string {
    if (typeof entry === "string") {
        return quotePatterns[entry];
    }
    if ("regex" in entry) {
        return entry.regex;
    }
    return prefixesPattern(entry) + quotePatterns[entry.quote];
}

/** 引用标识符的 scope：按引号种类派生（PRD §4 Scope 映射表） */
function identScopeFor(entry: QuoteType): string {
    const key = typeof entry === "string" ? entry : "quote" in entry ? entry.quote : "";
    if (key === "``") return "string.quoted.other.backtick.sql";
    if (key === "[]") return "string.quoted.other.brackets.sql";
    return "string.quoted.double.sql";
}

/** 字符串字面量的 scope：按引号种类派生（三引号判断必须先于单/双引号） */
function stringScopeFor(entry: QuoteType): string {
    const key = typeof entry === "string" ? entry : "quote" in entry ? entry.quote : "";
    if (key === "$$") return "string.quoted.other.dollar.sql";
    if (key === "q''") return "string.quoted.other.sql";
    if (key.startsWith("'''")) return "string.quoted.triple.single.sql";
    if (key.startsWith('"""')) return "string.quoted.triple.double.sql";
    if (key.startsWith("''")) return "string.quoted.single.sql";
    if (key.startsWith('""')) return "string.quoted.double.sql";
    // 自定义 regex（如 BigQuery r'…'）：按模式中引号出现的先后判断
    const pattern = quoteEntryToPattern(entry);
    const singleIdx = pattern.indexOf("'");
    const doubleIdx = pattern.indexOf('"');
    return doubleIdx !== -1 && (singleIdx === -1 || doubleIdx < singleIdx) ? "string.quoted.double.sql" : "string.quoted.single.sql";
}

/**
 * 跨行字符串 → begin/end 结构（match 规则无法跨行）：
 * - PG 美元引号 $tag$...$tag$：begin 捕获 tag，end 用 \1 反向引用保证首尾同名
 * - BigQuery 三引号 '''...''' / """..."""
 */
function multiLineStringRule(entry: QuoteType): TmBeginEndRule | null {
    const dollar = { name: "string.quoted.other.dollar.sql", begin: "(\\$[A-Za-z0-9_]*\\$)", end: "\\1" };
    if (typeof entry === "string") {
        if (entry === "$$") return dollar;
        if (entry === "'''..'''") return { name: "string.quoted.triple.single.sql", begin: "'''", end: "'''" };
        if (entry === '""".."""') return { name: "string.quoted.triple.double.sql", begin: '"""', end: '"""' };
        return null;
    }
    if ("regex" in entry) {
        if (entry.regex.includes("'''")) return { name: "string.quoted.triple.single.sql", begin: "'''", end: "'''" };
        if (entry.regex.includes('"""')) return { name: "string.quoted.triple.double.sql", begin: '"""', end: '"""' };
        // PG 方言的美元引号以 regex 形式配置（\$.*?\$）
        if (entry.regex.startsWith("\\$") || entry.regex.includes("$$")) return dollar;
        return null;
    }
    return null;
}

/** 命名参数的标识符主体（ASCII 版 identifierPattern，规避 \p{Alphabetic} 的兼容性问题） */
function asciiIdentPattern(chars: IdentChars | undefined): string {
    const firstExtra = chars?.first ? escapeRegExp(chars.first) : "";
    const restExtra = chars?.rest ? escapeRegExp(chars.rest) : "";
    if (chars?.allowFirstCharNumber) {
        return `[A-Za-z0-9_${firstExtra}][A-Za-z0-9_${restExtra}]*`;
    }
    return `[A-Za-z_${firstExtra}][A-Za-z0-9_${restExtra}]*`;
}

/** 参数占位符规则（named / quoted / numbered / positional / custom，结构对应 buildParamRulesImpl） */
function parameterRules(t: TokenizerOptions): TmRule[] {
    const pt = t.paramTypes;
    if (!pt) return [];
    const rules: TmRule[] = [];
    const identBody = asciiIdentPattern(t.paramChars || t.identChars);

    if (pt.named && pt.named.length > 0) {
        const prefixes = pt.named.map(escapeRegExp).join("|");
        rules.push({ match: `(?:${prefixes})${identBody}`, name: "variable.parameter.sql" });
    }
    if (pt.quoted && pt.quoted.length > 0) {
        const prefixes = pt.quoted.map(escapeRegExp).join("|");
        const quotedBody = t.identTypes.map((q) => quoteEntryToPattern(q)).join("|");
        rules.push({ match: `(?:${prefixes})(?:${quotedBody})`, name: "variable.parameter.sql" });
    }
    if (pt.numbered && pt.numbered.length > 0) {
        const prefixes = pt.numbered.map(escapeRegExp).join("|");
        rules.push({ match: `(?:${prefixes})[0-9]+`, name: "variable.parameter.sql" });
    }
    if (pt.positional) {
        rules.push({ match: "\\?", name: "variable.parameter.sql" });
    }
    for (const custom of pt.custom ?? []) {
        rules.push({ match: custom.regex, name: "variable.parameter.sql" });
    }
    return rules;
}

/** 变量规则（@var / ${var} / :bind 等，合并为单一 alternation，对应 regexFactory.variable） */
function variableRules(t: TokenizerOptions): TmRule[] {
    if (!t.variableTypes) return [];
    const body = t.variableTypes.map((v: VariableType) => ("regex" in v ? v.regex : prefixesPattern(v) + quotePatterns[v.quote])).join("|");
    return [{ match: `(?:${body})`, name: "variable.other.sql" }];
}

// ----------------------------------------------------------------------------
// 主入口
// ----------------------------------------------------------------------------

export function buildGrammar(config: DialectGrammarConfig): TmGrammar {
    const t = config.options.tokenizerOptions;
    const ctx = config.langId;
    const repository: TmGrammar["repository"] = {};
    const includes: string[] = [];

    /** 注册一条 repository 规则（空规则跳过，不产生 include） */
    const add = (key: string, rules: TmRule[]): void => {
        if (rules.length === 0) return;
        repository[key] = { patterns: rules };
        includes.push(`#${key}`);
    };

    // --- 以下按 Tokenizer.ts 规则顺序转译（顺序即优先级，不得调整） ---

    // 1. 块注释（begin/end 支持跨行；nestedBlockComments 无方言启用，标准非嵌套即可）
    add("block-comment", [{ name: "comment.block.sql", begin: "/\\*", end: "\\*/" }]);

    // 2. 行注释（每个标记独立 scope）
    add(
        "line-comment",
        (t.lineCommentTypes ?? ["--"]).map((marker) => ({
            match: `${escapeRegExp(marker)}.*`,
            name: marker === "--" ? "comment.line.double-dash.sql" : "comment.line.number-sign.sql",
        })),
    );

    // 3. 引用标识符（identTypes，每类引号独立 scope）
    add(
        "quoted-identifier",
        t.identTypes.map((q) => ({ match: quoteEntryToPattern(q), name: identScopeFor(q) })),
    );

    // 4. 数字（tokenizer NUMBER 规则的 ASCII 化：负号归 operator、去 \p{Alphabetic}；
    //    前置 (?<![\w.]) 保证 a1 / t.5col 不被误着色，同时保留 .5 字面量）
    add("number", [
        {
            match: "(?i)(?<![\\w.])(?:0x[0-9a-fA-F]+|0b[01]+|[0-9]*\\.[0-9]+|[0-9]+(?:\\.[0-9]*)?)(?:[eE][-+]?[0-9]+(?:\\.[0-9]+)?)?(?!\\w)",
            name: "constant.numeric.sql",
        },
    ]);

    // 5. 多词关键字短语 / 多词类型短语（优先于单词规则，防短前缀吞长短语）
    const phrases = keywordRule(t.reservedKeywordPhrases ?? [], "keyword.other.sql", t.identChars, `${ctx}.reservedKeywordPhrases`);
    if (phrases) add("keyword-phrases", [phrases]);
    const dataTypePhrases = keywordRule(
        t.reservedDataTypePhrases ?? [],
        "storage.type.sql",
        t.identChars,
        `${ctx}.reservedDataTypePhrases`,
    );
    if (dataTypePhrases) add("data-type-phrases", [dataTypePhrases]);

    // 6. CASE 系列控制流（Tokenizer 专用规则的全集）
    add("case-control", [{ match: keywordPattern(CASE_CONTROL_WORDS, t.identChars, ctx)!, name: "keyword.control.sql" }]);

    // 7. 逻辑运算符 AND/OR（XOR 按 supportsXor）
    const logical = t.supportsXor ? ["AND", "OR", "XOR"] : ["AND", "OR"];
    add("logical-operators", [{ match: keywordPattern(logical, t.identChars, ctx)!, name: "keyword.operator.logical.sql" }]);

    // 8. 子句 / SELECT / 集合操作 / JOIN
    const clauses = keywordRule(t.reservedClauses, "keyword.other.sql", t.identChars, `${ctx}.reservedClauses`);
    if (clauses) add("clauses", [clauses]);
    const select = keywordRule(t.reservedSelect, "keyword.other.sql", t.identChars, `${ctx}.reservedSelect`);
    if (select) add("select", [select]);
    const setOps = keywordRule(t.reservedSetOperations, "keyword.other.sql", t.identChars, `${ctx}.reservedSetOperations`);
    if (setOps) add("set-operations", [setOps]);
    const joins = keywordRule(t.reservedJoins, "keyword.other.sql", t.identChars, `${ctx}.reservedJoins`);
    if (joins) add("joins", [joins]);

    // 9. 内建函数（零宽前瞻要求后跟 `(`，避免列名误着色；见文件头注释）
    const functions = keywordRule(t.reservedFunctionNames, "support.function.sql", t.identChars, `${ctx}.reservedFunctionNames`);
    if (functions) {
        add("functions", [{ ...functions, match: `${functions.match}(?=\\s*\\()` }]);
    }

    // 10. 数据类型
    const dataTypes = keywordRule(t.reservedDataTypes, "storage.type.sql", t.identChars, `${ctx}.reservedDataTypes`);
    if (dataTypes) add("data-types", [dataTypes]);

    // 11. 常量（TRUE/FALSE/NULL 从 reservedKeywords 中分离）+ 其余关键字
    const isConstant = (w: string): boolean => CONSTANT_WORDS.includes(w.toUpperCase());
    const constants = keywordRule(t.reservedKeywords.filter(isConstant), "constant.language.sql", t.identChars, `${ctx}.reservedKeywords`);
    if (constants) add("constants", [constants]);
    const keywords = keywordRule(
        t.reservedKeywords.filter((w) => !isConstant(w)),
        "keyword.other.sql",
        t.identChars,
        `${ctx}.reservedKeywords`,
    );
    if (keywords) add("keywords", [keywords]);

    // 11b. AS 别名关键字：PG / StarRocks 等方言的关键字表不含 AS（格式化器经
    // identAlias 后处理识别别名，tokenizer 无需匹配），但高亮缺失 AS 不可接受，
    // 故为所有方言统一补充（其余方言的关键字表已含 AS，重复匹配无害——先到先得）。
    add("as-alias", [{ match: "(?i)\\bAS\\b", name: "keyword.other.alias.sql" }]);

    // 12. 参数占位符 / 13. 变量
    add("parameters", parameterRules(t));
    add("variables", variableRules(t));

    // 14. 字符串字面量（跨行形式必须排在前，防止单引号空串规则吞掉三引号开头）
    const multiLine: TmRule[] = [];
    const singleLine: TmRule[] = [];
    for (const entry of t.stringTypes) {
        const multi = multiLineStringRule(entry);
        if (multi) {
            multiLine.push(multi);
        } else {
            singleLine.push({ match: quoteEntryToPattern(entry), name: stringScopeFor(entry) });
        }
    }
    add("strings", [...multiLine, ...singleLine]);

    // 15. 运算符（tokenizer 标准集 + 星号 + 方言扩展；属性访问符 . 不着色）
    const operators = sortByLengthDesc([...new Set([...STANDARD_OPERATORS, "*", ...(t.operators ?? [])])]);
    add("operators", [{ match: `(?:${operators.map(escapeRegExp).join("|")})`, name: "keyword.operator.sql" }]);

    // 16. 分隔符（; , 与括号，extraParens 扩展 [] / {}）
    const delimiters: TmRule[] = [
        { match: ";", name: "punctuation.terminator.statement.sql" },
        { match: ",", name: "punctuation.separator.comma.sql" },
    ];
    const opens = ["\\("];
    const closes = ["\\)"];
    if (t.extraParens?.includes("[]")) {
        opens.push("\\[");
        closes.push("\\]");
    }
    if (t.extraParens?.includes("{}")) {
        opens.push("\\{");
        closes.push("\\}");
    }
    delimiters.push(
        { match: opens.join("|"), name: "punctuation.section.parens.begin.sql" },
        { match: closes.join("|"), name: "punctuation.section.parens.end.sql" },
    );
    add("delimiters", delimiters);

    return {
        name: config.name,
        scopeName: config.scopeName,
        patterns: includes.map((key) => ({ include: key })),
        repository,
    };
}
