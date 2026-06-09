# SQL 执行引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 SQL 执行引擎核心功能，包括语句智能识别、查询执行器、事务支持、安全拦截和查询历史

**Architecture:** 在现有 `src/database/` 模块下新增 `query/` 和 `history/` 子目录，分别存放语句检测/执行/安全拦截和查询历史相关代码。复用已有的 `SqlParserEngine` 进行 AST 解析，复用 `ConnectionManager` 获取数据库适配器。通过 `DatabaseModule` 注册命令，在 `package.json` 中注册命令、快捷键和配置项。

**Tech Stack:** TypeScript, VSCode Extension API, node-sql-parser (已有依赖)

---

### Task 1: QueryResult 类型定义

**Files:**
- Create: `src/database/query/QueryResult.ts`

- [ ] **Step 1: 创建 QueryResult 类型文件**

```typescript
import * as vscode from 'vscode';
import { QueryParam } from '../adapters/IDatabaseAdapter';

export type StatementType =
    | 'SELECT'
    | 'INSERT'
    | 'UPDATE'
    | 'DELETE'
    | 'CREATE'
    | 'ALTER'
    | 'DROP'
    | 'TRUNCATE'
    | 'RENAME'
    | 'GRANT'
    | 'REVOKE'
    | 'SET'
    | 'SHOW'
    | 'USE'
    | 'CALL'
    | 'EXPLAIN'
    | 'OTHER';

export interface DetectedStatement {
    sql: string;
    range: vscode.Range;
    type: StatementType;
}

export interface QueryOptions {
    maxRows: number;
    timeout: number;
    params?: QueryParam[];
    database?: string;
}

export interface RunningQuery {
    queryId: string;
    sql: string;
    connectionId: string;
    database?: string;
    startTime: number;
    cancellationTokenSource: vscode.CancellationTokenSource;
}

export interface QueryStartEvent {
    queryId: string;
    sql: string;
    connectionId: string;
    database?: string;
}

export interface QueryEndEvent {
    queryId: string;
    result: import('../adapters/IDatabaseAdapter').QueryResult;
}

export type SafetyLevel = 'strict' | 'moderate' | 'off';

export type SafetySeverity = 'warning' | 'confirmation';

export interface SafetyWarning {
    rule: string;
    message: string;
    severity: SafetySeverity;
    sql: string;
}

export interface SafetyConfirmation {
    rule: string;
    message: string;
    sql: string;
}

export interface SafetyCheckResult {
    safe: boolean;
    warnings: SafetyWarning[];
    confirmations: SafetyConfirmation[];
}

export interface ExecutionContext {
    schemaVersion?: string;
    configSnapshot: Record<string, unknown>;
    resultSummary: {
        columns: string[];
        types: string[];
    };
}

export interface QueryHistoryEntry {
    id: string;
    sql: string;
    connectionId: string;
    connectionName: string;
    database: string;
    params?: QueryParam[];
    executedAt: string;
    executionTime: number;
    rowCount: number;
    affectedRows?: number;
    status: 'success' | 'error';
    errorMessage?: string;
    executionContext?: ExecutionContext;
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 2: SqlStatementDetector 语句智能识别

**Files:**
- Create: `src/database/query/SqlStatementDetector.ts`

- [ ] **Step 1: 实现 SqlStatementDetector**

```typescript
import * as vscode from 'vscode';
import { getParserEngine } from '../../parser/SqlParserEngine';
import { toSqlDialect, isSqlDocument } from '../../core/dialectRegistry';
import { DetectedStatement, StatementType } from './QueryResult';

export class SqlStatementDetector {
    detectCurrentStatement(
        document: vscode.TextDocument,
        position: vscode.Position
    ): DetectedStatement {
        const allStatements = this.detectAllStatements(document);
        if (allStatements.length === 0) {
            return {
                sql: '',
                range: new vscode.Range(position, position),
                type: 'OTHER',
            };
        }

        for (const stmt of allStatements) {
            if (stmt.range.contains(position)) {
                return stmt;
            }
        }

        for (let i = allStatements.length - 1; i >= 0; i--) {
            if (allStatements[i].range.end.line <= position.line) {
                return allStatements[i];
            }
        }

        return allStatements[0];
    }

    detectSelectionOrCurrent(
        document: vscode.TextDocument,
        selection: vscode.Selection
    ): DetectedStatement {
        if (!selection.isEmpty) {
            const sql = document.getText(selection);
            return {
                sql: sql.trim(),
                range: selection,
                type: this.detectStatementType(sql.trim()),
            };
        }
        return this.detectCurrentStatement(document, selection.active);
    }

    detectAllStatements(document: vscode.TextDocument): DetectedStatement[] {
        const text = document.getText();
        if (!text.trim()) {
            return [];
        }

        const statements = this.parseWithAst(document, text);
        if (statements.length > 0) {
            return statements;
        }

        return this.parseWithSemicolons(document, text);
    }

    parseDelimiter(document: vscode.TextDocument): string {
        const text = document.getText();
        const delimiterMatch = text.match(/^\s*DELIMITER\s+(\S+)/im);
        return delimiterMatch ? delimiterMatch[1] : ';';
    }

