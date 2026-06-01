import * as assert from 'assert';
import { ExplainPlan } from '../database/query/ExplainPlan';
import type { ExplainResult, ExplainNode } from '../database/adapters/IDatabaseAdapter';

interface ExplainPlanInternal {
    detectOperation(block: unknown): string;
};

suite('ExplainPlan - parseMysqlExplain', () => {

    suite('JSON format parsing', () => {
        test('should parse MySQL JSON EXPLAIN with query_block', () => {
            const input = {
                query_block: {
                    select_id: 1,
                    cost_info: { query_cost: '1.00' },
                    table: {
                        table_name: 'users',
                        access_type: 'ALL',
                        rows_examined: 1000,
                        rows_produced_per_join: 100,
                        filtered: '10.00',
                        cost_info: {
                            read_cost: '100.00',
                            eval_cost: '10.00',
                            prefix_cost: '110.00',
                        },
                    },
                },
            };

            const result = ExplainPlan.parseMysqlExplain(input);
            assert.strictEqual(result.format, 'mysql');
            assert.ok(result.nodes.length > 0);
        });

        test('should parse nested_loop structure', () => {
            const input = {
                query_block: {
                    select_id: 1,
                    nested_loop: [
                        {
                            table: {
                                table_name: 'users',
                                access_type: 'eq_ref',
                                key: 'PRIMARY',
                            },
                        },
                        {
                            table: {
                                table_name: 'orders',
                                access_type: 'ref',
                                key: 'idx_user_id',
                            },
                        },
                    ],
                },
            };

            const result = ExplainPlan.parseMysqlExplain(input);
            assert.ok(result.nodes.length >= 2);
        });

        test('should parse ordering_operation', () => {
            const input = {
                query_block: {
                    select_id: 1,
                    ordering_operation: {
                        using_filesort: true,
                        table: {
                            table_name: 'users',
                            access_type: 'ALL',
                        },
                    },
                },
            };

            const result = ExplainPlan.parseMysqlExplain(input);
            const sortNode = result.nodes.find(n => n.operation === 'SORT');
            assert.ok(sortNode, 'Should find a SORT node');
        });

        test('should parse grouping_operation', () => {
            const input = {
                query_block: {
                    select_id: 1,
                    grouping_operation: {
                        using_temporary_table: true,
                        table: {
                            table_name: 'orders',
                            access_type: 'ALL',
                        },
                    },
                },
            };

            const result = ExplainPlan.parseMysqlExplain(input);
            const tempNode = result.nodes.find(n => n.operation === 'TEMPORARY');
            assert.ok(tempNode, 'Should find a TEMPORARY node');
        });
    });

    suite('Table format parsing', () => {
        test('should parse array of row objects', () => {
            const input = [
                { id: 1, select_type: 'SIMPLE', table: 'users', type: 'ALL', key: null, rows: 1000, Extra: '' },
                { id: 1, select_type: 'SIMPLE', table: 'orders', type: 'ref', key: 'idx_user_id', rows: 10, Extra: 'Using index' },
            ];

            const result = ExplainPlan.parseMysqlExplain(input);
            assert.strictEqual(result.format, 'mysql');
            assert.ok(result.nodes.length > 0);
        });

        test('should detect TABLE SCAN from type ALL', () => {
            const input = [
                { id: 1, table: 'users', type: 'ALL', rows: 5000, key: null, Extra: '' },
            ];

            const result = ExplainPlan.parseMysqlExplain(input);
            assert.ok(result.nodes.some(n => n.operation === 'TABLE SCAN'));
        });

        test('should detect INDEX SEEK from type eq_ref', () => {
            const input = [
                { id: 1, table: 'users', type: 'eq_ref', key: 'PRIMARY', rows: 1, Extra: '' },
            ];

            const result = ExplainPlan.parseMysqlExplain(input);
            assert.ok(result.nodes.some(n => n.operation === 'INDEX SEEK'));
        });

        test('should detect INDEX SCAN from type range', () => {
            const input = [
                { id: 1, table: 'users', type: 'range', key: 'idx_age', rows: 100, Extra: 'Using where' },
            ];

            const result = ExplainPlan.parseMysqlExplain(input);
            assert.ok(result.nodes.some(n => n.operation === 'INDEX SCAN'));
        });
    });

    suite('String input parsing', () => {
        test('should parse JSON string input', () => {
            const input = JSON.stringify({
                query_block: {
                    table: {
                        table_name: 'users',
                        access_type: 'ALL',
                    },
                },
            });

            const result = ExplainPlan.parseMysqlExplain(input);
            assert.ok(result.nodes.length > 0);
        });

        test('should handle invalid JSON string gracefully', () => {
            const input = 'not valid json';
            const result = ExplainPlan.parseMysqlExplain(input);
            assert.strictEqual(result.nodes.length, 0);
        });

        test('should handle empty object', () => {
            const result = ExplainPlan.parseMysqlExplain({});
            assert.strictEqual(result.nodes.length, 0);
        });

        test('should handle null input', () => {
            const result = ExplainPlan.parseMysqlExplain(null);
            assert.strictEqual(result.nodes.length, 0);
        });

        test('should handle undefined input', () => {
            const result = ExplainPlan.parseMysqlExplain(undefined);
            assert.strictEqual(result.nodes.length, 0);
        });
    });
});

