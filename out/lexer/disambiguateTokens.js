"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disambiguateTokens = disambiguateTokens;
const token_1 = require("./token");
/*
 * 解决 SQL Token 类型的二义性问题—— 分词阶段只能识别基础类型（如 RESERVED_FUNCTION_NAME），但无法结合上下文判断其真实语义。比如：
 *「SUM」如果后面跟 ( 是函数名，否则是普通标识符；
 * VARCHAR」如果后面跟 ( 是参数化数据类型（如 VARCHAR(255)），否则是普通数据类型；
 * foo」如果后面跟 [ 是数组标识符（foo[1]），否则是普通标识符；
 * 键字如果前后有 .（属性访问符），则是属性名而非关键字（如 table.column 中的 column 不是关键字）。
 */
function disambiguateTokens(tokens) {
    return tokens
        .map(propertyNameKeywordToIdent)
        .map(funcNameToIdent)
        .map(dataTypeToParameterizedDataType)
        .map(identToArrayIdent)
        .map(dataTypeToArrayKeyword);
}
// 如果「保留关键字 Token」前后有「属性访问符（.）」，则转为普通标识符（IDENTIFIER）—— 因为此时它是属性名，而非关键字
const propertyNameKeywordToIdent = (token, i, tokens) => {
    // 判断是否是保留关键字（RESERVED_* 类型）
    if ((0, token_1.isReserved)(token.type)) {
        // 找前一个非注释 Token，若为属性访问符则转标识符
        const prevToken = prevNonCommentToken(tokens, i);
        if (prevToken &&
            prevToken.type === token_1.TokenType.PROPERTY_ACCESS_OPERATOR) {
            return { ...token, type: token_1.TokenType.IDENTIFIER, text: token.raw };
        }
        // 找后一个非注释 Token，若为属性访问符则转标识符
        const nextToken = nextNonCommentToken(tokens, i);
        if (nextToken &&
            nextToken.type === token_1.TokenType.PROPERTY_ACCESS_OPERATOR) {
            return { ...token, type: token_1.TokenType.IDENTIFIER, text: token.raw };
        }
    }
    // 无歧义则返回原 Token
    return token;
};
// 如果「保留函数名 Token（RESERVED_FUNCTION_NAME）」后无紧跟的左括号 (（非注释 Token），则转为普通标识符 —— 因为它不是函数调用。
const funcNameToIdent = (token, i, tokens) => {
    if (token.type === token_1.TokenType.RESERVED_FUNCTION_NAME) {
        const nextToken = nextNonCommentToken(tokens, i);
        // 无后续 Token 或后续不是左括号->转标识符
        if (!nextToken || !isOpenParen(nextToken)) {
            return { ...token, type: token_1.TokenType.IDENTIFIER, text: token.raw };
        }
    }
    return token;
};
// 如果「保留数据类型 Token（RESERVED_DATA_TYPE）」后紧跟左括号 (，则转为「参数化数据类型（RESERVED_PARAMETERIZED_DATA_TYPE）」—— 用于识别带参数的类型（如 VARCHAR(255)）
const dataTypeToParameterizedDataType = (token, i, tokens) => {
    if (token.type === token_1.TokenType.RESERVED_DATA_TYPE) {
        const nextToken = nextNonCommentToken(tokens, i);
        if (nextToken && isOpenParen(nextToken)) {
            return {
                ...token,
                type: token_1.TokenType.RESERVED_PARAMETERIZED_DATA_TYPE,
            };
        }
    }
    return token;
};
// 如果「普通标识符 Token（IDENTIFIER）」后紧跟左中括号 [，则转为「数组标识符（ARRAY_IDENTIFIER）」—— 用于区分数组访问（foo[1]）和数组字面量（[1,2,3]）
const identToArrayIdent = (token, i, tokens) => {
    if (token.type === token_1.TokenType.IDENTIFIER) {
        const nextToken = nextNonCommentToken(tokens, i);
        if (nextToken && isOpenBracket(nextToken)) {
            return { ...token, type: token_1.TokenType.ARRAY_IDENTIFIER };
        }
    }
    return token;
};
// 如果「保留数据类型 Token（RESERVED_DATA_TYPE）」后紧跟左中括号 [，则转为「数组关键字（ARRAY_KEYWORD）」—— 用于识别数组类型（如 INT[]）
const dataTypeToArrayKeyword = (token, i, tokens) => {
    if (token.type === token_1.TokenType.RESERVED_DATA_TYPE) {
        const nextToken = nextNonCommentToken(tokens, i);
        if (nextToken && isOpenBracket(nextToken)) {
            return { ...token, type: token_1.TokenType.ARRAY_KEYWORD };
        }
    }
    return token;
};
// 找前一个非注释 Token（复用 nextNonCommentToken，方向为 -1）
const prevNonCommentToken = (tokens, index) => nextNonCommentToken(tokens, index, -1);
// 通用：找后/前非注释 Token（dir=1 找后，dir=-1 找前）
const nextNonCommentToken = (tokens, index, dir = 1) => {
    let i = 1;
    // 循环跳过所有注释 Token
    while (tokens[index + i * dir] && isComment(tokens[index + i * dir])) {
        i++;
    }
    // 返回找到的有效 Token（无则 undefined）
    return tokens[index + i * dir];
};
// 判断是否是左括号 (
const isOpenParen = (t) => t.type === token_1.TokenType.OPEN_PAREN && t.text === "(";
// 判断是否是左中括号 [
const isOpenBracket = (t) => t.type === token_1.TokenType.OPEN_PAREN && t.text === "[";
// 判断是否是注释 Token
const isComment = (t) => t.type === token_1.TokenType.BLOCK_COMMENT || t.type === token_1.TokenType.LINE_COMMENT;
//# sourceMappingURL=disambiguateTokens.js.map