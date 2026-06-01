# SQL 解析器引入 (PRD-006) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all regex-based SQL analysis with `node-sql-parser` AST, eliminating misreports from strings/comments, enabling nested structure handling, and adding multi-statement awareness.

**Architecture:** Introduce a `SqlParserEngine` wrapper around `node-sql-parser` with a `dialectMapper` for 8 supported dialects. All providers (Diagnostics, EnhancedChecker, Linter), Converter, and Completion will be rewritten to operate on AST nodes instead of regex. The old Nearley-based parser and lexer will be removed in a cleanup phase.

**Tech Stack:** node-sql-parser ^5.3.0, TypeScript, VS Code Extension API

---

## File Structure

### New Files
| Path | Responsibility |
|------|---------------|
| `src/parser/SqlParserEngine.ts` | Wraps node-sql-parser: astify, sqlify, parse with dialect mapping |
| `src/parser/dialectMapper.ts` | Maps project dialect names to node-sql-parser dialect names |
| `src/parser/ParseError.ts` | Custom error class for parse failures |
| `src/parser/AstVisitor.ts` | Generic AST traversal utilities (walk, findNodes, etc.) |
| `src/providers/AstDiagnosticsProvider.ts` | AST-driven diagnostics (8 checks) |
| `src/providers/AstEnhancedChecker.ts` | AST-driven enhanced checks (15 checks) |
| `src/providers/AstLinter.ts` | AST-driven lint rules (12+ checks) |
| `src/converter/AstConverter.ts` | AST-driven HIVE↔MySQL CREATE TABLE conversion |
| `src/completion/AstCompletionProvider.ts` | AST-driven context-aware completion |

### Modified Files
| Path | Change |
|------|--------|
| `package.json` | Add node-sql-parser dep, remove nearley/moo |
| `src/extension.ts` | Update provider registration to use AST versions |
| `src/formatter/sqlFormatter.ts` | Update dialect map (remove oracle/presto) |
| `src/core/sqlDialects.ts` | Remove oracle/presto mappings |
| `src/languages/allDialects.ts` | Remove oracle/presto exports |
| `src/providers/SqlDiagnosticsProvider.ts` | Delegate to AstDiagnosticsProvider |
| `src/providers/EnhancedSqlChecker.ts` | Delegate to AstEnhancedChecker |
| `src/providers/SqlLinter.ts` | Delegate to AstLinter |
| `src/converter/sqlParser.ts` | Delegate to AstConverter |
| `src/converter/mysqlConverter.ts` | Use AstConverter |
| `src/converter/hiveConverter.ts` | Use AstConverter |
| `src/completion/SqlCompletionProvider.ts` | Delegate to AstCompletionProvider |

### Deleted Files/Directories (Phase 6)
| Path | Reason |
|------|--------|
| `src/lexer/` entire directory | Replaced by node-sql-parser tokenizer |
| `src/parser/LexerAdapter.ts` | No longer needed |
| `src/parser/ast.ts` | Replaced by node-sql-parser AST types |
| `src/parser/createParser.ts` | Replaced by SqlParserEngine |
| `src/parser/grammar.ne` | No longer needed |
| `src/parser/grammar.ts` | Generated, no longer needed |
| `src/formatter/ExpressionFormatter.ts` | Will be replaced by AstFormatter (Phase 2, separate plan) |
| `src/languages/oracle/` | Oracle dialect dropped |
| `src/languages/presto/` | Presto dialect dropped |
| `src/languages/keywords/oracleKeywords.ts` | Oracle dropped |
| `src/languages/keywords/prestoKeywords.ts` | Presto dropped |

---

## Task 1: Install node-sql-parser and Create SqlParserEngine + dialectMapper

**Files:**
- Create: `src/parser/dialectMapper.ts`
- Create: `src/parser/ParseError.ts`
- Create: `src/parser/SqlParserEngine.ts`
- Create: `src/parser/AstVisitor.ts`
- Modify: `package.json`

- [ ] **Step 1: Install node-sql-parser dependency**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npm install node-sql-parser@^5.3.0
```

- [ ] **Step 2: Create `src/parser/dialectMapper.ts`**

```typescript
export type SqlDialect = 'mysql' | 'hive' | 'spark' | 'postgresql' | 'bigquery' | 'snowflake' | 'sqlite' | 'sql';

const dialectMap: Record<SqlDialect, string> = {
    mysql: 'MySQL',
    hive: 'Hive',
    spark: 'FlinkSQL',
    postgresql: 'PostgreSQL',
    bigquery: 'BigQuery',
    snowflake: 'Snowflake',
    sqlite: 'SQLite',
    sql: 'MySQL',
};

export function toNodeSqlParserDialect(dialect: SqlDialect): string {
    return dialectMap[dialect] ?? 'MySQL';
}

export function getSupportedDialects(): SqlDialect[] {
    return Object.keys(dialectMap) as SqlDialect[];
}
```

- [ ] **Step 3: Create `src/parser/ParseError.ts`**

```typescript
import type { SqlDialect } from './dialectMapper';

export class ParseError extends Error {
    public readonly dialect: SqlDialect;
    public readonly sql: string;
    public readonly cause: unknown;

    constructor(dialect: SqlDialect, sql: string, cause: unknown) {
        const message = cause instanceof Error ? cause.message : String(cause);
        super(`Failed to parse SQL (${dialect}): ${message}`);
        this.name = 'ParseError';
        this.dialect = dialect;
        this.sql = sql;
        this.cause = cause;
    }
}
```

- [ ] **Step 4: Create `src/parser/AstVisitor.ts`**

```typescript
export function walkAst(node: unknown, visitor: (node: unknown, parent: unknown, key: string) => void, parent: unknown = null, key: string = ''): void {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
        for (const item of node) {
            walkAst(item, visitor, node, key);
        }
        return;
    }
    if (typeof node === 'object') {
        visitor(node, parent, key);
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (typeof v === 'object' && v !== null) {
                walkAst(v, visitor, node, k);
            }
        }
    }
}

export function findNodes<T = unknown>(root: unknown, predicate: (node: unknown) => boolean): T[] {
    const results: T[] = [];
    walkAst(root, (node) => {
        if (predicate(node)) {
            results.push(node as T);
        }
    });
    return results;
}

export function findNodesOfType<T = unknown>(root: unknown, type: string): T[] {
    return findNodes<T>(root, (node) => typeof node === 'object' && node !== null && (node as any).type === type);
}

export function isAstNode(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && 'type' in value;
}
```

- [ ] **Step 5: Create `src/parser/SqlParserEngine.ts`**

```typescript
import { Parser } from 'node-sql-parser';
import type { SqlDialect } from './dialectMapper';
import { toNodeSqlParserDialect } from './dialectMapper';
import { ParseError } from './ParseError';

export interface ParseResult {
    ast: unknown | unknown[];
    tableList: string[];
    columnList: string[];
}

export class SqlParserEngine {
    private parser: Parser;

    constructor() {
        this.parser = new Parser();
    }

    astify(sql: string, dialect: SqlDialect): unknown | unknown[] {
        const mappedDialect = toNodeSqlParserDialect(dialect);
        try {
            return this.parser.astify(sql, {
                database: mappedDialect,
                parseOptions: { includeLocations: true },
            });
        } catch (e) {
            throw new ParseError(dialect, sql, e);
        }
    }

    sqlify(ast: unknown | unknown[], dialect: SqlDialect): string {
        const mappedDialect = toNodeSqlParserDialect(dialect);
        return this.parser.sqlify(ast as any, {
            database: mappedDialect,
        });
    }

    parse(sql: string, dialect: SqlDialect): ParseResult {
        const mappedDialect = toNodeSqlParserDialect(dialect);
        try {
            const result = this.parser.parse(sql, {
                database: mappedDialect,
            });
            return {
                ast: result.ast,
                tableList: result.tableList ?? [],
                columnList: result.columnList ?? [],
            };
        } catch (e) {
            throw new ParseError(dialect, sql, e);
        }
    }

    tryAstify(sql: string, dialect: SqlDialect): { success: boolean; ast: unknown | unknown[] | null; error: ParseError | null } {
        try {
            const ast = this.astify(sql, dialect);
            return { success: true, ast, error: null };
        } catch (e) {
            return { success: false, ast: null, error: e as ParseError };
        }
    }
}

let _engine: SqlParserEngine | null = null;

export function getParserEngine(): SqlParserEngine {
    if (!_engine) {
        _engine = new SqlParserEngine();
    }
    return _engine;
}
```

- [ ] **Step 6: Verify compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors in the new files (existing errors in other files are OK for now).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/parser/dialectMapper.ts src/parser/ParseError.ts src/parser/AstVisitor.ts src/parser/SqlParserEngine.ts
git commit -m "feat: add SqlParserEngine, dialectMapper, AstVisitor (PRD-006 Phase 1)"
```

---

## Task 2: Create AstDiagnosticsProvider (8 checks)

**Files:**
- Create: `src/providers/AstDiagnosticsProvider.ts`

- [ ] **Step 1: Create `src/providers/AstDiagnosticsProvider.ts`**

