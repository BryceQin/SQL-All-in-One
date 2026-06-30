import type { ConnectionPool, Request, Transaction } from 'mssql';
import { BaseSharedContext } from './BaseSharedContext';

/**
 * SQL Server shared context.
 *
 * Holds the mssql ConnectionPool and the transaction-scoped Request used by
 * the query/schema adapters. Mirrors the structure of MysqlSharedContext but
 * uses the mssql driver types (ConnectionPool/Request/Transaction). Common
 * adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 */
export class SqlServerSharedContext extends BaseSharedContext {
    // SQL Server shared state
    pool: ConnectionPool | null = null;
    transaction: Transaction | null = null;
    activeRequests = new Map<string, Request>();
}
