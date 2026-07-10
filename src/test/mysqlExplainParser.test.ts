import * as assert from "assert";
import { MysqlSchemaAdapter } from "../database/adapters/MysqlAdapter";
import type { ExplainNode } from "../database/adapters/IDatabaseAdapter";
import type { IMysqlProtocolSharedContext } from "../database/adapters/MysqlAdapter";
import type { ConnectionConfig } from "../database/connection/ConnectionConfig";

/**
 * Builds a {@link MysqlSchemaAdapter} wired to stub collaborators. The method
 * under test ({@link MysqlSchemaAdapter.parseExplainNodes}) is a private
 * instance method that only reads its `obj` argument and never touches
 * `this.shared` / `this.executeQuery` / `this.listTriggersFn`, so stubs are
 * sufficient and the tests do not need a live mysql2 pool or any database.
 *
 * The private method is reached via a structural cast because it is not part
 * of the public API; this mirrors how the rest of the test suite accesses
 * internal helpers (see e.g. explainPlan.test.ts casting `ExplainPlan` to
 * expose the private `detectOperation`).
 */
function createAdapterWithStubs(): MysqlSchemaAdapter {
    const stubShared: IMysqlProtocolSharedContext = {
        pool: null,
        transactionConnection: null,
        activeQueryThreadIds: new Map(),
        config: {} as ConnectionConfig,
        activeConnectionCount: 0,
        totalConnectionCount: 0,
        lastActivityTime: 0,
    } as unknown as IMysqlProtocolSharedContext;
    const executeQuery = async (): Promise<never> => {
        throw new Error("executeQuery should not be called by parseExplainNodes");
    };
    const listTriggersFn = async (): Promise<never> => {
        throw new Error("listTriggersFn should not be called by parseExplainNodes");
    };
    return new MysqlSchemaAdapter(stubShared, executeQuery, listTriggersFn);
}

interface ParseExplainNodesAccess {
    parseExplainNodes(obj: Record<string, unknown>, idCounter?: { value: number }): ExplainNode[];
}

function parse(adapter: MysqlSchemaAdapter, obj: Record<string, unknown>): ExplainNode[] {
    return (adapter as unknown as ParseExplainNodesAccess).parseExplainNodes(obj);
}

function flatten(nodes: ExplainNode[]): ExplainNode[] {
    const out: ExplainNode[] = [];
    const walk = (ns: ExplainNode[]): void => {
        for (const n of ns) {
            out.push(n);
            if (n.children?.length) {
                walk(n.children);
            }
        }
    };
    walk(nodes);
    return out;
}

/**
 * Tests for {@link MysqlSchemaAdapter.parseExplainNodes}.
 *
 * These tests assert the *current* behaviour of the private parser against
 * representative MySQL EXPLAIN JSON shapes. Two code paths exist:
 *   - `query_block` top-level → {@link parseQueryBlockNode}, which emits one
 *     node for the block (reading `select_id` / `cost_info`) and recurses
 *     into every other entry.
 *   - any other top-level shape → {@link parseGenericTopLevel}, which emits
 *     one node per top-level key via {@link parseGenericNode}, reading the
 *     inline `table_name` / `rows_examined` / `key` / `attached_condition` /
 *     `cost_info` fields and skipping those keys when recursing
 *     (the `EXPLAIN_SKIP_KEYS` set).
 *
 * `nested_loop` array items are typically `{ table: { ... } }` objects, so
 * they enter the generic path with `table` as the key — this is the path
 * that yields a fully-populated table node.
 */
