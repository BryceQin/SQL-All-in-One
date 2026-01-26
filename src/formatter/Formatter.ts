// 将原始 SQL 字符串经过「解析→AST 格式化→文本拼接」的完整流程，输出符合配置规则的格式化 SQL 字符串
import type { FormatOptions } from "./FormatOptions"
import { indentString } from "./config"
import Params from "./Params"

import { createParser } from "../parser/createParser"
import type { StatementNode } from "../parser/ast"
import type { Dialect } from "../languages/dialect"

import ExpressionFormatter from "./ExpressionFormatter"
import Layout, { WS } from "./Layout"
import Indentation from "./Indentation"

/** Main formatter class that produces a final output string from list of tokens */
export default class Formatter {
    private dialect: Dialect
    private cfg: FormatOptions
    private params: Params

    constructor(dialect: Dialect, cfg: FormatOptions) {
        this.dialect = dialect
        this.cfg = cfg
        this.params = new Params(this.cfg.params)
    }

    /**
     * Formats an SQL query.
     * @param query - The SQL query string to be formatted
     */
    public format(query: string): string {
        // 步骤1：解析SQL为AST
        const ast = this.parse(query)
        // 步骤2：格式化AST为文本
        const formattedQuery = this.formatAst(ast)
        // 步骤3：去除末尾多余空格/换行
        return formattedQuery.trimEnd()
    }

    private parse(query: string): StatementNode[] {
        return createParser(this.dialect.tokenizer).parse(
            query,
            this.cfg.paramTypes || {},
        )
    }

    private formatAst(statements: StatementNode[]): string {
        return statements
            .map((stat) => this.formatStatement(stat)) // 格式化单条语句
            .join("\n".repeat(this.cfg.linesBetweenQueries + 1)) // 按配置拼接多条语句
    }

    private formatStatement(statement: StatementNode): string {
        // 步骤1：创建表达式格式化器，处理AST子节点
        const layout = new ExpressionFormatter({
            cfg: this.cfg,
            dialectCfg: this.dialect.formatOptions,
            params: this.params,
            layout: new Layout(new Indentation(indentString(this.cfg))),
        }).format(statement.children)

        // 步骤2：处理分号（根据配置和语句是否含分号）
        if (!statement.hasSemicolon) {
            // 无分号则不处理
        } else if (this.cfg.newlineBeforeSemicolon) {
            layout.add(WS.NEWLINE, ";") // 分号前换行（如 SELECT * FROM t\n;）
        } else {
            layout.add(WS.NO_NEWLINE, ";") // 分号紧跟语句（如 SELECT * FROM t;）
        }
        return layout.toString() // 布局对象转为字符串
    }
}
