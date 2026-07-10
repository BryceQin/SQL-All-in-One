import type { SqlDialect } from "../parser/dialectMapper";
import { MYSQL_TO_HIVE_FUNCTION_NAMES, HIVE_TO_MYSQL_FUNCTION_NAMES } from "./functionMappings";
import { MYSQL_TO_HIVE_TYPES, HIVE_TO_MYSQL_TYPES, HIVE_COMPLEX_TYPES } from "./typeMappings";

/**
 * Key identifying a directed conversion pair (source dialect -\> target dialect).
 */
export type ConversionPairKey = `${SqlDialect}::${SqlDialect}`;

/**
 * Builds the canonical key for a directed conversion pair.
 */
export function pairKey(from: SqlDialect, to: SqlDialect): ConversionPairKey {
    return `${from}::${to}`;
}

/**
 * Set of MySQL table options that Hive does not support. Used to filter
 * table options when converting mysql -\> hive.
 */
export const HIVE_UNSUPPORTED_TABLE_OPTIONS = new Set([
    "ENGINE",
    "AUTO_INCREMENT",
    "DEFAULT CHARSET",
    "CHARSET",
    "COLLATE",
    "ROW_FORMAT",
    "AVG_ROW_LENGTH",
    "MAX_ROWS",
    "MIN_ROWS",
    "PACK_KEYS",
    "CHECKSUM",
    "DELAY_KEY_WRITE",
    "INSERT_METHOD",
    "DATA DIRECTORY",
    "INDEX DIRECTORY",
    "STATS_PERSISTENT",
    "STATS_AUTO_RECALC",
    "STATS_SAMPLE_PAGES",
    "TABLESPACE",
    "CONNECTION",
]);

/**
 * Set of Hive table options that MySQL does not support. Used to filter
 * table options when converting hive -\> mysql.
 */
export const MYSQL_UNSUPPORTED_TABLE_OPTIONS = new Set([
    "STORED AS",
    "LOCATION",
    "TBLPROPERTIES",
    "ROW FORMAT",
    "SERDE",
    "SERDEPROPERTIES",
    "INPUTFORMAT",
    "OUTPUTFORMAT",
]);

/**
 * Central registry for dialect conversion rules.
 *
 * Rules are keyed by a kind-namespaced composite key
 * `${ConversionPairKey}::${kind}`, where `kind` is owned by a single
 * transformer concern (e.g. 'functionNames', 'types'). This lets each
 * transformer declare its own payload type without key collisions and
 * without hard-coding dialect pairs in its own body.
 *
 * Adding a new dialect pair only requires registering entries here; the
 * transformers stay generic.
 */
export class ConversionRuleRegistry {
    private rules = new Map<string, unknown>();
    private pairs = new Set<ConversionPairKey>();

    /**
     * Registers a rule for a directed conversion pair under the given kind.
     * Overwrites any prior value registered for the same (from, to, kind).
     */
    register<T>(from: SqlDialect, to: SqlDialect, kind: string, rule: T): void {
        const pair = pairKey(from, to);
        this.rules.set(`${pair}::${kind}`, rule);
        this.pairs.add(pair);
    }

    /**
     * Returns the rule registered for (from, to, kind), or undefined.
     */
    get<T>(from: string, to: string, kind: string): T | undefined {
        return this.rules.get(`${from}::${to}::${kind}`) as T | undefined;
    }

    /**
     * Returns true if ANY rule is registered for the directed pair (from, to).
     */
    has(from: string, to: string): boolean {
        return this.pairs.has(`${from}::${to}` as ConversionPairKey);
    }
}

/**
 * Singleton registry instance shared by all node transformers.
 */
export const conversionRules = new ConversionRuleRegistry();

// ---------------------------------------------------------------------------
// mysql <-> hive rule registrations.
// Each kind is owned by exactly one transformer concern.
// ---------------------------------------------------------------------------

// FunctionTransformer: AST-level function-name mappings.
conversionRules.register("mysql", "hive", "functionNames", MYSQL_TO_HIVE_FUNCTION_NAMES);
conversionRules.register("hive", "mysql", "functionNames", HIVE_TO_MYSQL_FUNCTION_NAMES);

// TypeTransformer: AST-level type mappings.
conversionRules.register("mysql", "hive", "types", MYSQL_TO_HIVE_TYPES);
conversionRules.register("hive", "mysql", "types", HIVE_TO_MYSQL_TYPES);
// Direction-specific marker: complex-type warning is only emitted when
// converting hive -> mysql.
conversionRules.register("hive", "mysql", "complexTypes", HIVE_COMPLEX_TYPES);

// TableOptionTransformer: unsupported-option sets per target dialect.
conversionRules.register("mysql", "hive", "unsupportedTableOptions", HIVE_UNSUPPORTED_TABLE_OPTIONS);
conversionRules.register("hive", "mysql", "unsupportedTableOptions", MYSQL_UNSUPPORTED_TABLE_OPTIONS);

// Direction-specific markers so gating transformers stay direction-aware via
// the registry rather than hard-coded dialect checks.
conversionRules.register("mysql", "hive", "columnAttrs", true);
conversionRules.register("mysql", "hive", "constraints", true);
conversionRules.register("hive", "mysql", "clauses", true);

// ---------------------------------------------------------------------------
// Structural rewrite rules: callbacks that rebuild AST nodes in ways that
// cannot be expressed as simple name/type mappings. Each callback takes the
// matched node and ctx, returns true if it handled the node.
// ---------------------------------------------------------------------------

export type StructuralRewrite = (node: Record<string, unknown>, ctx: { warnings: string[] }) => boolean;

// FunctionTransformer: mysql -> hive IF(cond, a, b) becomes CASE/WHEN.
// The callback is registered here so FunctionTransformer stays generic.
// NOTE: To avoid a circular import (FunctionTransformer imports
// conversionRules for the registry, and this callback would import
// FunctionTransformer for rebuildAsCaseWhen), the rebuild logic is inlined
// in the callback. This keeps the registry self-contained.
conversionRules.register<StructuralRewrite>("mysql", "hive", "structuralRewrite", (node, ctx) => {
    const nameContainer = (node as { name?: { name?: { type: string; value: string }[] } }).name;
    if (!nameContainer || !nameContainer.name || !Array.isArray(nameContainer.name)) {
        return false;
    }
    const first = nameContainer.name[0];
    if (!first || typeof first.value !== "string" || first.value.toUpperCase() !== "IF") {
        return false;
    }

    const args = node.args as { type?: string; value?: unknown } | undefined;
    if (!args || args.type !== "expr_list" || !Array.isArray(args.value)) {
        return false;
    }
    const argArray = args.value as Record<string, unknown>[];
    if (argArray.length < 3) {
        return false;
    }
    const condition = argArray[0];
    const thenExpr = argArray[1];
    const elseExpr = argArray[2];

    Object.keys(node).forEach((key) => {
        delete node[key];
    });

    node.type = "case";
    node.expr = null;
    node.args = [
        { type: "when", cond: condition, result: thenExpr },
        { type: "else", result: elseExpr },
    ];
    void ctx;
    return true;
});