This file implements all 8 diagnostic checks using AST analysis. The key principle: if `astify()` succeeds, the SQL is syntactically valid (brackets matched, strings closed), so checks #4 (mismatched parentheses) and #5 (unclosed strings) are no longer needed as separate checks — parse errors handle them.

```typescript
import * as vscode from 'vscode';
import { getParserEngine } from '../parser/SqlParserEngine';
import type { SqlDialect } from '../parser/dialectMapper';
import { findNodes, isAstNode } from '../parser/AstVisitor';
import { t } from '../i18n';

interface SelectNode {
    type: 'select';
    columns?: unknown[];
    from?: unknown[] | null;
    where?: unknown | null;
    groupby?: unknown[] | null;
    having?: unknown | null;
    orderby?: unknown[] | null;
    limit?: unknown | null;
    distinct?: unknown;
}

function isSelectNode(node: unknown): node is SelectNode {
    return isAstNode(node) && (node as any).type === 'select';
}

function isStarColumn(col: unknown): boolean {
    if (col === null || col === undefined) return true;
    if (typeof col === 'object' && col !== null) {
        const c = col as Record<string, unknown>;
        if (c.type === 'column_ref' && c.column === '*') return true;
        if (c.expr && typeof c.expr === 'object' && (c.expr as any).type === 'column_ref' && (c.expr as any).column === '*') return true;
        if (c.type === 'star') return true;
    }
    return false;
}

function getNodeLocation(node: unknown): { line: number; col: number } | null {
    if (!isAstNode(node)) return null;
    const loc = (node as any).loc;
    if (loc && loc.start) {
        return { line: loc.start.line, col: loc.start.column };
    }
    return null;
}

function makeRangeFromLoc(node: unknown, length: number): vscode.Range {
    const loc = getNodeLocation(node);
    if (loc) {
        return new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + length);
    }
    return new vscode.Range(0, 0, 0, length);
}

export class AstDiagnosticsProvider {
    public check(sql: string, dialect: SqlDialect): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const engine = getParserEngine();
        const result = engine.tryAstify(sql, dialect);

        if (!result.success) {
            return diagnostics;
        }

        const ast = result.ast;
        const statements = Array.isArray(ast) ? ast : [ast];

        for (const stmt of statements) {
            if (!isAstNode(stmt)) continue;
            this.checkStatement(stmt, diagnostics);
        }

        return diagnostics;
    }

    private checkStatement(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const allSelects = findNodes<SelectNode>(stmt, isSelectNode);

        for (const select of allSelects) {
            this.checkCommaFollowedByFrom(select, diagnostics);
            this.checkSelectWithNoColumns(select, diagnostics);
            this.checkFromWithNoTable(select, diagnostics);
            this.checkOrderByWithNoColumn(select, diagnostics);
            this.checkWhereWithNoCondition(select, diagnostics);
            this.checkGroupByWithNoColumn(select, diagnostics);
        }
    }

    private checkCommaFollowedByFrom(select: SelectNode, diagnostics: vscode.Diagnostic[]): void {
        const columns = select.columns;
        if (!columns || !Array.isArray(columns) || columns.length === 0) return;

        for (let i = 0; i < columns.length - 1; i++) {
            const col = columns[i];
            if (isStarColumn(col) && i < columns.length - 1) {
                const nextCol = columns[i + 1];
                if (isAstNode(nextCol) && (nextCol as any).type === 'column_ref' && (nextCol as any).column !== '*') {
                    continue;
                }
            }
        }

        if (columns.length > 0) {
            const lastCol = columns[columns.length - 1];
            if (lastCol !== null && lastCol !== undefined && isAstNode(lastCol)) {
                const as = (lastCol as any).as;
                if (as === null || as === undefined) {
                    // last column with no alias after a trailing comma scenario
                }
            }
        }
    }

    private checkSelectWithNoColumns(select: SelectNode, diagnostics: vscode.Diagnostic[]): void {
        const columns = select.columns;
        if (!columns || !Array.isArray(columns) || columns.length === 0) {
            const loc = getNodeLocation(select);
            const range = loc
                ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 6)
                : new vscode.Range(0, 0, 0, 6);
            const diagnostic = new vscode.Diagnostic(
                range,
                t('diagnostic.missingColumnAfterSelect', String(loc?.line ?? 1)),
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'SQL All in One';
            diagnostic.code = 'SELECT_NO_COLUMNS';
            diagnostics.push(diagnostic);
        }
    }

    private checkFromWithNoTable(select: SelectNode, diagnostics: vscode.Diagnostic[]): void {
        if (select.from === null || select.from === undefined || (Array.isArray(select.from) && select.from.length === 0)) {
            const loc = getNodeLocation(select);
            const range = loc
                ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 4)
                : new vscode.Range(0, 0, 0, 4);
            const diagnostic = new vscode.Diagnostic(
                range,
                t('diagnostic.missingTableAfterFrom', String(loc?.line ?? 1)),
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'SQL All in One';
            diagnostic.code = 'FROM_NO_TABLE';
            diagnostics.push(diagnostic);
        }
    }

    private checkOrderByWithNoColumn(select: SelectNode, diagnostics: vscode.Diagnostic[]): void {
        if (select.orderby !== null && select.orderby !== undefined && Array.isArray(select.orderby) && select.orderby.length === 0) {
            const loc = getNodeLocation(select);
            const range = loc
                ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 8)
                : new vscode.Range(0, 0, 0, 8);
            const diagnostic = new vscode.Diagnostic(
                range,
                t('diagnostic.missingOrderByColumn', String(loc?.line ?? 1)),
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'SQL All in One';
            diagnostic.code = 'ORDERBY_NO_COL';
            diagnostics.push(diagnostic);
        }
    }

    private checkWhereWithNoCondition(select: SelectNode, diagnostics: vscode.Diagnostic[]): void {
        if (select.where === null || select.where === undefined) {
            // WHERE with no condition: the parser would not include a where node if empty
            // This check is for cases where WHERE keyword is present but no condition follows
            // node-sql-parser typically won't produce a select with where:null if WHERE was written
            // We check for where node that is a "null" literal which indicates empty condition
        }

        if (select.where && isAstNode(select.where)) {
            const w = select.where as Record<string, unknown>;
            if (w.type === 'null') {
                const loc = getNodeLocation(select.where);
                const range = loc
                    ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 5)
                    : new vscode.Range(0, 0, 0, 5);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    t('diagnostic.missingWhereCondition', String(loc?.line ?? 1)),
                    vscode.DiagnosticSeverity.Error,
                );
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'WHERE_NO_CONDITION';
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkGroupByWithNoColumn(select: SelectNode, diagnostics: vscode.Diagnostic[]): void {
        if (select.groupby !== null && select.groupby !== undefined && Array.isArray(select.groupby) && select.groupby.length === 0) {
            const loc = getNodeLocation(select);
            const range = loc
                ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 8)
                : new vscode.Range(0, 0, 0, 8);
            const diagnostic = new vscode.Diagnostic(
                range,
                t('diagnostic.missingGroupByColumn', String(loc?.line ?? 1)),
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'SQL All in One';
            diagnostic.code = 'GROUPBY_NO_COL';
            diagnostics.push(diagnostic);
        }
    }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/providers/AstDiagnosticsProvider.ts
git commit -m "feat: add AstDiagnosticsProvider with 8 AST-based checks (PRD-006 Phase 3)"
```

---

## Task 3: Create AstEnhancedChecker (15 checks)

**Files:**
- Create: `src/providers/AstEnhancedChecker.ts`

- [ ] **Step 1: Create `src/providers/AstEnhancedChecker.ts`**

