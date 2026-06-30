import { MysqlConnectionAdapter } from './MysqlConnectionAdapter';
import type { StarrocksSharedContext } from './StarrocksSharedContext';

/**
 * StarRocks connection pool operations.
 *
 * StarRocks is MySQL-protocol compatible, so we reuse the mysql2 driver and
 * inherit the full connect/disconnect/testConnection/health/reap/error-
 * formatting lifecycle from {@link MysqlConnectionAdapter}. Only the
 * dialect-specific version query, default product name and log prefixes are
 * overridden here. Used internally by StarrocksAdapter; common lifecycle
 * logic lives in BaseDatabaseAdapter.
 */
export class StarrocksConnectionAdapter extends MysqlConnectionAdapter<StarrocksSharedContext> {
    constructor(shared: StarrocksSharedContext) {
        super(shared);
    }

    /**
     * StarRocks supports `SELECT version() AS version` (MySQL-compatible).
     * The query text happens to be identical to MySQL's lowercased form, but
     * is overridden explicitly so the StarRocks version probe is documented
     * and decoupled from MySQL's canonical `SELECT VERSION() AS version`.
     */
    protected override getServerVersionSql(): string {
        return 'SELECT version() AS version';
    }

    protected override defaultServerVersion(): string {
        return 'StarRocks';
    }

    protected override warmupFailureLogPrefix(): string {
        return 'StarRocks';
    }

    protected override rollbackFailureLogPrefix(): string {
        return 'StarRocks';
    }

    protected override healthCheckFailureLogPrefix(): string {
        return 'StarrocksConnectionAdapter';
    }
}
