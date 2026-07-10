import * as assert from "assert";
import { FunctionTransformer } from "../../converter/nodeTransformers/FunctionTransformer";
import { TypeTransformer } from "../../converter/nodeTransformers/TypeTransformer";
import { ColumnAttrTransformer } from "../../converter/nodeTransformers/ColumnAttrTransformer";
import { TableOptionTransformer } from "../../converter/nodeTransformers/TableOptionTransformer";
import { ClauseTransformer } from "../../converter/nodeTransformers/ClauseTransformer";
import type { TransformContext } from "../../converter/AstTransformEngine";

function makeCtx(from: "mysql" | "hive", to: "mysql" | "hive"): TransformContext {
    return { from, to, warnings: [] };
}

suite("Node Transformers Test Suite", () => {
    // ========================================================================
    // FunctionTransformer
    // ========================================================================

    suite("FunctionTransformer", () => {
        const transformer = new FunctionTransformer();

        test("matches function nodes", () => {
            const node = { type: "function", name: { name: [{ type: "default", value: "NOW" }] }, args: { type: "expr_list", value: [] } };
            assert.strictEqual(transformer.matches(node as never), true);
        });

        test("does not match non-function nodes", () => {
            const node = { type: "column_ref" };
            assert.strictEqual(transformer.matches(node as never), false);
        });

        test("converts NOW() to CURRENT_TIMESTAMP (mysql to hive)", () => {
            const node = {
                type: "function",
                name: { name: [{ type: "default", value: "NOW" }] },
                args: { type: "expr_list", value: [] },
                over: null,
            };
            transformer.transform(node as never, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual((node.name as { name: { value: string }[] }).name[0].value, "CURRENT_TIMESTAMP");
        });

        test("converts IFNULL to COALESCE (mysql to hive)", () => {
            const node = {
                type: "function",
                name: { name: [{ type: "default", value: "IFNULL" }] },
                args: { type: "expr_list", value: [] },
                over: null,
            };
            transformer.transform(node as never, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual((node.name as { name: { value: string }[] }).name[0].value, "COALESCE");
        });

        test("converts IF(cond, a, b) to CASE WHEN (mysql to hive)", () => {
            const cond = { type: "column_ref", table: null, column: "x" };
            const a = { type: "single_quote_string", value: "a" };
            const b = { type: "single_quote_string", value: "b" };
            const node: Record<string, unknown> = {
                type: "function",
                name: { name: [{ type: "default", value: "IF" }] },
                args: { type: "expr_list", value: [cond, a, b] },
                over: null,
            };
            transformer.transform(node, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual(node.type, "case");
            assert.ok(Array.isArray(node.args));
            const args = node.args as { type: string }[];
            assert.strictEqual(args[0].type, "when");
            assert.strictEqual(args[1].type, "else");
        });

        test("converts CURRENT_TIMESTAMP to NOW (hive to mysql)", () => {
            const node = {
                type: "function",
                name: { name: [{ type: "default", value: "CURRENT_TIMESTAMP" }] },
                args: { type: "expr_list", value: [] },
                over: null,
            };
            transformer.transform(node as never, null, null, makeCtx("hive", "mysql"));
            assert.strictEqual((node.name as { name: { value: string }[] }).name[0].value, "NOW");
        });

        test("does not transform when from === to", () => {
            const node = {
                type: "function",
                name: { name: [{ type: "default", value: "NOW" }] },
                args: { type: "expr_list", value: [] },
                over: null,
            };
            transformer.transform(node as never, null, null, makeCtx("mysql", "mysql"));
            assert.strictEqual((node.name as { name: { value: string }[] }).name[0].value, "NOW");
        });
    });

    // ========================================================================
    // TypeTransformer
    // ========================================================================

    suite("TypeTransformer", () => {
        const transformer = new TypeTransformer();

        test("matches nodes with dataType field", () => {
            const node = { dataType: "VARCHAR", length: 255, parentheses: true };
            assert.strictEqual(transformer.matches(node as never), true);
        });

        test("does not match nodes without dataType", () => {
            const node = { type: "column_ref" };
            assert.strictEqual(transformer.matches(node as never), false);
        });

        test("converts VARCHAR to STRING (mysql to hive)", () => {
            const node: Record<string, unknown> = { dataType: "VARCHAR", length: 255, parentheses: true };
            transformer.transform(node, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual(node.dataType, "STRING");
            assert.strictEqual(node.length, undefined);
            assert.strictEqual(node.parentheses, undefined);
        });

        test("converts DATETIME to TIMESTAMP (mysql to hive)", () => {
            const node: Record<string, unknown> = { dataType: "DATETIME" };
            transformer.transform(node, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual(node.dataType, "TIMESTAMP");
        });

        test("converts STRING to VARCHAR(255) (hive to mysql)", () => {
            const node: Record<string, unknown> = { dataType: "STRING" };
            transformer.transform(node, null, null, makeCtx("hive", "mysql"));
            assert.strictEqual(node.dataType, "VARCHAR");
            assert.strictEqual(node.length, 255);
            assert.strictEqual(node.parentheses, true);
        });

        test("converts TIMESTAMP to DATETIME (hive to mysql)", () => {
            const node: Record<string, unknown> = { dataType: "TIMESTAMP" };
            transformer.transform(node, null, null, makeCtx("hive", "mysql"));
            assert.strictEqual(node.dataType, "DATETIME");
        });

        test("maps complex type ARRAY to JSON with warning (hive to mysql)", () => {
            const node: Record<string, unknown> = { dataType: "ARRAY" };
            const ctx = makeCtx("hive", "mysql");
            transformer.transform(node, null, null, ctx);
            assert.strictEqual(node.dataType, "JSON");
            assert.ok(ctx.warnings.length > 0, "Should produce a warning for complex type");
            assert.ok(ctx.warnings[0].includes("ARRAY"));
        });

        test("maps complex type MAP to JSON with warning (hive to mysql)", () => {
            const node: Record<string, unknown> = { dataType: "MAP" };
            const ctx = makeCtx("hive", "mysql");
            transformer.transform(node, null, null, ctx);
            assert.strictEqual(node.dataType, "JSON");
            assert.ok(ctx.warnings.length > 0);
        });

        test("does not transform unmapped types", () => {
            const node: Record<string, unknown> = { dataType: "UNKNOWN_TYPE" };
            transformer.transform(node, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual(node.dataType, "UNKNOWN_TYPE");
        });
    });

    // ========================================================================
    // ColumnAttrTransformer
    // ========================================================================

    suite("ColumnAttrTransformer", () => {
        const transformer = new ColumnAttrTransformer();

        test("matches column definition nodes", () => {
            const node = { resource: "column", column: {}, definition: {} };
            assert.strictEqual(transformer.matches(node as never), true);
        });

        test("does not match non-column nodes", () => {
            const node = { resource: "index" };
            assert.strictEqual(transformer.matches(node as never), false);
        });

        test("strips AUTO_INCREMENT when converting to hive", () => {
            const node = { resource: "column", auto_increment: "auto_increment", definition: { dataType: "INT" } };
            transformer.transform(node as never, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual(node.auto_increment, undefined);
        });

        test("strips NOT NULL when converting to hive", () => {
            const node = { resource: "column", nullable: { type: "not null", value: "not null" }, definition: { dataType: "INT" } };
            transformer.transform(node as never, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual(node.nullable, undefined);
        });

        test("strips UNSIGNED suffix when converting to hive", () => {
            const node = { resource: "column", definition: { dataType: "INT", suffix: ["UNSIGNED"] } };
            transformer.transform(node as never, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual((node.definition as { suffix?: unknown }).suffix, undefined);
        });

        test("strips COLLATE when converting to hive", () => {
            const node = { resource: "column", collate: "utf8_general_ci", definition: { dataType: "VARCHAR" } };
            transformer.transform(node as never, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual(node.collate, undefined);
        });

        test("strips DEFAULT NULL when converting to hive", () => {
            const node = { resource: "column", default_val: { value: null }, definition: { dataType: "INT" } };
            transformer.transform(node as never, null, null, makeCtx("mysql", "hive"));
            assert.strictEqual(node.default_val, undefined);
        });

        test("does not strip attributes when converting to mysql", () => {
            const node = { resource: "column", auto_increment: "auto_increment", definition: { dataType: "INT" } };
            transformer.transform(node as never, null, null, makeCtx("hive", "mysql"));
            assert.strictEqual(node.auto_increment, "auto_increment");
        });
    });

    // ========================================================================
    // TableOptionTransformer
    // ========================================================================

    suite("TableOptionTransformer", () => {
        const transformer = new TableOptionTransformer();

        test("matches table_options key with array parent", () => {
            const parent = { table_options: [{ keyword: "engine", value: "INNODB" }] };
            const node = parent.table_options[0];
            assert.strictEqual(transformer.matches(node as never, parent as never, "table_options"), true);
        });

        test("does not match non-table_options key", () => {
            const node = { keyword: "engine" };
            assert.strictEqual(transformer.matches(node as never, null, "columns"), false);
        });

        test("filters ENGINE option when converting to hive", () => {
            const parent = {
                table_options: [
                    { keyword: "engine", symbol: "=", value: "INNODB" },
                    { keyword: "comment", symbol: "=", value: "'test'" },
                ],
            };
            transformer.transform(parent.table_options[0] as never, parent as never, "table_options", makeCtx("mysql", "hive"));
            assert.strictEqual(parent.table_options.length, 1);
            assert.strictEqual((parent.table_options[0] as { keyword: string }).keyword, "comment");
        });

        test("filters STORED AS option when converting to mysql", () => {
            const parent = {
                table_options: [
                    { keyword: "stored as", value: "ORC" },
                    { keyword: "comment", symbol: "=", value: "'test'" },
                ],
            };
            transformer.transform(parent.table_options[0] as never, parent as never, "table_options", makeCtx("hive", "mysql"));
            assert.strictEqual(parent.table_options.length, 1);
            assert.strictEqual((parent.table_options[0] as { keyword: string }).keyword, "comment");
        });
    });

    // ========================================================================
    // ClauseTransformer
    // ========================================================================

    suite("ClauseTransformer", () => {
        const transformer = new ClauseTransformer();

        test("matches select nodes", () => {
            const node = { type: "select", columns: [] };
            assert.strictEqual(transformer.matches(node as never), true);
        });

        test("does not match non-select nodes", () => {
            const node = { type: "create" };
            assert.strictEqual(transformer.matches(node as never), false);
        });

        test("removes DISTRIBUTE BY clause (hive to mysql)", () => {
            const node = { type: "select", columns: [], distributeby: { type: "distribute by", value: [] } };
            transformer.transform(node as never, null, null, makeCtx("hive", "mysql"));
            assert.strictEqual(node.distributeby, undefined);
        });

        test("removes SORT BY clause (hive to mysql)", () => {
            const node = { type: "select", columns: [], sortby: { type: "sort by", value: [] } };
            transformer.transform(node as never, null, null, makeCtx("hive", "mysql"));
            assert.strictEqual(node.sortby, undefined);
        });

        test("removes CLUSTER BY clause (hive to mysql)", () => {
            const node = { type: "select", columns: [], clusterby: { type: "cluster by", value: [] } };
            transformer.transform(node as never, null, null, makeCtx("hive", "mysql"));
            assert.strictEqual(node.clusterby, undefined);
        });

        test("does not remove clauses when not hive to mysql", () => {
            const node = { type: "select", columns: [], distributeby: { type: "distribute by", value: [] } };
            transformer.transform(node as never, null, null, makeCtx("mysql", "hive"));
            assert.ok(node.distributeby !== undefined);
        });
    });
});