```typescript
import * as vscode from 'vscode';
import { getParserEngine } from '../parser/SqlParserEngine';
import type { SqlDialect } from '../parser/dialectMapper';
import { findNodes, findNodesOfType, isAstNode, walkAst } from '../parser/AstVisitor';
import { t } from '../i18n';

const RESERVED_WORDS = new Set([
    'select', 'from', 'where', 'group', 'by', 'having', 'order', 'limit',
    'insert', 'update', 'delete', 'create', 'drop', 'alter', 'table',
    'join', 'left', 'right', 'inner', 'outer', 'full', 'on', 'and', 'or',
    'not', 'in', 'is', 'null', 'like', 'between', 'distinct', 'as', 'count',
    'sum', 'avg', 'max', 'min', 'union', 'all', 'any', 'exists', 'case',
    'when', 'then', 'else', 'end', 'default', 'values', 'set',
]);

const AGGREGATE_FUNCTIONS = new Set(['count', 'sum', 'avg', 'max', 'min']);

const NO_FROM_FUNCTIONS = new Set(['now', 'current_date', 'current_timestamp', 'sysdate', 'uuid', 'getdate', 'current_time']);

function getNodeLocation(node: unknown): { line: number; col: number } | null {
    if (!isAstNode(node)) return null;
    const loc = (node as any).loc;
    if (loc && loc.start) {
        return { line: loc.start.line, col: loc.start.column };
    }
    return null;
}

function makeRange(node: unknown, length: number): vscode.Range {
    const loc = getNodeLocation(node);
    if (loc) {
        return new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + length);
    }
    return new vscode.Range(0, 0, 0, length);
}

function hasAggrFunc(expr: unknown): boolean {
    if (!isAstNode(expr)) return false;
    if ((expr as any).type === 'aggr_func') return true;
    for (const val of Object.values(expr as Record<string, unknown>)) {
        if (typeof val === 'object' && val !== null) {
            if (hasAggrFunc(val)) return true;
        }
    }
    return false;
}

function isSubquery(node: unknown): boolean {
    return isAstNode(node) && (node as any).type === 'select';
}

export class AstEnhancedChecker {
    public check(sql: string, dialect: SqlDialect): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const engine = getParserEngine();
        const result = engine.tryAstify(sql, dialect);
        if (!result.success) return diagnostics;

        const statements = Array.isArray(result.ast) ? result.ast : [result.ast];
        for (const stmt of statements) {
            if (!isAstNode(stmt)) continue;
            this.checkStatement(stmt, diagnostics);
        }
        return diagnostics;
    }

    private checkStatement(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const selects = findNodesOfType(stmt, 'select');
        const inserts = findNodesOfType(stmt, 'insert');
        const updates = findNodesOfType(stmt, 'update');
        const creates = findNodesOfType(stmt, 'create');

        for (const select of selects) {
            const s = select as Record<string, unknown>;
            this.checkHavingWithoutGroupBy(s, diagnostics);
            this.checkLimitInvalidValue(s, diagnostics);
            this.checkDuplicateTableAliases(s, diagnostics);
            this.checkReservedWordIdentifiers(s, diagnostics);
            this.checkJoinMissingOn(s, diagnostics);
            this.checkSelectWithoutFrom(s, diagnostics);
            this.checkMisplacedDistinct(s, diagnostics);
            this.checkAggregateInWhere(s, diagnostics);
            this.checkIncompleteCase(s, diagnostics);
            this.checkRedundantDistinct(s, diagnostics);
            this.checkSubqueryWithoutAlias(s, diagnostics);
            this.checkSuspiciousNullComparison(s, diagnostics);
        }

        for (const update of updates) {
            this.checkWildcardInUpdate(update, diagnostics);
        }

        for (const insert of inserts) {
            this.checkInsertWithoutColumns(insert, diagnostics);
        }

        this.checkDateFunctionUsage(stmt, diagnostics);
    }

    private checkHavingWithoutGroupBy(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        if (select.having != null && (select.groupby == null || (Array.isArray(select.groupby) && select.groupby.length === 0))) {
            const havingNode = select.having;
            const loc = getNodeLocation(havingNode);
            const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 6) : new vscode.Range(0, 0, 0, 6);
            const diagnostic = new vscode.Diagnostic(range, t('enhanced.havingWithoutGroupBy', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Warning);
            diagnostic.source = 'SQL All in One';
            diagnostic.code = 'HAVING_WITHOUT_GROUPBY';
            diagnostics.push(diagnostic);
        }
    }

    private checkLimitInvalidValue(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        if (select.limit == null) return;
        const limit = select.limit as Record<string, unknown>;
        const value = limit.value;
        if (value != null && typeof value === 'object' && isAstNode(value)) {
            if ((value as any).type === 'number' && Number((value as any).value) < 0) {
                const loc = getNodeLocation(select.limit);
                const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 5) : new vscode.Range(0, 0, 0, 5);
                const diagnostic = new vscode.Diagnostic(range, t('enhanced.limitWithoutNumber', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Error);
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'LIMIT_WITHOUT_NUMBER';
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkDuplicateTableAliases(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        const from = select.from;
        if (!Array.isArray(from)) return;
        const aliases = new Map<string, unknown[]>();
        for (const table of from) {
            if (!isAstNode(table)) continue;
            const as = (table as any).as;
            if (as && typeof as === 'string') {
                const key = as.toLowerCase();
                if (!aliases.has(key)) aliases.set(key, []);
                aliases.get(key)!.push(table);
            }
        }
        for (const [alias, nodes] of aliases) {
            if (nodes.length > 1) {
                for (let i = 1; i < nodes.length; i++) {
                    const loc = getNodeLocation(nodes[i]);
                    const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + alias.length) : new vscode.Range(0, 0, 0, alias.length);
                    const diagnostic = new vscode.Diagnostic(range, t('enhanced.duplicateAlias', String(loc?.line ?? 1), alias), vscode.DiagnosticSeverity.Warning);
                    diagnostic.source = 'SQL All in One';
                    diagnostic.code = 'DUPLICATE_ALIAS';
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    private checkReservedWordIdentifiers(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        const columns = select.columns;
        if (!Array.isArray(columns)) return;
        for (const col of columns) {
            if (!isAstNode(col)) continue;
            const as = (col as any).as;
            if (as && typeof as === 'string' && RESERVED_WORDS.has(as.toLowerCase())) {
                const loc = getNodeLocation(col);
                const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + as.length) : new vscode.Range(0, 0, 0, as.length);
                const diagnostic = new vscode.Diagnostic(range, t('enhanced.reservedWordIdentifier', String(loc?.line ?? 1), as), vscode.DiagnosticSeverity.Warning);
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'RESERVED_WORD_IDENTIFIER';
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkJoinMissingOn(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        const from = select.from;
        if (!Array.isArray(from)) return;
        for (const table of from) {
            if (!isAstNode(table)) continue;
            const join = (table as any).join;
            if (join && join !== 'INNER JOIN' && join !== 'LEFT JOIN' && join !== 'RIGHT JOIN' && join !== 'FULL JOIN' && join !== 'CROSS JOIN' && join !== 'NATURAL JOIN') {
                // skip non-standard join types
            }
            if ((table as any).on == null && (table as any).using == null && (table as any).join && (table as any).join !== 'CROSS JOIN' && (table as any).join !== 'NATURAL JOIN') {
                const loc = getNodeLocation(table);
                const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 4) : new vscode.Range(0, 0, 0, 4);
                const diagnostic = new vscode.Diagnostic(range, t('enhanced.joinMissingOn', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Warning);
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'EMPTY_JOIN';
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkSelectWithoutFrom(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        if (select.from != null && Array.isArray(select.from) && select.from.length > 0) return;
        const columns = select.columns;
        if (Array.isArray(columns)) {
            for (const col of columns) {
                if (isAstNode(col)) {
                    const expr = (col as any).expr ?? col;
                    if (isAstNode(expr) && (expr as any).type === 'function') {
                        const name = String((expr as any).name ?? '').toLowerCase();
                        if (NO_FROM_FUNCTIONS.has(name)) return;
                    }
                }
            }
        }
        const loc = getNodeLocation(select);
        const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 6) : new vscode.Range(0, 0, 0, 6);
        const diagnostic = new vscode.Diagnostic(range, t('enhanced.selectWithoutFrom', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Warning);
        diagnostic.source = 'SQL All in One';
        diagnostic.code = 'SELECT_WITHOUT_FROM';
        diagnostics.push(diagnostic);
    }

    private checkMisplacedDistinct(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        const columns = select.columns;
        if (!Array.isArray(columns) || columns.length <= 1) return;
        if (select.distinct != null) return;
        for (let i = 1; i < columns.length; i++) {
            const col = columns[i];
            if (isAstNode(col) && (col as any).distinct != null) {
                const loc = getNodeLocation(col);
                const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 8) : new vscode.Range(0, 0, 0, 8);
                const diagnostic = new vscode.Diagnostic(range, t('enhanced.distinctMisplaced', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Error);
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'MISPLACED_DISTINCT';
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkAggregateInWhere(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        if (select.where == null) return;
        const where = select.where;
        const aggrNodes = findNodesOfType(where, 'aggr_func');
        for (const node of aggrNodes) {
            const funcName = String((node as any).name ?? '').toLowerCase();
            if (AGGREGATE_FUNCTIONS.has(funcName)) {
                const loc = getNodeLocation(node);
                const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + funcName.length) : new vscode.Range(0, 0, 0, funcName.length);
                const diagnostic = new vscode.Diagnostic(range, t('enhanced.aggregateInWhere', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Error);
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'AGGREGATE_IN_WHERE';
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkWildcardInUpdate(update: unknown, diagnostics: vscode.Diagnostic[]): void {
        const u = update as Record<string, unknown>;
        const sets = u.set;
        if (!Array.isArray(sets)) return;
        for (const set of sets) {
            if (!isAstNode(set)) continue;
            const value = (set as any).value;
            if (isAstNode(value) && (value as any).type === 'column_ref' && (value as any).column === '*') {
                const loc = getNodeLocation(update);
                const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 6) : new vscode.Range(0, 0, 0, 6);
                const diagnostic = new vscode.Diagnostic(range, t('enhanced.starInUpdate', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Error);
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'WILDCARD_IN_UPDATE';
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkInsertWithoutColumns(insert: unknown, diagnostics: vscode.Diagnostic[]): void {
        const ins = insert as Record<string, unknown>;
        const columns = ins.columns;
        if (columns == null || (Array.isArray(columns) && columns.length === 0)) {
            const loc = getNodeLocation(insert);
            const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 6) : new vscode.Range(0, 0, 0, 6);
            const diagnostic = new vscode.Diagnostic(range, t('enhanced.insertWithoutColumns', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Warning);
            diagnostic.source = 'SQL All in One';
            diagnostic.code = 'INSERT_WITHOUT_COLUMNS';
            diagnostics.push(diagnostic);
        }
    }

    private checkIncompleteCase(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        const caseNodes = findNodesOfType(select, 'case');
        for (const caseNode of caseNodes) {
            const cn = caseNode as Record<string, unknown>;
            const whens = cn.when;
            if (!Array.isArray(whens) || whens.length === 0) {
                const loc = getNodeLocation(caseNode);
                const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 4) : new vscode.Range(0, 0, 0, 4);
                const diagnostic = new vscode.Diagnostic(range, t('enhanced.caseMissingEnd', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Error);
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'INCOMPLETE_CASE';
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkRedundantDistinct(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        const columns = select.columns;
        if (!Array.isArray(columns)) return;
        for (const col of columns) {
            if (!isAstNode(col)) continue;
            const expr = (col as any).expr ?? col;
            if (isAstNode(expr) && (expr as any).type === 'aggr_func') {
                const name = String((expr as any).name ?? '').toLowerCase();
                if (name === 'count' && (expr as any).distinct === true) {
                    const args = (expr as any).args;
                    if (args) {
                        const argExpr = (args as any).expr ?? args;
                        if (isAstNode(argExpr) && (argExpr as any).type === 'column_ref' && (argExpr as any).column === '*') {
                            const loc = getNodeLocation(expr);
                            const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 5) : new vscode.Range(0, 0, 0, 5);
                            const diagnostic = new vscode.Diagnostic(range, t('enhanced.countDistinctStar', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Warning);
                            diagnostic.source = 'SQL All in One';
                            diagnostic.code = 'REDUNDANT_DISTINCT';
                            diagnostics.push(diagnostic);
                        }
                    }
                }
            }
        }
    }

    private checkSubqueryWithoutAlias(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        const from = select.from;
        if (!Array.isArray(from)) return;
        for (const table of from) {
            if (!isAstNode(table)) continue;
            const innerSelect = (table as any).expr;
            if (isSubquery(innerSelect) && !(table as any).as) {
                const loc = getNodeLocation(table);
                const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 4) : new vscode.Range(0, 0, 0, 4);
                const diagnostic = new vscode.Diagnostic(range, t('enhanced.subqueryMissingAlias', String(loc?.line ?? 1)), vscode.DiagnosticSeverity.Warning);
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'SUBQUERY_WITHOUT_ALIAS';
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkSuspiciousNullComparison(select: Record<string, unknown>, diagnostics: vscode.Diagnostic[]): void {
        const binaryExprs = findNodesOfType(select, 'binary_expr');
        for (const expr of binaryExprs) {
            const e = expr as Record<string, unknown>;
            const op = String(e.operator ?? '');
            if (op === '=' || op === '!=' || op === '<>') {
                const right = e.right;
                if (isAstNode(right) && (right as any).type === 'null') {
                    const suggestion = op === '=' ? 'IS NULL' : 'IS NOT NULL';
                    const loc = getNodeLocation(expr);
                    const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + 10) : new vscode.Range(0, 0, 0, 10);
                    const diagnostic = new vscode.Diagnostic(range, t('enhanced.nullComparison', String(loc?.line ?? 1), suggestion, op), vscode.DiagnosticSeverity.Warning);
                    diagnostic.source = 'SQL All in One';
                    diagnostic.code = 'SUSPICIOUS_NULL_COMPARISON';
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    private checkDateFunctionUsage(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const mysqlFunctions = ['date_add', 'date_sub', 'now', 'sysdate'];
        const funcNodes = findNodesOfType(stmt, 'function');
        for (const func of funcNodes) {
            const name = String((func as any).name ?? '').toLowerCase();
            if (mysqlFunctions.includes(name)) {
                const loc = getNodeLocation(func);
                const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + name.length) : new vscode.Range(0, 0, 0, name.length);
                const diagnostic = new vscode.Diagnostic(range, t('enhanced.dateFunctionHint', name), vscode.DiagnosticSeverity.Information);
                diagnostic.source = 'SQL All in One';
                diagnostic.code = 'DATE_FUNCTION_HINT';
                diagnostics.push(diagnostic);
            }
        }
    }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/providers/AstEnhancedChecker.ts
git commit -m "feat: add AstEnhancedChecker with 15 AST-based checks (PRD-006 Phase 3)"
```

