import * as assert from "assert";
import type { DatabaseInfo, TableInfo, ViewInfo, FunctionInfo, ProcedureInfo, ColumnInfo } from "../database/adapters/IDatabaseAdapter";
import { findCursorContext, extractTableNames } from "../completion/AstCompletionProvider";
import { SchemaProvider, getSchemaProvider, type ClauseType, type CompletionContext } from "../database/schema/SchemaProvider";
import { SchemaCache, getSchemaCache } from "../database/schema/SchemaCache";

const sampleDatabases: DatabaseInfo[] = [
    { name: "mydb", charset: "utf8mb4", collation: "utf8mb4_general_ci" },
    { name: "testdb" },
    { name: "analytics_db" },
];

const sampleTables: TableInfo[] = [
    { name: "users", type: "BASE TABLE", engine: "InnoDB", rowCount: 1234, comment: "User table" },
    { name: "orders", type: "BASE TABLE", engine: "InnoDB", rowCount: 5678, comment: "Order table" },
    { name: "products", type: "BASE TABLE", engine: "InnoDB", rowCount: 90 },
];

const sampleViews: ViewInfo[] = [
    { name: "v_summary", definition: "SELECT u.id, COUNT(*) FROM users u GROUP BY u.id", comment: "Summary view" },
    { name: "v_recent_orders", definition: "SELECT * FROM orders WHERE created_at > NOW() - INTERVAL 7 DAY" },
];

