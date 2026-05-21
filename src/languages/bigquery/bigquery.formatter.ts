import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../../formatter/expandPhrases"
import { functions } from "./bigquery.functions"
import { dataTypes, keywords } from "./bigquery.keywords"

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
    "INSERT INTO",
    "VALUES",
    "SET",
    "MERGE INTO",
    "WHEN [NOT] MATCHED [THEN]",
    "UPDATE SET",
    "INSERT [VALUES]",
    "QUALIFY",
    "PIVOT",
    "UNPIVOT",
    "TABLESAMPLE",
    "FOR SYSTEM_TIME AS OF",
    "OPTIONS",
])

const standardOnelineClauses = expandPhrases([
    "CREATE [OR REPLACE] TABLE [IF NOT EXISTS]",
    "CREATE SCHEMA [IF NOT EXISTS]",
    "CREATE EXTERNAL TABLE [IF NOT EXISTS]",
    "CREATE MATERIALIZED VIEW [IF NOT EXISTS]",
    "CREATE [OR REPLACE] FUNCTION [IF NOT EXISTS]",
])

const tabularOnelineClauses = expandPhrases([
    "ALTER TABLE",
    "ALTER SCHEMA",
    "DROP TABLE [IF EXISTS]",
    "EXPORT DATA",
    "LOAD DATA",
    "TRUNCATE [TABLE]",
    "CREATE",
    "ALTER",
    "DROP",
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
])

const reservedPhrases = expandPhrases(["{ROWS | RANGE} BETWEEN"])

const reservedDataTypePhrases = expandPhrases([])

export const bigquery: DialectOptions = {
    name: "bigquery",
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
        stringTypes: [
            '""-bs',
            "''-bs",
            { regex: "r[bf]?'([^']*)'" },
            { regex: "'''([^']*)'''" },
        ],
        identTypes: ["``"],
        lineCommentTypes: ["--", "#"],
        operators: [
            "%",
            "~",
            "^",
            "|",
            "&",
            "<=>",
            "==",
            "!",
            "||",
            ">>",
            "<<",
        ],
        paramTypes: { named: ["@"], positional: false },
        variableTypes: [{ regex: "@[A-Za-z_][A-Za-z0-9_]*" }],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}