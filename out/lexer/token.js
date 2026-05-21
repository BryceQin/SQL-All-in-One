"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isToken = exports.EOF_TOKEN = exports.TokenType = void 0;
exports.createEofToken = createEofToken;
exports.testToken = testToken;
exports.isReserved = isReserved;
exports.isLogicalOperator = isLogicalOperator;
// 标记序列的类型枚举
// 1. 用 const + as const 实现只读枚举对象（标准 JS 语法）
exports.TokenType = {
    QUOTED_IDENTIFIER: 'QUOTED_IDENTIFIER',
    IDENTIFIER: 'IDENTIFIER',
    STRING: 'STRING',
    VARIABLE: 'VARIABLE',
    RESERVED_DATA_TYPE: 'RESERVED_DATA_TYPE',
    RESERVED_PARAMETERIZED_DATA_TYPE: 'RESERVED_PARAMETERIZED_DATA_TYPE',
    RESERVED_KEYWORD: 'RESERVED_KEYWORD',
    RESERVED_FUNCTION_NAME: 'RESERVED_FUNCTION_NAME',
    RESERVED_KEYWORD_PHRASE: 'RESERVED_KEYWORD_PHRASE',
    RESERVED_DATA_TYPE_PHRASE: 'RESERVED_DATA_TYPE_PHRASE',
    RESERVED_SET_OPERATION: 'RESERVED_SET_OPERATION',
    RESERVED_CLAUSE: 'RESERVED_CLAUSE',
    RESERVED_SELECT: 'RESERVED_SELECT',
    RESERVED_JOIN: 'RESERVED_JOIN',
    RESERVED_COMMAND: 'RESERVED_COMMAND',
    ARRAY_IDENTIFIER: 'ARRAY_IDENTIFIER', // IDENTIFIER token in front of [
    ARRAY_KEYWORD: 'ARRAY_KEYWORD', // RESERVED_DATA_TYPE token in front of [
    CASE: 'CASE',
    END: 'END',
    WHEN: 'WHEN',
    ELSE: 'ELSE',
    THEN: 'THEN',
    LIMIT: 'LIMIT',
    BETWEEN: 'BETWEEN',
    AND: 'AND',
    OR: 'OR',
    XOR: 'XOR',
    ON: 'ON',
    USING: 'USING',
    OPERATOR: 'OPERATOR',
    COMMA: 'COMMA',
    ASTERISK: 'ASTERISK', // *
    PROPERTY_ACCESS_OPERATOR: 'PROPERTY_ACCESS_OPERATOR', // Usually "."
    OPEN_PAREN: 'OPEN_PAREN',
    CLOSE_PAREN: 'CLOSE_PAREN',
    LINE_COMMENT: 'LINE_COMMENT',
    BLOCK_COMMENT: 'BLOCK_COMMENT',
    // Text between /* sql-formatter-disable */ and /* sql-formatter-enable */
    DISABLE_COMMENT: 'DISABLE_COMMENT',
    NUMBER: 'NUMBER',
    NAMED_PARAMETER: 'NAMED_PARAMETER',
    QUOTED_PARAMETER: 'QUOTED_PARAMETER',
    NUMBERED_PARAMETER: 'NUMBERED_PARAMETER',
    POSITIONAL_PARAMETER: 'POSITIONAL_PARAMETER',
    CUSTOM_PARAMETER: 'CUSTOM_PARAMETER',
    DELIMITER: 'DELIMITER',
    EOF: 'EOF'
};
// 创建一个在指定位置表示文件结尾的标记
function createEofToken(index) {
    return {
        type: exports.TokenType.EOF,
        raw: '«EOF»',
        text: '«EOF»',
        start: index
    };
}
// 用于缺失标记的全局 EOF 标记
exports.EOF_TOKEN = createEofToken(Infinity);
// 检查两个标记是否相等的辅助函数
function testToken(compareToken) {
    return function (token) {
        return (token.type === compareToken.type && token.text === compareToken.text);
    };
}
// 预定义的一组标记检查器
exports.isToken = {
    ARRAY: testToken({ text: 'ARRAY', type: exports.TokenType.RESERVED_DATA_TYPE }),
    BY: testToken({ text: 'BY', type: exports.TokenType.RESERVED_KEYWORD }),
    SET: testToken({ text: 'SET', type: exports.TokenType.RESERVED_CLAUSE }),
    STRUCT: testToken({ text: 'STRUCT', type: exports.TokenType.RESERVED_DATA_TYPE }),
    WINDOW: testToken({ text: 'WINDOW', type: exports.TokenType.RESERVED_CLAUSE }),
    VALUES: testToken({ text: 'VALUES', type: exports.TokenType.RESERVED_CLAUSE })
};
// 检查标记类型是否为保留关键字
function isReserved(type) {
    return (type === exports.TokenType.RESERVED_DATA_TYPE ||
        type === exports.TokenType.RESERVED_KEYWORD ||
        type === exports.TokenType.RESERVED_FUNCTION_NAME ||
        type === exports.TokenType.RESERVED_KEYWORD_PHRASE ||
        type === exports.TokenType.RESERVED_DATA_TYPE_PHRASE ||
        type === exports.TokenType.RESERVED_CLAUSE ||
        type === exports.TokenType.RESERVED_SELECT ||
        type === exports.TokenType.RESERVED_SET_OPERATION ||
        type === exports.TokenType.RESERVED_JOIN ||
        type === exports.TokenType.ARRAY_KEYWORD ||
        type === exports.TokenType.CASE ||
        type === exports.TokenType.END ||
        type === exports.TokenType.WHEN ||
        type === exports.TokenType.ELSE ||
        type === exports.TokenType.THEN ||
        type === exports.TokenType.LIMIT ||
        type === exports.TokenType.BETWEEN ||
        type === exports.TokenType.AND ||
        type === exports.TokenType.OR ||
        type === exports.TokenType.XOR);
}
// 检查标记类型是否为逻辑运算符
function isLogicalOperator(type) {
    return (type === exports.TokenType.AND ||
        type === exports.TokenType.OR ||
        type === exports.TokenType.XOR);
}
//# sourceMappingURL=token.js.map