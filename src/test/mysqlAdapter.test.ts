import * as assert from "assert";
import { MysqlConnectionAdapter } from "../database/adapters/MysqlAdapter";
import type { IMysqlProtocolSharedContext } from "../database/adapters/MysqlAdapter";
import type { ConnectionConfig as AppConnectionConfig } from "../database/connection/ConnectionConfig";

/**
 * Builds a {@link MysqlConnectionAdapter} wired to a minimal stub shared
 * context. The two methods under test ({@link MysqlConnectionAdapter.createPoolOptions}
 * and {@link MysqlConnectionAdapter.createConnectionOptions}) are private
 * instance methods that only read their `config` argument and never touch
 * `this.shared`, so a stub shared context is sufficient and the tests do
 * not need a live mysql2 pool or any database.
 *
 * The private methods are reached via an `any` cast because they are not
 * part of the public API; this mirrors how the rest of the test suite
 * accesses internal helpers (see e.g. explainPlan.test.ts casting
 * `ExplainPlan` to expose the private `detectOperation`).
 */
function createAdapterWithStubShared(): MysqlConnectionAdapter {
    const stubShared: IMysqlProtocolSharedContext = {
        pool: null,
        transactionConnection: null,
        activeQueryThreadIds: new Map(),
        config: {} as AppConnectionConfig,
        activeConnectionCount: 0,
        totalConnectionCount: 0,
        lastActivityTime: 0,
    } as unknown as IMysqlProtocolSharedContext;
    return new MysqlConnectionAdapter(stubShared);
}

function baseConfig(overrides: Partial<AppConnectionConfig> = {}): AppConnectionConfig {
    return {
        id: "test",
        name: "Test Connection",
        dialect: "mysql",
        host: "localhost",
        port: 3306,
        username: "root",
        ...overrides,
    };
}

suite("MysqlConnectionAdapter - createPoolOptions", () => {
    const adapter = createAdapterWithStubShared();

    test("default config yields connectionLimit=5 and keepAlive defaults", () => {
        const options = (
            adapter as unknown as {
                createPoolOptions(config: AppConnectionConfig): Record<string, unknown>;
            }
        ).createPoolOptions(baseConfig());

        assert.strictEqual(options.host, "localhost");
        assert.strictEqual(options.port, 3306);
        assert.strictEqual(options.user, "root");
        assert.strictEqual(options.connectionLimit, 5, "default maxConnections should be 5");
        assert.strictEqual(options.waitForConnections, true);
        assert.strictEqual(options.queueLimit, 0);
        assert.strictEqual(options.connectTimeout, 10000, "default connectTimeout should be 10000");
        assert.strictEqual(options.enableKeepAlive, true, "default enableKeepAlive should be true");
        assert.strictEqual(options.keepAliveInitialDelay, 30000, "default keepAliveInitialDelay should be 30000");
        assert.ok(!("ssl" in options), "ssl should be absent when ssl not enabled");
        assert.ok(!("charset" in options), "charset should be absent when not set");
        assert.ok(!("timezone" in options), "timezone should be absent when not set");
    });

    test("custom connectionLimit is honoured", () => {
        const options = (
            adapter as unknown as {
                createPoolOptions(config: AppConnectionConfig): Record<string, unknown>;
            }
        ).createPoolOptions(
            baseConfig({
                poolConfig: { maxConnections: 42 },
            }),
        );

        assert.strictEqual(options.connectionLimit, 42);
    });

    test("ssl options are propagated when ssl.enabled is true", () => {
        const options = (
            adapter as unknown as {
                createPoolOptions(config: AppConnectionConfig): Record<string, unknown> & { ssl?: Record<string, unknown> };
            }
        ).createPoolOptions(
            baseConfig({
                ssl: {
                    enabled: true,
                    rejectUnauthorized: false,
                    ca: "ca-content",
                    cert: "cert-content",
                    key: "key-content",
                },
            }),
        );

        assert.ok(options.ssl, "ssl should be present when ssl.enabled is true");
        assert.strictEqual(options.ssl!.rejectUnauthorized, false, "rejectUnauthorized should be honoured");
        assert.strictEqual(options.ssl!.ca, "ca-content");
        assert.strictEqual(options.ssl!.cert, "cert-content");
        assert.strictEqual(options.ssl!.key, "key-content");
    });

    test("ssl.rejectUnauthorized defaults to true when omitted", () => {
        const options = (
            adapter as unknown as {
                createPoolOptions(config: AppConnectionConfig): Record<string, unknown> & { ssl?: Record<string, unknown> };
            }
        ).createPoolOptions(
            baseConfig({
                ssl: {
                    enabled: true,
                    rejectUnauthorized: undefined as unknown as boolean,
                },
            }),
        );

        assert.strictEqual(options.ssl!.rejectUnauthorized, true);
    });

    test("charset and timezone options are propagated", () => {
        const options = (
            adapter as unknown as {
                createPoolOptions(config: AppConnectionConfig): Record<string, unknown>;
            }
        ).createPoolOptions(
            baseConfig({
                options: { charset: "utf8mb4", timezone: "+08:00" },
            }),
        );

        assert.strictEqual(options.charset, "utf8mb4");
        assert.strictEqual(options.timezone, "+08:00");
    });

    test("boundary: empty host is passed through unchanged", () => {
        // createPoolOptions does not validate host; it only forwards it. This
        // test documents that boundary so future refactors do not silently
        // start rejecting (or defaulting) an empty host here.
        const options = (
            adapter as unknown as {
                createPoolOptions(config: AppConnectionConfig): Record<string, unknown>;
            }
        ).createPoolOptions(baseConfig({ host: "" }));

        assert.strictEqual(options.host, "");
    });

    test("boundary: undefined port is forwarded as undefined", () => {
        // mysql2 itself treats an undefined port by falling back to the
        // protocol default (3306); the adapter must not invent a value.
        const config = baseConfig();
        (config as { port?: number }).port = undefined;
        const options = (
            adapter as unknown as {
                createPoolOptions(config: AppConnectionConfig): Record<string, unknown>;
            }
        ).createPoolOptions(config);

        assert.strictEqual(options.port, undefined);
    });
});