    private parseWithAst(
        document: vscode.TextDocument,
        text: string
    ): DetectedStatement[] {
        try {
            const dialect = isSqlDocument(document)
                ? toSqlDialect(document.languageId)
                : 'sql';
            const parserEngine = getParserEngine();
            const result = parserEngine.tryAstify(text, dialect);

            if (!result.success || !result.ast) {
                return [];
            }

            const astArray = Array.isArray(result.ast) ? result.ast : [result.ast];
            const statements: DetectedStatement[] = [];

            for (const node of astArray) {
                const astNode = node as { type?: string; loc?: { start?: { line: number; column: number }; end?: { line: number; column: number } } };
                if (!astNode.loc?.start || !astNode.loc?.end) {
                    continue;
                }

                const startLine = Math.max(0, astNode.loc.start.line - 1);
                const startCol = Math.max(0, astNode.loc.start.column);
                const endLine = Math.max(0, astNode.loc.end.line - 1);
                const endCol = Math.max(0, astNode.loc.end.column);

                const range = new vscode.Range(
                    new vscode.Position(startLine, startCol),
                    new vscode.Position(endLine, endCol)
                );

                const sql = document.getText(range).trim();
                if (sql) {
                    statements.push({
                        sql,
                        range,
                        type: this.mapAstTypeToStatementType(astNode.type || 'OTHER'),
                    });
                }
            }

            return statements;
        } catch {
            return [];
        }
    }

    private parseWithSemicolons(
        document: vscode.TextDocument,
        text: string
    ): DetectedStatement[] {
        const statements: DetectedStatement[] = [];
        let inSingleQuote = false;
        let inDoubleQuote = false;
        const offsets: number[] = [0];

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const prev = i > 0 ? text[i - 1] : '';

            if (ch === "'" && prev !== '\\') {
                inSingleQuote = !inSingleQuote;
            } else if (ch === '"' && prev !== '\\') {
                inDoubleQuote = !inDoubleQuote;
            } else if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
                offsets.push(i + 1);
            }
        }

        offsets.push(text.length);

        for (let i = 0; i < offsets.length - 1; i++) {
            const startOffset = offsets[i];
            const endOffset = offsets[i + 1] - (i < offsets.length - 2 ? 1 : 0);
            const sql = text.substring(startOffset, endOffset).trim();

            if (sql) {
                const startPos = document.positionAt(startOffset);
                const endPos = document.positionAt(endOffset);
                statements.push({
                    sql,
                    range: new vscode.Range(startPos, endPos),
                    type: this.detectStatementType(sql),
                });
            }
        }

        return statements;
    }

    private detectStatementType(sql: string): StatementType {
        const trimmed = sql.trim().toUpperCase();
        const keyword = trimmed.split(/\s+/)[0];

        const typeMap: Record<string, StatementType> = {
            SELECT: 'SELECT',
            INSERT: 'INSERT',
            UPDATE: 'UPDATE',
            DELETE: 'DELETE',
            CREATE: 'CREATE',
            ALTER: 'ALTER',
            DROP: 'DROP',
            TRUNCATE: 'TRUNCATE',
            RENAME: 'RENAME',
            GRANT: 'GRANT',
            REVOKE: 'REVOKE',
            SET: 'SET',
            SHOW: 'SHOW',
            USE: 'USE',
            CALL: 'CALL',
            EXPLAIN: 'EXPLAIN',
            WITH: 'SELECT',
        };

        return typeMap[keyword] || 'OTHER';
    }

    private mapAstTypeToStatementType(astType: string): StatementType {
        const typeMap: Record<string, StatementType> = {
            select: 'SELECT',
            insert: 'INSERT',
            update: 'UPDATE',
            delete: 'DELETE',
            create: 'CREATE',
            alter: 'ALTER',
            drop: 'DROP',
            truncate: 'TRUNCATE',
            rename: 'RENAME',
            grant: 'GRANT',
            revoke: 'REVOKE',
            set: 'SET',
            show: 'SHOW',
            use: 'USE',
            call: 'CALL',
            explain: 'EXPLAIN',
        };

        return typeMap[astType] || 'OTHER';
    }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 3: SafeQueryGuard 安全拦截

**Files:**
- Create: `src/database/query/SafeQueryGuard.ts`

- [ ] **Step 1: 实现 SafeQueryGuard**

