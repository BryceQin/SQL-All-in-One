import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../../formatter/expandPhrases"
import { functions } from "./snowflake.functions"
import { dataTypes, keywords } from "./snowflake.keywords"

const reservedSelect = expandPhrases(["SELECT [ALL | DISTINCT]"])

const reservedClauses = expandPhrases([
    // queries
    "WITH",
    "FROM",
    "WHERE",
    "GROUP BY",
    "HAVING",
    "WINDOW",
    "PARTITION BY",
    "ORDER BY",
    "LIMIT",
    "QUALIFY",
    "SAMPLE",
    "TABLESAMPLE",
    // Data manipulation
    "INSERT INTO",
    "VALUES",
    "SET",
    "MERGE INTO",
    "WHEN [NOT] MATCHED [THEN]",
    "UPDATE SET",
    "INSERT [VALUES]",
    // Snowflake-specific
    "LATERAL FLATTEN",
    "MATCH_RECOGNIZE",
    "CONNECT BY",
    "START WITH",
    "PIVOT",
    "UNPIVOT",
    "CLUSTER BY",
    "COPY INTO",
    "STAGE",
    "FILE FORMAT",
])

const standardOnelineClauses = expandPhrases([
    "CREATE [OR REPLACE] TABLE [IF NOT EXISTS]",
    "CREATE [OR REPLACE] WAREHOUSE",
    "CREATE [OR REPLACE] STAGE",
    "CREATE [OR REPLACE] FILE FORMAT",
    "CREATE [OR REPLACE] PIPE",
    "CREATE [OR REPLACE] TASK",
    "CREATE [OR REPLACE] STREAM",
    "COPY INTO",
])

const tabularOnelineClauses = expandPhrases([
    "ALTER TABLE",
    "ALTER SESSION",
    "ALTER WAREHOUSE",
    "CREATE [MATERIALIZED] VIEW",
    "DROP TABLE [IF EXISTS]",
    "TRUNCATE [TABLE]",
    "GRANT",
    "REVOKE",
    "CREATE",
    "ALTER",
    "DROP",
    "USE",
    "SHOW",
    "DESCRIBE",
    "LIST",
    "PUT",
    "GET",
    "REMOVE",
])

const reservedSetOperations = expandPhrases([
    "UNION [ALL]",
    "INTERSECT",
    "MINUS",
    "EXCEPT [ALL | DISTINCT]",
])

const reservedJoins = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT | FULL} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
])

const reservedPhrases = expandPhrases(["{ROWS | RANGE} BETWEEN"])

const reservedDataTypePhrases = expandPhrases([])

export const snowflake: DialectOptions = {
    name: "snowflake",
    tokenizerOptions: {
        reservedSelect,
        reservedClauses: [
            ...reservedClauses,
            ...standardOnelineClauses,
            ...tabularOnelineClauses,
        ],
        reservedSetOperations,
        reservedJoins,
        reservedKeywordPhrases: reservedPhrases,
        reservedDataTypePhrases,
        reservedKeywords: keywords,
        reservedDataTypes: dataTypes,
        reservedFunctionNames: functions,
        extraParens: ["[]"],
        stringTypes: ['""-qq-bs', "''-bs", { regex: "\\$\\$[^$]*\\$\\$" }],
        identTypes: ['""-qq'],
        lineCommentTypes: ["--", "//"],
        operators: ["::", "||", "%", "~", "^", "|", "&", "<=>", "==", "!", "=>"],
        paramTypes: { named: [":"], positional: true },
        variableTypes: [{ regex: ":[A-Za-z_][A-Za-z0-9_]*" }],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}
