"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lineColFromIndex_1 = require("../lexer/lineColFromIndex");
const token_1 = require("../lexer/token");
class LexerAdapter {
    // 当前读取到的 Token 下标（游标）
    index = 0;
    // 分词后的 Token 数组（缓存）
    tokens = [];
    // 原始输入字符串（用于错误格式化时计算行列号）
    input = "";
    // 构造函数：接收自定义分词器的 tokenize 方法（依赖注入，解耦）
    // 改写构造函数参数属性
    tokenize;
    constructor(tokenize) {
        this.tokenize = tokenize;
    }
    // 初始化 / 重置词法分析器
    reset(chunk) {
        // 保存原始输入（用于错误定位）
        this.input = chunk;
        // 重置 Token 游标
        this.index = 0;
        // 调用自定义分词器，生成 Token 数组并缓存
        this.tokens = this.tokenize(chunk);
    }
    // 获取下一个 Token
    next() {
        // 读取当前游标位置的 Token，游标自增，同时类型断言为 NearleyToken
        return this.tokens[this.index++];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    save() {
        return;
    }
    // 格式化解析错误信息
    formatError(token) {
        // 根据 Token 的起始位置，计算其在原始输入中的行号和列号
        const { line, col } = (0, lineColFromIndex_1.lineColFromIndex)(this.input, token.start);
        // 返回人性化的错误信息（包含 Token 文本、行号、列号）
        return `解析错误发生在: ${token.text} 行 ${line}， 列 ${col}`;
    }
    // 检查 Token 类型是否存在
    has(name) {
        // 检查传入的类型名是否存在于 TokenType 枚举/对象中
        return name in token_1.TokenType;
    }
}
exports.default = LexerAdapter;
//# sourceMappingURL=LexerAdapter.js.map