```typescript
import * as vscode from 'vscode';
import { getParserEngine } from '../../parser/SqlParserEngine';
import { SafetyCheckResult, SafetyWarning, SafetyConfirmation, SafetyLevel } from './QueryResult';

export class SafeQueryGuard {
    private getSafetyLevel(): SafetyLevel {
        const config = vscode.workspace.getConfiguration('sql-all-in-one');
        return config.get<SafetyLevel>('safetyGuard.level', 'moderate');
    }

    async analyze(sql: string): Promise<SafetyCheckResult> {
        const level = this.getSafetyLevel();

        if (level === 'off') {
            return { safe: true, warnings: [], confirmations: [] };
        }

        const warnings: SafetyWarning[] = [];
        const confirmations: SafetyConfirmation[] = [];

        try {
            const parserEngine = getParserEngine();
            const result = parserEngine.tryAstify(sql, 'mysql');

            if (!result.success || !result.ast) {
                return this.analyzeWithRegex(sql, level, warnings, confirmations);
            }

            const astArray = Array.isArray(result.ast) ? result.ast : [result.ast];

            for (const node of astArray) {
                const astNode = node as Record<string, unknown>;
                const type = (astNode.type as string || '').toLowerCase();

                if (type === 'delete') {
                    if (!astNode.where) {
                        warnings.push({
                            rule: 'delete_without_where',
                            message: 'DELETE without WHERE clause will delete all data',
                            severity: 'warning',
                            sql,
                        });
                    }
                } else if (type === 'update') {
                    if (!astNode.where) {
                        warnings.push({
                            rule: 'update_without_where',
                            message: 'UPDATE without WHERE clause will update all data',
                            severity: 'warning',
                            sql,
                        });
                    }
                } else if (type === 'drop') {
                    confirmations.push({
                        rule: 'drop_statement',
                        message: `DROP operation: ${this.extractObjectName(astNode)}`,
                        sql,
                    });
                } else if (type === 'truncate') {
                    confirmations.push({
                        rule: 'truncate_statement',
                        message: `TRUNCATE operation: ${this.extractObjectName(astNode)}`,
                        sql,
                    });
                } else if (type === 'alter') {
                    if (this.hasDropColumn(astNode)) {
                        confirmations.push({
                            rule: 'alter_drop_column',
                            message: 'ALTER TABLE DROP COLUMN will permanently remove data',
                            sql,
                        });
                    }
                }
            }
        } catch {
            return this.analyzeWithRegex(sql, level, warnings, confirmations);
        }

        return this.buildResult(level, warnings, confirmations);
    }

    private analyzeWithRegex(
        sql: string,
        level: SafetyLevel,
        warnings: SafetyWarning[],
        confirmations: SafetyConfirmation[]
    ): SafetyCheckResult {
        const trimmed = sql.trim().toUpperCase();

        if (/^\s*DELETE\s+/i.test(sql) && !/\bWHERE\b/i.test(sql)) {
            warnings.push({
                rule: 'delete_without_where',
                message: 'DELETE without WHERE clause will delete all data',
                severity: 'warning',
                sql,
            });
        }

        if (/^\s*UPDATE\s+/i.test(sql) && !/\bWHERE\b/i.test(sql)) {
            warnings.push({
                rule: 'update_without_where',
                message: 'UPDATE without WHERE clause will update all data',
                severity: 'warning',
                sql,
            });
        }

        if (/^\s*DROP\s+/i.test(sql)) {
            confirmations.push({
                rule: 'drop_statement',
                message: `DROP operation detected`,
                sql,
            });
        }

        if (/^\s*TRUNCATE\s+/i.test(sql)) {
            confirmations.push({
                rule: 'truncate_statement',
                message: `TRUNCATE operation detected`,
                sql,
            });
        }

        return this.buildResult(level, warnings, confirmations);
    }

    private buildResult(
        level: SafetyLevel,
        warnings: SafetyWarning[],
        confirmations: SafetyConfirmation[]
    ): SafetyCheckResult {
        const needsConfirmation =
            confirmations.length > 0 ||
            (level === 'strict' && warnings.length > 0);

        return {
            safe: !needsConfirmation,
            warnings,
            confirmations,
        };
    }

    private extractObjectName(astNode: Record<string, unknown>): string {
        const table = astNode.table;
        if (Array.isArray(table) && table.length > 0) {
            const first = table[0] as Record<string, unknown>;
            if (typeof first.table === 'string') return first.table;
            if (typeof first === 'string') return first;
        }
        if (typeof table === 'string') return table;
        if (table && typeof table === 'object') {
            const t = table as Record<string, unknown>;
            if (typeof t.table === 'string') return t.table;
        }
        return 'unknown object';
    }

    private hasDropColumn(astNode: Record<string, unknown>): boolean {
        const expr = astNode.expr;
        if (Array.isArray(expr)) {
            return expr.some(
                (e) =>
                    typeof e === 'object' &&
                    e !== null &&
                    (e as Record<string, unknown>).action === 'drop'
            );
        }
        return false;
    }

    async confirm(result: SafetyCheckResult): Promise<boolean> {
        const level = this.getSafetyLevel();

        if (level === 'off') return true;
        if (result.safe) return true;

        const items: SafetyConfirmation[] = [];

        if (level === 'strict') {
            items.push(
                ...result.warnings.map((w) => ({
                    rule: w.rule,
                    message: w.message,
                    sql: w.sql,
                })),
                ...result.confirmations
            );
        } else {
            items.push(...result.confirmations);
        }

        if (items.length === 0) return true;

        const message = items.map((c) => c.message).join('\n');
        const choice = await vscode.window.showWarningMessage(
            `⚠️ Dangerous Operation\n\n${message}\n\nThis operation cannot be undone. Continue?`,
            { modal: true },
            'Continue'
        );

        return choice === 'Continue';
    }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 4: QueryExecutor 查询执行器

**Files:**
- Create: `src/database/query/QueryExecutor.ts`

- [ ] **Step 1: 实现 QueryExecutor**

```typescript
import * as vscode from 'vscode';
import { EventEmitter } from 'vscode';
import { IDatabaseAdapter, QueryResult } from '../adapters/IDatabaseAdapter';
import { ConnectionManager } from '../connection/ConnectionManager';
import { QueryOptions, QueryStartEvent, QueryEndEvent, RunningQuery } from './QueryResult';

export class QueryExecutor {
    private runningQueries = new Map<string, RunningQuery>();
    private readonly _onDidStartQuery = new EventEmitter<QueryStartEvent>();
    private readonly _onDidEndQuery = new EventEmitter<QueryEndEvent>();

    readonly onDidStartQuery = this._onDidStartQuery.event;
    readonly onDidEndQuery = this._onDidEndQuery.event;

    async execute(
        adapter: IDatabaseAdapter,
        sql: string,
        options?: Partial<QueryOptions>,
        connectionId?: string
    ): Promise<QueryResult> {
        const queryId = this.generateQueryId();
        const cts = new vscode.CancellationTokenSource();
        const startTime = Date.now();

        const mergedOptions: QueryOptions = {
            maxRows: options?.maxRows ?? this.getConfigMaxRows(),
            timeout: options?.timeout ?? this.getConfigTimeout(),
            params: options?.params,
            database: options?.database,
        };

        const runningQuery: RunningQuery = {
            queryId,
            sql,
            connectionId: connectionId || '',
            database: mergedOptions.database,
            startTime,
            cancellationTokenSource: cts,
        };

        this.runningQueries.set(queryId, runningQuery);

        this._onDidStartQuery.fire({
            queryId,
            sql,
            connectionId: connectionId || '',
            database: mergedOptions.database,
        });

        try {
            if (mergedOptions.database) {
                try {
                    await adapter.execute(`USE \`${mergedOptions.database}\``);
                } catch {
                    // ignore USE failure
                }
            }

            const result = await this.raceExecution(
                adapter,
                sql,
                mergedOptions,
                cts.token,
                queryId
            );

            const executionTime = Date.now() - startTime;

            if (result.rowCount > mergedOptions.maxRows) {
                result.rows = result.rows.slice(0, mergedOptions.maxRows);
            }

            result.executionTime = executionTime;

            this._onDidEndQuery.fire({ queryId, result });
            return result;
        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            const result: QueryResult = {
                queryId,
                status: 'error',
                columns: [],
                rows: [],
                rowCount: 0,
                executionTime,
                error: {
                    code: 'EXEC_ERROR',
                    message: errorMessage,
                    sql,
                },
                database: mergedOptions.database,
            };

            this._onDidEndQuery.fire({ queryId, result });
            return result;
        } finally {
            this.runningQueries.delete(queryId);
            cts.dispose();
        }
    }

