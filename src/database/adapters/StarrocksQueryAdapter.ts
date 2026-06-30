import type { StarrocksSharedContext } from './StarrocksSharedContext';
import { MysqlQueryAdapter } from './MysqlQueryAdapter';
import { t } from '../../i18n/index';

/**
 * StarRocks query adapter.
 *
 * StarRocks is MySQL-protocol compatible, so execute / executeBatch /
 * acquireConnectionWithTimeout are inherited unchanged from
 * {@link MysqlQueryAdapter}. Only the transaction lifecycle and the cancel
 * path differ:
 *
 *   - StarRocks uses `KILL <connectionId>` (without the `QUERY` keyword that
 *     MySQL uses).
 *   - The transaction connection's threadId is tracked under the
 *     `__transaction__` key so cancelQuery can target queries running inside
 *     an open transaction (otherwise the queryId was never registered and the
 *     cancel would silently no-op).
 */
export class StarrocksQueryAdapter extends MysqlQueryAdapter<StarrocksSharedContext> {
    constructor(shared: StarrocksSharedContext) {
        super(shared);
    }

    override async beginTransaction(): Promise<void> {
        if (this.shared.transactionConnection) {
            throw new Error(t('database.transactionInProgress'));
        }
        if (!this.shared.pool) {
            throw new Error(t('database.notConnected'));
        }

        this.shared.transactionConnection = await this.shared.pool.getConnection();
        await this.shared.transactionConnection.beginTransaction();
        // Track the transaction connection's threadId so cancelQuery can target
        // queries running inside the transaction. Without this, cancelQuery for
        // a transaction-scoped query would silently no-op because the queryId
        // was never registered in activeQueryThreadIds.
        const txThreadId = (this.shared.transactionConnection as unknown as { threadId?: number }).threadId;
        if (txThreadId !== undefined) {
            this.shared.activeQueryThreadIds.set('__transaction__', txThreadId);
        }
    }

    override async commit(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.commit();
        } finally {
            this.shared.activeQueryThreadIds.delete('__transaction__');
            this.shared.transactionConnection.release();
            this.shared.transactionConnection = null;
        }
    }

    override async rollback(): Promise<void> {
        if (!this.shared.transactionConnection) {
            throw new Error(t('database.noTransactionInProgress'));
        }

        try {
            await this.shared.transactionConnection.rollback();
            this.shared.transactionConnection.release();
        } catch (rollbackError) {
            this.shared.transactionConnection.destroy();
            console.error('Rollback failed, connection destroyed:', rollbackError);
        } finally {
            this.shared.activeQueryThreadIds.delete('__transaction__');
            this.shared.transactionConnection = null;
        }
    }

    override async cancelQuery(_queryId: string): Promise<void> {
        if (!this.shared.pool) {
            return;
        }

        // Look up the threadId for the given queryId. If not found and a
        // transaction is active, fall back to the transaction connection's
        // threadId so transaction-scoped queries can also be cancelled.
        let threadId = this.shared.activeQueryThreadIds.get(_queryId);
        if (threadId === undefined && this.shared.transactionConnection) {
            threadId = this.shared.activeQueryThreadIds.get('__transaction__');
        }
        if (threadId === undefined) {
            return;
        }

        try {
            const conn = await this.shared.pool.getConnection();
            try {
                // StarRocks supports MySQL-compatible KILL statement (without
                // the QUERY keyword that MySQL uses).
                await conn.query(`KILL ${threadId}`);
            } finally {
                conn.release();
            }
        } catch (e) {
            console.debug('[SQL All in One] StarRocks cancel query error:', e);
        }
    }
}
