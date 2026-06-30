import type { Pool, PoolConnection } from 'mysql2/promise';
import { BaseSharedContext } from './BaseSharedContext';
import type { IMysqlProtocolSharedContext } from './MysqlSharedContext';

/**
 * StarRocks shared context.
 *
 * StarRocks is MySQL-protocol compatible, so we reuse the mysql2 driver
 * Pool/PoolConnection types. The structure mirrors MysqlSharedContext and
 * implements {@link IMysqlProtocolSharedContext} so the StarRocks query
 * adapter can reuse {@link MysqlQueryAdapter} via inheritance. Common
 * adapter-delegated state (config / connectionId / activity counters /
 * reap timer) is inherited from {@link BaseSharedContext}.
 */
export class StarrocksSharedContext extends BaseSharedContext implements IMysqlProtocolSharedContext {
    // StarRocks (MySQL-protocol) shared state
    pool: Pool | null = null;
    transactionConnection: PoolConnection | null = null;
    activeQueryThreadIds = new Map<string, number>();
}
