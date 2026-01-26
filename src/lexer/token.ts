// 标记序列的类型枚举
// 1. 用 const + as const 实现只读枚举对象（标准 JS 语法）
export const TokenType = {
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
} as const;
// 提取枚举值类型（替代原 enum 类型引用）
export type TokenType = (typeof TokenType)[keyof typeof TokenType];
// 标记接口，存储语言语法的最基础单元
export interface Token {
    type: TokenType;
    raw: string; // 原始文本
    text: string; // 处理后的文本
    key?: string; // 关键字的标准化形式
    start: number; // 在输入字符串中的起始位置
    precedingWhitespace?: string; // 在此标记之前的空白字符
}

// 创建一个在指定位置表示文件结尾的标记
export function createEofToken(index: number): {
    type: TokenType;
    raw: string;
    text: string;
    start: number;
} {
    return {
        type: TokenType.EOF,
        raw: '«EOF»',
        text: '«EOF»',
        start: index
    };
}

// 用于缺失标记的全局 EOF 标记
export const EOF_TOKEN = createEofToken(Infinity);

// 检查两个标记是否相等的辅助函数
export function testToken(compareToken: { type: TokenType; text: string }) {
    return function (token: Token): boolean {
        return (
            token.type === compareToken.type && token.text === compareToken.text
        );
    };
}

// 预定义的一组标记检查器
export const isToken = {
    ARRAY: testToken({ text: 'ARRAY', type: TokenType.RESERVED_DATA_TYPE }),
    BY: testToken({ text: 'BY', type: TokenType.RESERVED_KEYWORD }),
    SET: testToken({ text: 'SET', type: TokenType.RESERVED_CLAUSE }),
    STRUCT: testToken({ text: 'STRUCT', type: TokenType.RESERVED_DATA_TYPE }),
    WINDOW: testToken({ text: 'WINDOW', type: TokenType.RESERVED_CLAUSE }),
    VALUES: testToken({ text: 'VALUES', type: TokenType.RESERVED_CLAUSE })
};

// 检查标记类型是否为保留关键字
export function isReserved(type: TokenType): boolean {
    return (
        type === TokenType.RESERVED_DATA_TYPE ||
        type === TokenType.RESERVED_KEYWORD ||
        type === TokenType.RESERVED_FUNCTION_NAME ||
        type === TokenType.RESERVED_KEYWORD_PHRASE ||
        type === TokenType.RESERVED_DATA_TYPE_PHRASE ||
        type === TokenType.RESERVED_CLAUSE ||
        type === TokenType.RESERVED_SELECT ||
        type === TokenType.RESERVED_SET_OPERATION ||
        type === TokenType.RESERVED_JOIN ||
        type === TokenType.ARRAY_KEYWORD ||
        type === TokenType.CASE ||
        type === TokenType.END ||
        type === TokenType.WHEN ||
        type === TokenType.ELSE ||
        type === TokenType.THEN ||
        type === TokenType.LIMIT ||
        type === TokenType.BETWEEN ||
        type === TokenType.AND ||
        type === TokenType.OR ||
        type === TokenType.XOR
    );
}

// 检查标记类型是否为逻辑运算符
export function isLogicalOperator(type: TokenType): boolean {
    return (
        type === TokenType.AND ||
        type === TokenType.OR ||
        type === TokenType.XOR
    );
}
