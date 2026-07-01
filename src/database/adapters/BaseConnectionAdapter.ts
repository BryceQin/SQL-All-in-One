import { t } from '../../i18n/index';

/**
 * Minimal shared-context contract required by {@link BaseConnectionAdapter}'s
 * default {@link BaseConnectionAdapter.reapIdleConnections} implementation.
 *
 * Every concrete dialect's shared context (MysqlSharedContext,
 * PostgresSharedContext, OracleSharedContext, DamengSharedContext,
 * SqlServerSharedContext, SqliteSharedContext) satisfies this contract:
 * pool-based dialects expose `pool`, SQLite exposes `db`, and all of them
 * inherit `lastActivityTime` from {@link BaseSharedContext}.
 */
export interface IReapableSharedContext {
    pool?: unknown;
    db?: unknown;
    lastActivityTime: number;
}

/**
 * Shared base class for per-dialect connection sub-adapters.
 *
 * Connection sub-adapters ({@link MysqlConnectionAdapter},
 * {@link PostgresConnectionAdapter}, ...) do NOT extend
 * {@link BaseDatabaseAdapter}: they are leaf collaborators that hold a
 * reference to a shared context and implement only the connect/disconnect/
 * testConnection/health/reap lifecycle. They were therefore duplicating the
 * common network-error branch of `formatConnectionError` (ECONNREFUSED,
 * ETIMEDOUT, EHOSTUNREACH, ENOTFOUND) and the SSL fallback in every
 * dialect.
 *
 * This base class centralises that shared logic and exposes the same
 * `formatDriverSpecificError` hook pattern as
 * {@link BaseDatabaseAdapter.formatDriverSpecificError}: subclasses override
 * the hook to map driver-specific error codes (ER_ACCESS_DENIED_ERROR,
 * ORA-01017, mssql ELOGIN, ODBC SQLSTATE 28000, ...) to localised messages
 * and return `undefined` to fall back to the common network-level handling
 * here.
 *
 * Generic over the dialect's shared-context type so that the default
 * {@link reapIdleConnections} implementation can read `pool` / `db` and
 * `lastActivityTime` from `this.shared` without each subclass repeating the
 * same 3-line guard.
 *
 * Order of precedence in {@link formatConnectionError}:
 *   1. {@link formatDriverSpecificError} hook (dialect-specific codes).
 *   2. Common network-level errors (ECONNREFUSED, ETIMEDOUT, ...).
 *   3. The original error (or a wrapped Error for non-Error throws),
 *      with a dialect-specific error-code tag (e.g. `ORA-01017`)
 *      prepended via {@link extractErrorCodeTag} when the original error
 *      is returned unchanged.
 */
export abstract class BaseConnectionAdapter<TShared extends IReapableSharedContext = IReapableSharedContext> {
    /**
     * The dialect's shared context. Concrete subclasses declare this as a
     * `protected` (or `private`) constructor parameter; the base class
     * references it only inside {@link reapIdleConnections}.
     */
    protected abstract readonly shared: TShared;
    /**
     * Formats a connection error for display.
     *
     * Subclasses must NOT override this; override
     * {@link formatDriverSpecificError} and/or {@link extractErrorCodeTag}
     * instead.
     */
    formatConnectionError(error: unknown, config: { host: string; port?: number; username: string; database?: string }): Error {
        const driverSpecific = this.formatDriverSpecificError(error, config);
        if (driverSpecific) {
            return driverSpecific;
        }

        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        if (msg.includes('ECONNREFUSED')) {
            return new Error(t('database.connectionRefused', hostPort));
        }
        if (msg.includes('ETIMEDOUT') || msg.includes('connectTimeout')) {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        if (msg.includes('EHOSTUNREACH')) {
            return new Error(t('database.hostUnreachable', hostPort));
        }
        if (msg.includes('ENOTFOUND')) {
            return new Error(t('database.hostNotFound', config.host));
        }

        // Common network-level fallbacks did not match. When the original
        // error object is about to be returned unchanged, prepend the
        // dialect-specific error-code tag (e.g. `ORA-01017` or the ODBC
        // SQLSTATE) so callers can still surface dialect-specific
        // diagnostics. Subclasses opt in by overriding
        // {@link extractErrorCodeTag}; the default returns `null` so this
        // branch is a no-op for dialects without a structured error code.
        if (error instanceof Error) {
            const codeTag = this.extractErrorCodeTag(error);
            if (codeTag && !msg.includes(codeTag)) {
                return new Error(`${codeTag}: ${msg}`);
            }
            return error;
        }

        return new Error(msg);
    }

    /**
     * Extracts a dialect-specific error-code tag from a thrown error.
     *
     * Override this in a concrete connection sub-adapter to surface the
     * dialect's structured error code — e.g. Oracle's `ORA-XXXXX`
     * (derived from `error.errorNum`) or the ODBC SQLSTATE / `DM-XXXX`
     * tag used by Dameng. Return `null` when no tag is available so that
     * {@link formatConnectionError} returns the original error untouched.
     *
     * The default implementation returns `null`; this hook is only
     * consulted when neither {@link formatDriverSpecificError} nor the
     * common network-error fallbacks produced a localised message, i.e.
     * when the original error object would otherwise be returned as-is.
     */
    protected extractErrorCodeTag(_error: unknown): string | null {
        return null;
    }

    /**
     * Reaps idle connections.
     *
     * Most modern drivers (mysql2 with enableKeepAlive, pg, mssql, oracledb,
     * odbc, better-sqlite3) handle idle connection eviction internally.
     * Manual pool destruction is harmful: it kills active queries and creates
     * a brief unavailability window. This default implementation is therefore
     * a no-op that only refreshes `lastActivityTime` when a pool/db handle is
     * present, matching the previous 3-line override that was duplicated
     * verbatim across MySQL / Postgres / Oracle / Dameng / SqlServer / Sqlite.
     *
     * Concrete sub-adapters only need to override this when they have
     * driver-specific idle reaping that the driver itself cannot handle.
     */
    async reapIdleConnections(): Promise<void> {
        // Pool-based dialects set `pool`; SQLite sets `db`. Either way, if no
        // handle is present there is nothing to reap and no activity to stamp.
        if (!this.shared.pool && !this.shared.db) return;
        this.shared.lastActivityTime = Date.now();
    }

    /**
     * Dialect-specific error-code mapping hook.
     *
     * Override this in a concrete connection sub-adapter to map
     * driver-specific error codes (ER_ACCESS_DENIED_ERROR, ORA-01017, mssql
     * ELOGIN, ODBC SQLSTATE 28000, ...) to localised user-facing messages.
     * Return `undefined` to fall back to the common network-error handling
     * in {@link formatConnectionError}.
     *
     * The default implementation handles SSL/certificate errors shared by
     * every TLS-capable driver so subclasses do not have to repeat it.
     */
    protected formatDriverSpecificError(_error: unknown, _config: { host: string; port?: number; username: string; database?: string }): Error | undefined {
        const msg = _error instanceof Error ? _error.message : String(_error);
        const hostPort = `${_config.host}:${_config.port}`;
        if (msg.includes('self signed certificate') || msg.includes('certificate') || msg.includes('SSL')) {
            return new Error(t('database.sslError', hostPort));
        }
        return undefined;
    }
}
