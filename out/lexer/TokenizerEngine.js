"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lineColFromIndex_1 = require("./lineColFromIndex");
const regexUtil_1 = require("./regexUtil");
// SQL/自定义 DSL 词法分析的核心执行类
class TokenizerEngine {
    // 待处理的原始 SQL 输入字符串
    input = "";
    // 词法分析的位置指针（0-based），跟踪当前处理到的字符索引
    index = 0;
    // 参数属性手动改写
    rules;
    dialectName;
    // 构造函数：接收 Token 规则列表和方言名称
    constructor(rules, dialectName) {
        this.rules = rules;
        this.dialectName = dialectName;
    }
    // 提供方言相关提示
    dialectInfo() {
        if (this.dialectName === "sql") {
            return (`This likely happens because you're using the default "sql" dialect.\n` +
                `If possible, please select a more specific dialect (like sqlite, postgresql, etc).`);
        }
        else {
            return `SQL dialect used: "${this.dialectName}".`;
        }
    }
    // 当无规则匹配时，生成带「上下文文本」「行号列号」「方言信息」的友好错误
    createParseError() {
        // 截取当前位置后 10 个字符作为错误上下文，便于定位
        const text = this.input.slice(this.index, this.index + 10);
        // 转换为 1-based 行号列号（用户友好）
        const { line, col } = (0, lineColFromIndex_1.lineColFromIndex)(this.input, this.index);
        return new Error(`Parse error: Unexpected "${text}" at line ${line} column ${col}.\n${this.dialectInfo()}`);
    }
    // 自动跳过空白字符
    getWhitespace() {
        // 关键：将空白正则的匹配起始位置设为当前 index
        regexUtil_1.WHITESPACE_REGEX.lastIndex = this.index;
        const matches = regexUtil_1.WHITESPACE_REGEX.exec(this.input);
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
    match(rule) {
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
            const token = {
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
    getNextToken() {
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
    tokenize(input) {
        // 1. 初始化：重置输入和位置指针，初始化 Token 结果数组
        this.input = input;
        this.index = 0;
        const tokens = [];
        let token;
        // 新增：计数器，防止无限循环导致程序卡死
        // let loopCount = 0;
        // const MAX_LOOP = 1000; // 设定最大循环次数
        // 2. 循环分析：直到处理完输入字符串的所有字符
        while (this.index < this.input.length) {
            // console.log(
            //     `循环次数: ${loopCount}, 当前index: ${this.index}, 输入长度: ${this.input.length}`
            // );
            // // 新增：超过最大循环次数，强制终止并抛出错误
            // if (loopCount++ > MAX_LOOP) {
            //     throw new Error(
            //         `疑似死循环！index=${
            //             this.index
            //         } 长时间未递增，输入内容: ${input.slice(
            //             this.index,
            //             this.index + 20
            //         )}`
            //     );
            // }
            // 2.1 跳过当前位置的所有空白字符（空格、制表符、换行符等）
            const precedingWhitespace = this.getWhitespace();
            // console.log(`跳过空白后index: ${this.index}`); // 检查空白处理是否递增index
            // 2.2 若跳过空白后仍未到输入末尾，尝试匹配下一个 Token
            if (this.index < this.input.length) {
                // 2.3 获取下一个有效 Token
                token = this.getNextToken();
                // console.log(
                //     `匹配Token后index: ${this.index}, Token: ${token?.type}`
                // ); // 检查Token匹配是否递增index
                // 2.4 匹配失败：抛出解析错误
                if (!token) {
                    throw this.createParseError();
                }
                // 2.5 收集 Token：合并空白信息，推入结果数组
                tokens.push({ ...token, precedingWhitespace });
            }
        }
        // 3. 返回结构化 Token 流
        return tokens;
    }
}
exports.default = TokenizerEngine;
//# sourceMappingURL=TokenizerEngine.js.map