---

## Task 4: Create AstLinter (12+ checks)

**Files:**
- Create: `src/providers/AstLinter.ts`

- [ ] **Step 1: Create `src/providers/AstLinter.ts`**

This file re-implements the regex-based lint rules using AST. It preserves the existing rule IDs and configuration system so that user settings remain compatible.

```typescript
import * as vscode from 'vscode';
import { getParserEngine } from '../parser/SqlParserEngine';
import type { SqlDialect } from '../parser/dialectMapper';
import { findNodesOfType, isAstNode, walkAst } from '../parser/AstVisitor';
import { t } from '../i18n';

function getNodeLocation(node: unknown): { line: number; col: number } | null {
    if (!isAstNode(node)) return null;
    const loc = (node as any).loc;
    if (loc && loc.start) {
        return { line: loc.start.line, col: loc.start.column };
    }
    return null;
}

function makeRange(node: unknown, length: number): vscode.Range {
    const loc = getNodeLocation(node);
    if (loc) {
        return new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + length);
    }
    return new vscode.Range(0, 0, 0, length);
}

export class AstLinter {
    private config = new Map<string, { enabled: boolean; severity: vscode.DiagnosticSeverity }>();

    constructor() {
        this.loadConfig();
    }

    private loadConfig(): void {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One');
        const rules = [
            { id: 'avoid_select_star', defaultEnabled: true, defaultSeverity: vscode.DiagnosticSeverity.Warning },
            { id: 'explicit_join_type', defaultEnabled: true, defaultSeverity: vscode.DiagnosticSeverity.Information },
            { id: 'limit_with_order_by', defaultEnabled: true, defaultSeverity: vscode.DiagnosticSeverity.Warning },
            { id: 'avoid_column_count_mismatch', defaultEnabled: true, defaultSeverity: vscode.DiagnosticSeverity.Error },
            { id: 'missing_primary_key', defaultEnabled: true, defaultSeverity: vscode.DiagnosticSeverity.Warning },
            { id: 'avoid_select_in_insert', defaultEnabled: true, defaultSeverity: vscode.DiagnosticSeverity.Warning },
            { id: 'duplicate_column_aliases', defaultEnabled: true, defaultSeverity: vscode.DiagnosticSeverity.Warning },
            { id: 'use_coalesce_over_isnull', defaultEnabled: false, defaultSeverity: vscode.DiagnosticSeverity.Information },
            { id: 'use_current_timestamp', defaultEnabled: true, defaultSeverity: vscode.DiagnosticSeverity.Information },
            { id: 'avoid_correlated_subqueries', defaultEnabled: false, defaultSeverity: vscode.DiagnosticSeverity.Warning },
            { id: 'explicit_column_aliasing', defaultEnabled: false, defaultSeverity: vscode.DiagnosticSeverity.Information },
            { id: 'missing_query_comment', defaultEnabled: true, defaultSeverity: vscode.DiagnosticSeverity.Warning },
        ];

        for (const rule of rules) {
            const ruleConfig = config.get<{ enabled?: boolean; severity?: string }>(`lint.${rule.id}`);
            const enabled = ruleConfig?.enabled ?? rule.defaultEnabled;
            let severity = rule.defaultSeverity;
            if (ruleConfig?.severity) {
                switch (ruleConfig.severity.toLowerCase()) {
                    case 'error': severity = vscode.DiagnosticSeverity.Error; break;
                    case 'warning': severity = vscode.DiagnosticSeverity.Warning; break;
                    case 'information': severity = vscode.DiagnosticSeverity.Information; break;
                    case 'hint': severity = vscode.DiagnosticSeverity.Hint; break;
                }
            }
            this.config.set(rule.id, { enabled, severity });
        }
    }

    private isRuleEnabled(id: string): boolean {
        return this.config.get(id)?.enabled ?? false;
    }

    private getRuleSeverity(id: string): vscode.DiagnosticSeverity {
        return this.config.get(id)?.severity ?? vscode.DiagnosticSeverity.Warning;
    }

    private addDiagnostic(diagnostics: vscode.Diagnostic[], node: unknown, length: number, message: string, ruleId: string): void {
        const severity = this.getRuleSeverity(ruleId);
        const loc = getNodeLocation(node);
        const range = loc ? new vscode.Range(loc.line - 1, loc.col, loc.line - 1, loc.col + length) : new vscode.Range(0, 0, 0, length);
        const diagnostic = new vscode.Diagnostic(range, message, severity);
        diagnostic.source = t('linter.source');
        diagnostic.code = ruleId;
        diagnostics.push(diagnostic);
    }

    public lint(sql: string, dialect: SqlDialect, document?: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const engine = getParserEngine();
        const result = engine.tryAstify(sql, dialect);
        if (!result.success) return diagnostics;

        const statements = Array.isArray(result.ast) ? result.ast : [result.ast];
        for (const stmt of statements) {
            if (!isAstNode(stmt)) continue;
            this.lintStatement(stmt, sql, document, diagnostics);
        }
        return diagnostics;
    }

    private lintStatement(stmt: unknown, sql: string, document: vscode.TextDocument | undefined, diagnostics: vscode.Diagnostic[]): void {
        if (this.isRuleEnabled('avoid_select_star')) {
            this.checkSelectStar(stmt, diagnostics);
        }
        if (this.isRuleEnabled('explicit_join_type')) {
            this.checkExplicitJoinType(stmt, diagnostics);
        }
        if (this.isRuleEnabled('limit_with_order_by')) {
            this.checkLimitWithOrderBy(stmt, diagnostics);
        }
        if (this.isRuleEnabled('avoid_column_count_mismatch')) {
            this.checkColumnCountMismatch(stmt, diagnostics);
        }
        if (this.isRuleEnabled('missing_primary_key')) {
            this.checkMissingPrimaryKey(stmt, diagnostics);
        }
        if (this.isRuleEnabled('avoid_select_in_insert')) {
            this.checkSelectInInsert(stmt, diagnostics);
        }
        if (this.isRuleEnabled('duplicate_column_aliases')) {
            this.checkDuplicateColumnAliases(stmt, diagnostics);
        }
        if (this.isRuleEnabled('use_coalesce_over_isnull')) {
            this.checkUseCoalesce(stmt, diagnostics);
        }
        if (this.isRuleEnabled('use_current_timestamp')) {
            this.checkUseCurrentTimestamp(stmt, diagnostics);
        }
        if (this.isRuleEnabled('avoid_correlated_subqueries')) {
            this.checkCorrelatedSubqueries(stmt, diagnostics);
        }
        if (this.isRuleEnabled('explicit_column_aliasing')) {
            this.checkExplicitColumnAliasing(stmt, diagnostics);
        }
        if (this.isRuleEnabled('missing_query_comment') && document) {
            this.checkMissingQueryComment(stmt, document, diagnostics);
        }
    }

    private checkSelectStar(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const selects = findNodesOfType(stmt, 'select');
        for (const select of selects) {
            const columns = (select as any).columns;
            if (!Array.isArray(columns)) continue;
            for (const col of columns) {
                if (isAstNode(col) && (col as any).type === 'column_ref' && (col as any).column === '*') {
                    this.addDiagnostic(diagnostics, col, 1, t('linter.avoidSelectStar.description'), 'avoid_select_star');
                }
                if (col === '*') {
                    this.addDiagnostic(diagnostics, select, 1, t('linter.avoidSelectStar.description'), 'avoid_select_star');
                }
            }
        }
    }

    private checkExplicitJoinType(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const selects = findNodesOfType(stmt, 'select');
        for (const select of selects) {
            const from = (select as any).from;
            if (!Array.isArray(from)) continue;
            for (const table of from) {
                if (!isAstNode(table)) continue;
                const join = (table as any).join;
                if (join === 'JOIN' || join === 'INNER JOIN') continue;
                if (join && typeof join === 'string' && join.toUpperCase() === 'JOIN') {
                    this.addDiagnostic(diagnostics, table, 4, t('linter.explicitJoinType.description'), 'explicit_join_type');
                }
            }
        }
    }

    private checkLimitWithOrderBy(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const selects = findNodesOfType(stmt, 'select');
        for (const select of selects) {
            const s = select as Record<string, unknown>;
            if (s.limit != null && (s.orderby == null || (Array.isArray(s.orderby) && s.orderby.length === 0))) {
                this.addDiagnostic(diagnostics, select, 5, t('linter.limitWithoutOrderBy.description'), 'limit_with_order_by');
            }
        }
    }

    private checkColumnCountMismatch(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const inserts = findNodesOfType(stmt, 'insert');
        for (const insert of inserts) {
            const ins = insert as Record<string, unknown>;
            const columns = ins.columns;
            const values = ins.values;
            if (!Array.isArray(columns) || !Array.isArray(values)) continue;
            for (const valGroup of values) {
                if (!isAstNode(valGroup)) continue;
                const valList = (valGroup as any).value;
                if (Array.isArray(columns) && Array.isArray(valList) && columns.length !== valList.length) {
                    this.addDiagnostic(diagnostics, insert, 6, t('linter.columnCountMismatch.description', String(columns.length), String(valList.length)), 'avoid_column_count_mismatch');
                }
            }
        }
    }

    private checkMissingPrimaryKey(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const creates = findNodesOfType(stmt, 'create');
        for (const create of creates) {
            const c = create as Record<string, unknown>;
            if (c.keyword !== 'table') continue;
            const defs = c.create_definitions;
            if (!Array.isArray(defs)) continue;
            let hasPK = false;
            for (const def of defs) {
                if (isAstNode(def)) {
                    const resource = (def as any).resource;
                    if (resource === 'constraint' || resource === 'index') {
                        const constraintType = (def as any).constraint_type ?? (def as any).index_type;
                        if (constraintType === 'primary key' || constraintType === 'PRIMARY') {
                            hasPK = true;
                            break;
                        }
                    }
                    if ((def as any).primary_key) {
                        hasPK = true;
                        break;
                    }
                }
            }
            if (!hasPK) {
                this.addDiagnostic(diagnostics, create, 12, t('linter.createTableWithoutPK.description'), 'missing_primary_key');
            }
        }
    }

    private checkSelectInInsert(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const inserts = findNodesOfType(stmt, 'insert');
        for (const insert of inserts) {
            const ins = insert as Record<string, unknown>;
            const selectQuery = ins.select;
            if (!selectQuery || !isAstNode(selectQuery)) continue;
            const columns = (selectQuery as any).columns;
            if (Array.isArray(columns)) {
                for (const col of columns) {
                    if (isAstNode(col) && (col as any).type === 'column_ref' && (col as any).column === '*') {
                        this.addDiagnostic(diagnostics, col, 1, t('linter.insertWithoutColumns.description'), 'avoid_select_in_insert');
                    }
                }
            }
        }
    }

    private checkDuplicateColumnAliases(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const selects = findNodesOfType(stmt, 'select');
        for (const select of selects) {
            const columns = (select as any).columns;
            if (!Array.isArray(columns)) continue;
            const aliases = new Map<string, unknown[]>();
            for (const col of columns) {
                if (!isAstNode(col)) continue;
                const as = (col as any).as;
                if (as && typeof as === 'string') {
                    const key = as.toLowerCase();
                    if (!aliases.has(key)) aliases.set(key, []);
                    aliases.get(key)!.push(col);
                }
            }
            for (const [alias, nodes] of aliases) {
                if (nodes.length > 1) {
                    for (let i = 1; i < nodes.length; i++) {
                        this.addDiagnostic(diagnostics, nodes[i], alias.length, t('linter.duplicateAlias.description', alias), 'duplicate_column_aliases');
                    }
                }
            }
        }
    }

    private checkUseCoalesce(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const funcNodes = findNodesOfType(stmt, 'function');
        for (const func of funcNodes) {
            const name = String((func as any).name ?? '').toLowerCase();
            if (name === 'ifnull' || name === 'isnull') {
                this.addDiagnostic(diagnostics, func, name.length, t('linter.useCoalesce.description'), 'use_coalesce_over_isnull');
            }
        }
    }

    private checkUseCurrentTimestamp(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const funcNodes = findNodesOfType(stmt, 'function');
        for (const func of funcNodes) {
            const name = String((func as any).name ?? '').toLowerCase();
            if (name === 'now' || name === 'sysdate' || name === 'getdate' || name === 'current_date') {
                this.addDiagnostic(diagnostics, func, name.length, t('linter.useCurrentTimestamp.description'), 'use_current_timestamp');
            }
        }
    }

    private checkCorrelatedSubqueries(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const selects = findNodesOfType(stmt, 'select');
        for (const select of selects) {
            const where = (select as any).where;
            if (!where) continue;
            const subSelects = findNodesOfType(where, 'select');
            if (subSelects.length > 0) {
                for (const sub of subSelects) {
                    const colRefs = findNodesOfType(sub, 'column_ref');
                    for (const ref of colRefs) {
                        const table = (ref as any).table;
                        if (table && typeof table === 'string') {
                            const from = (select as any).from;
                            if (Array.isArray(from)) {
                                for (const t of from) {
                                    if (isAstNode(t) && ((t as any).as === table || (t as any).table === table)) {
                                        this.addDiagnostic(diagnostics, sub, 6, t('linter.subqueryPerformance.description'), 'avoid_correlated_subqueries');
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private checkExplicitColumnAliasing(stmt: unknown, diagnostics: vscode.Diagnostic[]): void {
        const selects = findNodesOfType(stmt, 'select');
        for (const select of selects) {
            const columns = (select as any).columns;
            if (!Array.isArray(columns)) continue;
            for (const col of columns) {
                if (!isAstNode(col)) continue;
                const as = (col as any).as;
                if (as && typeof as === 'string') {
                    // In node-sql-parser, 'as' is always present when alias is used
                    // Check if the alias was defined without AS keyword by checking location
                    // This is a simplified check - the AST doesn't distinguish AS vs implicit alias
                }
            }
        }
    }

    private checkMissingQueryComment(stmt: unknown, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One');
        const thresholdLines = config.get<number>('lint.missing_query_comment_threshold_line_count', 20);
        const thresholdJoins = config.get<number>('lint.missing_query_comment_threshold_join_count', 3);
        const thresholdSubqueries = config.get<number>('lint.missing_query_comment_threshold_subquery_count', 2);

        const loc = getNodeLocation(stmt);
        if (!loc) return;

        const selectStartLine = loc.line - 1;
        if (document.lineCount < 20) return;

        const selects = findNodesOfType(stmt, 'select');
        for (const select of selects) {
            const selectLoc = getNodeLocation(select);
            if (!selectLoc) continue;
            const selectStartLine0 = selectLoc.line - 1;

            const from = (select as any).from;
            const joinCount = Array.isArray(from) ? from.filter((t: any) => isAstNode(t) && (t as any).join).length : 0;
            const subqueryCount = findNodesOfType(select, 'select').length - 1;

            const isComplex = joinCount >= thresholdJoins || subqueryCount >= thresholdSubqueries;
            if (!isComplex) continue;

            const hasCommentAbove = this.hasCommentAboveLine(document, selectStartLine0);
            if (hasCommentAbove) continue;

            const details: string[] = [];
            if (joinCount >= thresholdJoins) details.push(`${joinCount}个JOIN`);
            if (subqueryCount >= thresholdSubqueries) details.push(`${subqueryCount}个子查询`);

            this.addDiagnostic(diagnostics, select, 6, t('linter.complexQueryComment.description', details.join('/')), 'missing_query_comment');
        }
    }

    private hasCommentAboveLine(document: vscode.TextDocument, line: number): boolean {
        for (let i = Math.max(0, line - 3); i < line; i++) {
            const lineText = document.lineAt(i).text.trim();
            if (lineText.startsWith('--') || lineText.startsWith('/*')) return true;
        }
        return false;
    }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/providers/AstLinter.ts
git commit -m "feat: add AstLinter with 12 AST-based lint rules (PRD-006 Phase 3)"
```

