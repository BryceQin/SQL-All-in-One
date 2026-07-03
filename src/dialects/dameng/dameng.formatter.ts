import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../expandPhrases"
import { dataTypes, keywords } from "./dameng.keywords"
import { functions } from "./dameng.functions"
import {
    ORACLE_DDL_TABULAR_ONELINE_CLAUSES,
    ORACLE_STANDARD_ONELINE_CLAUSES,
    ORACLE_RESERVED_CLAUSES,
    ORACLE_RESERVED_SET_OPERATIONS,
    ORACLE_RESERVED_JOINS,
    ORACLE_RESERVED_KEYWORD_PHRASES,
    ORACLE_OPERATORS,
} from "../oracleDdlBase"

// Dameng (DM) SQL dialect options.
// Derived from the Oracle dialect, retaining Oracle-compatible syntax
// (CONNECT BY / ROWNUM / DUAL / || / :=, etc.) and adding Dameng-specific
// syntax (SELECT TOP n, LIMIT clause).
// References:
// - Oracle SQL: https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SQL-Statements.html
// - Dameng SQL Language Manual: https://eco.dameng.com/document/dm/zh-cn/sql-reference
// Note: Dameng has limited support for the Oracle q'[...]' alternative quoting
// mechanism, so the related configuration has been removed.

// Dameng extends Oracle's SELECT with the TOP clause (Dameng 8 supports SELECT TOP n).
const reservedSelect = expandPhrases(["SELECT [ALL | DISTINCT | UNIQUE] [TOP]"])

// Dameng adds LIMIT (MySQL-compatibility mode) on top of Oracle's reserved clauses.
const reservedClauses = expandPhrases([
    ...ORACLE_RESERVED_CLAUSES,
    "LIMIT",
])

// Dameng reuses Oracle's DDL tabular clauses and appends its own TOP clause.
const tabularOnelineClauses = expandPhrases([
    ...ORACLE_DDL_TABULAR_ONELINE_CLAUSES,
    "TOP",
])

const standardOnelineClauses = ORACLE_STANDARD_ONELINE_CLAUSES
const reservedSetOperations = ORACLE_RESERVED_SET_OPERATIONS
const reservedJoins = ORACLE_RESERVED_JOINS
const reservedKeywordPhrases = ORACLE_RESERVED_KEYWORD_PHRASES
const reservedDataTypePhrases = expandPhrases([])
const operators = ORACLE_OPERATORS

// https://eco.dameng.com/document/dm/zh-cn/sql-reference
export const dameng: DialectOptions = {
    name: "dameng",
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
        // Dameng string types:
        // - ''-qq-bs: standard single-quoted string, supports '' and \ escaping
        // - N''-qq-bs: national character set string (N prefix)
        // Note: Dameng has limited support for the Oracle q'[...]' alternative
        // quoting mechanism, so the related configuration has been removed.
        stringTypes: [
            "''-qq-bs",
            { quote: "''-qq-bs", prefixes: ["N"], requirePrefix: false },
        ],
        // Dameng identifier types:
        // - ""-qq: double-quoted identifier (SQL standard, Dameng default)
        identTypes: ['""-qq'],
        // Dameng variables:
        // - :name: bind variable (e.g. :1, :emp_id)
        // - &name: substitution variable
        variableTypes: [
            { regex: ":[A-Za-z0-9_.$]+" },
            { regex: "&[A-Za-z0-9_.$]+" },
        ],
        paramTypes: { named: [":"], positional: false },
        lineCommentTypes: ["--"],
        operators,
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}
