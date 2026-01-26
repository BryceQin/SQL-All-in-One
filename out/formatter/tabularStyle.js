"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = toTabularFormat;
exports.isTabularToken = isTabularToken;
const token_1 = require("../lexer/token");
/**
 * 当制表符风格开启的时候将 Token 文本格式化为 10 字符宽度的字符串
 */
function toTabularFormat(tokenText, indentStyle) {
    if (indentStyle === "standard") {
        return tokenText;
    }
    let tail = []; // rest of keyword
    if (tokenText.length >= 10 && tokenText.includes(" ")) {
        // 若文本长度 ≥10 且包含空格（如 INNER JOIN/UNION DISTINCT），按空格拆分为「首段 + 剩余段」，仅处理首段
        ;
        [tokenText, ...tail] = tokenText.split(" ");
    }
    if (indentStyle === "tabularLeft") {
        tokenText = tokenText.padEnd(9, " ");
    }
    else {
        tokenText = tokenText.padStart(9, " ");
    }
    return tokenText + ["", ...tail].join(" ");
}
/**
 * 判断 Token 类型是否支持 tabular 格式化（仅特定关键字 / 运算符需对齐）
 */
function isTabularToken(type) {
    return ((0, token_1.isLogicalOperator)(type) ||
        type === token_1.TokenType.RESERVED_CLAUSE ||
        type === token_1.TokenType.RESERVED_SELECT ||
        type === token_1.TokenType.RESERVED_SET_OPERATION ||
        type === token_1.TokenType.RESERVED_JOIN ||
        type === token_1.TokenType.LIMIT);
}
//# sourceMappingURL=tabularStyle.js.map