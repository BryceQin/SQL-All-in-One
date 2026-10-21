// VSCode 语言配置生成器：把方言 tokenizer 配置转译为 language-configuration.json。
//
// 转译原则（与 grammarBuilder 同构，见 docs/prd/025-语言配置.md）：
// 1. 数据单一来源：直接消费 DialectOptions.tokenizerOptions —— 行注释符来自
//    lineCommentTypes，括号对来自 extraParens / identTypes，自动闭合引号来自
//    stringTypes / identTypes 实际使用的引号种类，不维护第二份清单。
// 2. 保守派生：语言配置影响全部基础编辑行为（注释切换、括号匹配、自动闭合、
//    环绕选中），仅生成有确定数据来源的字段；onEnterRules / indentationRules /
//    wordPattern 等无来源特性一律不生成（错误的缩进规则比缺失更糟）。
//
// 与 tokenizer 的有意差异：
// - VSCode 仅支持单一行注释符，取 lineCommentTypes 首个（SQL 标准 --；
//   MySQL/BigQuery/StarRocks 的 # 仍由语法高亮着色，仅不参与 Cmd+/ 切换）。
// - {} 不进入 brackets：hive/spark 的 ${var} 是 requirePrefix 变量语法，
//   tokenizer 亦不将其作为括号处理。

import type { QuoteType } from "../lexer/TokenizerOptions";
import type { DialectGrammarConfig } from "./dialectGrammarConfigs";

// ----------------------------------------------------------------------------
// VSCode 语言配置类型（仅覆盖本生成器用到的字段）
// ----------------------------------------------------------------------------

/** 自动闭合对（notIn：光标位于这些 scope 内时不触发自动闭合） */
export interface AutoClosingPair {
    open: string;
    close: string;
    notIn?: string[];
}

/** VSCode language-configuration.json 的生成器子集 */
export interface LanguageConfiguration {
    comments: {
        lineComment: string;
        blockComment: [string, string];
    };
    brackets: [string, string][];
    autoClosingPairs: AutoClosingPair[];
    surroundingPairs: [string, string][];
}

// ----------------------------------------------------------------------------
// 派生逻辑
// ----------------------------------------------------------------------------

/** QuoteType → quotePatterns 键（PrefixedQuoteType 取其 quote；RegexPattern 无键返回 null） */
function quoteKeyOf(entry: QuoteType): string | null {
    if (typeof entry === "string") return entry;
    if ("quote" in entry) return entry.quote;
    return null;
}

/** 从 stringTypes / identTypes 收集该方言实际使用的引号字符（' " `） */
function collectQuoteChars(entries: QuoteType[]): Set<string> {
    const chars = new Set<string>();
    for (const entry of entries) {
        // RegexPattern 条目（如 BigQuery r'…'）：按正则中出现的引号字符判断
        if (typeof entry !== "string" && "regex" in entry) {
            if (entry.regex.includes("'")) chars.add("'");
            if (entry.regex.includes('"')) chars.add('"');
            continue;
        }
        // PlainQuoteType / PrefixedQuoteType：$$ 美元引号、{} 变量、[] 引用标识符等
        // 无引号字符的键不命中任何分支，自然跳过
        const key = typeof entry === "string" ? entry : entry.quote;
        if (key.startsWith("''") || key === "q''") {
            chars.add("'");
        } else if (key.startsWith('""')) {
            chars.add('"');
        } else if (key === "``") {
            chars.add("`");
        }
    }
    return chars;
}

// ----------------------------------------------------------------------------
// 主入口
// ----------------------------------------------------------------------------

export function buildLanguageConfiguration(config: DialectGrammarConfig): LanguageConfiguration {
    const t = config.options.tokenizerOptions;

    // 1. 行注释符：VSCode 仅支持一个，取 lineCommentTypes 首个（默认 --）
    const lineCommentTypes = t.lineCommentTypes ?? ["--"];
    if (lineCommentTypes.length === 0) {
        throw new Error(`${config.langId}: lineCommentTypes 为空数组（应省略该字段以使用默认 --）`);
    }
    const lineComment = lineCommentTypes[0];
    if (lineComment === "" || lineComment !== lineComment.trim()) {
        throw new Error(`${config.langId}: 行注释符非法 "${lineComment}"`);
    }

    // 2. 方括号：extraParens（数组下标）或 identTypes（引用标识符）任一使用 [] 即启用
    const usesSquareBrackets = (t.extraParens ?? []).includes("[]") || t.identTypes.some((e) => quoteKeyOf(e) === "[]");

    // 3. 引号字符：stringTypes ∪ identTypes 实际使用的引号（' " `）
    const quoteChars = collectQuoteChars([...t.stringTypes, ...t.identTypes]);

    // 4. 组装（顺序确定：括号在前、引号按 ' " ` 排序，保证生成物稳定可 diff）
    const notIn: string[] = ["string", "comment"];
    const autoClosingPairs: AutoClosingPair[] = [
        { open: "(", close: ")", notIn },
        ...(usesSquareBrackets ? [{ open: "[", close: "]", notIn }] : []),
        ...(["'", '"', "`"] as const).filter((ch) => quoteChars.has(ch)).map((ch) => ({ open: ch, close: ch, notIn })),
    ];

    return {
        comments: { lineComment, blockComment: ["/*", "*/"] },
        brackets: usesSquareBrackets
            ? [
                  ["(", ")"],
                  ["[", "]"],
              ]
            : [["(", ")"]],
        autoClosingPairs,
        // VSCode 文档：surroundingPairs 缺省时回退 autoClosingPairs，此处显式生成便于审阅
        surroundingPairs: autoClosingPairs.map((p) => [p.open, p.close] as [string, string]),
    };
}
