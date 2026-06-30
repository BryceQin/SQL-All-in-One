import type { Pool, PoolConnection } from 'mysql2/promise';
import type { ConnectionConfig } from './IDatabaseAdapter';
import { BaseSharedContext } from './BaseSharedContext';

/**
 * Structural shape shared by {@link MysqlSharedContext} and
 * {@link StarrocksSharedContext}. Declared so that
 * {@link MysqlQueryAdapter} (and any other MySQL-protocol sub-adapter that
 * StarRocks reuses via inheritance) can be typed against a common contract
 * without forcing StarRocks to import the MySQL shared-context class.
 *
 * Both contexts delegate `config` / `connectionId` / activity counters to a
 * {@link BaseDatabaseAdapter} instance, so the structural members below are
 * guaranteed to be present on either dialect's context.
 */
export interface IMysqlProtocolSharedContext {
    pool: Pool | null;
    transactionConnection: PoolConnection | null;
    activeQueryThreadIds: Map<string, number>;
    readonly config: ConnectionConfig;
    activeConnectionCount: number;
    totalConnectionCount: number;
    lastActivityTime: number;
}

/**
 * MySQL shared context.
 *
 * Holds the mysql2 Pool, the transaction-scoped PoolConnection and the
 * active-query threadId map used by the query/schema/connection sub-adapters.
 * Common adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 */
export class MysqlSharedContext extends BaseSharedContext implements IMysqlProtocolSharedContext {
    // MySQL-specific state
    pool: Pool | null = null;
    transactionConnection: PoolConnection | null = null;
    activeQueryThreadIds = new Map<string, number>();
}
