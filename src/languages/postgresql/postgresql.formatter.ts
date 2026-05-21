import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../../formatter/expandPhrases"
import { functions } from "./postgresql.functions"
import { dataTypes, keywords } from "./postgresql.keywords"

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
    "DISTINCT ON",
    "RETURNING",
    "ON CONFLICT",
    "FETCH FIRST",
    "FETCH NEXT",
    "FOR UPDATE",
    "FOR SHARE",
    "LATERAL",
    "TABLESAMPLE",
    "WITH ORDINALITY",
])

const standardOnelineClauses = expandPhrases([
    "CREATE [TEMPORARY] TABLE [IF NOT EXISTS]",
    "CREATE INDEX [CONCURRENTLY]",
    "CREATE [OR REPLACE] FUNCTION",
    "COPY",
])

const tabularOnelineClauses = expandPhrases([
    "ALTER TABLE",
    "CREATE [MATERIALIZED] VIEW",
    "DROP TABLE [IF EXISTS]",
    "TRUNCATE [TABLE]",
    "CREATE EXTENSION",
    "CREATE ROLE",
    "VACUUM",
    "EXPLAIN [ANALYZE]",
    "GRANT",
    "REVOKE",
    "ALTER",
    "CREATE",
    "SET",
    "SHOW",
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

export const postgresql: DialectOptions = {
    name: "postgresql",
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
        stringTypes: ['""-qq-bs', "''-qq-bs", { quote: "''-bs", prefixes: ["E"] }, { quote: "''-bs", prefixes: ["U&"] }, { regex: "\\$.*?\\$" }],
        identTypes: ['""-qq', "``"],
        lineCommentTypes: ["--"],
        operators: ["::", "->", "->>", "#>", "#>>", "@>", "<@", "?", "?|", "?&", "~", "~*", "!~", "!~*", "@@", "@@@", "||"],
        paramTypes: { named: [":"], positional: false },
        variableTypes: [{ regex: ":[a-zA-Z_]\\w*" }],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}