# 跳转与导航增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SQL All in One 扩展新增四项代码导航能力（Go to Definition、Find All References、Rename Symbol、Breadcrumb 导航增强），全部基于 node-sql-parser 的 AST 实现。

**Architecture:** 引入 `AstNavigator` 共享导航引擎，构建符号索引（CTE 定义、表别名定义、列别名定义）并提供引用查找能力。四个 Provider 复用同一套符号索引和 AST 缓存。增强现有 `SqlOutlineProvider` 以支持子句级 Breadcrumb 导航。

**Tech Stack:** TypeScript, VS Code Extension API, node-sql-parser

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/navigation/AstNavigator.ts` | 共享导航引擎：AST 缓存、符号索引构建、引用查找 |
| Create | `src/navigation/SqlDefinitionProvider.ts` | Go to Definition 实现 |
| Create | `src/navigation/SqlReferenceProvider.ts` | Find All References 实现 |
| Create | `src/navigation/SqlRenameProvider.ts` | Rename Symbol 实现 |
| Modify | `src/providers/SqlOutlineProvider.ts` | 增强子句级层级符号（Breadcrumb） |
| Modify | `src/extension.ts` | 注册 Definition/Reference/Rename Provider |
| Modify | `package.json` | 新增 `enableNavigation` 配置项 |
| Modify | `src/i18n/messages.zh.json` | 新增导航相关中文翻译 |
| Modify | `src/i18n/messages.en.json` | 新增导航相关英文翻译 |

---

### Task 1: 创建 AstNavigator 共享导航引擎

**Files:**
- Create: `src/navigation/AstNavigator.ts`

- [ ] **Step 1: 创建 AstNavigator.ts 文件**

```typescript
import * as vscode from 'vscode'
import { getParserEngine } from '../parser/SqlParserEngine'
import { toSqlDialect } from '../core/sqlDialects'
import { walkAst, isAstNode } from '../parser/AstVisitor'
import { getNodeLocation, getStatementEndLocation } from '../parser/astUtils'
import type { AstNode, AstLocation } from '../parser/astTypes'

export interface SymbolIndex {
    cteDefinitions: Map<string, vscode.Location>
    tableAliasDefinitions: Map<string, vscode.Location>
    columnAliasDefinitions: Map<string, vscode.Location>
}

export interface SymbolReference {
    location: vscode.Location
    context: string
}

export type SymbolType = 'cte' | 'tableAlias' | 'columnAlias'

interface CacheEntry {
    version: number
    ast: unknown[] | unknown
    index: SymbolIndex
}

export function extractName(name: unknown): string | null {
    if (typeof name === 'string' && name.length > 0) {
        return name
    }
    if (name != null && typeof name === 'object') {
        const nameObj = name as Record<string, unknown>
        if (typeof nameObj.value === 'string' && nameObj.value.length > 0) {
            return nameObj.value
        }
    }
    return null
}

function toVscodeLocation(node: AstNode, document: vscode.TextDocument): vscode.Location | null {
    const startLoc = getNodeLocation(node)
    if (!startLoc) return null
    const startPos = new vscode.Position(startLoc.line - 1, startLoc.column - 1)
    const endLoc = getStatementEndLocation(node)
    const endPos = endLoc
        ? new vscode.Position(endLoc.line - 1, endLoc.column - 1)
        : startPos
    return new vscode.Location(document.uri, new vscode.Range(startPos, endPos))
}

function toVscodeLocationFromLoc(loc: { start?: AstLocation; end?: AstLocation } | undefined, document: vscode.TextDocument): vscode.Location | null {
    if (!loc?.start?.line || !loc?.start?.column) return null
    const startPos = new vscode.Position(loc.start.line - 1, loc.start.column - 1)
    const endPos = loc?.end?.line && loc?.end?.column
        ? new vscode.Position(loc.end.line - 1, loc.end.column - 1)
        : startPos
    return new vscode.Location(document.uri, new vscode.Range(startPos, endPos))
}