suite("MysqlConnectionAdapter - createConnectionOptions", () => {
    const adapter = createAdapterWithStubShared();

    test("default config produces the minimal connection options", () => {
        const options = (
            adapter as unknown as {
                createConnectionOptions(config: AppConnectionConfig): Record<string, unknown>;
            }
        ).createConnectionOptions(baseConfig());

        assert.strictEqual(options.host, "localhost");
        assert.strictEqual(options.port, 3306);
        assert.strictEqual(options.user, "root");
        assert.strictEqual(options.database, undefined);
        assert.strictEqual(options.connectTimeout, 10000, "default connectTimeout should be 10000");
        assert.ok(!("ssl" in options), "ssl should be absent when ssl not enabled");
        assert.ok(!("charset" in options), "charset should be absent when not set");
        assert.ok(!("timezone" in options), "timezone should be absent when not set");
    });

    test("database is propagated when set", () => {
        const options = (
            adapter as unknown as {
                createConnectionOptions(config: AppConnectionConfig): Record<string, unknown>;
            }
        ).createConnectionOptions(baseConfig({ database: "shop" }));

        assert.strictEqual(options.database, "shop");
    });

    test("ssl options are propagated when ssl.enabled is true", () => {
        const options = (
            adapter as unknown as {
                createConnectionOptions(config: AppConnectionConfig): Record<string, unknown> & { ssl?: Record<string, unknown> };
            }
        ).createConnectionOptions(
            baseConfig({
                ssl: {
                    enabled: true,
                    rejectUnauthorized: true,
                    ca: "ca-content",
                    cert: "cert-content",
                    key: "key-content",
                },
            }),
        );

        assert.ok(options.ssl);
        assert.strictEqual(options.ssl!.rejectUnauthorized, true);
        assert.strictEqual(options.ssl!.ca, "ca-content");
        assert.strictEqual(options.ssl!.cert, "cert-content");
        assert.strictEqual(options.ssl!.key, "key-content");
    });

    test("charset and timezone options are propagated", () => {
        const options = (
            adapter as unknown as {
                createConnectionOptions(config: AppConnectionConfig): Record<string, unknown>;
            }
        ).createConnectionOptions(
            baseConfig({
                options: { charset: "utf8mb4", timezone: "Z" },
            }),
        );

        assert.strictEqual(options.charset, "utf8mb4");
        assert.strictEqual(options.timezone, "Z");
    });

    test("connectTimeout override is honoured", () => {
        const options = (
            adapter as unknown as {
                createConnectionOptions(config: AppConnectionConfig): Record<string, unknown>;
            }
        ).createConnectionOptions(baseConfig({ connectTimeout: 2500 }));

        assert.strictEqual(options.connectTimeout, 2500);
    });
});