suite("MysqlSchemaAdapter - parseExplainNodes", () => {
    const adapter = createAdapterWithStubs();

    suite("query_block nesting", () => {
        test("top-level query_block emits one node with select_id in operation", () => {
            const nodes = parse(adapter, {
                query_block: {
                    select_id: 1,
                    cost_info: { query_cost: "10.00" },
                },
            });

            assert.strictEqual(nodes.length, 1);
            assert.strictEqual(nodes[0].operation, "query_block (id=1)");
            assert.strictEqual(nodes[0].cost, 10);
            assert.deepStrictEqual(nodes[0].children, []);
        });

        test('query_block without select_id uses bare "query_block" operation', () => {
            const nodes = parse(adapter, {
                query_block: {
                    cost_info: { query_cost: "5.00" },
                },
            });

            assert.strictEqual(nodes.length, 1);
            assert.strictEqual(nodes[0].operation, "query_block");
        });

        test('nested_loop array entries each become "table" child nodes in order', () => {
            // Each nested_loop item is `{ table: { ... } }`, which enters the
            // generic path with `table` as the key — the path that populates
            // table / key / rows / cost inline.
            const nodes = parse(adapter, {
                query_block: {
                    select_id: 1,
                    nested_loop: [
                        { table: { table_name: "users", key: "PRIMARY", rows_examined: 1 } },
                        { table: { table_name: "orders", key: "idx_user_id", rows_examined: 10 } },
                    ],
                },
            });

            assert.strictEqual(nodes.length, 1);
            const tables = nodes[0].children;
            assert.strictEqual(tables.length, 2);
            assert.strictEqual(tables[0].operation, "table");
            assert.strictEqual(tables[0].table, "users");
            assert.strictEqual(tables[0].key, "PRIMARY");
            assert.strictEqual(tables[0].rows, 1);
            assert.strictEqual(tables[1].operation, "table");
            assert.strictEqual(tables[1].table, "orders");
            assert.strictEqual(tables[1].key, "idx_user_id");
            assert.strictEqual(tables[1].rows, 10);
        });

        test("query_block recursion descends into ordering_operation children", () => {
            const nodes = parse(adapter, {
                query_block: {
                    select_id: 1,
                    ordering_operation: {
                        using_filesort: true,
                        table: { table_name: "orders" },
                    },
                },
            });

            const flat = flatten(nodes);
            // query_block + ordering_operation's generic children. The
            // generic path emits one node per top-level key of the
            // ordering_operation object: `using_filesort` (boolean → bare
            // node) and `table` (object → table node).
            const ops = flat.map((n) => n.operation);
            assert.ok(ops.includes("query_block (id=1)"));
            assert.ok(ops.includes("using_filesort"));
            const tableNodes = flat.filter((n) => n.operation === "table" && n.table === "orders");
            assert.strictEqual(tableNodes.length, 1);
        });
    });

    suite("cost_info handling", () => {
        test("query_block cost_info.query_cost is parsed as float", () => {
            const nodes = parse(adapter, {
                query_block: {
                    cost_info: { query_cost: "123.45" },
                },
            });

            assert.strictEqual(nodes[0].cost, 123.45);
        });

        test("query_block rows from cost_info.rows_examined_per_scan", () => {
            const nodes = parse(adapter, {
                query_block: {
                    cost_info: {
                        query_cost: "10.00",
                        rows_examined_per_scan: 500,
                    },
                },
            });

            assert.strictEqual(nodes[0].rows, 500);
        });

        test("table cost_info.query_cost populates node.cost (generic path)", () => {
            // Use the top-level `{ table: {...} }` shape so the generic path
            // runs with `table` as the key and reads cost_info inline.
            const nodes = parse(adapter, {
                table: {
                    table_name: "t",
                    cost_info: { query_cost: "7.5" },
                },
            });

            assert.strictEqual(nodes.length, 1);
            assert.strictEqual(nodes[0].operation, "table");
            assert.strictEqual(nodes[0].cost, 7.5);
        });

        test("missing cost_info leaves cost/rows undefined", () => {
            const nodes = parse(adapter, {
                query_block: { select_id: 1 },
            });

            assert.strictEqual(nodes[0].cost, undefined);
            assert.strictEqual(nodes[0].rows, undefined);
        });
    });

    suite("EXPLAIN_SKIP_KEYS filtering", () => {
        test("inline leaf keys are read into the node and NOT emitted as children", () => {
            // Top-level `table` enters the generic path; parseGenericNode
            // reads table_name / rows_examined / key / attached_condition /
            // cost_info inline and skips them when recursing, so they do
            // not become spurious child nodes. Here we use only skip-set
            // keys plus a `cost_info` to keep the assertion focused on the
            // filtering contract: no child nodes are emitted because every
            // entry is in EXPLAIN_SKIP_KEYS.
            const nodes = parse(adapter, {
                table: {
                    table_name: "products",
                    rows_examined: 200,
                    key: "idx_sku",
                    attached_condition: "products.sku IS NOT NULL",
                    cost_info: { query_cost: "2.00" },
                },
            });

            assert.strictEqual(nodes.length, 1, 'top-level "table" key emits exactly one node');
            const node = nodes[0];
            assert.strictEqual(node.operation, "table");
            assert.strictEqual(node.table, "products");
            assert.strictEqual(node.rows, 200);
            assert.strictEqual(node.key, "idx_sku");
            assert.strictEqual(node.extra, "products.sku IS NOT NULL");
            assert.strictEqual(node.cost, 2);
            // Every inline field was consumed into `node` and skipped during
            // recursion, so no children are emitted.
            assert.deepStrictEqual(node.children, []);
        });

        test("cost_info at the top level of a generic object is skipped", () => {
            const nodes = parse(adapter, {
                cost_info: { query_cost: "99.00" },
                ordering_operation: { table: { table_name: "t" } },
            });

            // cost_info must not become its own node; only ordering_operation does.
            const ops = nodes.map((n) => n.operation);
            assert.ok(!ops.includes("cost_info"));
            assert.ok(ops.includes("ordering_operation"));
        });

        test("select_id and cost_info inside query_block are not recursed as children", () => {
            const nodes = parse(adapter, {
                query_block: {
                    select_id: 7,
                    cost_info: { query_cost: "1.00" },
                    nested_loop: [{ table: { table_name: "t" } }],
                },
            });

            const childOps = nodes[0].children.map((n) => n.operation);
            assert.ok(!childOps.includes("select_id"));
            assert.ok(!childOps.includes("cost_info"));
            assert.ok(childOps.includes("table"), "nested_loop table child should be present");
        });
    });

    suite("edge cases", () => {
        test("empty object yields no nodes", () => {
            const nodes = parse(adapter, {});
            assert.deepStrictEqual(nodes, []);
        });

        test("falsy input yields no nodes", () => {
            assert.deepStrictEqual(
                (adapter as unknown as ParseExplainNodesAccess).parseExplainNodes(null as unknown as Record<string, unknown>),
                [],
            );
        });

        test("idCounter is shared and incremented across recursion", () => {
            const idCounter = { value: 0 };
            const nodes = (adapter as unknown as ParseExplainNodesAccess).parseExplainNodes(
                {
                    query_block: {
                        nested_loop: [{ table: { table_name: "a" } }, { table: { table_name: "b" } }],
                    },
                },
                idCounter,
            );

            const flat = flatten(nodes);
            // query_block (1) + table a (2) + table b (3) = 3 nodes, ids 1..3
            assert.strictEqual(flat.length, 3);
            const ids = flat.map((n) => n.id).sort();
            assert.deepStrictEqual(ids, ["1", "2", "3"]);
            assert.strictEqual(idCounter.value, 3);
        });
    });
});
