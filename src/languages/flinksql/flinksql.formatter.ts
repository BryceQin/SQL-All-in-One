import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../../formatter/expandPhrases"
import { dataTypes, keywords } from "./flinksql.keywords"
import { functions } from "./flinksql.functions"

const reservedSelect = expandPhrases(["SELECT [ALL | DISTINCT]"])

const reservedClauses = expandPhrases([
    "WITH",
    "FROM",
    "WHERE",
    "GROUP BY",
    "HAVING",
    "WINDOW",
    "PARTITION BY",
    "ORDER BY",
    "LIMIT",
    "INSERT [INTO | OVERWRITE] [TABLE]",
    "VALUES",
])

const standardOnelineClauses = expandPhrases([
    "CREATE [EXTERNAL] TABLE [IF NOT EXISTS]",
])

const tabularOnelineClauses = expandPhrases([
    "CREATE [OR REPLACE] [TEMPORARY] VIEW [IF NOT EXISTS]",
    "DROP TABLE [IF EXISTS]",
    "ALTER TABLE",
    "ADD COLUMNS",
    "DROP {COLUMN | COLUMNS}",
    "RENAME TO",
    "RENAME COLUMN",
    "ALTER COLUMN",
    "TRUNCATE TABLE",
    "ALTER DATABASE",
    "ALTER FUNCTION",
    "CREATE DATABASE",
    "CREATE FUNCTION",
    "DROP DATABASE",
    "DROP FUNCTION",
    "DROP VIEW",
    "DROP CATALOG",
    "USE CATALOG",
    "USE DATABASE",
    "USE MODULES",
    "EXPLAIN",
    "DESCRIBE",
    "SHOW CATALOGS",
    "SHOW DATABASES",
    "SHOW TABLES",
    "SHOW VIEWS",
    "SHOW FUNCTIONS",
    "SHOW MODULES",
    "SHOW JARS",
    "RESET",
])

const reservedSetOperations = expandPhrases([
    "UNION [ALL | DISTINCT]",
    "EXCEPT [ALL | DISTINCT]",
    "INTERSECT [ALL | DISTINCT]",
])

const reservedJoins = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT | FULL} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "NATURAL [INNER] JOIN",
    "NATURAL {LEFT | RIGHT | FULL} [OUTER] JOIN",
    "[LEFT] {ANTI | SEMI} JOIN",
    "NATURAL [LEFT] {ANTI | SEMI} JOIN",
])

const reservedKeywordPhrases = expandPhrases([
    "ON DELETE",
    "ON UPDATE",
    "CURRENT ROW",
    "{ROWS | RANGE} BETWEEN",
])

const reservedDataTypePhrases = expandPhrases([])

export const flinksql: DialectOptions = {
    name: "flinksql",
    tokenizerOptions: {
        reservedSelect,
        reservedClauses: [
            ...reservedClauses,
            ...standardOnelineClauses,
            ...tabularOnelineClauses,
        ],
        reservedSetOperations,
        reservedJoins,
        reservedKeywordPhrases,
        reservedDataTypePhrases,
        supportsXor: true,
        reservedKeywords: keywords,
        reservedDataTypes: dataTypes,
        reservedFunctionNames: functions,
        stringTypes: [
            "''-bs",
            '""-bs',
        ],
        identTypes: ["``"],
        identChars: { allowFirstCharNumber: true },
        variableTypes: [{ quote: "{}", prefixes: ["$"], requirePrefix: true }],
        operators: ["%", "~", "^", "|", "&", "==", "!", "||", "->"],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}
