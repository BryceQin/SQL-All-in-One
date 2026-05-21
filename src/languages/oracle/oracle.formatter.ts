import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../../formatter/expandPhrases"
import { functions } from "./oracle.functions"
import { dataTypes, keywords } from "./oracle.keywords"

const reservedSelect = expandPhrases(["SELECT [ALL | DISTINCT | UNIQUE]"])

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
    // Oracle-specific
    "CONNECT BY",
    "START WITH",
    "MERGE INTO",
    "RETURNING INTO",
    "BULK COLLECT INTO",
    "MODEL",
    "FOR UPDATE",
    "FLASHBACK",
    "VERSIONS BETWEEN",
])

const standardOnelineClauses = expandPhrases([
    "CREATE [OR REPLACE] PACKAGE",
    "CREATE [OR REPLACE] PROCEDURE",
    "CREATE [OR REPLACE] FUNCTION",
    "CREATE [OR REPLACE] TRIGGER",
    "CREATE MATERIALIZED VIEW",
    "CREATE TABLESPACE",
])

const tabularOnelineClauses = expandPhrases([
    "ALTER TABLE",
    "ALTER SESSION",
    "ALTER SYSTEM",
    "GRANT",
    "REVOKE",
    "AUDIT",
    "EXECUTE IMMEDIATE",
    "DROP TABLE [IF EXISTS]",
    "TRUNCATE [TABLE]",
    "EXPLAIN PLAN",
])

const reservedSetOperations = expandPhrases(["UNION [ALL]", "INTERSECT", "MINUS"])

const reservedJoins = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT | FULL} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "PARTITION BY",
])

const reservedKeywordPhrases = expandPhrases(["{ROWS | RANGE} BETWEEN"])

const reservedDataTypePhrases = expandPhrases([])

// https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/index.html
export const oracle: DialectOptions = {
    name: "oracle",
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
        reservedKeywords: keywords,
        reservedDataTypes: dataTypes,
        reservedFunctionNames: functions,
        extraParens: ["[]"],
        stringTypes: ['""-qq-bs', "''-qq-bs", "q''"],
        identTypes: ['""-qq'],
        lineCommentTypes: ["--"],
        operators: ["||", ":=", "**", "(+)", "=>"],
        paramTypes: { named: [":"], positional: false },
        variableTypes: [
            { regex: ":[A-Za-z][A-Za-z0-9_$#]*" },
            { regex: "&[A-Za-z][A-Za-z0-9_$#]*" },
        ],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}