import * as vscode from 'vscode'
import type { AstNavigator, SymbolIndex } from './AstNavigator'

const SQL_RESERVED_WORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER',
    'DROP', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'ON',
    'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'BETWEEN', 'LIKE', 'EXISTS',
    'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
    'UNION', 'ALL', 'AS', 'DISTINCT', 'SET', 'INTO', 'VALUES', 'TABLE',
    'VIEW', 'INDEX', 'WITH', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'BEGIN', 'COMMIT', 'ROLLBACK', 'GRANT', 'REVOKE', 'TRUNCATE', 'MERGE',
    'USING', 'NATURAL', 'OVER', 'PARTITION', 'WINDOW', 'ROWS', 'RANGE',
    'FETCH', 'NEXT', 'ONLY', 'EXCEPT', 'INTERSECT', 'MINUS', 'ANY', 'SOME',
    'TRUE', 'FALSE', 'UNKNOWN', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
    'CHECK', 'DEFAULT', 'CONSTRAINT', 'UNIQUE', 'CASCADE', 'RESTRICT',
    'IF', 'OF', 'TO', 'FOR', 'AT', 'PRECISION', 'VARYING',
    'LATERAL', 'RECURSIVE', 'TEMPORARY', 'TEMP', 'GLOBAL', 'LOCAL',
    'DISTRIBUTE', 'CLUSTER', 'SORT', 'DYNAMIC', 'STATIC', 'REDUCE',
    'TRANSFORM', 'SERDE', 'SERDEPROPERTIES', 'STORED', 'LOCATION',
    'OVERWRITE', 'DIRECTORY', 'FORMAT', 'DELIMITED', 'FIELDS', 'TERMINATED',
    'COLLECTION', 'MAP', 'KEYS', 'LINES', 'FILE', 'ROW',
    'INPUTFORMAT', 'OUTPUTFORMAT', 'INPUTDRIVER', 'OUTPUTDRIVER',
    'TBLPROPERTIES', 'BUCKETS', 'SKEWED', 'SORTED', 'PURGE',
    'EXTERNAL', 'MANAGED', 'CTAS', 'LIKE', 'COMMENT', 'STRUCT', 'ARRAY',
    'UNIONTYPE', 'BOOLEAN', 'TINYINT', 'SMALLINT', 'INT', 'INTEGER',
    'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'STRING', 'VARCHAR',
    'CHAR', 'DATE', 'TIMESTAMP', 'BINARY', 'VARBINARY', 'TEXT', 'CLOB',
    'BLOB', 'REAL', 'TIME', 'DATETIME', 'YEAR', 'MONTH', 'DAY', 'HOUR',
    'MINUTE', 'SECOND', 'ZONE', 'WITHOUT', 'TIMESTAMPTZ',
])

export class SqlRenameProvider implements vscode.RenameProvider {
    constructor(private navigator: AstNavigator) {}

    prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.Range | null {
        try {
            const config = vscode.workspace.getConfiguration('SQL-All-in-One')
            if (!config.get<boolean>('enableNavigation', true)) return null

            const range = document.getWordRangeAtPosition(position)
            if (!range) return null
            const word = document.getText(range)

            const result = this.navigator.getAST(document)
            if (!result) return null

            const { index } = result
            if (!this.navigator.hasDefinition(word, index)) return null

            return range
        } catch {
            return null
        }
    }

    provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        _token: vscode.CancellationToken,
    ): vscode.WorkspaceEdit | null {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        if (!config.get<boolean>('enableNavigation', true)) return null

        const range = document.getWordRangeAtPosition(position)
        if (!range) return null
        const word = document.getText(range)

        if (word === newName) return null

        const result = this.navigator.getAST(document)
        if (!result) return null

        const { ast, index } = result

        const symbolType = this.navigator.detectSymbolType(word, index)
        if (!symbolType) return null

        const validationError = this.validateNewName(newName, word, index)
        if (validationError) throw new Error(validationError)

        const defLocation = this.navigator.getDefinition(word, index)
        const refs = this.navigator.findReferences(ast, word, document, symbolType)

        const edit = new vscode.WorkspaceEdit()
        if (defLocation) {
            edit.replace(document.uri, defLocation.range, newName)
        }
        for (const ref of refs) {
            if (ref.location.uri.toString() === document.uri.toString()) {
                edit.replace(document.uri, ref.location.range, newName)
            }
        }

        return edit
    }

    private validateNewName(newName: string, oldName: string, index: SymbolIndex): string | null {
        if (SQL_RESERVED_WORDS.has(newName.toUpperCase())) {
            return `'${newName}' 是 SQL 保留字，不能用作标识符`
        }

        const nameLower = newName.toLowerCase()
        if (index.cteDefinitions.has(nameLower) && nameLower !== oldName.toLowerCase()) {
            return `名称 '${newName}' 已被使用`
        }
        if (index.tableAliasDefinitions.has(nameLower) && nameLower !== oldName.toLowerCase()) {
            return `名称 '${newName}' 已被使用`
        }
        if (index.columnAliasDefinitions.has(nameLower) && nameLower !== oldName.toLowerCase()) {
            return `名称 '${newName}' 已被使用`
        }

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
            return '名称只能包含字母、数字和下划线，且不能以数字开头'
        }

        return null
    }
}
