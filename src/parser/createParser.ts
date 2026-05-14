// SQL 字符串 → parse 方法 → 传递 paramTypes 配置 →
// Tokenizer.tokenize 分词 → disambiguateTokens 消歧 → 补充 EOF Token →
// LexerAdapter 适配 Nearley → NearleyParser 按 grammar 解析 →
// 返回 StatementNode[] 类型的 AST

import nearley from "nearley"

import Tokenizer from "../lexer/Tokenizer"
import { disambiguateTokens } from "../lexer/disambiguateTokens"
import type { ParamTypes } from "../lexer/TokenizerOptions"
import type { StatementNode } from "./ast"
import grammar from "./grammar"
import LexerAdapter from "./LexerAdapter"
import { createEofToken } from "../lexer/token"

const { Parser: NearleyParser, Grammar } = nearley

export interface Parser {
    parse(sql: string, paramTypesOverrides: ParamTypes): StatementNode[]
}

/**
 * Creates a parser object which wraps the setup of Nearley parser
 */
export function createParser(tokenizer: Tokenizer): Parser {
    // 闭包变量：共享参数类型配置（Tokenizer 和 parse 方法间）
    let paramTypesOverrides: ParamTypes = {}
    let currentSql: string = ""
    // 初始化 LexerAdapter：关联自定义分词逻辑
    const lexer = new LexerAdapter((chunk) => [
        // 步骤1：分词 → 步骤2：消歧 → 合并为 Token 数组
        ...disambiguateTokens(tokenizer.tokenize(chunk, paramTypesOverrides)),
        // 步骤3：补充 EOF Token（Nearley 必须，标记解析结束）
        createEofToken(chunk.length),
    ])

    // 初始化 Nearley 解析器：关联文法和自定义 Lexer
    const parser = new NearleyParser(Grammar.fromCompiled(grammar), { lexer })

    // 返回对外暴露的 Parser 对象（仅含 parse 方法）
    return {
        parse: (sql: string, paramTypes: ParamTypes) => {
            // 1. 共享参数配置：传递给 Tokenizer 的分词逻辑
            paramTypesOverrides = paramTypes
            currentSql = sql

            try {
                // 2. 执行解析：feed 方法传入 SQL 文本，触发 Lexer 分词 + 文法解析
                const { results } = parser.feed(sql)

                // 3. 解析结果处理（Nearley 特性：可能返回 0/1/多个结果）
                if (results.length === 1) {
                    // 正常情况：1 个结果 → 返回 AST 节点数组
                    return results[0]
                } else if (results.length === 0) {
                    // 异常1：0 个结果 → 无效 SQL
                    // 尝试获取最后一个 token 的位置作为错误位置
                    const lastToken = lexer.lastToken
                    const errorPos = lastToken ? lastToken.start + lastToken.raw.length : sql.length
                    throw new Error(`解析错误: 无效的 SQL 语句 at position ${errorPos}`)
                } else {
                    // 异常2：多个结果 → 文法歧义（同一段 SQL 匹配多种文法规则）
                    throw new Error(
                        `解析错误: 语法歧义\n${JSON.stringify(
                            results,
                            undefined,
                            2,
                        )}`,
                    )
                }
            } catch (error) {
                if (error instanceof Error) {
                    // 如果错误还没有位置信息，添加一个
                    if (!error.message.includes("at position")) {
                        const lastToken = lexer.lastToken
                        const errorPos = lastToken ? lastToken.start + lastToken.raw.length : sql.length
                        throw new Error(`${error.message} at position ${errorPos}`)
                    }
                }
                throw error
            }
        },
    }
}
