import type { ExplainResult, ExplainNode } from '../adapters/IDatabaseAdapter';

export interface OptimizationSuggestion {
    severity: 'info' | 'warning' | 'critical';
    message: string;
    table?: string;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ExplainPlan {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private constructor() {}

    static parseMysqlExplain(raw: any): ExplainResult {
        // JSON format: raw is a string containing JSON, or already-parsed object
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                return ExplainPlan.parseMysqlJsonExplain(parsed);
            } catch {
                // Not valid JSON, treat as raw text
                return { format: 'mysql', raw: raw, nodes: [] };
            }
        }

        // Already a parsed object — could be JSON EXPLAIN or table-format rows
        if (Array.isArray(raw)) {
            return ExplainPlan.parseMysqlTableExplain(raw);
        }

        if (typeof raw === 'object' && raw !== null) {
            // JSON EXPLAIN result (has query_block)
            if (raw.query_block) {
                return ExplainPlan.parseMysqlJsonExplain(raw);
            }
            // Could be wrapped in an array at top level of FORMAT=JSON
            // e.g. [{ query_block: ... }]
            return { format: 'mysql', raw: JSON.stringify(raw), nodes: [] };
        }

        return { format: 'mysql', raw: String(raw), nodes: [] };
    }

    /**
     * Recursively parse a query_block from MySQL JSON EXPLAIN output.
     */
    private static parseQueryBlock(block: any, parentId?: string): ExplainNode[] {
        if (!block || typeof block !== 'object') {
            return [];
        }

        const nodes: ExplainNode[] = [];
        const id = parentId ? `${parentId}-${nodes.length}` : '0';

        // Handle the table / nested_loop / ordering_operation / grouping_operation blocks
        // A query_block can contain a single table or a nested_loop join structure

        if (block.nested_loop) {
            // nested_loop contains an array of join tables
            const joinNodes = block.nested_loop.map((item: any, index: number) => {
                const childNodes = ExplainPlan.parseQueryBlock(item, `${id}-nl${index}`);
                return childNodes;
            }).flat();
            nodes.push(...joinNodes);
        }

        if (block.table) {
            const tableInfo = block.table;
            const nodeId = parentId ? parentId : id;
            const node: ExplainNode = {
                id: nodeId,
                operation: ExplainPlan.detectOperation(block),
                table: tableInfo.table_name,
                rows: tableInfo.rows_examined ?? tableInfo.rows_produced_per_join ?? tableInfo.rows,
                cost: tableInfo.read_cost ?? tableInfo.eval_cost ?? tableInfo.prefix_cost,
                key: tableInfo.key ?? tableInfo.best_key,
                extra: tableInfo.used_columns ?? (tableInfo.insert ? 'INSERT' : undefined),
                children: [],
            };

            // Build extra string from available fields
            const extras: string[] = [];
            if (tableInfo.using_filesort) extras.push('Using filesort');
            if (tableInfo.using_temporary_table) extras.push('Using temporary');
            if (tableInfo.using_index) extras.push('Using index');
            if (tableInfo.full_scan) extras.push('Full table scan');
            if (tableInfo.range_scan) extras.push('Range scan');
            if (extras.length > 0) {
                node.extra = extras.join('; ');
            }

            nodes.push(node);
        }

        // Handle ordering_operation
        if (block.ordering_operation) {
            const orderNode: ExplainNode = {
                id: `${id}-sort`,
                operation: 'SORT',
                children: [],
            };
            if (block.ordering_operation.using_filesort) {
                orderNode.extra = 'Using filesort';
            }
            const childNodes = ExplainPlan.parseQueryBlock(block.ordering_operation, `${id}-sort`);
            orderNode.children = childNodes;
            nodes.push(orderNode);
        }

        // Handle grouping_operation
        if (block.grouping_operation) {
            const groupNode: ExplainNode = {
                id: `${id}-group`,
                operation: 'TEMPORARY',
                children: [],
            };
            if (block.grouping_operation.using_temporary_table) {
                groupNode.extra = 'Using temporary';
            }
            const childNodes = ExplainPlan.parseQueryBlock(block.grouping_operation, `${id}-group`);
            groupNode.children = childNodes;
            nodes.push(groupNode);
        }

        // Handle derived tables / subqueries
        if (block.subqueries) {
            for (const subquery of block.subqueries) {
                if (subquery.query_block) {
                    const subNodes = ExplainPlan.parseQueryBlock(subquery.query_block, `${id}-sub`);
                    nodes.push(...subNodes);
                }
            }
        }

        // Handle union
        if (block.union_result) {
            const unionNode: ExplainNode = {
                id: `${id}-union`,
                operation: 'UNION',
                extra: block.union_result.table_name ? `UNION result ${block.union_result.table_name}` : 'UNION result',
                children: [],
            };
            nodes.push(unionNode);
        }

        // If no specific structure found but block has a table_name directly
        if (!block.table && !block.nested_loop && !block.ordering_operation && !block.grouping_operation && block.table_name) {
            nodes.push({
                id: parentId ?? id,
                operation: 'TABLE SCAN',
                table: block.table_name,
                rows: block.rows,
                cost: block.cost,
                key: block.key,
                extra: block.Extra,
                children: [],
            });
        }

        return nodes;
    }

    /**
     * Detect the operation type from a query block.
     */
    private static detectOperation(block: any): string {
        if (!block || typeof block !== 'object') {
            return 'UNKNOWN';
        }

        const table = block.table;
        if (!table) {
            return 'UNKNOWN';
        }

        // Check for full table scan
        if (table.access_type === 'ALL' || table.full_scan) {
            return 'TABLE SCAN';
        }

        // Check for index scan (range or index)
        if (table.access_type === 'range' || table.range_scan) {
            return 'INDEX SCAN';
        }

        // Check for index seek (eq_ref, const, ref)
        if (table.access_type === 'eq_ref' || table.access_type === 'const' || table.access_type === 'ref') {
            return 'INDEX SEEK';
        }

        // Check for nested loop join
        if (block.nested_loop) {
            return 'NESTED LOOP';
        }

        // Check for sort operation
        if (block.ordering_operation) {
            return 'SORT';
        }

        // Check for temporary table
        if (block.grouping_operation || table.using_temporary_table) {
            return 'TEMPORARY';
        }

        // Default based on access_type
        if (table.access_type === 'index') {
            return 'INDEX SCAN';
        }

        return 'TABLE SCAN';
    }

    /**
     * Generate optimization suggestions based on EXPLAIN results.
     */
    static generateSuggestions(result: ExplainResult): OptimizationSuggestion[] {
        const suggestions: OptimizationSuggestion[] = [];
        const seen = new Set<string>();

        const addSuggestion = (suggestion: OptimizationSuggestion) => {
            const key = `${suggestion.severity}:${suggestion.message}:${suggestion.table ?? ''}`;
            if (!seen.has(key)) {
                seen.add(key);
                suggestions.push(suggestion);
            }
        };

        const analyzeNode = (node: ExplainNode) => {
            // TABLE SCAN → critical
            if (node.operation === 'TABLE SCAN') {
                addSuggestion({
                    severity: 'critical',
                    message: 'Full table scan detected; consider adding an index for WHERE conditions',
                    table: node.table,
                });
            }

            // Using filesort → warning
            if (node.extra?.includes('Using filesort')) {
                addSuggestion({
                    severity: 'warning',
                    message: 'Filesort detected; consider adding an index for ORDER BY columns',
                    table: node.table,
                });
            }

            // Using temporary → warning
            if (node.extra?.includes('Using temporary')) {
                addSuggestion({
                    severity: 'warning',
                    message: 'Temporary table used; consider optimizing GROUP BY or DISTINCT',
                    table: node.table,
                });
            }

            // key = NULL → warning
            if (node.key === 'NULL' || node.key === null || node.key === undefined) {
                // Only warn about missing index if not already flagged as TABLE SCAN
                if (node.operation !== 'TABLE SCAN') {
                    addSuggestion({
                        severity: 'warning',
                        message: 'No index used; consider adding an appropriate index',
                        table: node.table,
                    });
                }
            }

            // rows > 10000 with key → info (low selectivity)
            if (node.rows && node.rows > 10000 && node.key && node.key !== 'NULL') {
                addSuggestion({
                    severity: 'info',
                    message: 'Low index selectivity (many rows scanned); consider a composite index',
                    table: node.table,
                });
            }

            // Recurse into children
            for (const child of node.children) {
                analyzeNode(child);
            }
        };

        for (const node of result.nodes) {
            analyzeNode(node);
        }

        return suggestions;
    }

    // --- Private helpers for different input formats ---

    private static parseMysqlJsonExplain(parsed: any): ExplainResult {
        const raw = JSON.stringify(parsed);

        // FORMAT=JSON output may be wrapped: [{ query_block: ... }] or { query_block: ... }
        let root = parsed;
        if (Array.isArray(parsed) && parsed.length > 0) {
            root = parsed[0];
        }

        if (!root.query_block) {
            return { format: 'mysql', raw, nodes: [] };
        }

        const nodes = ExplainPlan.parseQueryBlock(root.query_block, '0');
        return { format: 'mysql', raw, nodes };
    }

    private static parseMysqlTableExplain(rows: any[]): ExplainResult {
        const raw = JSON.stringify(rows);
        const nodes: ExplainNode[] = rows.map((row: any, index: number) => {
            const id = String(row.id ?? index);
            const operation = ExplainPlan.detectOperationFromTableRow(row);
            const node: ExplainNode = {
                id,
                operation,
                table: row.table ?? undefined,
                rows: row.rows != null ? Number(row.rows) : undefined,
                key: row.key ?? undefined,
                extra: row.Extra ?? row.extra ?? undefined,
                children: [],
            };
            return node;
        });

        // Build tree structure based on id column
        const rootNodes = ExplainPlan.buildNodeTree(nodes);
        return { format: 'mysql', raw, nodes: rootNodes };
    }

    private static detectOperationFromTableRow(row: any): string {
        const type = (row.type ?? row.access_type ?? '').toUpperCase();
        const extra = (row.Extra ?? row.extra ?? '').toLowerCase();

        if (type === 'ALL') return 'TABLE SCAN';
        if (type === 'RANGE') return 'INDEX SCAN';
        if (type === 'INDEX') return 'INDEX SCAN';
        if (type === 'EQ_REF' || type === 'CONST' || type === 'REF') return 'INDEX SEEK';
        if (extra.includes('using temporary')) return 'TEMPORARY';
        if (extra.includes('using filesort')) return 'SORT';

        return type || 'UNKNOWN';
    }

    /**
     * Build a tree from flat rows using the id column.
     * Rows with the same id are siblings; lower ids are parents of higher ids
     * when there is a gap (e.g., SUBQUERY indicators).
     */
    private static buildNodeTree(nodes: ExplainNode[]): ExplainNode[] {
        if (nodes.length === 0) return nodes;

        // Simple approach: group by id, treat as flat list for now
        // More sophisticated tree building could be added later
        const roots: ExplainNode[] = [];
        const idGroups = new Map<string, ExplainNode[]>();

        for (const node of nodes) {
            if (!idGroups.has(node.id)) {
                idGroups.set(node.id, []);
            }
            idGroups.get(node.id)!.push(node);
        }

        // For each group with same id, the first is the parent and rest are children
        for (const [, group] of idGroups) {
            if (group.length === 1) {
                roots.push(group[0]);
            } else {
                const parent = group[0];
                parent.children = group.slice(1);
                roots.push(parent);
            }
        }

        return roots;
    }
}
