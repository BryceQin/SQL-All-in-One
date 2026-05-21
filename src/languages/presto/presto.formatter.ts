import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../../formatter/expandPhrases"
import { functions } from "./presto.functions"
import { dataTypes, keywords } from "./presto.keywords"

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
    // Data manipulation
    "INSERT INTO",
    "VALUES",
    "SET",
    // Presto-specific
    "CROSS JOIN UNNEST",
    "LATERAL",
    "AT TIME ZONE",
    "MATCH_RECOGNIZE",
    "WITH ORDINALITY",
])

const standardOnelineClauses = expandPhrases([
    "CREATE TABLE [IF NOT EXISTS]",
    "CREATE TABLE AS",
    "CREATE VIEW [IF NOT EXISTS]",
    "CREATE SCHEMA [IF NOT EXISTS]",
])

const tabularOnelineClauses = expandPhrases([
    "ALTER TABLE",
    "ALTER SCHEMA",
    "DROP TABLE [IF EXISTS]",
    "DROP VIEW",
    "DROP SCHEMA",
    "TRUNCATE [TABLE]",
    "SHOW CATALOGS",
    "SHOW SCHEMAS",
    "SHOW TABLES",
    "SHOW COLUMNS",
    "SHOW PARTITIONS",
    "SHOW FUNCTIONS",
    "EXPLAIN [ANALYZE]",
    "CREATE",
    "ALTER",
    "DROP",
    "SET",
    "SHOW",
    "USE",
    "DESCRIBE",
])

const reservedSetOperations = expandPhrases([
    "UNION [ALL | DISTINCT]",
    "INTERSECT [ALL | DISTINCT]",
    "EXCEPT [ALL | DISTINCT]",
])

const reservedJoins = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT | FULL} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "NATURAL [INNER | LEFT | RIGHT | FULL] JOIN",
])

const reservedPhrases = expandPhrases(["{ROWS | RANGE} BETWEEN"])

const reservedDataTypePhrases = expandPhrases([])

export const presto: DialectOptions = {
    name: "presto",
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
        stringTypes: ['""-qq-bs', "''-bs"],
        identTypes: ['""-qq', "``"],
        lineCommentTypes: ["--"],
        operators: ["->", "||", "%", "~", "^", "|", "&", "<=>", "==", "!"],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}