function buildIndex(ast: unknown[] | unknown, document: vscode.TextDocument): SymbolIndex {
    const index: SymbolIndex = {
        cteDefinitions: new Map(),
        tableAliasDefinitions: new Map(),
        columnAliasDefinitions: new Map(),
    }

    const astList = Array.isArray(ast) ? ast : [ast]

    for (const stmt of astList) {
        if (!isAstNode(stmt)) continue
        const node = stmt as AstNode

        if (node.type === 'select') {
            processSelectForIndex(node, document, index)
        }

        if (node.type === 'with' || (node.type === 'select' && node.with)) {
            const withClause = node.type === 'with' ? node : node.with
            processWithForIndex(withClause, document, index)
        }
    }

    return index
}

function processWithForIndex(withClause: unknown, document: vscode.TextDocument, index: SymbolIndex): void {
    let cteItems: unknown[] = []

    if (isAstNode(withClause) && (withClause as AstNode).type === 'with') {
        const withNode = withClause as AstNode
        const value = withNode.value
        if (Array.isArray(value)) {
            cteItems = value
        }
    } else if (Array.isArray(withClause)) {
        cteItems = withClause
    }

    for (const item of cteItems) {
        if (item == null || typeof item !== 'object') continue
        const itemNode = item as Record<string, unknown>
        const cteName = extractName(itemNode.name)
        if (cteName) {
            const loc = (item as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
            const location = loc
                ? toVscodeLocationFromLoc(loc, document)
                : (isAstNode(item) ? toVscodeLocation(item as AstNode, document) : null)
            if (location) {
                index.cteDefinitions.set(cteName.toLowerCase(), location)
            }
        }
    }
}

function processSelectForIndex(node: AstNode, document: vscode.TextDocument, index: SymbolIndex): void {
    const from = node.from
    if (Array.isArray(from)) {
        for (const item of from) {
            if (item == null || typeof item !== 'object') continue
            const fromEntry = item as Record<string, unknown>

            if (fromEntry.as) {
                const aliasName = extractName(fromEntry.as)
                if (aliasName) {
                    const loc = fromEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined
                    const location = loc
                        ? toVscodeLocationFromLoc(loc, document)
                        : null
                    if (location) {
                        index.tableAliasDefinitions.set(aliasName.toLowerCase(), location)
                    }
                }
            }
        }
    }

    const columns = node.columns
    if (Array.isArray(columns)) {
        for (const col of columns) {
            if (col == null || typeof col !== 'object') continue
            const colEntry = col as Record<string, unknown>
            if (colEntry.as) {
                const aliasName = extractName(colEntry.as)
                if (aliasName) {
                    const loc = colEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined
                    const location = loc
                        ? toVscodeLocationFromLoc(loc, document)
                        : null
                    if (location) {
                        index.columnAliasDefinitions.set(aliasName.toLowerCase(), location)
                    }
                }
            }
        }
    }
}

function findReferences(
    ast: unknown[] | unknown,
    symbolName: string,
    document: vscode.TextDocument,
    symbolType: SymbolType
): SymbolReference[] {
    const refs: SymbolReference[] = []
    const nameLower = symbolName.toLowerCase()

    walkAst(ast, {
        enter(node) {
            switch (symbolType) {
                case 'cte':
                    if (isAstNode(node)) {
                        const astNode = node as AstNode
                        if (astNode.type === 'column_ref') {
                            const table = astNode.table
                            if (typeof table === 'string' && table.toLowerCase() === nameLower) {
                                const loc = (node as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
                                const location = loc ? toVscodeLocationFromLoc(loc, document) : null
                                if (location) {
                                    refs.push({ location, context: '列引用' })
                                }
                            }
                        }
                        if (Array.isArray((astNode as Record<string, unknown>).from)) {
                            const from = (astNode as Record<string, unknown>).from as unknown[]
                            for (const fromItem of from) {
                                if (fromItem == null || typeof fromItem !== 'object') continue
                                const fromEntry = fromItem as Record<string, unknown>
                                const table = fromEntry.table
                                const tableName = extractName(table)
                                if (tableName && tableName.toLowerCase() === nameLower) {
                                    const loc = fromEntry.loc as { start?: AstLocation; end?: AstLocation } | undefined
                                    const location = loc ? toVscodeLocationFromLoc(loc, document) : null
                                    if (location) {
                                        const join = fromEntry.join
                                        const context = typeof join === 'string' ? 'JOIN 子句' : 'FROM 子句'
                                        refs.push({ location, context })
                                    }
                                }
                            }
                        }
                    }
                    break
                case 'tableAlias':
                    if (isAstNode(node)) {
                        const astNode = node as AstNode
                        if (astNode.type === 'column_ref') {
                            const table = astNode.table
                            if (typeof table === 'string' && table.toLowerCase() === nameLower) {
                                const loc = (node as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
                                const location = loc ? toVscodeLocationFromLoc(loc, document) : null
                                if (location) {
                                    refs.push({ location, context: '列引用' })
                                }
                            }
                        }
                    }
                    break
                case 'columnAlias':
                    if (isAstNode(node)) {
                        const astNode = node as AstNode
                        if (astNode.type === 'column_ref') {
                            const column = astNode.column
                            if (typeof column === 'string' && column.toLowerCase() === nameLower) {
                                const loc = (node as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
                                const location = loc ? toVscodeLocationFromLoc(loc, document) : null
                                if (location) {
                                    refs.push({ location, context: '子句引用' })
                                }
                            }
                        }
                    }
                    break
            }
        },
    })

    return refs
}

export class AstNavigator {
    private cache: Map<string, CacheEntry> = new Map()

    getAST(document: vscode.TextDocument): { ast: unknown[] | unknown; index: SymbolIndex } | null {
        const key = document.uri.toString()
        const version = document.version
        const cached = this.cache.get(key)
        if (cached && cached.version === version) {
            return { ast: cached.ast, index: cached.index }
        }

        const dialect = toSqlDialect(document.languageId)
        const result = getParserEngine().tryAstify(document.getText(), dialect)
        if (!result.success || !result.ast) {
            return null
        }

        const index = buildIndex(result.ast, document)
        this.cache.set(key, { version, ast: result.ast, index })
        return { ast: result.ast, index }
    }

    invalidate(document: vscode.TextDocument): void {
        this.cache.delete(document.uri.toString())
    }

    findReferences(
        ast: unknown[] | unknown,
        symbolName: string,
        document: vscode.TextDocument,
        symbolType: SymbolType
    ): SymbolReference[] {
        return findReferences(ast, symbolName, document, symbolType)
    }

    detectSymbolType(word: string, index: SymbolIndex): SymbolType | null {
        const nameLower = word.toLowerCase()
        if (index.cteDefinitions.has(nameLower)) return 'cte'
        if (index.tableAliasDefinitions.has(nameLower)) return 'tableAlias'
        if (index.columnAliasDefinitions.has(nameLower)) return 'columnAlias'
        return null
    }

    getDefinition(word: string, index: SymbolIndex): vscode.Location | null {
        const nameLower = word.toLowerCase()
        return index.cteDefinitions.get(nameLower)
            || index.tableAliasDefinitions.get(nameLower)
            || index.columnAliasDefinitions.get(nameLower)
            || null
    }

    hasDefinition(word: string, index: SymbolIndex): boolean {
        const nameLower = word.toLowerCase()
        return index.cteDefinitions.has(nameLower)
            || index.tableAliasDefinitions.has(nameLower)
            || index.columnAliasDefinitions.has(nameLower)
    }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30`
Expected: 无与 AstNavigator.ts 相关的错误

---

### Task 2: 创建 SqlDefinitionProvider

**Files:**
- Create: `src/navigation/SqlDefinitionProvider.ts`

- [ ] **Step 1: 创建 SqlDefinitionProvider.ts 文件**

```typescript
import * as vscode from 'vscode'
import type { AstNavigator } from './AstNavigator'

export class SqlDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private navigator: AstNavigator) {}

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.Definition | null {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        if (!config.get<boolean>('enableNavigation', true)) return null

        const range = document.getWordRangeAtPosition(position)
        if (!range) return null
        const word = document.getText(range)

        const result = this.navigator.getAST(document)
        if (!result) return null

        const { index } = result
        const nameLower = word.toLowerCase()

        const loc = index.cteDefinitions.get(nameLower)
            || index.tableAliasDefinitions.get(nameLower)
            || index.columnAliasDefinitions.get(nameLower)

        return loc || null
    }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30`
Expected: 无错误

---

### Task 3: 创建 SqlReferenceProvider

**Files:**
- Create: `src/navigation/SqlReferenceProvider.ts`

- [ ] **Step 1: 创建 SqlReferenceProvider.ts 文件**

```typescript
import * as vscode from 'vscode'
import type { AstNavigator } from './AstNavigator'

export class SqlReferenceProvider implements vscode.ReferenceProvider {
    constructor(private navigator: AstNavigator) {}

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        _token: vscode.CancellationToken,
    ): vscode.Location[] | null {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        if (!config.get<boolean>('enableNavigation', true)) return null

        const range = document.getWordRangeAtPosition(position)
        if (!range) return null
        const word = document.getText(range)

        const result = this.navigator.getAST(document)
        if (!result) return null

        const { ast, index } = result

        const symbolType = this.navigator.detectSymbolType(word, index)
        if (!symbolType) return null

        const defLoc = this.navigator.getDefinition(word, index)
        const refs = this.navigator.findReferences(ast, word, document, symbolType)

        const locations: vscode.Location[] = []
        if (defLoc) {
            locations.push(defLoc)
        }
        for (const ref of refs) {
            locations.push(ref.location)
        }

        return locations.length > 0 ? locations : null
    }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30`
Expected: 无错误

---

### Task 4: 创建 SqlRenameProvider

**Files:**
- Create: `src/navigation/SqlRenameProvider.ts`

- [ ] **Step 1: 创建 SqlRenameProvider.ts 文件**

```typescript
import * as vscode from 'vscode'
import type { AstNavigator } from './AstNavigator'

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
    'IF', 'OF', 'TO', 'FROM', 'FOR', 'AT', 'PRECISION', 'VARYING',
    'LATERAL', 'RECURSIVE', 'TEMPORARY', 'TEMP', 'GLOBAL', 'LOCAL',
    'DISTRIBUTE', 'CLUSTER', 'SORT', 'DYNAMIC', 'STATIC', 'REDUCE',
    'TRANSFORM', 'SERDE', 'SERDEPROPERTIES', 'STORED', 'LOCATION',
    'OVERWRITE', 'DIRECTORY', 'FORMAT', 'DELIMITED', 'FIELDS', 'TERMINATED',
    'COLLECTION', 'MAP', 'KEYS', 'LINES', 'FILE', 'ROW', 'FORMAT',
    'INPUTFORMAT', 'OUTPUTFORMAT', 'INPUTDRIVER', 'OUTPUTDRIVER',
    'TBLPROPERTIES', 'BUCKETS', 'SKEWED', 'SORTED', 'PURGE',
    'EXTERNAL', 'MANAGED', 'CTAS', 'LIKE', 'COMMENT', 'STRUCT', 'ARRAY',
    'MAP', 'UNIONTYPE', 'BOOLEAN', 'TINYINT', 'SMALLINT', 'INT', 'INTEGER',
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

    private validateNewName(newName: string, oldName: string, index: import('./AstNavigator').SymbolIndex): string | null {
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
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30`
Expected: 无错误

---

### Task 5: 增强 SqlOutlineProvider 支持子句级 Breadcrumb

**Files:**
- Modify: `src/providers/SqlOutlineProvider.ts`

- [ ] **Step 1: 在 processSelectStatement 方法中增加子句级子节点**

在现有的 `processSelectStatement` 方法中，在 `processSelectChain` 调用之前，添加子句级子节点的处理逻辑。需要新增以下私有方法：

1. `processSelectColumns` — 处理 SELECT 列（仅别名列）
2. `processFromClauses` — 处理 FROM/JOIN 子句
3. `createClauseSymbol` — 创建子句级符号

在 `processSelectStatement` 中，在 `symbol.children.push(withSymbol)` 之后、`processSelectChain` 之前添加：

```typescript
if (Array.isArray(node.columns)) {
    const columnsSymbol = this.processSelectColumns(document, node.columns)
    if (columnsSymbol) {
        symbol.children.push(columnsSymbol)
    }
}

if (Array.isArray(node.from)) {
    const fromSymbols = this.processFromClauses(document, node.from)
    symbol.children.push(...fromSymbols)
}

if (node.where) {
    const whereSymbol = this.createClauseSymbol(document, node.where, 'WHERE')
    if (whereSymbol) symbol.children.push(whereSymbol)
}

if (node.groupby) {
    const groupBySymbol = this.createClauseSymbolFromGroupBy(document, node.groupby, 'GROUP BY')
    if (groupBySymbol) symbol.children.push(groupBySymbol)
}

if (node.having) {
    const havingSymbol = this.createClauseSymbol(document, node.having, 'HAVING')
    if (havingSymbol) symbol.children.push(havingSymbol)
}

if (node.orderby) {
    const orderBySymbol = this.createClauseSymbolFromOrderBy(document, node.orderby, 'ORDER BY')
    if (orderBySymbol) symbol.children.push(orderBySymbol)
}
```

新增方法实现：

```typescript
private processSelectColumns(
    document: vscode.TextDocument,
    columns: unknown[]
): vscode.DocumentSymbol | null {
    if (!Array.isArray(columns) || columns.length === 0) return null

    const aliasSymbols: vscode.DocumentSymbol[] = []
    for (const col of columns) {
        if (col == null || typeof col !== 'object') continue
        const colEntry = col as Record<string, unknown>
        if (colEntry.as) {
            const aliasName = this.extractNameFromAny(colEntry.as)
            if (aliasName) {
                const loc = colEntry.loc as { start?: import('../parser/astTypes').AstLocation; end?: import('../parser/astTypes').AstLocation } | undefined
                if (loc?.start?.line && loc?.start?.column) {
                    const startPos = new vscode.Position(loc.start.line - 1, loc.start.column - 1)
                    const endPos = loc?.end?.line && loc?.end?.column
                        ? new vscode.Position(loc.end.line - 1, loc.end.column - 1)
                        : startPos
                    const range = new vscode.Range(startPos, endPos)
                    aliasSymbols.push(new vscode.DocumentSymbol(
                        aliasName,
                        'alias',
                        vscode.SymbolKind.Field,
                        range,
                        range
                    ))
                }
            }
        }
    }

    const firstCol = columns[0]
    const lastCol = columns[columns.length - 1]
    const firstLoc = this.getLocFromEntry(firstCol)
    const lastLoc = this.getLocFromEntry(lastCol)
    if (!firstLoc) return null

    const startPos = new vscode.Position(firstLoc.start.line - 1, firstLoc.start.column - 1)
    const endPos = lastLoc?.end
        ? new vscode.Position(lastLoc.end.line - 1, lastLoc.end.column - 1)
        : startPos
    const range = new vscode.Range(startPos, endPos)

    const label = `SELECT (${columns.length} columns)`
    const symbol = new vscode.DocumentSymbol(
        label,
        '',
        vscode.SymbolKind.Field,
        range,
        range
    )
    symbol.children = aliasSymbols
    return symbol
}

private processFromClauses(
    document: vscode.TextDocument,
    from: unknown[]
): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = []
    if (!Array.isArray(from)) return symbols

    for (const item of from) {
        if (item == null || typeof item !== 'object') continue
        const fromEntry = item as Record<string, unknown>
        const loc = fromEntry.loc as { start?: import('../parser/astTypes').AstLocation; end?: import('../parser/astTypes').AstLocation } | undefined
        if (!loc?.start?.line || !loc?.start?.column) continue

        const startPos = new vscode.Position(loc.start.line - 1, loc.start.column - 1)
        const endPos = loc?.end?.line && loc?.end?.column
            ? new vscode.Position(loc.end.line - 1, loc.end.column - 1)
            : startPos
        const range = new vscode.Range(startPos, endPos)

        const tableName = this.extractNameFromAny(fromEntry.table)
        const alias = this.extractNameFromAny(fromEntry.as)
        const join = fromEntry.join

        let label = ''
        if (typeof join === 'string') {
            const joinUpper = join.toUpperCase()
            label = alias
                ? `${joinUpper} ${tableName || '...'} ${alias}`
                : `${joinUpper} ${tableName || '...'}`
        } else {
            label = alias
                ? `FROM ${tableName || '...'} ${alias}`
                : `FROM ${tableName || '...'}`
        }

        const truncatedLabel = label.length > 30 ? label.substring(0, 30) + '...' : label

        symbols.push(new vscode.DocumentSymbol(
            truncatedLabel,
            '',
            vscode.SymbolKind.Module,
            range,
            range
        ))
    }

    return symbols
}

private createClauseSymbol(
    document: vscode.TextDocument,
    clause: unknown,
    clauseName: string
): vscode.DocumentSymbol | null {
    if (!isAstNode(clause)) return null
    const loc = (clause as Record<string, unknown>).loc as { start?: import('../parser/astTypes').AstLocation; end?: import('../parser/astTypes').AstLocation } | undefined
    if (!loc?.start?.line || !loc?.start?.column) return null

    const startPos = new vscode.Position(loc.start.line - 1, loc.start.column - 1)
    const endPos = loc?.end?.line && loc?.end?.column
        ? new vscode.Position(loc.end.line - 1, loc.end.column - 1)
        : startPos
    const range = new vscode.Range(startPos, endPos)

    const text = document.getText(range).trim()
    const label = text.length > 30 ? `${clauseName} ${text.substring(0, 30 - clauseName.length - 1)}...` : `${clauseName} ${text}`

    return new vscode.DocumentSymbol(
        label,
        '',
        clauseName === 'WHERE' || clauseName === 'HAVING'
            ? vscode.SymbolKind.Boolean
            : vscode.SymbolKind.Array,
        range,
        range
    )
}

private createClauseSymbolFromGroupBy(
    document: vscode.TextDocument,
    groupby: unknown,
    clauseName: string
): vscode.DocumentSymbol | null {
    if (Array.isArray(groupby) && groupby.length > 0) {
        const firstItem = groupby[0]
        const lastItem = groupby[groupby.length - 1]
        const firstLoc = this.getLocFromEntry(firstItem)
        const lastLoc = this.getLocFromEntry(lastItem)
        if (!firstLoc) return null

        const startPos = new vscode.Position(firstLoc.start.line - 1, firstLoc.start.column - 1)
        const endPos = lastLoc?.end
            ? new vscode.Position(lastLoc.end.line - 1, lastLoc.end.column - 1)
            : startPos
        const range = new vscode.Range(startPos, endPos)

        const text = document.getText(range).trim()
        const label = text.length > 30 ? `${clauseName} ${text.substring(0, 30 - clauseName.length - 1)}...` : `${clauseName} ${text}`

        return new vscode.DocumentSymbol(label, '', vscode.SymbolKind.Array, range, range)
    }

    if (isAstNode(groupby)) {
        return this.createClauseSymbol(document, groupby, clauseName)
    }

    return null
}

private createClauseSymbolFromOrderBy(
    document: vscode.TextDocument,
    orderby: unknown,
    clauseName: string
): vscode.DocumentSymbol | null {
    if (Array.isArray(orderby) && orderby.length > 0) {
        const firstItem = orderby[0]
        const lastItem = orderby[orderby.length - 1]
        const firstLoc = this.getLocFromEntry(firstItem)
        const lastLoc = this.getLocFromEntry(lastItem)
        if (!firstLoc) return null

        const startPos = new vscode.Position(firstLoc.start.line - 1, firstLoc.start.column - 1)
        const endPos = lastLoc?.end
            ? new vscode.Position(lastLoc.end.line - 1, lastLoc.end.column - 1)
            : startPos
        const range = new vscode.Range(startPos, endPos)

        const text = document.getText(range).trim()
        const label = text.length > 30 ? `${clauseName} ${text.substring(0, 30 - clauseName.length - 1)}...` : `${clauseName} ${text}`

        return new vscode.DocumentSymbol(label, '', vscode.SymbolKind.Array, range, range)
    }

    if (isAstNode(orderby)) {
        return this.createClauseSymbol(document, orderby, clauseName)
    }

    return null
}

private extractNameFromAny(name: unknown): string | null {
    if (typeof name === 'string' && name.length > 0) return name
    if (name != null && typeof name === 'object') {
        const nameObj = name as Record<string, unknown>
        if (typeof nameObj.value === 'string' && nameObj.value.length > 0) {
            return nameObj.value
        }
    }
    return null
}

private getLocFromEntry(entry: unknown): { start: import('../parser/astTypes').AstLocation; end?: import('../parser/astTypes').AstLocation } | null {
    if (entry == null || typeof entry !== 'object') return null
    const obj = entry as Record<string, unknown>
    const loc = obj.loc as { start?: import('../parser/astTypes').AstLocation; end?: import('../parser/astTypes').AstLocation } | undefined
    if (loc?.start?.line && loc?.start?.column) {
        return loc as { start: import('../parser/astTypes').AstLocation; end?: import('../parser/astTypes').AstLocation }
    }
    return null
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30`
Expected: 无错误

---

### Task 6: 修改 extension.ts 注册新 Provider

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: 在 extension.ts 中添加导航 Provider 的注册逻辑**

1. 在 `lazyProviders` 对象中添加 `astNavigator` 懒加载实例
2. 在 `lazyProviders` 对象中添加 `definitionProvider`、`referenceProvider`、`renameProvider` 懒加载实例
3. 在 `registerProviders` 函数中注册这三个 Provider
4. 在 `activate` 函数中添加 `onDidChangeTextDocument` 监听以清除缓存

具体修改：

在 `lazyProviders` 对象中添加：

```typescript
astNavigator: lazy(() => {
    const { AstNavigator } = require("./navigation/AstNavigator")
    return new AstNavigator()
}),
definitionProvider: lazy(() => {
    const { SqlDefinitionProvider } = require("./navigation/SqlDefinitionProvider")
    const navigator = lazyProviders.astNavigator.get()
    return new SqlDefinitionProvider(navigator)
}),
referenceProvider: lazy(() => {
    const { SqlReferenceProvider } = require("./navigation/SqlReferenceProvider")
    const navigator = lazyProviders.astNavigator.get()
    return new SqlReferenceProvider(navigator)
}),
renameProvider: lazy(() => {
    const { SqlRenameProvider } = require("./navigation/SqlRenameProvider")
    const navigator = lazyProviders.astNavigator.get()
    return new SqlRenameProvider(navigator)
}),
```

在 `registerProviders` 函数中，在 `for (const lang of sqlLanguages)` 循环内，在 `registerHoverProvider` 之后添加：

```typescript
const definitionProvider = lazyProviders.definitionProvider.get()
const referenceProvider = lazyProviders.referenceProvider.get()
const renameProvider = lazyProviders.renameProvider.get()

// 在 for 循环内添加：
if (definitionProvider) {
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, definitionProvider)
    )
}

if (referenceProvider) {
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(selector, referenceProvider)
    )
}

if (renameProvider) {
    context.subscriptions.push(
        vscode.languages.registerRenameProvider(selector, renameProvider)
    )
}
```

在 `activate` 函数的 `setTimeout` 回调中，在 `registerProviders` 调用之后添加缓存失效监听：

```typescript
const navigator = lazyProviders.astNavigator.get()
if (navigator) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (isSqlDocument(e.document)) {
                navigator.invalidate(e.document)
            }
        })
    )
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30`
Expected: 无错误

---

### Task 7: 修改 package.json 添加 enableNavigation 配置项

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在 package.json 的 configuration.properties 中添加 enableNavigation 配置**

在 `SQL-All-in-One.enableHover` 配置项之后添加：

```json
"SQL-All-in-One.enableNavigation": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "启用/禁用代码导航功能（跳转到定义、查找引用、重命名符号、面包屑导航）",
    "order": 105
}
```

- [ ] **Step 2: 验证 JSON 格式正确**

Run: `cd /Users/hao/Downloads/sql-all-in-one && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('JSON valid')"`
Expected: `JSON valid`

