import * as assert from "assert";
import { ParseError } from "../parser/ParseError";

suite("ParseError Tests", () => {
    test("从 node-sql-parser 错误提取位置", () => {
        const cause = new Error('Expected "FROM" but "FORM" found. at position 25');
        const err = new ParseError("mysql", "SELECT a FORM t", cause);
        assert.strictEqual(err.position?.line, 1);
        assert.strictEqual(err.position?.column, 26);
    });

    test("位置为 undefined 时无崩溃", () => {
        const cause = new Error("Some error without position");
        const err = new ParseError("mysql", "SELECT 1", cause);
        assert.strictEqual(err.position, undefined);
    });

    test("FlinkSQL 方言提示存在", () => {
        const cause = new Error('Expected "," but "WATERMARK" found');
        const err = new ParseError("flinksql", "CREATE TABLE t (id INT, WATERMARK FOR ts AS ts)", cause);
        assert.ok(err.dialectHint !== undefined);
        assert.ok(err.dialectHint!.length > 0);
    });

    test("SparkSQL 方言提示存在", () => {
        const cause = new Error('Expected "BY" but "BUCKET" found');
        const err = new ParseError("spark", "SELECT a FROM t SORT BY a", cause);
        assert.ok(err.dialectHint !== undefined);
    });

    test("通用方言无特定提示", () => {
        const cause = new Error("syntax error");
        const err = new ParseError("sql", "SELECT 1", cause);
        assert.strictEqual(err.dialectHint, undefined);
    });

    test("错误消息包含 SQL 与方言信息", () => {
        const cause = new Error("parse failed");
        const err = new ParseError("hive", "SELECT 1", cause);
        assert.ok(err.message.includes("hive"));
    });
});
