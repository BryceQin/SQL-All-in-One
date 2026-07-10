import * as assert from "assert";
import { parseMultiStatement } from "../parser/MultiStatementParser";

suite("Multi-Statement Parser Tests", () => {
    test("单条合法语句返回成功结果", () => {
        const results = parseMultiStatement("SELECT 1", "mysql");
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].success);
        assert.ok(results[0].ast !== null);
    });

    test("多条合法语句全部成功", () => {
        const sql = "SELECT 1; SELECT 2; SELECT 3";
        const results = parseMultiStatement(sql, "mysql");
        assert.strictEqual(results.length, 3);
        assert.ok(results.every((r) => r.success));
    });

    test("中间语句失败不影响前后语句", () => {
        const sql = "SELECT 1; SELECT FROM; SELECT 3";
        const results = parseMultiStatement(sql, "mysql");
        assert.strictEqual(results.length, 3);
        assert.ok(results[0].success, "first statement should succeed");
        assert.ok(!results[1].success, "second statement should fail");
        assert.ok(results[2].success, "third statement should succeed");
    });

    test("失败语句携带错误信息", () => {
        const sql = "SELECT FROM";
        const results = parseMultiStatement(sql, "mysql");
        assert.strictEqual(results.length, 1);
        assert.ok(!results[0].success);
        assert.ok(results[0].error !== null);
        assert.ok(results[0].error!.message.includes("mysql"));
    });

    test("字符串内分号不切分语句", () => {
        const sql = "SELECT 'a;b'; SELECT 2";
        const results = parseMultiStatement(sql, "mysql");
        assert.strictEqual(results.length, 2);
        assert.ok(results[0].success);
        assert.ok(results[1].success);
    });

    test("注释内分号不切分语句", () => {
        const sql = "SELECT 1; -- this; is comment\nSELECT 2";
        const results = parseMultiStatement(sql, "mysql");
        assert.strictEqual(results.length, 2);
        assert.ok(results[0].success);
        assert.ok(results[1].success);
    });

    test("空语句被跳过", () => {
        const sql = "SELECT 1; ; ; SELECT 2";
        const results = parseMultiStatement(sql, "mysql");
        assert.strictEqual(results.length, 2);
    });

    test("每条结果包含语句文本与范围", () => {
        const sql = "SELECT 1; SELECT 2";
        const results = parseMultiStatement(sql, "mysql");
        assert.strictEqual(results[0].text, "SELECT 1;");
        assert.strictEqual(results[1].text, " SELECT 2");
        assert.ok(results[0].startOffset === 0);
        assert.ok(results[0].endOffset > 0);
    });

    test("FlinkSQL 方言多语句", () => {
        const sql = "SELECT 1; SELECT 2 FROM t";
        const results = parseMultiStatement(sql, "flinksql");
        assert.strictEqual(results.length, 2);
        assert.ok(results[0].success);
    });

    test("SparkSQL 方言多语句", () => {
        const sql = "SELECT 1; SELECT 2 FROM t";
        const results = parseMultiStatement(sql, "spark");
        assert.strictEqual(results.length, 2);
        assert.ok(results[0].success);
    });
});
