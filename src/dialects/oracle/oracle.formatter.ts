import type { DialectOptions } from "../dialect";
import { expandPhrases } from "../expandPhrases";
import { dataTypes, keywords } from "./oracle.keywords";
import { functions } from "./oracle.functions";
import {
    ORACLE_DDL_TABULAR_ONELINE_CLAUSES as tabularOnelineClauses,
    ORACLE_STANDARD_ONELINE_CLAUSES as standardOnelineClauses,
    ORACLE_RESERVED_CLAUSES as reservedClauses,
    ORACLE_RESERVED_SET_OPERATIONS as reservedSetOperations,
    ORACLE_RESERVED_JOINS as reservedJoins,
    ORACLE_RESERVED_KEYWORD_PHRASES as reservedKeywordPhrases,
    ORACLE_OPERATORS as operators,
} from "../oracleDdlBase";

// Oracle SQL dialect options.
// Reference: https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SQL-Statements.html

const reservedSelect = expandPhrases(["SELECT [ALL | DISTINCT | UNIQUE]"]);

const reservedDataTypePhrases = expandPhrases([]);

// https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SQL-Statements.html
export const oracle: DialectOptions = {
    name: "oracle",
    tokenizerOptions: {
        reservedSelect,
        reservedClauses: [...reservedClauses, ...standardOnelineClauses, ...tabularOnelineClauses],
        reservedSetOperations,
        reservedJoins,
        reservedKeywordPhrases,
        reservedDataTypePhrases,
        reservedKeywords: keywords,
        reservedDataTypes: dataTypes,
        reservedFunctionNames: functions,
        // Oracle string types:
        // - ''-qq-bs: standard single-quoted strings with '' and \ escaping
        // - N''-qq-bs: National character string (N prefix)
        // - q'': Oracle alternative quoting mechanism (q'[...]', q'{...}', q'<...>', q'(...)', q'!...!')
        //   Supported via the prebuilt "q''" quote pattern (buildQStringPatterns).
        stringTypes: ["''-qq-bs", { quote: "''-qq-bs", prefixes: ["N"], requirePrefix: false }, "q''"],
        // Oracle identifier types:
        // - ""-qq: double-quoted identifiers (SQL standard, Oracle default)
        identTypes: ['""-qq'],
        // Oracle variables:
        // - :name: bind variables (e.g., :1, :emp_id)
        // - &name: substitution variables (SQL*Plus / SQL Developer)
        variableTypes: [{ regex: ":[A-Za-z0-9_.$]+" }, { regex: "&[A-Za-z0-9_.$]+" }],
        paramTypes: { named: [":"], positional: false },
        lineCommentTypes: ["--"],
        operators,
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
};