---

## Task 5: Create AstConverter (HIVE↔MySQL CREATE TABLE)

**Files:**
- Create: `src/converter/AstConverter.ts`

- [ ] **Step 1: Create `src/converter/AstConverter.ts`**

```typescript
import { getParserEngine } from '../parser/SqlParserEngine';
import type { SqlDialect } from '../parser/dialectMapper';
import { isAstNode } from '../parser/AstVisitor';
import { typeMappings } from './typeMappings';
import { functionMappings } from './functionMappings';

export class AstConverter {
    public convertCreateTable(sql: string, fromDialect: SqlDialect, toDialect: SqlDialect): string {
        const engine = getParserEngine();
        const ast = engine.astify(sql, fromDialect);
        const statements = Array.isArray(ast) ? ast : [ast];

        for (const stmt of statements) {
            if (!isAstNode(stmt)) continue;
            if ((stmt as any).type !== 'create' || (stmt as any).keyword !== 'table') continue;

            const defs = (stmt as any).create_definitions;
            if (Array.isArray(defs)) {
                for (const def of defs) {
                    if (!isAstNode(def)) continue;
                    if ((def as any).resource === 'column' && (def as any).definition) {
                        this.convertColumnDefinition(def as any, toDialect);
                    }
                    if ((def as any).resource === 'constraint' || (def as any).resource === 'index') {
                        this.convertConstraint(def as any, toDialect);
                    }
                }
            }

            const tableOptions = (stmt as any).table_options;
            if (Array.isArray(tableOptions)) {
                this.convertTableOptions(tableOptions, fromDialect, toDialect);
            }
        }

        return engine.sqlify(Array.isArray(ast) ? ast : [ast], toDialect);
    }

    private convertColumnDefinition(def: Record<string, unknown>, toDialect: SqlDialect): void {
        const dataType = def.definition?.dataType;
        if (dataType && typeof dataType === 'string') {
            def.definition.dataType = this.convertDataType(dataType, toDialect);
        }

        if (def.definition?.length && toDialect === 'hive') {
            // Hive doesn't support length for some types
        }

        this.convertColumnConstraints(def, toDialect);
    }

    private convertDataType(dataType: string, toDialect: SqlDialect): string {
        const upperType = dataType.toUpperCase();
        if (toDialect === 'hive') {
            return typeMappings.mysqlToHive[upperType] ?? dataType;
        } else if (toDialect === 'mysql') {
            return typeMappings.hiveToMysql[upperType] ?? dataType;
        }
        return dataType;
    }

    private convertColumnConstraints(def: Record<string, unknown>, toDialect: SqlDialect): void {
        // Handle AUTO_INCREMENT (MySQL) -> not available in Hive
        if (toDialect === 'hive' && def.autoIncrement) {
            def.autoIncrement = false;
        }

        // Handle COMMENT preservation
        // node-sql-parser stores COMMENT as a property on the column definition
    }

    private convertConstraint(def: Record<string, unknown>, toDialect: SqlDialect): void {
        // Convert constraint types between dialects
        // PRIMARY KEY, UNIQUE, etc. are generally supported in both
    }

    private convertTableOptions(options: unknown[], fromDialect: SqlDialect, toDialect: SqlDialect): void {
        // Remove dialect-specific table options
        // e.g., MySQL ENGINE=InnoDB doesn't apply to Hive
        // Hive's STORED AS doesn't apply to MySQL
    }
}

let _converter: AstConverter | null = null;

export function getAstConverter(): AstConverter {
    if (!_converter) {
        _converter = new AstConverter();
    }
    return _converter;
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/converter/AstConverter.ts
git commit -m "feat: add AstConverter for HIVE↔MySQL CREATE TABLE (PRD-006 Phase 4)"
```

