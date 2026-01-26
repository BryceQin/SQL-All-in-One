"use strict";
// SQL 字符串 → parse 方法 → 传递 paramTypes 配置 →
// Tokenizer.tokenize 分词 → disambiguateTokens 消歧 → 补充 EOF Token →
// LexerAdapter 适配 Nearley → NearleyParser 按 grammar 解析 →
// 返回 StatementNode[] 类型的 AST
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createParser = createParser;
const nearley_1 = __importDefault(require("nearley"));
const disambiguateTokens_1 = require("../lexer/disambiguateTokens");
const grammar_1 = __importDefault(require("./grammar"));
const LexerAdapter_1 = __importDefault(require("./LexerAdapter"));
const token_1 = require("../lexer/token");
const { Parser: NearleyParser, Grammar } = nearley_1.default;
/**
 * Creates a parser object which wraps the setup of Nearley parser
 */
function createParser(tokenizer) {
    // 闭包变量：共享参数类型配置（Tokenizer 和 parse 方法间）
    let paramTypesOverrides = {};
    // 初始化 LexerAdapter：关联自定义分词逻辑
    const lexer = new LexerAdapter_1.default((chunk) => [
        // 步骤1：分词 → 步骤2：消歧 → 合并为 Token 数组
        ...(0, disambiguateTokens_1.disambiguateTokens)(tokenizer.tokenize(chunk, paramTypesOverrides)),
        // 步骤3：补充 EOF Token（Nearley 必须，标记解析结束）
        (0, token_1.createEofToken)(chunk.length),
    ]);
    // 初始化 Nearley 解析器：关联文法和自定义 Lexer
    const parser = new NearleyParser(Grammar.fromCompiled(grammar_1.default), { lexer });
    // 返回对外暴露的 Parser 对象（仅含 parse 方法）
    return {
        parse: (sql, paramTypes) => {
            // 1. 共享参数配置：传递给 Tokenizer 的分词逻辑
            paramTypesOverrides = paramTypes;
            // 2. 执行解析：feed 方法传入 SQL 文本，触发 Lexer 分词 + 文法解析
            const { results } = parser.feed(sql);
            // 3. 解析结果处理（Nearley 特性：可能返回 0/1/多个结果）
            if (results.length === 1) {
                // 正常情况：1 个结果 → 返回 AST 节点数组
                return results[0];
            }
            else if (results.length === 0) {
                // 异常1：0 个结果 → 无效 SQL
                // Ideally we would report a line number where the parser failed,
                // but I haven't found a way to get this info from Nearley :(
                throw new Error("解析错误: 无效的 SQL 语句。");
            }
            else {
                // 异常2：多个结果 → 文法歧义（同一段 SQL 匹配多种文法规则）
                throw new Error(`解析错误: 语法歧义\n${JSON.stringify(results, undefined, 2)}`);
            }
        },
    };
}
//# sourceMappingURL=createParser.js.map