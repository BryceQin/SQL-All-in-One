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