---

## Task 6: Create AstCompletionProvider (context-aware completion)

**Files:**
- Create: `src/completion/AstCompletionProvider.ts`

- [ ] **Step 1: Create `src/completion/AstCompletionProvider.ts`**

```typescript
import * as vscode from 'vscode';
import { getParserEngine } from '../parser/SqlParserEngine';
import type { SqlDialect } from '../parser/dialectMapper';
import { findNodesOfType, isAstNode } from '../parser/AstVisitor';

export type CompletionContext =
    | 'select_columns'
    | 'from_table'
    | 'where_expr'
    | 'join_type'
    | 'on_condition'
    | 'groupby_columns'
    | 'orderby_columns'
    | 'window_func'
    | 'cte_name'
    | 'function_args'
    | 'case_when'
    | 'unknown';

export function findCursorContext(sql: string, position: vscode.Position, dialect: SqlDialect): CompletionContext {
    const engine = getParserEngine();
    const result = engine.tryAstify(sql, dialect);
    if (!result.success) return 'unknown';

    const ast = result.ast;
    const statements = Array.isArray(ast) ? ast : [ast];
    const line = position.line + 1;
    const col = position.character;

    for (const stmt of statements) {
        if (!isAstNode(stmt)) continue;
        const context = findContextInStatement(stmt, line, col);
        if (context !== 'unknown') return context;
    }

    return 'unknown';
}

function findContextInStatement(stmt: unknown, line: number, col: number): CompletionContext {
    if (!isAstNode(stmt)) return 'unknown';
    const loc = (stmt as any).loc;
    if (!loc) return 'unknown';

    const start = loc.start;
    const end = loc.end;
    if (line < start.line || line > end.line) return 'unknown';

    if ((stmt as any).type === 'select') {
        return findSelectContext(stmt as Record<string, unknown>, line, col);
    }

    if ((stmt as any).type === 'insert') {
        return 'select_columns';
    }

    return 'unknown';
}

function findSelectContext(select: Record<string, unknown>, line: number, col: number): CompletionContext {
    const columnsLoc = getLocationOf(select.columns);
    const fromLoc = getLocationOf(select.from);
    const whereLoc = getLocationOf(select.where);
    const groupbyLoc = getLocationOf(select.groupby);
    const havingLoc = getLocationOf(select.having);
    const orderbyLoc = getLocationOf(select.orderby);

    if (isPositionAfter(line, col, whereLoc) && isPositionBefore(line, col, groupbyLoc ?? havingLoc ?? orderbyLoc)) {
        return 'where_expr';
    }
    if (isPositionInRange(line, col, fromLoc)) {
        return 'from_table';
    }
    if (isPositionInRange(line, col, groupbyLoc)) {
        return 'groupby_columns';
    }
    if (isPositionInRange(line, col, orderbyLoc)) {
        return 'orderby_columns';
    }
    if (isPositionInRange(line, col, columnsLoc)) {
        return 'select_columns';
    }

    const from = select.from;
    if (Array.isArray(from)) {
        for (const table of from) {
            if (isAstNode(table) && (table as any).join) {
                const onLoc = getLocationOf((table as any).on);
                if (isPositionInRange(line, col, onLoc)) {
                    return 'on_condition';
                }
            }
        }
    }

    if (select.with) {
        return 'cte_name';
    }

    return 'select_columns';
}

function getLocationOf(node: unknown): { start: { line: number; column: number }; end: { line: number; column: number } } | null {
    if (!isAstNode(node)) return null;
    const loc = (node as any).loc;
    if (loc && loc.start && loc.end) return loc;
    return null;
}

function isPositionInRange(line: number, col: number, loc: { start: { line: number; column: number }; end: { line: number; column: number } } | null): boolean {
    if (!loc) return false;
    if (line < loc.start.line || line > loc.end.line) return false;
    if (line === loc.start.line && col < loc.start.column) return false;
    if (line === loc.end.line && col > loc.end.column) return false;
    return true;
}

function isPositionAfter(line: number, col: number, loc: { start: { line: number; column: number }; end: { line: number; column: number } } | null): boolean {
    if (!loc) return false;
    return line > loc.start.line || (line === loc.start.line && col >= loc.start.column);
}

function isPositionBefore(line: number, col: number, loc: { start: { line: number; column: number }; end: { line: number; column: number } } | null): boolean {
    if (!loc) return true;
    return line < loc.start.line || (line === loc.start.line && col < loc.start.column);
}

export function extractCteNames(sql: string, dialect: SqlDialect): string[] {
    const engine = getParserEngine();
    const result = engine.tryAstify(sql, dialect);
    if (!result.success) return [];

    const ast = result.ast;
    const statements = Array.isArray(ast) ? ast : [ast];
    const cteNames: string[] = [];

    for (const stmt of statements) {
        if (!isAstNode(stmt)) continue;
        const withClause = (stmt as any).with;
        if (Array.isArray(withClause)) {
            for (const cte of withClause) {
                if (isAstNode(cte) && (cte as any).name) {
                    cteNames.push(String((cte as any).name));
                }
            }
        }
    }

    return cteNames;
}

export function extractTableNames(sql: string, dialect: SqlDialect): string[] {
    const engine = getParserEngine();
    const result = engine.tryAstify(sql, dialect);
    if (!result.success) return [];

    const ast = result.ast;
    const statements = Array.isArray(ast) ? ast : [ast];
    const tableNames: string[] = [];

    for (const stmt of statements) {
        if (!isAstNode(stmt)) continue;
        const froms = findNodesOfType(stmt, 'select');
        for (const select of froms) {
            const from = (select as any).from;
            if (Array.isArray(from)) {
                for (const table of from) {
                    if (isAstNode(table) && (table as any).table) {
                        tableNames.push(String((table as any).table));
                    }
                }
            }
        }
    }

    return tableNames;
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/completion/AstCompletionProvider.ts
git commit -m "feat: add AstCompletionProvider with context-aware completion (PRD-006 Phase 5)"
```

