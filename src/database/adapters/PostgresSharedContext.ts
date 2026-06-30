import type { Pool, PoolClient } from 'pg';
import { BaseSharedContext } from './BaseSharedContext';

/**
 * PostgreSQL shared context.
 *
 * Holds the pg Pool, the transaction-scoped PoolClient and the active-query
 * pid map used by the query/schema/connection sub-adapters. Common
 * adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 */
export class PostgresSharedContext extends BaseSharedContext {
    pool: Pool | null = null;
    transactionClient: PoolClient | null = null;
    activeQueryPids = new Map<string, number>();
}