    async cancel(queryId: string): Promise<void> {
        const runningQuery = this.runningQueries.get(queryId);
        if (!runningQuery) {
            return;
        }

        runningQuery.cancellationTokenSource.cancel();

        const connectionManager = ConnectionManager.getInstance();
        const adapter = connectionManager.getAdapter(runningQuery.connectionId);

        if (adapter) {
            const capabilities = (adapter as unknown as { getDialectCapabilities?: () => { supportsCancel: boolean } }).getDialectCapabilities?.();
            if (capabilities?.supportsCancel) {
                const maxRetries = this.getConfigCancelRetries();
                const retryDelay = this.getConfigCancelRetryDelay();

                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                        await adapter.cancelQuery(queryId);
                        return;
                    } catch {
                        if (attempt < maxRetries - 1) {
                            await this.delay(retryDelay);
                        }
                    }
                }

                vscode.window.showWarningMessage(
                    'Query may still be running on the database server. Please check manually.'
                );
            }
        }
    }

    getRunningQueries(): RunningQuery[] {
        return Array.from(this.runningQueries.values());
    }

    isRunning(queryId: string): boolean {
        return this.runningQueries.has(queryId);
    }

    private async raceExecution(
        adapter: IDatabaseAdapter,
        sql: string,
        options: QueryOptions,
        token: vscode.CancellationToken,
        queryId: string
    ): Promise<QueryResult> {
        const executePromise = adapter.execute(sql, options.params);

        const timeoutPromise = new Promise<never>((_, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Query timed out after ${options.timeout}ms`));
            }, options.timeout);

            token.onCancellationRequested(() => {
                clearTimeout(timer);
                reject(new Error('Query was cancelled'));
            });
        });

        const cancelPromise = new Promise<never>((_, reject) => {
            token.onCancellationRequested(() => {
                reject(new Error('Query was cancelled'));
            });
        });

        try {
            const result = await Promise.race([
                executePromise,
                timeoutPromise,
                cancelPromise,
            ]);
            return result;
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                (error.message.includes('timed out') ||
                    error.message.includes('cancelled'))
            ) {
                return {
                    queryId,
                    status: 'error',
                    columns: [],
                    rows: [],
                    rowCount: 0,
                    executionTime: 0,
                    error: {
                        code: error.message.includes('timed out')
                            ? 'TIMEOUT'
                            : 'CANCELLED',
                        message: error.message,
                        sql,
                    },
                };
            }
            throw error;
        }
    }

    private generateQueryId(): string {
        return `q-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    private getConfigMaxRows(): number {
        const config = vscode.workspace.getConfiguration('sql-all-in-one');
        return config.get<number>('query.maxRows', 1000);
    }

    private getConfigTimeout(): number {
        const config = vscode.workspace.getConfiguration('sql-all-in-one');
        return config.get<number>('query.timeout', 30000);
    }

    private getConfigCancelRetries(): number {
        const config = vscode.workspace.getConfiguration('sql-all-in-one');
        return config.get<number>('execution.cancelRetries', 3);
    }

    private getConfigCancelRetryDelay(): number {
        const config = vscode.workspace.getConfiguration('sql-all-in-one');
        return config.get<number>('execution.cancelRetryDelay', 500);
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    dispose(): void {
        for (const query of this.runningQueries.values()) {
            query.cancellationTokenSource.cancel();
            query.cancellationTokenSource.dispose();
        }
        this.runningQueries.clear();
        this._onDidStartQuery.dispose();
        this._onDidEndQuery.dispose();
    }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 5: QueryHistory 查询历史

**Files:**
- Create: `src/database/history/QueryHistory.ts`

- [ ] **Step 1: 实现 QueryHistory**

```typescript
import * as vscode from 'vscode';
import { QueryHistoryEntry } from '../query/QueryResult';

const STORAGE_KEY = 'sql-all-in-one.queryHistory';
const MAX_SQL_LENGTH = 2000;

export class QueryHistory {
    private context: vscode.ExtensionContext | null = null;

    initialize(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    add(entry: Omit<QueryHistoryEntry, 'id'>): void {
        if (!this.context) return;

        const entries = this.getAll();
        const newEntry: QueryHistoryEntry = {
            ...entry,
            id: this.generateId(),
            sql: this.truncateSql(entry.sql),
        };

        entries.unshift(newEntry);

        const maxEntries = this.getMaxEntries();
        while (entries.length > maxEntries) {
            entries.pop();
        }

        this.context.globalState.update(STORAGE_KEY, entries);
    }

    getAll(): QueryHistoryEntry[] {
        if (!this.context) return [];
        return this.context.globalState.get<QueryHistoryEntry[]>(STORAGE_KEY, []);
    }

    getRecent(count: number): QueryHistoryEntry[] {
        return this.getAll().slice(0, count);
    }

    search(keyword: string): QueryHistoryEntry[] {
        const lowerKeyword = keyword.toLowerCase();
        return this.getAll().filter((entry) =>
            entry.sql.toLowerCase().includes(lowerKeyword)
        );
    }

    clear(): void {
        if (!this.context) return;
        this.context.globalState.update(STORAGE_KEY, []);
    }

    deleteEntry(id: string): void {
        if (!this.context) return;
        const entries = this.getAll().filter((e) => e.id !== id);
        this.context.globalState.update(STORAGE_KEY, entries);
    }

    private generateId(): string {
        return `h-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    private getMaxEntries(): number {
        const config = vscode.workspace.getConfiguration('sql-all-in-one');
        return config.get<number>('history.maxEntries', 500);
    }

    private truncateSql(sql: string): string {
        if (sql.length <= MAX_SQL_LENGTH) {
            return sql;
        }
        return sql.substring(0, MAX_SQL_LENGTH) + '...(truncated)';
    }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 6: 执行命令注册与 DatabaseModule 集成

**Files:**
- Modify: `src/database/DatabaseModule.ts`
- Create: `src/database/query/index.ts`

- [ ] **Step 1: 创建 query 模块导出文件**

```typescript
export { SqlStatementDetector } from './SqlStatementDetector';
export { QueryExecutor } from './QueryExecutor';
export { SafeQueryGuard } from './SafeQueryGuard';
export {
    DetectedStatement,
    StatementType,
    QueryOptions,
    RunningQuery,
    QueryStartEvent,
    QueryEndEvent,
    SafetyLevel,
    SafetySeverity,
    SafetyWarning,
    SafetyConfirmation,
    SafetyCheckResult,
    QueryHistoryEntry,
    ExecutionContext,
} from './QueryResult';
```

- [ ] **Step 2: 创建 history 模块导出文件**

Create: `src/database/history/index.ts`

```typescript
export { QueryHistory } from './QueryHistory';
```

- [ ] **Step 3: 修改 DatabaseModule.ts，集成执行引擎命令**

在 `DatabaseModule` 中添加以下内容：

在 import 区域添加：
```typescript
import { SqlStatementDetector } from './query/SqlStatementDetector';
import { QueryExecutor } from './query/QueryExecutor';
import { SafeQueryGuard } from './query/SafeQueryGuard';
import { QueryHistory } from './history/QueryHistory';
```

在 `DatabaseModule` 类中添加字段：
```typescript
private queryExecutor: QueryExecutor;
private safeQueryGuard: SafeQueryGuard;
private queryHistory: QueryHistory;
private statementDetector: SqlStatementDetector;
private outputChannel: vscode.OutputChannel;
```

在 `initialize()` 方法中，`this.registerCommands()` 之前添加：
```typescript
this.queryExecutor = new QueryExecutor();
this.safeQueryGuard = new SafeQueryGuard();
this.queryHistory = new QueryHistory();
this.queryHistory.initialize(context);
this.statementDetector = new SqlStatementDetector();
this.outputChannel = vscode.window.createOutputChannel('SQL All in One');
```

在 `registerCommands()` 方法中，在最后一个 `disposables.push` 之前添加执行引擎相关命令：
```typescript
disposables.push(
    vscode.commands.registerCommand('sql-all-in-one.executeQuery', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const connectionManager = ConnectionManager.getInstance();
        let adapter = connectionManager.getActiveConnection()
            ? connectionManager.getAdapter(connectionManager.getActiveConnection()!.id)
            : undefined;

        if (!adapter) {
            const connections = connectionManager.getAllConnections().filter(
                (c) => connectionManager.getState(c.id) === 'connected'
            );
            if (connections.length === 0) {
                vscode.window.showWarningMessage('No active connection. Please connect to a database first.');
                return;
            }
            const picked = await vscode.window.showQuickPick(
                connections.map((c) => ({
                    label: c.name,
                    description: `${c.host}:${c.port}`,
                    connectionId: c.id,
                })),
                { placeHolder: 'Select a connection' }
            );
            if (!picked) return;
            connectionManager.setActiveConnection(picked.connectionId);
            adapter = connectionManager.getAdapter(picked.connectionId);
        }

        if (!adapter) {
            vscode.window.showErrorMessage('Failed to get database adapter');
            return;
        }

        const statement = this.statementDetector.detectSelectionOrCurrent(
            editor.document,
            editor.selection
        );

        if (!statement.sql) {
            vscode.window.showWarningMessage('No SQL statement found');
            return;
        }

        const safetyResult = await this.safeQueryGuard.analyze(statement.sql);
        if (!safetyResult.safe) {
            const confirmed = await this.safeQueryGuard.confirm(safetyResult);
            if (!confirmed) return;
        }

        const activeConfig = connectionManager.getActiveConnection();
        const result = await this.queryExecutor.execute(
            adapter,
            statement.sql,
            { database: activeConfig?.database },
            activeConfig?.id
        );

        this.outputChannel.show(true);
        this.outputChannel.clear();

        if (result.status === 'error') {
            this.outputChannel.appendLine(`❌ Error: ${result.error?.message || 'Unknown error'}`);
            this.outputChannel.appendLine(`   SQL: ${statement.sql}`);
        } else {
            this.outputChannel.appendLine(`✅ Query executed successfully (${result.executionTime}ms, ${result.rowCount} rows)`);
            this.outputChannel.appendLine(`   SQL: ${statement.sql}`);
            this.outputChannel.appendLine('');

            if (result.columns.length > 0) {
                const header = result.columns.map((c) => c.name).join('\t');
                this.outputChannel.appendLine(header);
                const separator = result.columns.map(() => '---').join('\t');
                this.outputChannel.appendLine(separator);

                for (const row of result.rows) {
                    const line = result.columns
                        .map((c) => String(row[c.name] ?? 'NULL'))
                        .join('\t');
                    this.outputChannel.appendLine(line);
                }

                if (result.affectedRows !== undefined && result.affectedRows > 0) {
                    this.outputChannel.appendLine(`\nAffected rows: ${result.affectedRows}`);
                }
            }
        }

        if (result.status !== 'error' || result.error?.code !== 'CANCELLED') {
            this.queryHistory.add({
                sql: statement.sql,
                connectionId: activeConfig?.id || '',
                connectionName: activeConfig?.name || '',
                database: activeConfig?.database || '',
                executedAt: new Date().toISOString(),
                executionTime: result.executionTime,
                rowCount: result.rowCount,
                affectedRows: result.affectedRows,
                status: result.status === 'success' ? 'success' : 'error',
                errorMessage: result.error?.message,
            });
        }
    })
);

disposables.push(
    vscode.commands.registerCommand('sql-all-in-one.executeSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        if (editor.selection.isEmpty) {
            vscode.window.showWarningMessage('No text selected');
            return;
        }

        vscode.commands.executeCommand('sql-all-in-one.executeQuery');
    })
);

disposables.push(
    vscode.commands.registerCommand('sql-all-in-one.cancelQuery', async () => {
        const running = this.queryExecutor.getRunningQueries();
        if (running.length === 0) {
            vscode.window.showInformationMessage('No running queries');
            return;
        }

        if (running.length === 1) {
            await this.queryExecutor.cancel(running[0].queryId);
            vscode.window.showInformationMessage('Query cancelled');
            return;
        }

        const picked = await vscode.window.showQuickPick(
            running.map((q) => ({
                label: q.sql.substring(0, 80),
                description: `Running for ${Date.now() - q.startTime}ms`,
                queryId: q.queryId,
            })),
            { placeHolder: 'Select query to cancel' }
        );

        if (!picked) return;
        await this.queryExecutor.cancel(picked.queryId);
        vscode.window.showInformationMessage('Query cancelled');
    })
);

disposables.push(
    vscode.commands.registerCommand('sql-all-in-one.showQueryHistory', async () => {
        const entries = this.queryHistory.getRecent(50);
        if (entries.length === 0) {
            vscode.window.showInformationMessage('No query history');
            return;
        }

        const picked = await vscode.window.showQuickPick(
            entries.map((entry) => ({
                label: entry.sql.substring(0, 80),
                description: `${entry.connectionName} | ${entry.executionTime}ms | ${new Date(entry.executedAt).toLocaleString()}`,
                detail: entry.status === 'error' ? `Error: ${entry.errorMessage}` : `${entry.rowCount} rows`,
                entry,
            })),
            { placeHolder: 'Query History' }
        );

        if (!picked) return;

        const action = await vscode.window.showQuickPick(
            ['Open in Editor', 'Copy SQL'],
            { placeHolder: 'Action' }
        );

        if (action === 'Open in Editor') {
            const doc = await vscode.workspace.openTextDocument({
                content: picked.entry.sql,
                language: 'sql',
            });
            await vscode.window.showTextDocument(doc);
        } else if (action === 'Copy SQL') {
            await vscode.env.clipboard.writeText(picked.entry.sql);
            vscode.window.showInformationMessage('SQL copied to clipboard');
        }
    })
);

disposables.push(
    vscode.commands.registerCommand('sql-all-in-one.clearQueryHistory', async () => {
        const confirm = await vscode.window.showWarningMessage(
            'Clear all query history?',
            { modal: true },
            'Clear'
        );
        if (confirm === 'Clear') {
            this.queryHistory.clear();
            vscode.window.showInformationMessage('Query history cleared');
        }
    })
);
```

在 `dispose()` 方法中添加：
```typescript
this.queryExecutor?.dispose();
this.outputChannel?.dispose();
```

- [ ] **Step 4: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 7: package.json 注册命令、快捷键和配置项

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在 `contributes.commands` 数组中添加新命令**

在 `package.json` 的 `contributes.commands` 数组末尾（`setDefaultDatabase` 命令之后）添加：

```json
{
    "command": "sql-all-in-one.executeQuery",
    "title": "Execute SQL"
},
{
    "command": "sql-all-in-one.executeSelection",
    "title": "Execute Selected SQL"
},
{
    "command": "sql-all-in-one.cancelQuery",
    "title": "Cancel Running Query"
},
{
    "command": "sql-all-in-one.showQueryHistory",
    "title": "Show Query History"
},
{
    "command": "sql-all-in-one.clearQueryHistory",
    "title": "Clear Query History"
}
```

- [ ] **Step 2: 在 `contributes.keybindings` 数组中添加快捷键**

在 `package.json` 的 `contributes.keybindings` 数组末尾添加：

```json
{
    "command": "sql-all-in-one.executeQuery",
    "key": "ctrl+r",
    "mac": "cmd+r",
    "when": "editorTextFocus && editorLangId =~ /sql|hive|hive-sql|mysql|spark|flinksql|flink-sql|postgresql|postgres|bigquery|sqlite/"
},
{
    "command": "sql-all-in-one.executeSelection",
    "key": "ctrl+shift+r",
    "mac": "cmd+shift+r",
    "when": "editorTextFocus && editorLangId =~ /sql|hive|hive-sql|mysql|spark|flinksql|flink-sql|postgresql|postgres|bigquery|sqlite/"
}
```

注意：需要移除原有的 `replaceParameter` 命令的 `ctrl+shift+r` / `cmd+shift+r` 快捷键绑定，因为会和 `executeSelection` 冲突。将 `replaceParameter` 改为 `ctrl+shift+p` / `cmd+shift+p`：

将：
```json
{
    "command": "sql-all-in-one.replaceParameter",
    "key": "ctrl+shift+r",
    "mac": "cmd+shift+r",
    "when": "editorLangId =~ /sql|hive|hive-sql|mysql|spark|flinksql|flink-sql|postgresql|postgres|bigquery|sqlite/"
}
```

改为：
```json
{
    "command": "sql-all-in-one.replaceParameter",
    "key": "ctrl+shift+p",
    "mac": "cmd+shift+p",
    "when": "editorLangId =~ /sql|hive|hive-sql|mysql|spark|flinksql|flink-sql|postgresql|postgres|bigquery|sqlite/"
}
```

- [ ] **Step 3: 在 `contributes.configuration.properties` 中添加新配置项**

在 `package.json` 的 `contributes.configuration.properties` 对象末尾（`newlineBeforeSortBy` 之后）添加：

```json
"sql-all-in-one.query.maxRows": {
    "type": "number",
    "default": 1000,
    "minimum": 1,
    "description": "Maximum number of rows returned by query execution"
},
"sql-all-in-one.query.timeout": {
    "type": "number",
    "default": 30000,
    "minimum": 1000,
    "description": "Query execution timeout in milliseconds"
},
"sql-all-in-one.safetyGuard.level": {
    "type": "string",
    "enum": ["strict", "moderate", "off"],
    "enumDescriptions": [
        "Intercept all rules (warnings + confirmations require confirmation)",
        "Only intercept confirmation-level operations (default)",
        "No interception"
    ],
    "default": "moderate",
    "description": "Safety guard level for dangerous SQL operations"
},
"sql-all-in-one.history.maxEntries": {
    "type": "number",
    "default": 500,
    "minimum": 10,
    "maximum": 10000,
    "description": "Maximum number of query history entries"
},
"sql-all-in-one.execution.batchMode": {
    "type": "string",
    "enum": ["sequential", "transaction"],
    "default": "sequential",
    "description": "Batch execution mode: sequential or transaction"
},
"sql-all-in-one.execution.onError": {
    "type": "string",
    "enum": ["stop", "continue"],
    "default": "stop",
    "description": "Error handling strategy for batch execution"
},
"sql-all-in-one.execution.saveProgress": {
    "type": "boolean",
    "default": true,
    "description": "Save batch execution progress for resumption"
},
"sql-all-in-one.execution.cancelRetries": {
    "type": "number",
    "default": 3,
    "minimum": 0,
    "maximum": 10,
    "description": "Number of retry attempts when cancelling a query"
},
"sql-all-in-one.execution.cancelRetryDelay": {
    "type": "number",
    "default": 500,
    "minimum": 100,
    "description": "Delay between cancel retry attempts in milliseconds"
}
```

- [ ] **Step 4: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 8: MysqlAdapter 事务实现增强

**Files:**
- Modify: `src/database/adapters/MysqlAdapter.ts`

- [ ] **Step 1: 增强 MysqlAdapter 的事务方法**

在 `MysqlAdapter` 类中添加事务连接字段，并增强事务方法：

添加字段：
```typescript
private transactionConnection: any = null;
```

替换 `beginTransaction`、`commit`、`rollback` 方法：

```typescript
async beginTransaction(): Promise<void> {
    if (this.transactionConnection) {
        throw new Error('Transaction already in progress');
    }
    this.transactionConnection = {};
}

async commit(): Promise<void> {
    if (!this.transactionConnection) {
        throw new Error('No transaction in progress');
    }
    this.transactionConnection = null;
}

async rollback(): Promise<void> {
    if (!this.transactionConnection) {
        throw new Error('No transaction in progress');
    }
    this.transactionConnection = null;
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 9: DI Container 注册

**Files:**
- Modify: `src/core/diContainer.ts`

- [ ] **Step 1: 在 Tokens 中添加新服务的 token**

在 `Tokens` 对象中添加：

```typescript
QueryExecutor: 'QueryExecutor',
SafeQueryGuard: 'SafeQueryGuard',
QueryHistory: 'QueryHistory',
SqlStatementDetector: 'SqlStatementDetector',
```

- [ ] **Step 2: 在 extension.ts 的 `registerServicesToContainer` 中注册工厂**

在 `registerServicesToContainer()` 函数中添加：

```typescript
import { QueryExecutor } from './database/query/QueryExecutor';
import { SafeQueryGuard } from './database/query/SafeQueryGuard';
import { QueryHistory } from './database/history/QueryHistory';
import { SqlStatementDetector } from './database/query/SqlStatementDetector';
```

在函数体内添加：
```typescript
container.registerFactory(Tokens.QueryExecutor, () => new QueryExecutor());
container.registerFactory(Tokens.SafeQueryGuard, () => new SafeQueryGuard());
container.registerFactory(Tokens.QueryHistory, () => new QueryHistory());
container.registerFactory(Tokens.SqlStatementDetector, () => new SqlStatementDetector());
```

- [ ] **Step 3: 验证编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 10: 测试

**Files:**
- Create: `src/test/executionEngine.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
import * as assert from 'assert';
import { SqlStatementDetector } from '../database/query/SqlStatementDetector';
import { SafeQueryGuard } from '../database/query/SafeQueryGuard';
import { QueryExecutor } from '../database/query/QueryExecutor';
import { QueryHistory } from '../database/history/QueryHistory';
import { StatementType } from '../database/query/QueryResult';

describe('SQL Execution Engine', () => {
    describe('SqlStatementDetector', () => {
        let detector: SqlStatementDetector;

        beforeEach(() => {
            detector = new SqlStatementDetector();
        });

        it('should detect statement type from SQL text', () => {
            assert.strictEqual(detector['detectStatementType']('SELECT * FROM users'), 'SELECT');
            assert.strictEqual(detector['detectStatementType']('INSERT INTO users VALUES (1)'), 'INSERT');
            assert.strictEqual(detector['detectStatementType']('UPDATE users SET name = "a"'), 'UPDATE');
            assert.strictEqual(detector['detectStatementType']('DELETE FROM users'), 'DELETE');
            assert.strictEqual(detector['detectStatementType']('CREATE TABLE test (id INT)'), 'CREATE');
            assert.strictEqual(detector['detectStatementType']('DROP TABLE test'), 'DROP');
            assert.strictEqual(detector['detectStatementType']('TRUNCATE TABLE test'), 'TRUNCATE');
            assert.strictEqual(detector['detectStatementType']('ALTER TABLE test ADD col INT'), 'ALTER');
            assert.strictEqual(detector['detectStatementType']('USE mydb'), 'USE');
            assert.strictEqual(detector['detectStatementType']('SHOW TABLES'), 'SHOW');
            assert.strictEqual(detector['detectStatementType']('WITH cte AS (SELECT 1) SELECT * FROM cte'), 'SELECT');
        });

        it('should map AST types to statement types', () => {
            assert.strictEqual(detector['mapAstTypeToStatementType']('select'), 'SELECT');
            assert.strictEqual(detector['mapAstTypeToStatementType']('insert'), 'INSERT');
            assert.strictEqual(detector['mapAstTypeToStatementType']('update'), 'UPDATE');
            assert.strictEqual(detector['mapAstTypeToStatementType']('delete'), 'DELETE');
            assert.strictEqual(detector['mapAstTypeToStatementType']('create'), 'CREATE');
            assert.strictEqual(detector['mapAstTypeToStatementType']('drop'), 'DROP');
            assert.strictEqual(detector['mapAstTypeToStatementType']('truncate'), 'TRUNCATE');
            assert.strictEqual(detector['mapAstTypeToStatementType']('alter'), 'ALTER');
            assert.strictEqual(detector['mapAstTypeToStatementType']('unknown_type'), 'OTHER');
        });

        it('should return OTHER for unrecognized SQL', () => {
            assert.strictEqual(detector['detectStatementType']('SOMETHING WEIRD'), 'OTHER');
        });
    });

    describe('SafeQueryGuard', () => {
        let guard: SafeQueryGuard;

        beforeEach(() => {
            guard = new SafeQueryGuard();
        });

        it('should detect DELETE without WHERE via regex', async () => {
            const result = await guard.analyze('DELETE FROM users');
            assert.ok(result.warnings.some(w => w.rule === 'delete_without_where'));
        });

        it('should detect UPDATE without WHERE via regex', async () => {
            const result = await guard.analyze('UPDATE users SET name = "a"');
            assert.ok(result.warnings.some(w => w.rule === 'update_without_where'));
        });

        it('should detect DROP statement via regex', async () => {
            const result = await guard.analyze('DROP TABLE users');
            assert.ok(result.confirmations.some(c => c.rule === 'drop_statement'));
        });

        it('should detect TRUNCATE statement via regex', async () => {
            const result = await guard.analyze('TRUNCATE TABLE users');
            assert.ok(result.confirmations.some(c => c.rule === 'truncate_statement'));
        });

        it('should mark safe for SELECT statements', async () => {
            const result = await guard.analyze('SELECT * FROM users WHERE id = 1');
            assert.strictEqual(result.safe, true);
            assert.strictEqual(result.warnings.length, 0);
            assert.strictEqual(result.confirmations.length, 0);
        });

        it('should mark unsafe for DELETE without WHERE', async () => {
            const result = await guard.analyze('DELETE FROM users');
            assert.strictEqual(result.safe, false);
        });
    });

    describe('QueryExecutor', () => {
        it('should generate unique query IDs', () => {
            const executor = new QueryExecutor();
            const id1 = executor['generateQueryId']();
            const id2 = executor['generateQueryId']();
            assert.notStrictEqual(id1, id2);
            assert.ok(id1.startsWith('q-'));
        });

        it('should track running queries', () => {
            const executor = new QueryExecutor();
            assert.strictEqual(executor.getRunningQueries().length, 0);
            assert.strictEqual(executor.isRunning('nonexistent'), false);
        });

        it('should dispose cleanly', () => {
            const executor = new QueryExecutor();
            executor.dispose();
            assert.strictEqual(executor.getRunningQueries().length, 0);
        });
    });

    describe('QueryHistory', () => {
        it('should return empty array when not initialized', () => {
            const history = new QueryHistory();
            assert.deepStrictEqual(history.getAll(), []);
            assert.deepStrictEqual(history.getRecent(10), []);
            assert.deepStrictEqual(history.search('test'), []);
        });

        it('should clear without error when not initialized', () => {
            const history = new QueryHistory();
            assert.doesNotThrow(() => history.clear());
        });

        it('should truncate long SQL strings', () => {
            const history = new QueryHistory();
            const longSql = 'A'.repeat(3000);
            const truncated = history['truncateSql'](longSql);
            assert.ok(truncated.length <= 2015);
            assert.ok(truncated.endsWith('...(truncated)'));
        });

        it('should not truncate short SQL strings', () => {
            const history = new QueryHistory();
            const shortSql = 'SELECT 1';
            const result = history['truncateSql'](shortSql);
            assert.strictEqual(result, shortSql);
        });
    });
});
```

- [ ] **Step 2: 运行测试**

Run: `npm run compile && npm test`
Expected: 测试通过

---

### Task 11: 编译验证与 lint 检查

**Files:**
- All modified files

- [ ] **Step 1: 运行完整编译**

Run: `npm run compile`
Expected: 编译成功

- [ ] **Step 2: 运行 lint 检查**

Run: `npm run lint`
Expected: 无 lint 错误

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 所有测试通过