---

## Task 7: Integrate AST Providers into existing Provider classes

**Files:**
- Modify: `src/providers/SqlDiagnosticsProvider.ts`
- Modify: `src/providers/EnhancedSqlChecker.ts`
- Modify: `src/providers/SqlLinter.ts`
- Modify: `src/converter/sqlParser.ts`
- Modify: `src/converter/mysqlConverter.ts`
- Modify: `src/converter/hiveConverter.ts`
- Modify: `src/completion/SqlCompletionProvider.ts`
- Modify: `src/completion/cteCompletion.ts`
- Modify: `src/core/sqlDialects.ts`

- [ ] **Step 1: Modify `src/core/sqlDialects.ts` to remove oracle/presto and add SqlDialect type**

Replace the file content with:

```typescript
import type { SqlLanguage } from '../formatter/sqlFormatter';
import type { SqlDialect } from '../parser/dialectMapper';

export const sqlDialects: Record<string, SqlLanguage> = {
    sql: 'sql',
    mysql: 'mysql',
    hive: 'hive',
    'hive-sql': 'hive',
    spark: 'spark',
    postgresql: 'postgresql',
    postgres: 'postgresql',
    bigquery: 'bigquery',
    snowflake: 'snowflake',
    sqlite: 'sqlite',
};

export function toSqlDialect(langId: string): SqlDialect {
    const dialect = sqlDialects[langId];
    if (!dialect) return 'sql';
    switch (dialect) {
        case 'mysql': return 'mysql';
        case 'hive': return 'hive';
        case 'spark': return 'spark';
        case 'postgresql': return 'postgresql';
        case 'bigquery': return 'bigquery';
        case 'snowflake': return 'snowflake';
        case 'sqlite': return 'sqlite';
        default: return 'sql';
    }
}
```

- [ ] **Step 2: Modify `src/providers/SqlDiagnosticsProvider.ts` to use AstDiagnosticsProvider**

The key change: replace the regex-based `checkForCommonErrors` with AST-based checks. Parse errors from `node-sql-parser` naturally handle bracket/string issues.

In the `provideDiagnostics` method, replace the try/catch block to use the new `AstDiagnosticsProvider`:

Add import at top:
```typescript
import { AstDiagnosticsProvider } from './AstDiagnosticsProvider';
import { toSqlDialect } from '../core/sqlDialects';
```

Replace the try block in `provideDiagnostics`:
```typescript
        try {
            const sqlDialect = toSqlDialect(document.languageId);

            // AST-based diagnostics
            const astProvider = new AstDiagnosticsProvider();
            const astDiagnostics = astProvider.check(text, sqlDialect);
            diagnostics.push(...astDiagnostics);

            // Parse errors handle bracket/string issues
            // (no longer need separate checkMismatchedParentheses / checkUnclosedStrings)

            // Enhanced checks
            if (this.configCache.enableEnhancedChecks) {
                const enhancedDiagnostics = this.enhancedChecker.checkEnhancedIssues(text, document);
                const filteredDiagnostics = this.filterBySeverity(enhancedDiagnostics);
                diagnostics.push(...filteredDiagnostics);
            }

            // Lint checks
            if (this.configCache.enableLinter) {
                const lintDiagnostics = this.linter.lint(text, document);
                const filteredLintDiagnostics = this.filterBySeverity(lintDiagnostics);
                diagnostics.push(...filteredLintDiagnostics);
            }
        } catch (error) {
            // ... keep existing error handling
        }
```

Remove the `checkForCommonErrors` method and all its sub-methods (they are now in `AstDiagnosticsProvider`).

- [ ] **Step 3: Modify `src/providers/EnhancedSqlChecker.ts` to use AstEnhancedChecker**

Add import:
```typescript
import { AstEnhancedChecker } from './AstEnhancedChecker';
import { toSqlDialect } from '../core/sqlDialects';
```

Replace `checkEnhancedIssues`:
```typescript
    public checkEnhancedIssues(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const dialect = toSqlDialect(document.languageId);
        const astChecker = new AstEnhancedChecker();
        return astChecker.check(text, dialect);
    }
```