---

### Task 8: 添加 i18n 翻译

**Files:**
- Modify: `src/i18n/messages.zh.json`
- Modify: `src/i18n/messages.en.json`

- [ ] **Step 1: 在 messages.zh.json 中添加导航相关翻译**

在文件末尾（`}` 之前）添加：

```json
"navigation.cteDefinition": "CTE 定义",
"navigation.tableAliasDefinition": "表别名定义",
"navigation.columnAliasDefinition": "列别名定义",
"navigation.fromReference": "FROM 引用",
"navigation.joinReference": "JOIN 引用",
"navigation.columnReference": "列引用",
"navigation.clauseReference": "子句引用",
"navigation.reservedWord": "'{0}' 是 SQL 保留字，不能用作标识符",
"navigation.nameConflict": "名称 '{0}' 已被使用",
"navigation.invalidName": "名称只能包含字母、数字和下划线，且不能以数字开头"
```

- [ ] **Step 2: 在 messages.en.json 中添加导航相关翻译**

在文件末尾（`}` 之前）添加：

```json
"navigation.cteDefinition": "CTE definition",
"navigation.tableAliasDefinition": "Table alias definition",
"navigation.columnAliasDefinition": "Column alias definition",
"navigation.fromReference": "FROM reference",
"navigation.joinReference": "JOIN reference",
"navigation.columnReference": "Column reference",
"navigation.clauseReference": "Clause reference",
"navigation.reservedWord": "'{0}' is a SQL reserved word and cannot be used as an identifier",
"navigation.nameConflict": "Name '{0}' is already in use",
"navigation.invalidName": "Name can only contain letters, digits, and underscores, and cannot start with a digit"
```