suite('ExplainPlan - detectOperation', () => {

    test('should detect TABLE SCAN for access_type ALL', () => {
        const block = { table: { access_type: 'ALL' } };
        assert.strictEqual((ExplainPlan as unknown as ExplainPlanInternal).detectOperation(block), 'TABLE SCAN');
    });

    test('should detect TABLE SCAN for full_scan', () => {
        const block = { table: { full_scan: true } };
        assert.strictEqual((ExplainPlan as unknown as ExplainPlanInternal).detectOperation(block), 'TABLE SCAN');
    });

    test('should detect INDEX SCAN for access_type range', () => {
        const block = { table: { access_type: 'range' } };
        assert.strictEqual((ExplainPlan as unknown as ExplainPlanInternal).detectOperation(block), 'INDEX SCAN');
    });

    test('should detect INDEX SCAN for access_type index', () => {
        const block = { table: { access_type: 'index' } };
        assert.strictEqual((ExplainPlan as unknown as ExplainPlanInternal).detectOperation(block), 'INDEX SCAN');
    });

    test('should detect INDEX SEEK for access_type eq_ref', () => {
        const block = { table: { access_type: 'eq_ref' } };
        assert.strictEqual((ExplainPlan as unknown as ExplainPlanInternal).detectOperation(block), 'INDEX SEEK');
    });

    test('should detect INDEX SEEK for access_type const', () => {
        const block = { table: { access_type: 'const' } };
        assert.strictEqual((ExplainPlan as unknown as ExplainPlanInternal).detectOperation(block), 'INDEX SEEK');
    });

    test('should detect INDEX SEEK for access_type ref', () => {
        const block = { table: { access_type: 'ref' } };
        assert.strictEqual((ExplainPlan as unknown as ExplainPlanInternal).detectOperation(block), 'INDEX SEEK');
    });

    test('should return UNKNOWN for null block', () => {
        assert.strictEqual((ExplainPlan as unknown as ExplainPlanInternal).detectOperation(null), 'UNKNOWN');
    });

    test('should return UNKNOWN for block without table', () => {
        assert.strictEqual((ExplainPlan as unknown as ExplainPlanInternal).detectOperation({}), 'UNKNOWN');
    });
});

