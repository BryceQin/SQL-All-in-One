import type { DialectOptions } from "../dialect";
import { expandPhrases } from "../expandPhrases";
import { dataTypes, keywords } from "./starrocks.keywords";
import { functions } from "./starrocks.functions";
import {
    baseIdentChars,
    baseIdentTypes,
    baseLineCommentTypes,
    baseOperators,
    baseParamTypes,
    baseReservedClauses,
    baseReservedDataTypePhrases,
    baseReservedJoins,
    baseReservedKeywordPhrases,
    baseReservedSelect,
    baseReservedSetOperations,
    baseStandardOnelineClauses,
    baseStringTypes,
    baseTabularOnelineClauses,
    baseVariableTypes,
    postProcess,
} from "../mysqlProtocolBase";

// StarRocks is MySQL-protocol compatible. We derive from the MySQL formatter
// configuration and add StarRocks-specific DDL clauses (materialized views,
// rollups, admin commands).
//
// To preserve the historical ordering of the original StarRocks formatter
// (where these extras sat right after TRUNCATE [TABLE] and before the
// MySQL DDL statement list), we splice them into the shared base list at
// the same position instead of appending them at the end.

// StarRocks-specific tabular oneline clauses. These cover StarRocks-only DDL
// such as materialized views, rollups, and admin/config statements.
const starrocksExtraTabularClauses = expandPhrases([
    "CREATE MATERIALIZED VIEW [IF NOT EXISTS]",
    "REFRESH MATERIALIZED VIEW",
    "ALTER TABLE ADD ROLLUP",
    "ALTER TABLE DROP ROLLUP",
    "DROP ROLLUP",
    "ADMIN SET CONFIG",
    "SET VARIABLE",
]);

// Index of "TRUNCATE TABLE" in the shared base list. The StarRocks extras
// are inserted immediately after it to match the original ordering.
const TRUNCATE_TABLE_INDEX = baseTabularOnelineClauses.indexOf("TRUNCATE TABLE");

// StarRocks tabular oneline clauses = base list with StarRocks extras spliced
// in right after TRUNCATE [TABLE].
const tabularOnelineClauses = [
    ...baseTabularOnelineClauses.slice(0, TRUNCATE_TABLE_INDEX + 1),
    ...starrocksExtraTabularClauses,
    ...baseTabularOnelineClauses.slice(TRUNCATE_TABLE_INDEX + 1),
];

// StarRocks is MySQL-protocol compatible, so tokenizer options mirror MySQL.
export const starrocks: DialectOptions = {
    name: "starrocks",
    tokenizerOptions: {
        reservedSelect: baseReservedSelect,
        reservedClauses: [...baseReservedClauses, ...baseStandardOnelineClauses, ...tabularOnelineClauses],
        reservedSetOperations: baseReservedSetOperations,
        reservedJoins: baseReservedJoins,
        reservedKeywordPhrases: baseReservedKeywordPhrases,
        reservedDataTypePhrases: baseReservedDataTypePhrases,
        supportsXor: true,
        reservedKeywords: keywords,
        reservedDataTypes: dataTypes,
        reservedFunctionNames: functions,
        // TODO: support _ char set prefixes such as _utf8, _latin1, _binary, _utf8mb4, etc.
        stringTypes: baseStringTypes,
        identTypes: baseIdentTypes,
        identChars: baseIdentChars,
        variableTypes: baseVariableTypes,
        paramTypes: baseParamTypes,
        lineCommentTypes: baseLineCommentTypes,
        operators: baseOperators,
        postProcess,
    },
    formatOptions: {
        onelineClauses: [...baseStandardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
};
