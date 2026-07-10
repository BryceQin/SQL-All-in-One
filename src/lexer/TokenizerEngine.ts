import type { Token, TokenType } from "./token";
import { lineColFromIndexFast, precomputeLineOffsets } from "./lineColFromIndex";
import { WHITESPACE_REGEX } from "./regexUtil";
import { t } from "../i18n";

// 是原生 RegExp 的最小兼容接口，解耦原生正则依赖、支持自定义复杂匹配
export interface RegExpLike {
    // 匹配位置跟踪属性：用于记录下一次匹配的起始索引（对应原生 RegExp 的 lastIndex）
    lastIndex: number;
    // 匹配执行方法：接收输入字符串，返回匹配结果或 null（对应原生 RegExp 的 exec 方法）
    exec(input: string): string[] | null;
}

// 让 lexer 可以按规则批量识别不同类型的 Token（如标识符、字符串、参数等）
export interface TokenRule {
    // Token 类型标识：匹配成功后生成的 Token 类型
    type: TokenType;
    // 匹配逻辑：可传入原生 RegExp（自动兼容）或自定义 RegExpLike 实现（复杂匹配）
    regex: RegExpLike;
    // 可选：文本处理函数：接收原始匹配文本，返回最终的 Token 文本
    text?: (rawText: string) => string;
    // 可选：键提取函数：接收原始匹配文本，返回 Token 的核心业务键（用于后续解析/绑定）
    key?: (rawText: string) => string;
}

// SQL/自定义 DSL 词法分析的核心执行类
export default class TokenizerEngine {
    // 待处理的原始 SQL 输入字符串
    private input = "";
    // 词法分析的位置指针（0-based），跟踪当前处理到的字符索引
    private index = 0;

    // 参数属性手动改写
    private rules: TokenRule[];
    private dialectName: string;

    // 构造函数：接收 Token 规则列表和方言名称
    constructor(rules: TokenRule[], dialectName: string) {
        this.rules = rules;
        this.dialectName = dialectName;
    }

    // 提供方言相关提示
    private dialectInfo(): string {
        if (this.dialectName === "sql") {
            return t("lexer.defaultDialectHint");
        } else {
            return t("lexer.currentDialect", this.dialectName);
        }
    }

    // 当无规则匹配时，生成带「上下文文本」「行号列号」「方言信息」的友好错误
    private createParseError(): Error {
        // 截取当前位置后 10 个字符作为错误上下文，便于定位
        const text = this.input.slice(this.index, this.index + 10);
        // 转换为 1-based 行号列号（用户友好）
        const lineStarts = precomputeLineOffsets(this.input);
        const { line, col } = lineColFromIndexFast(lineStarts, this.index);
        return new Error(t("lexer.parseError", String(line), String(col), text, this.dialectInfo()));
    }

    // 自动跳过空白字符
    private getWhitespace(): string | undefined {
        // 关键：将空白正则的匹配起始位置设为当前 index
        WHITESPACE_REGEX.lastIndex = this.index;

        const matches = WHITESPACE_REGEX.exec(this.input);
        if (matches) {
            // 推进位置指针：跳过匹配到的空白字符
            this.index += matches[0].length;
            // 返回空白文本
            return matches[0];
        }
        // 无空白字符时返回 undefined
        return undefined;
    }

    // 核心 Token 匹配逻辑
    private match(rule: TokenRule): Token | undefined {
        // 关键：将规则的 regex 匹配起始位置设为当前 index（兼容 RegExpLike）
        rule.regex.lastIndex = this.index;
        const matches = rule.regex.exec(this.input);

        if (matches) {
            // 获取原始匹配文本
            const matchedText = matches[0];

            // 新增：防止零长度匹配导致死循环
            if (matchedText.length === 0) {
                this.index += 1;
                return undefined;
                // throw new Error(
                //     `Zero-length token match at index ${
                //         this.index
                //     } for rule ${String(rule.type)}. regex=${rule.regex}.`
                // );
            }

            // 构造标准化 Token 对象
            const token: Token = {
                // Token 类型
                type: rule.type,
                // 原始匹配文本（未加工）
                raw: matchedText,
                // 可选加工后的文本
                text: rule.text ? rule.text(matchedText) : matchedText,
                // Token 在输入中的起始索引（0-based）
                start: this.index,
            };

            // 可选：提取 Token 业务键
            if (rule.key) {
                token.key = rule.key(matchedText);
            }

            // 推进位置指针：移动到 Token 结束后的位置
            this.index += matchedText.length;
            return token;
        }
        // 匹配失败
        return undefined;
    }

    // 按优先级匹配下一个 Token
    private getNextToken(): Token | undefined {
        // 遍历规则数组：先定义的规则优先匹配（关键特性）
        for (const rule of this.rules) {
            const token = this.match(rule);
            if (token) {
                // 找到第一个匹配的 Token，立即返回
                return token;
            }
        }
        // 所有规则均不匹配，返回 undefined
        return undefined;
    }

    /**
     * 对输入字符串进行词法分析，生成标记列表
     * @param input - 待分析的输入字符串
     * @returns 生成的标记数组
     */
    public tokenize(input: string): Token[] {
        // 1. 初始化：重置输入和位置指针，初始化 Token 结果数组
        this.input = input;
        this.index = 0;
        const tokens: Token[] = [];
        let token: Token | undefined;

        while (this.index < this.input.length) {
            const precedingWhitespace = this.getWhitespace();

            if (this.index < this.input.length) {
                token = this.getNextToken();

                if (!token) {
                    throw this.createParseError();
                }

                token.precedingWhitespace = precedingWhitespace;
                tokens.push(token);
            }
        }
        // 3. 返回结构化 Token 流
        return tokens;
    }
}