- [ ] **Step 3: 验证 JSON 格式正确**

Run: `cd /Users/hao/Downloads/sql-all-in-one && node -e "JSON.parse(require('fs').readFileSync('src/i18n/messages.zh.json','utf8')); console.log('zh JSON valid')" && node -e "JSON.parse(require('fs').readFileSync('src/i18n/messages.en.json','utf8')); console.log('en JSON valid')"`
Expected: `zh JSON valid` 和 `en JSON valid`

---

### Task 9: 编译验证与 lint 检查

**Files:**
- All modified/created files

- [ ] **Step 1: 运行 TypeScript 编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -20`
Expected: 编译成功，无错误

- [ ] **Step 2: 运行 lint 检查**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run lint 2>&1 | tail -20`
Expected: lint 通过，无错误

---

## Self-Review

### 1. Spec Coverage

| PRD 要求 | 对应 Task |
|----------|-----------|
| AstNavigator 共享导航引擎 | Task 1 |
| Go to Definition (CTE/表别名/列别名) | Task 2 |
| Find All References | Task 3 |
| Rename Symbol (含校验) | Task 4 |
| Breadcrumb 导航增强 | Task 5 |
| extension.ts 注册 | Task 6 |
| enableNavigation 配置项 | Task 7 |
| i18n 翻译 | Task 8 |
| 编译与 lint 验证 | Task 9 |

### 2. Placeholder Scan

无 TBD/TODO/占位符。所有代码步骤包含完整实现。

### 3. Type Consistency

- `AstNavigator` 类在 Task 1 中定义，在 Task 2/3/4/6 中引用，接口一致
- `SymbolIndex` 接口在 Task 1 中导出，在 Task 4 中通过 `import` 引用
- `SymbolType` 类型在 Task 1 中导出，在 Task 3/4 中使用
- `extractName` 函数在 Task 1 中导出，可被其他模块复用
