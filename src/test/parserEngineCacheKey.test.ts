import * as assert from "assert";
import { SqlParserEngine } from "../parser/SqlParserEngine";

suite("Parser Engine Cache Key Tests", () => {
    test("相同 SQL 二次 astify 命中缓存（无重新解析）", () => {
        const engine = new SqlParserEngine();
        const sql = "SELECT id, name FROM users WHERE age > 18";
        const r1 = engine.tryAstify(sql, "mysql");
        const r2 = engine.tryAstify(sql, "mysql");
        assert.ok(r1.success && r2.success);
        // 缓存命中：两次返回的 AST 引用相同（同一对象）
        const ast1 = Array.isArray(r1.ast) ? r1.ast[0] : r1.ast;
        const ast2 = Array.isArray(r2.ast) ? r2.ast[0] : r2.ast;
        assert.strictEqual(ast1, ast2);
    });

    test("中间修改的 SQL 不命中缓存（关键回归）", () => {
        const engine = new SqlParserEngine();
        // SQL > 64 字符，编辑点在 [32, len-32) 中间盲区。
        // 旧方案 head32+tail32 不覆盖此区域，会碰撞；SHA-256 不会。
        // sql1/sql2 长 83 字符，"table2"→"xable2" 的编辑点位于 index 34（盲区 [32, 51)）。
        const sql1 = 'SELECT a, b, c, d, e FROM table1, table2 WHERE id = 1 AND name = "test" ORDER BY id';
        const sql2 = 'SELECT a, b, c, d, e FROM table1, xable2 WHERE id = 1 AND name = "test" ORDER BY id';
        const r1 = engine.tryAstify(sql1, "mysql");
        const r2 = engine.tryAstify(sql2, "mysql");
        assert.ok(r1.success && r2.success);
        const ast1 = Array.isArray(r1.ast) ? r1.ast[0] : r1.ast;
        const ast2 = Array.isArray(r2.ast) ? r2.ast[0] : r2.ast;
        assert.notStrictEqual(ast1, ast2);
    });

    test("尾部修改的 SQL 不命中缓存", () => {
        const engine = new SqlParserEngine();
        const sql1 = "SELECT * FROM t LIMIT 10";
        const sql2 = "SELECT * FROM t LIMIT 100";
        const r1 = engine.tryAstify(sql1, "mysql");
        const r2 = engine.tryAstify(sql2, "mysql");
        assert.ok(r1.success && r2.success);
        const ast1 = Array.isArray(r1.ast) ? r1.ast[0] : r1.ast;
        const ast2 = Array.isArray(r2.ast) ? r2.ast[0] : r2.ast;
        assert.notStrictEqual(ast1, ast2);
    });

    test("不同方言相同 SQL 不共享缓存", () => {
        const engine = new SqlParserEngine();
        const sql = "SELECT id FROM t";
        const r1 = engine.tryAstify(sql, "mysql");
        const r2 = engine.tryAstify(sql, "postgresql");
        assert.ok(r1.success && r2.success);
        const ast1 = Array.isArray(r1.ast) ? r1.ast[0] : r1.ast;
        const ast2 = Array.isArray(r2.ast) ? r2.ast[0] : r2.ast;
        assert.notStrictEqual(ast1, ast2);
    });

    test("clearCache 后再次 astify 重新解析", () => {
        const engine = new SqlParserEngine();
        const sql = "SELECT id FROM t";
        const r1 = engine.tryAstify(sql, "mysql");
        engine.clearCache();
        const r2 = engine.tryAstify(sql, "mysql");
        assert.ok(r1.success && r2.success);
        const ast1 = Array.isArray(r1.ast) ? r1.ast[0] : r1.ast;
        const ast2 = Array.isArray(r2.ast) ? r2.ast[0] : r2.ast;
        assert.notStrictEqual(ast1, ast2);
    });
});