suite('ExplainPlan - generateSuggestions', () => {

    test('should suggest critical for TABLE SCAN', () => {
        const result: ExplainResult = {
            format: 'mysql',
            raw: '',
            nodes: [{
                id: '0',
                operation: 'TABLE SCAN',
                table: 'users',
                children: [],
            }],
        };

        const suggestions = ExplainPlan.generateSuggestions(result);
        assert.ok(suggestions.length > 0);
        assert.ok(suggestions.some(s => s.severity === 'critical' && s.table === 'users'));
    });

    test('should suggest warning for Using filesort', () => {
        const result: ExplainResult = {
            format: 'mysql',
            raw: '',
            nodes: [{
                id: '0',
                operation: 'SORT',
                table: 'orders',
                extra: 'Using filesort',
                children: [],
            }],
        };

        const suggestions = ExplainPlan.generateSuggestions(result);
        assert.ok(suggestions.some(s => s.severity === 'warning' && s.message.includes('Filesort')));
    });

    test('should suggest warning for Using temporary', () => {
        const result: ExplainResult = {
            format: 'mysql',
            raw: '',
            nodes: [{
                id: '0',
                operation: 'TEMPORARY',
                table: 'orders',
                extra: 'Using temporary',
                children: [],
            }],
        };

        const suggestions = ExplainPlan.generateSuggestions(result);
        assert.ok(suggestions.some(s => s.severity === 'warning' && s.message.includes('Temporary')));
    });

    test('should suggest warning for no index used (key is null)', () => {
        const result: ExplainResult = {
            format: 'mysql',
            raw: '',
            nodes: [{
                id: '0',
                operation: 'INDEX SCAN',
                table: 'products',
                key: undefined,
                children: [],
            }],
        };

        const suggestions = ExplainPlan.generateSuggestions(result);
        assert.ok(suggestions.some(s => s.severity === 'warning' && s.table === 'products'));
    });

    test('should suggest info for low index selectivity', () => {
        const result: ExplainResult = {
            format: 'mysql',
            raw: '',
            nodes: [{
                id: '0',
                operation: 'INDEX SCAN',
                table: 'logs',
                rows: 50000,
                key: 'idx_created_at',
                children: [],
            }],
        };

        const suggestions = ExplainPlan.generateSuggestions(result);
        assert.ok(suggestions.some(s => s.severity === 'info' && s.table === 'logs'));
    });

    test('should not suggest for efficient index seek', () => {
        const result: ExplainResult = {
            format: 'mysql',
            raw: '',
            nodes: [{
                id: '0',
                operation: 'INDEX SEEK',
                table: 'users',
                rows: 1,
                key: 'PRIMARY',
                children: [],
            }],
        };

        const suggestions = ExplainPlan.generateSuggestions(result);
        assert.strictEqual(suggestions.length, 0);
    });

    test('should traverse children recursively', () => {
        const result: ExplainResult = {
            format: 'mysql',
            raw: '',
            nodes: [{
                id: '0',
                operation: 'NESTED LOOP',
                children: [{
                    id: '0-0',
                    operation: 'TABLE SCAN',
                    table: 'child_table',
                    children: [],
                }],
            }],
        };

        const suggestions = ExplainPlan.generateSuggestions(result);
        assert.ok(suggestions.some(s => s.table === 'child_table' && s.severity === 'critical'));
    });

    test('should deduplicate suggestions', () => {
        const result: ExplainResult = {
            format: 'mysql',
            raw: '',
            nodes: [
                {
                    id: '0',
                    operation: 'TABLE SCAN',
                    table: 'users',
                    children: [],
                },
                {
                    id: '1',
                    operation: 'TABLE SCAN',
                    table: 'users',
                    children: [],
                },
            ],
        };

        const suggestions = ExplainPlan.generateSuggestions(result);
        const criticalForUsers = suggestions.filter(s => s.severity === 'critical' && s.table === 'users');
        assert.strictEqual(criticalForUsers.length, 1, 'Should deduplicate identical suggestions');
    });

    test('should return empty for empty nodes', () => {
        const result: ExplainResult = {
            format: 'mysql',
            raw: '',
            nodes: [],
        };

        const suggestions = ExplainPlan.generateSuggestions(result);
        assert.strictEqual(suggestions.length, 0);
    });
});

suite('ExplainPlan - complex scenarios', () => {

    function countAllNodes(nodes: ExplainNode[]): number {
        let count = 0;
        for (const node of nodes) {
            count++;
            if (node.children && node.children.length > 0) {
                count += countAllNodes(node.children);
            }
        }
        return count;
    }

    test('should parse multi-table join with EXPLAIN', () => {
        const input = [
            { id: 1, select_type: 'SIMPLE', table: 'u', type: 'ALL', key: null, rows: 10000, Extra: '' },
            { id: 1, select_type: 'SIMPLE', table: 'o', type: 'ref', key: 'idx_user_id', rows: 5, Extra: 'Using index' },
            { id: 1, select_type: 'SIMPLE', table: 'p', type: 'eq_ref', key: 'PRIMARY', rows: 1, Extra: '' },
        ];

        const result = ExplainPlan.parseMysqlExplain(input);
        assert.ok(result.nodes.length >= 1, 'Should have at least one root node');

        const totalNodes = countAllNodes(result.nodes);
        assert.ok(totalNodes >= 3, `Should have at least 3 total nodes, got ${totalNodes}`);

        const suggestions = ExplainPlan.generateSuggestions(result);
        assert.ok(suggestions.some(s => s.table === 'u' && s.severity === 'critical'), 'Should warn about full table scan on u');
    });

    test('should parse subquery in EXPLAIN', () => {
        const input = [
            { id: 1, select_type: 'PRIMARY', table: 'users', type: 'ALL', key: null, rows: 100, Extra: '' },
            { id: 2, select_type: 'SUBQUERY', table: 'orders', type: 'index', key: 'idx_status', rows: 5000, Extra: 'Using index' },
        ];

        const result = ExplainPlan.parseMysqlExplain(input);
        assert.ok(result.nodes.length >= 2);
    });
});