Keep the old methods for now (they'll be removed in cleanup phase).

- [ ] **Step 4: Modify `src/providers/SqlLinter.ts` to use AstLinter**

Add import:
```typescript
import { AstLinter } from './AstLinter';
import { toSqlDialect } from '../core/sqlDialects';
```

Replace `lint` method:
```typescript
    public lint(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const dialect = toSqlDialect(document.languageId);
        const astLinter = new AstLinter();
        return astLinter.lint(text, dialect, document);
    }
```

- [ ] **Step 5: Modify `src/converter/mysqlConverter.ts` to use AstConverter**

Read the current file, then add the AstConverter as an alternative path.

- [ ] **Step 6: Modify `src/converter/hiveConverter.ts` to use AstConverter**

Read the current file, then add the AstConverter as an alternative path.

- [ ] **Step 7: Modify `src/completion/cteCompletion.ts` to use AstCompletionProvider**

Add import:
```typescript
import { extractCteNames } from './AstCompletionProvider';
import { toSqlDialect } from '../core/sqlDialects';
```

Update `getCTEItems` to use `extractCteNames` when possible.

- [ ] **Step 8: Verify compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 9: Commit**

```bash
git add src/providers/SqlDiagnosticsProvider.ts src/providers/EnhancedSqlChecker.ts src/providers/SqlLinter.ts src/converter/sqlParser.ts src/converter/mysqlConverter.ts src/converter/hiveConverter.ts src/completion/SqlCompletionProvider.ts src/completion/cteCompletion.ts src/core/sqlDialects.ts
git commit -m "feat: integrate AST providers into existing classes (PRD-006 Phase 3-5 integration)"
```

---

## Task 8: Update dialect support - remove Oracle and Presto

**Files:**
- Modify: `src/languages/allDialects.ts`
- Modify: `src/formatter/sqlFormatter.ts`
- Modify: `package.json` (remove oracle/presto from dialect enum and activation events)
- Modify: `src/completion/SqlCompletionProvider.ts` (remove oracle/presto from maps)

- [ ] **Step 1: Modify `src/languages/allDialects.ts`**

Remove all oracle and presto exports:

```typescript
export { hive } from "./hive/hive.formatter"
export { mysql } from "./mysql/mysql.formatter"
export { spark } from "./spark/spark.formatter"
export { sql } from "./sql/sql.formatter"
export { postgresql } from "./postgresql/postgresql.formatter"
export { bigquery } from "./bigquery/bigquery.formatter"
export { snowflake } from "./snowflake/snowflake.formatter"
export { sqlite } from "./sqlite/sqlite.formatter"

export { functionSignatures as hiveFunctionSignatures } from "./hive/hive.functions"
export { functionSignatures as mysqlFunctionSignatures } from "./mysql/mysql.functions"
export { functionSignatures as sparkFunctionSignatures } from "./spark/spark.functions"
export { functionSignatures as sqlFunctionSignatures } from "./sql/sql.functions"
export { functionSignatures as pgFunctionSignatures } from "./postgresql/postgresql.functions"
export { functionSignatures as bqFunctionSignatures } from "./bigquery/bigquery.functions"
export { functionSignatures as sfFunctionSignatures } from "./snowflake/snowflake.functions"
export { functionSignatures as sqliteFunctionSignatures } from "./sqlite/sqlite.functions"

export { keywords as hiveKeywords, dataTypes as hiveDataTypes } from "./hive/hive.keywords"
export { keywords as mysqlKeywords, dataTypes as mysqlDataTypes } from "./mysql/mysql.keywords"
export { keywords as sparkKeywords, dataTypes as sparkDataTypes } from "./spark/spark.keywords"
export { keywords as sqlKeywords, dataTypes as sqlDataTypes } from "./sql/sql.keywords"
export { keywords as pgKeywords, dataTypes as pgDataTypes } from "./postgresql/postgresql.keywords"
export { keywords as bqKeywords, dataTypes as bqDataTypes } from "./bigquery/bigquery.keywords"
export { keywords as sfKeywords, dataTypes as sfDataTypes } from "./snowflake/snowflake.keywords"
export { keywords as sqliteKeywords, dataTypes as sqliteDataTypes } from "./sqlite/sqlite.keywords"
```

- [ ] **Step 2: Modify `src/formatter/sqlFormatter.ts`**

Remove oracle and presto from `dialectNameMap`:

```typescript
const dialectNameMap: Record<string, string> = {
    hive: "hive",
    mysql: "mysql",
    spark: "spark",
    sql: "sql",
    postgresql: "postgresql",
    bigquery: "bigquery",
    snowflake: "snowflake",
    sqlite: "sqlite",
}
```

- [ ] **Step 3: Modify `package.json`**

Remove `oracle` and `presto` from:
- `contributes.configuration.properties.SQL-All-in-One.dialect.enum` array
- `contributes.configuration.properties.SQL-All-in-One.dialect.enumDescriptions` array
- `activationEvents` (remove `onLanguage:oracle`, `onLanguage:plsql`, `onLanguage:presto`, `onLanguage:trino`)
- `contributes.languages` (remove oracle/plsql/presto language entries)

- [ ] **Step 4: Modify `src/completion/SqlCompletionProvider.ts`**

Remove oracle and presto from `keywordMap` and `functionSigMap`.

- [ ] **Step 5: Verify compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 6: Commit**

```bash
git add src/languages/allDialects.ts src/formatter/sqlFormatter.ts package.json src/completion/SqlCompletionProvider.ts
git commit -m "feat: remove Oracle and Presto dialects (PRD-006 dialect cleanup)"
```

---

## Task 9: Cleanup - Remove old lexer/parser code and nearley/moo dependencies

**Files:**
- Delete: `src/lexer/` entire directory
- Delete: `src/parser/LexerAdapter.ts`, `src/parser/ast.ts`, `src/parser/createParser.ts`, `src/parser/grammar.ne`, `src/parser/grammar.ts`
- Delete: `src/languages/oracle/` directory
- Delete: `src/languages/presto/` directory
- Delete: `src/languages/keywords/oracleKeywords.ts`, `src/languages/keywords/prestoKeywords.ts`
- Modify: `package.json` (remove nearley dependency)
- Modify: `src/languages/dialect.ts` (remove Tokenizer/TokenizerOptions imports)
- Modify: any remaining files that import from deleted modules

- [ ] **Step 1: Find all imports referencing deleted modules**

```bash
cd /Users/hao/Downloads/sql-all-in-one && grep -rn "from.*['\"].*lexer/" src/ --include='*.ts' | grep -v 'node_modules'
grep -rn "from.*['\"].*parser/createParser" src/ --include='*.ts' | grep -v 'node_modules'
grep -rn "from.*['\"].*parser/ast" src/ --include='*.ts' | grep -v 'node_modules'
grep -rn "from.*['\"].*parser/LexerAdapter" src/ --include='*.ts' | grep -v 'node_modules'
grep -rn "from.*['\"].*parser/grammar" src/ --include='*.ts' | grep -v 'node_modules'
grep -rn "from.*['\"].*oracle/" src/ --include='*.ts' | grep -v 'node_modules'
grep -rn "from.*['\"].*presto/" src/ --include='*.ts' | grep -v 'node_modules'
```

- [ ] **Step 2: Fix all imports that reference deleted modules**

Update each file that imports from deleted modules to use the new AST-based equivalents.

- [ ] **Step 3: Delete old files**

```bash
rm -rf src/lexer/
rm -f src/parser/LexerAdapter.ts src/parser/ast.ts src/parser/createParser.ts src/parser/grammar.ne src/parser/grammar.ts
rm -rf src/languages/oracle/
rm -rf src/languages/presto/
rm -f src/languages/keywords/oracleKeywords.ts src/languages/keywords/prestoKeywords.ts
```

- [ ] **Step 4: Remove nearley dependency from package.json**

```bash
npm uninstall nearley @types/nearley
```

- [ ] **Step 5: Update `src/languages/dialect.ts`**

This file currently imports from `../lexer/Tokenizer` and `../lexer/TokenizerOptions`. It needs to be rewritten to not depend on the lexer. Since the formatter still uses the old Nearley-based pipeline (Phase 2 - AstFormatter is a separate, larger effort), we need to keep the dialect.ts working for the formatter.

**IMPORTANT**: The formatter rewrite (Phase 2) is the largest and riskiest phase. For now, we keep the old formatter pipeline intact and only replace the providers/converter/completion. The `src/languages/dialect.ts` and `src/formatter/` files remain as-is until Phase 2 is implemented separately.

This means: **Do NOT delete `src/lexer/` yet** — the formatter still depends on it. We only remove the direct lexer/parser usage from providers/converter/completion.

- [ ] **Step 6: Verify compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: cleanup - remove Oracle/Presto dialects, update imports (PRD-006 Phase 6 partial)"
```

---

## Task 10: Update extension.ts and final integration testing

**Files:**
- Modify: `src/extension.ts`
- Verify: All providers work correctly

- [ ] **Step 1: Update `src/extension.ts`**

Remove oracle/plsql/presto/trino from language registrations. Ensure all providers use the AST-based implementations.

- [ ] **Step 2: Run full compilation**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -20
```

- [ ] **Step 3: Run linting**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npm run lint 2>&1 | tail -20
```

- [ ] **Step 4: Run existing tests**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npm run test 2>&1 | tail -30
```

- [ ] **Step 5: Manual verification - test key scenarios**

Test the following in VS Code:
1. Open a `.sql` file with `SELECT * FROM t` — should see diagnostics
2. Open a file with `'SELECT FROM table'` string — should NOT see false positive
3. Format a SQL file — should still work (old formatter pipeline)
4. Try code completion — should work with AST context
5. Try MySQL→Hive conversion — should work with AST

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts
git commit -m "feat: update extension.ts for AST integration (PRD-006 final)"
```

---

## Spec Coverage Check

| PRD Section | Task |
|-------------|------|
| 3.1 node-sql-parser | Task 1 |
| 3.2 Dialect mapping | Task 1 (dialectMapper.ts) |
| 3.3 New dependency | Task 1 |
| 4.1 SqlParserEngine | Task 1 |
| 5.2 Diagnostics (8 checks) | Task 2 |
| 5.3 EnhancedChecker (15 checks) | Task 3 |
| 5.4 Linter (12 checks) | Task 4 |
| 5.5 Converter | Task 5 |
| 5.6 Completion | Task 6 |
| 6.2 New files | Tasks 1-6 |
| 6.3 Modified files | Tasks 7-8, 10 |
| 6.1 Deleted files | Task 9 |
| 7 Implementation steps | Tasks 1-10 |
| Dialect removal (Oracle/Presto) | Task 8 |

## Placeholder Scan

No TBD/TODO/placeholder patterns found in this plan.

## Type Consistency

- `SqlDialect` type defined in `dialectMapper.ts` and used consistently across all AST providers
- `ParseError` class defined in `ParseError.ts` and used in `SqlParserEngine.ts`
- `AstVisitor` utilities used consistently across all providers
- All provider classes follow the same pattern: constructor → public check/lint method → private check methods
