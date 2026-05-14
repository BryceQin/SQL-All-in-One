import type { FormatOptions } from "./FormatOptions"
import { indentString } from "./config"
import Params from "./Params"
import { createParser } from "../parser/createParser"
import type { StatementNode } from "../parser/ast"
import type { Dialect } from "../languages/dialect"
import ExpressionFormatter from "./ExpressionFormatter"
import Layout, { WS } from "./Layout"
import Indentation from "./Indentation"

/**
 * 主要的格式化器类
 * 负责将SQL字符串转换为格式化后的输出
 */
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
     * 格式化SQL查询
     * @param query - 要格式化的SQL字符串
     */
    public format(query: string): string {
        const ast = this.parse(query)
        const formattedQuery = this.formatAst(ast)
        return formattedQuery.trimEnd()
    }

    /**
     * 将SQL字符串解析为AST
     */
    private parse(query: string): StatementNode[] {
        return createParser(this.dialect.tokenizer).parse(
            query,
            this.cfg.paramTypes || {},
        )
    }

    /**
     * 将AST格式化为文本
     */
    private formatAst(statements: StatementNode[]): string {
        return statements
            .map((stat) => this.formatStatement(stat))
            .join("\n".repeat(this.cfg.linesBetweenQueries + 1))
    }

    /**
     * 格式化单条SQL语句
     */
    private formatStatement(statement: StatementNode): string {
        const layout = new ExpressionFormatter({
            cfg: this.cfg,
            dialectCfg: this.dialect.formatOptions,
            params: this.params,
            layout: new Layout(new Indentation(indentString(this.cfg))),
        }).format(statement.children)

        // 根据配置添加分号
        if (statement.hasSemicolon) {
            if (this.cfg.newlineBeforeSemicolon) {
                layout.add(WS.NEWLINE, ";")
            } else {
                layout.add(WS.NO_NEWLINE, ";")
            }
        }
        return layout.toString()
    }
}