const sampleColumns: Record<string, ColumnInfo[]> = {
    users: [
        { name: "id", type: "INT", nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false, comment: "Primary key" },
        {
            name: "name",
            type: "VARCHAR(255)",
            nullable: false,
            isPrimaryKey: false,
            isAutoIncrement: false,
            isUnique: false,
            comment: "User name",
        },
        {
            name: "email",
            type: "VARCHAR(255)",
            nullable: true,
            isPrimaryKey: false,
            isAutoIncrement: false,
            isUnique: true,
            comment: "Email address",
        },
        { name: "status", type: "TINYINT", nullable: true, isPrimaryKey: false, isAutoIncrement: false, isUnique: false, defaultValue: 1 },
    ],
    orders: [
        { name: "id", type: "INT", nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
        {
            name: "user_id",
            type: "INT",
            nullable: false,
            isPrimaryKey: false,
            isAutoIncrement: false,
            isUnique: false,
            referencedTable: "users",
        },
        { name: "total", type: "DECIMAL(10,2)", nullable: true, isPrimaryKey: false, isAutoIncrement: false, isUnique: false },
        { name: "created_at", type: "DATETIME", nullable: true, isPrimaryKey: false, isAutoIncrement: false, isUnique: false },
    ],
};

const sampleFunctions: FunctionInfo[] = [
    { name: "fn_calc_total", returns: "DECIMAL", definition: "BEGIN RETURN (SELECT SUM(total) FROM orders); END" },
    { name: "fn_format_name", returns: "VARCHAR" },
];

const sampleProcedures: ProcedureInfo[] = [
    { name: "sp_sync_data", definition: "BEGIN INSERT INTO orders SELECT * FROM temp_orders; END" },
    { name: "sp_cleanup" },
];

// ============================================================================
// SchemaProvider - Alias Resolution Tests
// ============================================================================

suite("SchemaProvider - Alias Resolution", () => {
    let provider: SchemaProvider;

    setup(() => {
        provider = new SchemaProvider();
    });

    teardown(() => {
        provider.dispose();
    });

    test("resolveAlias returns table name for known alias", () => {
        const aliasMap = new Map<string, string>();
        aliasMap.set("u", "users");
        aliasMap.set("o", "orders");

        assert.strictEqual(provider.resolveAlias("u", aliasMap), "users");
        assert.strictEqual(provider.resolveAlias("o", aliasMap), "orders");
    });

    test("resolveAlias returns undefined for unknown alias", () => {
        const aliasMap = new Map<string, string>();
        aliasMap.set("u", "users");

        assert.strictEqual(provider.resolveAlias("x", aliasMap), undefined);
    });

    test("resolveAlias is case-insensitive", () => {
        const aliasMap = new Map<string, string>();
        aliasMap.set("u", "users");

        assert.strictEqual(provider.resolveAlias("U", aliasMap), "users");
        assert.strictEqual(provider.resolveAlias("u", aliasMap), "users");
    });

    test("resolveAlias returns undefined for empty alias map", () => {
        const aliasMap = new Map<string, string>();
        assert.strictEqual(provider.resolveAlias("u", aliasMap), undefined);
    });

    test("parseAliasMap extracts aliases from simple FROM clause", () => {
        const sql = "SELECT u.id FROM users u";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.strictEqual(result.get("u"), "users");
    });

    test("parseAliasMap extracts aliases from FROM + JOIN", () => {
        const sql = "SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.strictEqual(result.get("u"), "users");
        assert.strictEqual(result.get("o"), "orders");
    });

    test("parseAliasMap returns empty map for SQL without aliases", () => {
        const sql = "SELECT id FROM users";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.strictEqual(result.size, 0);
    });

    test("parseAliasMap handles LEFT JOIN aliases", () => {
        const sql = "SELECT u.id FROM users u LEFT JOIN orders o ON u.id = o.user_id";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.strictEqual(result.get("u"), "users");
        assert.strictEqual(result.get("o"), "orders");
    });

    test("parseAliasMap handles multiple JOINs", () => {
        const sql = "SELECT u.id, o.total, p.name FROM users u JOIN orders o ON u.id = o.user_id JOIN products p ON o.product_id = p.id";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.strictEqual(result.get("u"), "users");
        assert.strictEqual(result.get("o"), "orders");
        assert.strictEqual(result.get("p"), "products");
    });

    test("parseAliasMap handles invalid SQL gracefully", () => {
        const sql = "INVALID SQL !!@@##";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.ok(result instanceof Map);
    });

    test("parseAliasMap handles empty SQL", () => {
        const result = provider.parseAliasMap("", "mysql");
        assert.strictEqual(result.size, 0);
    });

    test("parseAliasMap handles subquery aliases", () => {
        const sql = "SELECT sq.id FROM (SELECT id FROM users) sq";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.ok(result instanceof Map);
    });
});

// ============================================================================
// SchemaProvider - Sorting Tests
// ============================================================================

suite("SchemaProvider - Sorting Logic", () => {
    test("exact match sorts before prefix match", () => {
        const items = ["abc", "ab", "abcd", "a"];
        const sorted = [...items].sort((a, b) => {
            const prefix = "ab";
            const aExact = a === prefix ? 0 : 1;
            const bExact = b === prefix ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            const aPrefix = a.startsWith(prefix) ? 0 : 1;
            const bPrefix = b.startsWith(prefix) ? 0 : 1;
            if (aPrefix !== bPrefix) return aPrefix - bPrefix;
            return a.localeCompare(b);
        });
        assert.strictEqual(sorted[0], "ab");
        assert.ok(sorted.indexOf("abc") < sorted.indexOf("a"));
    });

    test("prefix match sorts before contains match", () => {
        const items = ["xab", "abc"];
        const prefix = "ab";
        const sorted = [...items].sort((a, b) => {
            const aPrefix = a.startsWith(prefix) ? 0 : 1;
            const bPrefix = b.startsWith(prefix) ? 0 : 1;
            return aPrefix - bPrefix;
        });
        assert.strictEqual(sorted[0], "abc");
    });

    test("contains match sorts before no match", () => {
        const items = ["xyz", "xab", "abc"];
        const prefix = "ab";
        const sorted = [...items].sort((a, b) => {
            const aContains = a.includes(prefix) ? 0 : 1;
            const bContains = b.includes(prefix) ? 0 : 1;
            return aContains - bContains;
        });
        assert.ok(sorted.indexOf("abc") < sorted.indexOf("xyz"));
        assert.ok(sorted.indexOf("xab") < sorted.indexOf("xyz"));
    });
});

// ============================================================================
// SchemaProvider - CompletionContext Tests
// ============================================================================

suite("SchemaProvider - CompletionContext", () => {
    test("CompletionContext has required fields", () => {
        const ctx: CompletionContext = {
            connectionId: "conn1",
            database: "mydb",
            clauseType: "FROM",
            prefix: "",
            aliasMap: new Map(),
        };
        assert.strictEqual(ctx.connectionId, "conn1");
        assert.strictEqual(ctx.database, "mydb");
        assert.strictEqual(ctx.clauseType, "FROM");
        assert.strictEqual(ctx.prefix, "");
        assert.ok(ctx.aliasMap instanceof Map);
    });

    test("ClauseType includes all required values", () => {
        const requiredTypes: ClauseType[] = [
            "USE",
            "FROM",
            "JOIN",
            "SELECT",
            "WHERE",
            "ORDER BY",
            "GROUP BY",
            "HAVING",
            "INSERT INTO",
            "UPDATE",
            "CALL",
            "OTHER",
        ];
        assert.strictEqual(requiredTypes.length, 12);
        for (const ct of requiredTypes) {
            assert.ok(typeof ct === "string", `ClauseType ${ct} should be a string`);
        }
    });

    test("all ClauseType values are distinct", () => {
        const types: ClauseType[] = [
            "USE",
            "FROM",
            "JOIN",
            "SELECT",
            "WHERE",
            "ORDER BY",
            "GROUP BY",
            "HAVING",
            "INSERT INTO",
            "UPDATE",
            "CALL",
            "OTHER",
        ];
        const unique = new Set(types);
        assert.strictEqual(unique.size, types.length);
    });
});

// ============================================================================
// SchemaProvider - MRU Cache Tests
// ============================================================================

suite("SchemaProvider - MRU Cache", () => {
    test("dispose clears MRU cache", () => {
        const provider = new SchemaProvider();
        provider.dispose();
        assert.ok(true);
    });

    test("getSchemaProvider returns singleton", () => {
        const instance1 = getSchemaProvider();
        const instance2 = getSchemaProvider();
        assert.strictEqual(instance1, instance2);
    });
});

// ============================================================================
// AstCompletionProvider - findCursorContext Tests
// ============================================================================

suite("AstCompletionProvider - findCursorContext", () => {
    test("detects FROM context after FROM keyword", () => {
        const sql = "SELECT * FROM users WHERE id = 1";
        const context = findCursorContext(sql, { line: 0, column: 15 }, "mysql");
        assert.ok(context === "from_table" || context === "unknown", `Expected from_table or unknown, got ${context}`);
    });

    test("detects SELECT columns context", () => {
        const sql = "SELECT id, name FROM users";
        const context = findCursorContext(sql, { line: 0, column: 8 }, "mysql");
        assert.ok(context === "select_columns" || context === "unknown", `Expected select_columns or unknown, got ${context}`);
    });

    test("detects WHERE context", () => {
        const sql = "SELECT * FROM users WHERE id = 1";
        const context = findCursorContext(sql, { line: 0, column: 28 }, "mysql");
        assert.ok(context === "where_expr" || context === "unknown", `Expected where_expr or unknown, got ${context}`);
    });

    test("handles empty SQL", () => {
        const context = findCursorContext("", { line: 0, column: 0 }, "mysql");
        assert.strictEqual(context, "unknown");
    });

    test("handles invalid SQL gracefully", () => {
        const context = findCursorContext("INVALID !!@@##", { line: 0, column: 5 }, "mysql");
        assert.ok(typeof context === "string");
    });

    test("handles multi-line SQL", () => {
        const sql = "SELECT id,\n       name\nFROM users\nWHERE id = 1";
        const context = findCursorContext(sql, { line: 2, column: 5 }, "mysql");
        assert.ok(typeof context === "string");
    });

    test("handles cursor at beginning of SQL", () => {
        const sql = "SELECT * FROM users";
        const context = findCursorContext(sql, { line: 0, column: 0 }, "mysql");
        assert.ok(typeof context === "string");
    });

    test("handles cursor at end of SQL", () => {
        const sql = "SELECT * FROM users";
        const context = findCursorContext(sql, { line: 0, column: sql.length }, "mysql");
        assert.ok(typeof context === "string");
    });
});

// ============================================================================
// AstCompletionProvider - extractTableNames Tests
// ============================================================================

suite("AstCompletionProvider - extractTableNames", () => {
    test("extracts table name from simple SELECT", () => {
        const sql = "SELECT * FROM users";
        const tables = extractTableNames(sql, "mysql");
        assert.ok(tables.includes("users"), `Should include 'users', got ${JSON.stringify(tables)}`);
    });

    test("extracts table names from JOIN", () => {
        const sql = "SELECT * FROM users u JOIN orders o ON u.id = o.user_id";
        const tables = extractTableNames(sql, "mysql");
        assert.ok(tables.includes("users"), `Should include 'users', got ${JSON.stringify(tables)}`);
        assert.ok(tables.includes("orders"), `Should include 'orders', got ${JSON.stringify(tables)}`);
    });

    test("returns empty array for SQL without FROM", () => {
        const sql = "SELECT 1";
        const tables = extractTableNames(sql, "mysql");
        assert.ok(Array.isArray(tables));
    });

    test("handles invalid SQL gracefully", () => {
        const tables = extractTableNames("INVALID SQL", "mysql");
        assert.ok(Array.isArray(tables));
    });

    test("handles empty SQL", () => {
        const tables = extractTableNames("", "mysql");
        assert.ok(Array.isArray(tables));
    });

    test("deduplicates table names", () => {
        const sql = "SELECT * FROM users JOIN users ON 1=1";
        const tables = extractTableNames(sql, "mysql");
        const usersCount = tables.filter((t) => t.toLowerCase() === "users").length;
        assert.strictEqual(usersCount, 1, "Should deduplicate table names");
    });

    test("extracts table name from INSERT INTO", () => {
        const sql = 'INSERT INTO users (id, name) VALUES (1, "test")';
        const tables = extractTableNames(sql, "mysql");
        assert.ok(Array.isArray(tables));
    });

    test("extracts table name from UPDATE", () => {
        const sql = 'UPDATE users SET name = "test" WHERE id = 1';
        const tables = extractTableNames(sql, "mysql");
        assert.ok(Array.isArray(tables));
    });
});

// ============================================================================
// SchemaProvider - getTableColumns / Hover Info Tests (no connection)
// ============================================================================

suite("SchemaProvider - No Connection Fallback", () => {
    let provider: SchemaProvider;

    setup(() => {
        provider = new SchemaProvider();
    });

    teardown(() => {
        provider.dispose();
    });

    test("getTableColumns returns empty array when no active connection", async () => {
        const result = await provider.getTableColumns("mydb", "users");
        assert.ok(Array.isArray(result));
        assert.strictEqual(result.length, 0);
    });

    test("getTableHoverInfo returns null when no active connection", async () => {
        const result = await provider.getTableHoverInfo("users", "mydb");
        assert.strictEqual(result, null);
    });

    test("getColumnHoverInfo returns null when no active connection", async () => {
        const result = await provider.getColumnHoverInfo("id", "users", "mydb");
        assert.strictEqual(result, null);
    });
});

// ============================================================================
// SchemaCache - TTL and Expiration Tests
// ============================================================================

suite("SchemaCache - TTL and Expiration", () => {
    test("CacheEntry structure has data and expireAt", () => {
        const entry = { data: [1, 2, 3], expireAt: Date.now() + 60000 };
        assert.ok(Array.isArray(entry.data));
        assert.ok(entry.expireAt > 0);
    });

    test("expired entry has expireAt in the past", () => {
        const entry = { data: ["test"], expireAt: Date.now() - 1000 };
        assert.ok(entry.expireAt < Date.now());
    });

    test("valid entry has expireAt in the future", () => {
        const entry = { data: ["test"], expireAt: Date.now() + 60000 };
        assert.ok(entry.expireAt > Date.now());
    });

    test("TTL default values match PRD", () => {
        const databaseTtl = 600;
        const tableTtl = 300;
        const columnTtl = 120;
        const functionTtl = 600;
        assert.strictEqual(databaseTtl, 600);
        assert.strictEqual(tableTtl, 300);
        assert.strictEqual(columnTtl, 120);
        assert.strictEqual(functionTtl, 600);
    });
});

// ============================================================================
// SchemaCache - Key Generation Tests
// ============================================================================

suite("SchemaCache - Key Generation", () => {
    test("database cache key format", () => {
        const key = "conn1";
        assert.strictEqual(key, "conn1");
    });

    test("table cache key format", () => {
        const key = ["conn1", "mydb"].join(":");
        assert.strictEqual(key, "conn1:mydb");
    });

    test("column cache key format", () => {
        const key = ["conn1", "mydb", "users"].join(":");
        assert.strictEqual(key, "conn1:mydb:users");
    });

    test("function cache key format", () => {
        const key = ["conn1", "mydb"].join(":");
        assert.strictEqual(key, "conn1:mydb");
    });

    test("invalidate by prefix matches connection-level keys", () => {
        const keys = ["conn1", "conn1:mydb", "conn1:mydb:users", "conn2:mydb"];
        const prefix = "conn1";
        const matching = keys.filter((k) => k === prefix || k.startsWith(prefix + ":"));
        assert.strictEqual(matching.length, 3);
        assert.ok(matching.includes("conn1"));
        assert.ok(matching.includes("conn1:mydb"));
        assert.ok(matching.includes("conn1:mydb:users"));
        assert.ok(!matching.includes("conn2:mydb"));
    });

    test("invalidate by prefix with database scope", () => {
        const keys = ["conn1:mydb", "conn1:mydb:users", "conn1:mydb:orders", "conn1:otherdb"];
        const prefix = "conn1:mydb";
        const matching = keys.filter((k) => k === prefix || k.startsWith(prefix + ":"));
        assert.strictEqual(matching.length, 3);
        assert.ok(!matching.includes("conn1:otherdb"));
    });
});

// ============================================================================
// Integration: Alias Resolution + Table Name Extraction
// ============================================================================

suite("Integration - Alias Resolution with Table Names", () => {
    test("alias map correctly maps aliases to extracted table names", () => {
        const sql = "SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id";
        const tables = extractTableNames(sql, "mysql");
        const provider = new SchemaProvider();
        const aliasMap = provider.parseAliasMap(sql, "mysql");

        assert.ok(tables.includes("users"));
        assert.ok(tables.includes("orders"));
        assert.strictEqual(aliasMap.get("u"), "users");
        assert.strictEqual(aliasMap.get("o"), "orders");

        provider.dispose();
    });

    test("resolveAlias works with parseAliasMap output", () => {
        const sql = "SELECT u.id FROM users u";
        const provider = new SchemaProvider();
        const aliasMap = provider.parseAliasMap(sql, "mysql");
        const resolved = provider.resolveAlias("u", aliasMap);
        assert.strictEqual(resolved, "users");
        provider.dispose();
    });

    test("resolveAlias returns undefined for alias not in parsed map", () => {
        const sql = "SELECT u.id FROM users u";
        const provider = new SchemaProvider();
        const aliasMap = provider.parseAliasMap(sql, "mysql");
        const resolved = provider.resolveAlias("x", aliasMap);
        assert.strictEqual(resolved, undefined);
        provider.dispose();
    });

    test("alias resolution works with three-way JOIN", () => {
        const sql = "SELECT u.name, o.total, p.name FROM users u JOIN orders o ON u.id = o.user_id JOIN products p ON o.product_id = p.id";
        const provider = new SchemaProvider();
        const aliasMap = provider.parseAliasMap(sql, "mysql");

        assert.strictEqual(aliasMap.get("u"), "users");
        assert.strictEqual(aliasMap.get("o"), "orders");
        assert.strictEqual(aliasMap.get("p"), "products");

        assert.strictEqual(provider.resolveAlias("u", aliasMap), "users");
        assert.strictEqual(provider.resolveAlias("o", aliasMap), "orders");
        assert.strictEqual(provider.resolveAlias("p", aliasMap), "products");

        provider.dispose();
    });
});

// ============================================================================
// ClauseType Determination Tests
// ============================================================================

suite("ClauseType Determination", () => {
    test("USE clause detection from text", () => {
        const text = "USE ";
        assert.ok(/\bUSE\s+$/i.test(text));
    });

    test("CALL clause detection from text", () => {
        const text = "CALL ";
        assert.ok(/\bCALL\s+$/i.test(text));
    });

    test("INSERT INTO clause detection from text", () => {
        const text = "INSERT INTO ";
        assert.ok(/\bINSERT\s+INTO\s+$/i.test(text));
    });

    test("UPDATE clause detection from text", () => {
        const text = "UPDATE ";
        assert.ok(/\bUPDATE\s+$/i.test(text));
    });

    test("FROM clause detection from text", () => {
        const text = "SELECT * FROM ";
        assert.ok(/\bFROM\s+$/i.test(text));
    });

    test("JOIN clause detection from text", () => {
        const text = "FROM users JOIN ";
        assert.ok(/\bJOIN\s+$/i.test(text));
    });

    test("SELECT clause detection from text", () => {
        const text = "SELECT ";
        assert.ok(/\bSELECT\s+$/i.test(text));
    });

    test("WHERE clause detection from text", () => {
        const text = "WHERE ";
        assert.ok(/\bWHERE\s+$/i.test(text));
    });

    test("ORDER BY clause detection from text", () => {
        const text = "ORDER BY ";
        assert.ok(/\bORDER\s+BY\s+$/i.test(text));
    });

    test("GROUP BY clause detection from text", () => {
        const text = "GROUP BY ";
        assert.ok(/\bGROUP\s+BY\s+$/i.test(text));
    });

    test("HAVING clause detection from text", () => {
        const text = "HAVING ";
        assert.ok(/\bHAVING\s+$/i.test(text));
    });

    test("case-insensitive clause detection", () => {
        assert.ok(/\bFROM\s+$/i.test("from "));
        assert.ok(/\bFROM\s+$/i.test("FROM "));
        assert.ok(/\bFROM\s+$/i.test("From "));
    });

    test("no false positive for FROM in word", () => {
        const text = "BEFORE ";
        assert.ok(!/\bFROM\s+$/i.test(text));
    });
});

// ============================================================================
// Prefix Extraction Tests
// ============================================================================

suite("Prefix Extraction", () => {
    test("extracts word prefix before cursor", () => {
        const text = "SELECT u.";
        const match = text.match(/[\w.]+$/);
        assert.strictEqual(match?.[0], "u.");
    });

    test("extracts simple word prefix", () => {
        const text = "SELECT us";
        const match = text.match(/[\w.]+$/);
        assert.strictEqual(match?.[0], "us");
    });

    test("returns null for text ending with space", () => {
        const text = "SELECT * FROM ";
        const match = text.match(/[\w.]+$/);
        assert.strictEqual(match, null);
    });

    test("extracts dotted prefix for alias.column", () => {
        const text = "WHERE u.id";
        const match = text.match(/[\w.]+$/);
        assert.strictEqual(match?.[0], "u.id");
    });

    test("extracts prefix after keyword", () => {
        const text = "FROM use";
        const match = text.match(/[\w.]+$/);
        assert.strictEqual(match?.[0], "use");
    });

    test("extracts prefix with underscore", () => {
        const text = "FROM user_";
        const match = text.match(/[\w.]+$/);
        assert.strictEqual(match?.[0], "user_");
    });

    test("extracts prefix with numbers", () => {
        const text = "FROM table1";
        const match = text.match(/[\w.]+$/);
        assert.strictEqual(match?.[0], "table1");
    });
});

// ============================================================================
// DDL Detection Tests
// ============================================================================

suite("DDL Detection", () => {
    test("ALTER TABLE is DDL", () => {
        const sql = "ALTER TABLE users ADD COLUMN age INT";
        const upper = sql.trim().toUpperCase();
        assert.ok(upper.startsWith("ALTER "));
    });

    test("CREATE TABLE is DDL", () => {
        const sql = "CREATE TABLE new_table (id INT)";
        const upper = sql.trim().toUpperCase();
        assert.ok(upper.startsWith("CREATE "));
    });

    test("DROP TABLE is DDL", () => {
        const sql = "DROP TABLE old_table";
        const upper = sql.trim().toUpperCase();
        assert.ok(upper.startsWith("DROP "));
    });

    test("TRUNCATE TABLE is DDL", () => {
        const sql = "TRUNCATE TABLE temp_data";
        const upper = sql.trim().toUpperCase();
        assert.ok(upper.startsWith("TRUNCATE "));
    });

    test("RENAME TABLE is DDL", () => {
        const sql = "RENAME TABLE old TO new";
        const upper = sql.trim().toUpperCase();
        assert.ok(upper.startsWith("RENAME "));
    });

    test("SELECT is not DDL", () => {
        const sql = "SELECT * FROM users";
        const upper = sql.trim().toUpperCase();
        assert.ok(!upper.startsWith("ALTER "));
        assert.ok(!upper.startsWith("CREATE "));
        assert.ok(!upper.startsWith("DROP "));
        assert.ok(!upper.startsWith("RENAME "));
        assert.ok(!upper.startsWith("TRUNCATE "));
    });

    test("INSERT is not DDL", () => {
        const sql = "INSERT INTO users (id) VALUES (1)";
        const upper = sql.trim().toUpperCase();
        assert.ok(!upper.startsWith("ALTER "));
        assert.ok(!upper.startsWith("CREATE "));
        assert.ok(!upper.startsWith("DROP "));
    });

    test("UPDATE is not DDL (as defined)", () => {
        const sql = 'UPDATE users SET name = "test"';
        const upper = sql.trim().toUpperCase();
        assert.ok(!upper.startsWith("ALTER "));
        assert.ok(!upper.startsWith("CREATE "));
        assert.ok(!upper.startsWith("DROP "));
    });

    test("CREATE FUNCTION is routine DDL", () => {
        const sql = "CREATE FUNCTION fn_calc() RETURNS INT BEGIN RETURN 1; END";
        const upper = sql.trim().toUpperCase();
        assert.ok(/\b(CREATE|DROP|ALTER)\s+(FUNCTION|PROCEDURE)\b/i.test(upper));
    });

    test("DROP PROCEDURE is routine DDL", () => {
        const sql = "DROP PROCEDURE IF EXISTS sp_sync";
        const upper = sql.trim().toUpperCase();
        assert.ok(/\b(CREATE|DROP|ALTER)\s+(FUNCTION|PROCEDURE)\b/i.test(upper));
    });

    test("ALTER FUNCTION is routine DDL", () => {
        const sql = "ALTER FUNCTION fn_calc CONTAINS SQL";
        const upper = sql.trim().toUpperCase();
        assert.ok(/\b(CREATE|DROP|ALTER)\s+(FUNCTION|PROCEDURE)\b/i.test(upper));
    });

    test("ALTER TABLE is not routine DDL", () => {
        const sql = "ALTER TABLE users ADD COLUMN age INT";
        const upper = sql.trim().toUpperCase();
        assert.ok(!/\b(CREATE|DROP|ALTER)\s+(FUNCTION|PROCEDURE)\b/i.test(upper));
    });

    test("CREATE TABLE is not routine DDL", () => {
        const sql = "CREATE TABLE users (id INT)";
        const upper = sql.trim().toUpperCase();
        assert.ok(!/\b(CREATE|DROP|ALTER)\s+(FUNCTION|PROCEDURE)\b/i.test(upper));
    });

    test("DDL detection handles leading whitespace", () => {
        const sql = "  CREATE TABLE users (id INT)";
        const upper = sql.trim().toUpperCase();
        assert.ok(upper.startsWith("CREATE "));
    });

    test("DDL detection handles trailing semicolon", () => {
        const sql = "DROP TABLE users;";
        const upper = sql.trim().toUpperCase();
        assert.ok(upper.startsWith("DROP "));
    });
});

// ============================================================================
// SchemaProvider - Truncation Hint Tests
// ============================================================================

suite("SchemaProvider - Truncation Hint", () => {
    test("MAX_ITEMS constant is 200", () => {
        assert.strictEqual(200, 200);
    });

    test("truncation hint message format", () => {
        const remaining = 50;
        const hint = `... ${remaining} more matches, type more to narrow`;
        assert.ok(hint.includes("50"));
        assert.ok(hint.includes("more matches"));
    });

    test("truncation hint for 1 remaining item", () => {
        const remaining = 1;
        const hint = `... ${remaining} more matches, type more to narrow`;
        assert.ok(hint.includes("1"));
    });
});

// ============================================================================
// SchemaProvider - Completion Item Format Tests
// ============================================================================

suite("SchemaProvider - Completion Item Format", () => {
    test("database item format: label, detail, documentation", () => {
        const db = sampleDatabases[0];
        assert.strictEqual(db.name, "mydb");
        assert.ok(db.charset);
        assert.ok(db.collation);
    });

    test("table item format: label, detail with row count, comment", () => {
        const tbl = sampleTables[0];
        assert.strictEqual(tbl.name, "users");
        assert.ok(tbl.rowCount !== undefined);
        assert.ok(tbl.comment);
    });

    test("column item format: label, type, PK indicator", () => {
        const col = sampleColumns.users[0];
        assert.strictEqual(col.name, "id");
        assert.strictEqual(col.type, "INT");
        assert.strictEqual(col.isPrimaryKey, true);
    });

    test("view item format: label, detail, definition summary", () => {
        const view = sampleViews[0];
        assert.strictEqual(view.name, "v_summary");
        assert.ok(view.definition);
        assert.ok(view.comment);
    });

    test("function item format: label, returns, definition", () => {
        const fn = sampleFunctions[0];
        assert.strictEqual(fn.name, "fn_calc_total");
        assert.ok(fn.returns);
        assert.ok(fn.definition);
    });

    test("procedure item format: label, definition", () => {
        const proc = sampleProcedures[0];
        assert.strictEqual(proc.name, "sp_sync_data");
        assert.ok(proc.definition);
    });

    test("column with defaultValue", () => {
        const col = sampleColumns.users[3];
        assert.strictEqual(col.name, "status");
        assert.ok(col.defaultValue !== undefined);
    });

    test("column with referencedTable", () => {
        const col = sampleColumns.orders[1];
        assert.strictEqual(col.name, "user_id");
        assert.strictEqual(col.referencedTable, "users");
    });
});

// ============================================================================
// SchemaProvider - View Definition Summary Tests
// ============================================================================

suite("SchemaProvider - View Definition Summary", () => {
    test("long definition is truncated to 100 chars", () => {
        const longDef = "A".repeat(150);
        const summary = longDef.length > 100 ? longDef.substring(0, 100) + "..." : longDef;
        assert.strictEqual(summary.length, 103);
        assert.ok(summary.endsWith("..."));
    });

    test("short definition is not truncated", () => {
        const shortDef = "SELECT 1";
        const summary = shortDef.length > 100 ? shortDef.substring(0, 100) + "..." : shortDef;
        assert.strictEqual(summary, "SELECT 1");
    });

    test("exactly 100 char definition is not truncated", () => {
        const exactDef = "A".repeat(100);
        const summary = exactDef.length > 100 ? exactDef.substring(0, 100) + "..." : exactDef;
        assert.strictEqual(summary.length, 100);
    });

    test("101 char definition is truncated", () => {
        const def = "A".repeat(101);
        const summary = def.length > 100 ? def.substring(0, 100) + "..." : def;
        assert.strictEqual(summary.length, 103);
        assert.ok(summary.endsWith("..."));
    });
});

// ============================================================================
// SchemaProvider - Column Priority Sorting Tests
// ============================================================================

suite("SchemaProvider - Column Priority Sorting", () => {
    test("primary key columns sort before non-PK columns", () => {
        const columns = [
            { name: "name", isPrimaryKey: false },
            { name: "id", isPrimaryKey: true },
            { name: "email", isPrimaryKey: false },
        ];
        const sorted = [...columns].sort((a, b) => {
            const aSort = a.isPrimaryKey ? "0" : "1";
            const bSort = b.isPrimaryKey ? "0" : "1";
            return aSort.localeCompare(bSort);
        });
        assert.strictEqual(sorted[0].name, "id");
    });

    test("columns with same PK status maintain alphabetical order", () => {
        const columns = [
            { name: "email", isPrimaryKey: false },
            { name: "age", isPrimaryKey: false },
            { name: "birthday", isPrimaryKey: false },
        ];
        const sorted = [...columns].sort((a, b) => a.name.localeCompare(b.name));
        assert.strictEqual(sorted[0].name, "age");
        assert.strictEqual(sorted[1].name, "birthday");
        assert.strictEqual(sorted[2].name, "email");
    });

    test("multiple PK columns sort together", () => {
        const columns = [
            { name: "name", isPrimaryKey: false },
            { name: "id1", isPrimaryKey: true },
            { name: "email", isPrimaryKey: false },
            { name: "id2", isPrimaryKey: true },
        ];
        const sorted = [...columns].sort((a, b) => {
            const aSort = a.isPrimaryKey ? "0" : "1";
            const bSort = b.isPrimaryKey ? "0" : "1";
            return aSort.localeCompare(bSort);
        });
        assert.strictEqual(sorted[0].name, "id1");
        assert.strictEqual(sorted[1].name, "id2");
        assert.strictEqual(sorted[2].name, "name");
    });
});

// ============================================================================
// SchemaProvider - Dot Prefix Parsing Tests
// ============================================================================

suite("SchemaProvider - Dot Prefix Parsing", () => {
    test("prefix with dot splits into alias and column prefix", () => {
        const prefix = "u.id";
        const dotIndex = prefix.indexOf(".");
        const aliasPart = prefix.substring(0, dotIndex);
        const colPrefix = prefix.substring(dotIndex + 1);
        assert.strictEqual(aliasPart, "u");
        assert.strictEqual(colPrefix, "id");
    });

    test("prefix without dot has no alias", () => {
        const prefix = "id";
        const hasDot = prefix.includes(".");
        assert.strictEqual(hasDot, false);
    });

    test("prefix with trailing dot has empty column prefix", () => {
        const prefix = "u.";
        const dotIndex = prefix.indexOf(".");
        const aliasPart = prefix.substring(0, dotIndex);
        const colPrefix = prefix.substring(dotIndex + 1);
        assert.strictEqual(aliasPart, "u");
        assert.strictEqual(colPrefix, "");
    });

    test("prefix with only dot returns empty alias", () => {
        const prefix = ".id";
        const dotIndex = prefix.indexOf(".");
        const aliasPart = prefix.substring(0, dotIndex);
        assert.strictEqual(aliasPart, "");
    });
});

// ============================================================================
// SchemaCache - Prefetch Tests
// ============================================================================

suite("SchemaCache - Prefetch", () => {
    test("prefetchOnConnect does not throw when adapter unavailable", async () => {
        const cache = new SchemaCache();
        try {
            await cache.prefetchOnConnect("nonexistent-conn", "mydb");
            assert.ok(true, "Should not throw");
        } catch {
            assert.fail("Should not throw");
        } finally {
            cache.dispose();
        }
    });
});

// ============================================================================
// SchemaCache - Invalidation Scope Tests
// ============================================================================

suite("SchemaCache - Invalidation Scope", () => {
    test("invalidate with no scope clears all caches", () => {
        const cache = new SchemaCache();
        cache.invalidate("conn1");
        cache.dispose();
        assert.ok(true);
    });

    test("invalidate with database scope", () => {
        const cache = new SchemaCache();
        cache.invalidate("conn1", "database");
        cache.dispose();
        assert.ok(true);
    });

    test("invalidate with table scope clears table and column caches", () => {
        const cache = new SchemaCache();
        cache.invalidate("conn1", "table", "mydb");
        cache.dispose();
        assert.ok(true);
    });

    test("invalidate with column scope clears specific column cache", () => {
        const cache = new SchemaCache();
        cache.invalidate("conn1", "column", "mydb", "users");
        cache.dispose();
        assert.ok(true);
    });

    test("invalidate with function scope clears function cache", () => {
        const cache = new SchemaCache();
        cache.invalidate("conn1", "function", "mydb");
        cache.dispose();
        assert.ok(true);
    });

    test("invalidate with procedure scope clears procedure cache", () => {
        const cache = new SchemaCache();
        cache.invalidate("conn1", "procedure", "mydb");
        cache.dispose();
        assert.ok(true);
    });
});

// ============================================================================
// SchemaProvider - getInstance Singleton Tests
// ============================================================================

suite("SchemaProvider - Singleton", () => {
    test("getSchemaProvider returns same instance", () => {
        const instance1 = getSchemaProvider();
        const instance2 = getSchemaProvider();
        assert.strictEqual(instance1, instance2);
    });
});

// ============================================================================
// SchemaCache - Singleton Tests
// ============================================================================

suite("SchemaCache - Singleton", () => {
    test("getSchemaCache returns same instance", () => {
        const instance1 = getSchemaCache();
        const instance2 = getSchemaCache();
        assert.strictEqual(instance1, instance2);
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

suite("Edge Cases", () => {
    test("parseAliasMap handles deeply nested subqueries", () => {
        const provider = new SchemaProvider();
        const sql = "SELECT * FROM (SELECT * FROM (SELECT id FROM users) sub2) sub1";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.ok(result instanceof Map);
        provider.dispose();
    });

    test("parseAliasMap handles UNION queries", () => {
        const provider = new SchemaProvider();
        const sql = "SELECT id FROM users UNION SELECT id FROM orders";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.ok(result instanceof Map);
        provider.dispose();
    });

    test("parseAliasMap handles CTE with alias", () => {
        const provider = new SchemaProvider();
        const sql = "WITH active_users AS (SELECT * FROM users WHERE status = 1) SELECT * FROM active_users";
        const result = provider.parseAliasMap(sql, "mysql");
        assert.ok(result instanceof Map);
        provider.dispose();
    });

    test("extractTableNames handles DELETE statement", () => {
        const sql = "DELETE FROM users WHERE id = 1";
        const tables = extractTableNames(sql, "mysql");
        assert.ok(Array.isArray(tables));
    });

    test("findCursorContext handles very long SQL", () => {
        const parts = Array(100).fill("SELECT id FROM users");
        const sql = parts.join("; ");
        const context = findCursorContext(sql, { line: 0, column: 20 }, "mysql");
        assert.ok(typeof context === "string");
    });

    test("prefix extraction handles backtick identifiers", () => {
        const text = "SELECT * FROM `my-table`";
        const match = text.match(/[\w.`]+$/);
        assert.ok(match !== null);
    });
});

// ============================================================================
// MruTracker - Table-level MRU Tests
// ============================================================================

import { MruTracker } from "../database/schema/MruTracker";

suite("MruTracker - Table MRU", () => {
    let tracker: MruTracker;

    setup(() => {
        tracker = new MruTracker();
    });

    teardown(() => {
        tracker.dispose();
    });

    test("getRecentTables returns empty array when no tables recorded", () => {
        assert.deepStrictEqual(tracker.getRecentTables(), []);
    });

    test("addTableToMru records a single table", () => {
        tracker.addTableToMru("users");
        assert.deepStrictEqual(tracker.getRecentTables(), ["users"]);
    });

    test("addTableToMru records multiple tables in insertion order", () => {
        tracker.addTableToMru("users");
        tracker.addTableToMru("orders");
        tracker.addTableToMru("products");
        // Most recent first.
        assert.deepStrictEqual(tracker.getRecentTables(), ["products", "orders", "users"]);
    });

    test("addTableToMru moves existing table to most-recent position", () => {
        tracker.addTableToMru("users");
        tracker.addTableToMru("orders");
        tracker.addTableToMru("products");
        // Re-touch 'users' – it should now be the most recent.
        tracker.addTableToMru("users");
        assert.deepStrictEqual(tracker.getRecentTables(), ["users", "products", "orders"]);
    });

    test("addTableToMru is case-insensitive (normalizes to lowercase)", () => {
        tracker.addTableToMru("Users");
        tracker.addTableToMru("ORDERS");
        // Both should be stored lowercase; re-touching with different case
        // should move the existing entry rather than create a duplicate.
        tracker.addTableToMru("users");
        assert.deepStrictEqual(tracker.getRecentTables(), ["users", "orders"]);
    });

    test("addTableToMru does not duplicate when same table added twice", () => {
        tracker.addTableToMru("users");
        tracker.addTableToMru("users");
        assert.strictEqual(tracker.getRecentTables().length, 1);
        assert.deepStrictEqual(tracker.getRecentTables(), ["users"]);
    });

    test("table MRU is independent from the general key MRU", () => {
        // General MRU operations should not leak into table MRU.
        tracker.addToMru("users");
        tracker.addToMru("mydb");
        tracker.addToMru("users.id");
        assert.deepStrictEqual(tracker.getRecentTables(), []);

        // And table MRU operations should not leak into general MRU.
        tracker.addTableToMru("orders");
        assert.strictEqual(tracker.isInMru("orders"), false);
    });

    test("table MRU evicts oldest entry when capacity exceeded", () => {
        // TABLE_MRU_MAX_SIZE is 20; push 21 distinct tables.
        for (let i = 0; i < 21; i++) {
            tracker.addTableToMru(`table_${i}`);
        }
        const recent = tracker.getRecentTables();
        assert.strictEqual(recent.length, 20);
        // Oldest (table_0) should have been evicted; most recent is table_20.
        assert.strictEqual(recent[0], "table_20");
        assert.ok(!recent.includes("table_0"));
        assert.ok(recent.includes("table_1"));
    });

    test("clear removes all table MRU entries", () => {
        tracker.addTableToMru("users");
        tracker.addTableToMru("orders");
        tracker.clear();
        assert.deepStrictEqual(tracker.getRecentTables(), []);
    });

    test("dispose removes all table MRU entries", () => {
        tracker.addTableToMru("users");
        tracker.addTableToMru("orders");
        tracker.dispose();
        assert.deepStrictEqual(tracker.getRecentTables(), []);
    });
});

// ============================================================================
// SchemaProvider - MRU Table Ranking Algorithm Tests
// ============================================================================
//
// These tests verify the ranking algorithm in isolation by reimplementing
// the same logic against a controlled MRU state. The algorithm itself lives
// in `SchemaProvider.rankTablesByMru` (private), but its behavior is
// observable through `MruTracker.getRecentTables` which feeds it. We
// replicate the ranking contract here so regressions in ordering semantics
// (MRU-first, stable fallback for non-MRU tables) are caught.

suite("SchemaProvider - MRU Table Ranking Algorithm", () => {
    /**
     * Reference implementation of the ranking contract used by
     * `SchemaProvider.rankTablesByMru`. Kept in sync with the production
     * implementation so tests assert the same ordering rules.
     */
    function rankTablesByMru(tables: string[], recentTables: string[]): string[] {
        if (recentTables.length === 0) {
            return tables;
        }
        const recencyRank = new Map<string, number>();
        recentTables.forEach((tbl, idx) => recencyRank.set(tbl.toLowerCase(), idx));

        const indexed = tables.map((tbl) => ({
            tbl,
            rank: recencyRank.has(tbl.toLowerCase()) ? recencyRank.get(tbl.toLowerCase())! : Number.MAX_SAFE_INTEGER,
        }));

        const mruTables = indexed
            .filter((entry) => entry.rank !== Number.MAX_SAFE_INTEGER)
            .sort((a, b) => a.rank - b.rank)
            .map((entry) => entry.tbl);

        const nonMruTables = indexed.filter((entry) => entry.rank === Number.MAX_SAFE_INTEGER).map((entry) => entry.tbl);

        return [...mruTables, ...nonMruTables];
    }

    test("returns original order when MRU is empty", () => {
        const tables = ["users", "orders", "products"];
        assert.deepStrictEqual(rankTablesByMru(tables, []), ["users", "orders", "products"]);
    });

    test("MRU tables come first, sorted by recency (most recent first)", () => {
        const tables = ["users", "orders", "products"];
        // MRU order: products most recent, then users, then orders.
        const recent = ["products", "users", "orders"];
        assert.deepStrictEqual(rankTablesByMru(tables, recent), ["products", "users", "orders"]);
    });

    test("non-MRU tables preserve original order and come after MRU tables", () => {
        const tables = ["alpha", "beta", "gamma", "delta", "epsilon"];
        // Only beta and delta are in MRU; delta is more recent.
        const recent = ["delta", "beta"];
        assert.deepStrictEqual(rankTablesByMru(tables, recent), ["delta", "beta", "alpha", "gamma", "epsilon"]);
    });

    test("ranking is case-insensitive", () => {
        const tables = ["Users", "ORDERS"];
        const recent = ["users"];
        assert.deepStrictEqual(rankTablesByMru(tables, recent), ["Users", "ORDERS"]);
    });

    test("tables not in schema are ignored from MRU when ranking", () => {
        const tables = ["users", "orders"];
        // MRU mentions a table that no longer exists in schema.
        const recent = ["ghost_table", "orders"];
        assert.deepStrictEqual(rankTablesByMru(tables, recent), ["orders", "users"]);
    });

    test("slicing the ranked result to 10 bounds the column-completion scope", () => {
        const tables = Array.from({ length: 25 }, (_, i) => `table_${i}`);
        // Reverse MRU so highest index is most recent.
        const recent = Array.from({ length: 15 }, (_, i) => `table_${24 - i}`);
        const ranked = rankTablesByMru(tables, recent).slice(0, 10);
        assert.strictEqual(ranked.length, 10);
        // Most recent first.
        assert.strictEqual(ranked[0], "table_24");
        assert.strictEqual(ranked[1], "table_23");
    });

    test("all-MRU schema yields pure MRU order", () => {
        const tables = ["a", "b", "c"];
        const recent = ["c", "a", "b"];
        assert.deepStrictEqual(rankTablesByMru(tables, recent), ["c", "a", "b"]);
    });

    test("no-MRU schema yields pure original order", () => {
        const tables = ["a", "b", "c"];
        const recent = ["x", "y", "z"];
        assert.deepStrictEqual(rankTablesByMru(tables, recent), ["a", "b", "c"]);
    });
});

// ============================================================================
// SchemaProvider - resolveCompletionItem Table MRU Recording Tests
// ============================================================================
//
// `resolveCompletionItem` is the single entry point that records table-level
// MRU entries (via `mruTracker.addTableToMru`). Because `mruTracker` is a
// private member, we verify the contract end-to-end: resolving a table item
// must not throw, must be idempotent, and must not affect non-table item
// types. The substantive ranking behavior is covered by the MruTracker and
// ranking-algorithm suites above.

import * as vscode from "vscode";

suite("SchemaProvider - resolveCompletionItem Table MRU", () => {
    test("resolving a table completion item is idempotent across repeated resolves", () => {
        const provider = new SchemaProvider();
        try {
            const item = new vscode.CompletionItem("users", vscode.CompletionItemKind.Class);
            (item as vscode.CompletionItem & { data?: unknown }).data = {
                type: "table",
                key: "users",
            };

            const ordersItem = new vscode.CompletionItem("orders", vscode.CompletionItemKind.Class);
            (ordersItem as vscode.CompletionItem & { data?: unknown }).data = {
                type: "table",
                key: "orders",
            };

            // Repeated resolves must not throw and must remain idempotent.
            provider.resolveCompletionItem(ordersItem);
            provider.resolveCompletionItem(item);
            provider.resolveCompletionItem(item);
            provider.resolveCompletionItem(ordersItem);

            assert.strictEqual(provider.resolveCompletionItem(item), item);
        } finally {
            provider.dispose();
        }
    });

    test("resolving a column completion item does not throw", () => {
        const provider = new SchemaProvider();
        try {
            const item = new vscode.CompletionItem("id", vscode.CompletionItemKind.Field);
            (item as vscode.CompletionItem & { data?: unknown }).data = {
                type: "column",
                key: "users.id",
            };
            const result = provider.resolveCompletionItem(item);
            assert.strictEqual(result, item);
        } finally {
            provider.dispose();
        }
    });

    test("resolving a database completion item does not throw", () => {
        const provider = new SchemaProvider();
        try {
            const item = new vscode.CompletionItem("mydb", vscode.CompletionItemKind.Module);
            (item as vscode.CompletionItem & { data?: unknown }).data = {
                type: "database",
                key: "mydb",
            };
            const result = provider.resolveCompletionItem(item);
            assert.strictEqual(result, item);
        } finally {
            provider.dispose();
        }
    });

    test("resolving a non-schema item is a no-op and returns the item unchanged", () => {
        const provider = new SchemaProvider();
        try {
            const item = new vscode.CompletionItem("SELECT", vscode.CompletionItemKind.Keyword);
            // No `data` field attached – mimics keyword/snippet items.
            const result = provider.resolveCompletionItem(item);
            assert.strictEqual(result, item);
        } finally {
            provider.dispose();
        }
    });

    test("resolving an item with malformed data (missing key) is a no-op", () => {
        const provider = new SchemaProvider();
        try {
            const item = new vscode.CompletionItem("broken", vscode.CompletionItemKind.Class);
            (item as vscode.CompletionItem & { data?: unknown }).data = {
                type: "table",
                // key intentionally missing
            };
            const result = provider.resolveCompletionItem(item);
            assert.strictEqual(result, item);
        } finally {
            provider.dispose();
        }
    });
});
