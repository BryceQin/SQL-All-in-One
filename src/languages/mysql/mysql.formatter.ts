import type { DialectOptions } from "../dialect"
import { dataTypes, keywords } from "./mysql.keywords"
import { functions } from "./mysql.functions"
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
} from "../mysqlProtocolBase"

// Shared functionality used by all MariaDB-like SQL dialects.

// MySQL uses the shared base tabular oneline clauses unchanged.
const tabularOnelineClauses = baseTabularOnelineClauses

// https://dev.mysql.com/doc/refman/8.0/en/
export const mysql: DialectOptions = {
    name: "mysql",
    tokenizerOptions: {
        reservedSelect: baseReservedSelect,
        reservedClauses: [
            ...baseReservedClauses,
            ...baseStandardOnelineClauses,
            ...tabularOnelineClauses,
        ],
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
}
