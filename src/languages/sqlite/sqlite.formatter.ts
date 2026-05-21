import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../../formatter/expandPhrases"
import { functions } from "./sqlite.functions"
import { dataTypes, keywords } from "./sqlite.keywords"

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
    "ON CONFLICT",
    "RETURNING",
])

const standardOnelineClauses = expandPhrases([
    "CREATE TABLE [IF NOT EXISTS]",
    "CREATE VIRTUAL TABLE",
])

const tabularOnelineClauses = expandPhrases([
    "ALTER TABLE",
    "DROP TABLE [IF EXISTS]",
    "ATTACH DATABASE",
    "DETACH DATABASE",
    "REINDEX",
    "VACUUM",
    "PRAGMA",
    "EXPLAIN QUERY PLAN",
    "CREATE",
    "ALTER",
    "DROP",
    "INSERT",
    "REPLACE",
])

const reservedSetOperations = expandPhrases(["UNION [ALL]", "INTERSECT", "EXCEPT"])

const reservedJoins = expandPhrases([
    "JOIN",
    "{LEFT | INNER | CROSS} JOIN",
    "NATURAL JOIN",
    "NATURAL LEFT JOIN",
])

const reservedPhrases = expandPhrases(["{ROWS | RANGE} BETWEEN"])

const reservedDataTypePhrases = expandPhrases([])

export const sqlite: DialectOptions = {
    name: "sqlite",
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
        stringTypes: ["''-qq"],
        identTypes: ['""-qq', "``", "[]"],
        lineCommentTypes: ["--"],
        operators: ["->", "->>", "||", "%", "~", "^", "|", "&", "=="],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}
