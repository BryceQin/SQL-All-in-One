"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = void 0;
const expandPhrases_1 = require("../../formatter/expandPhrases");
const sql_functions_1 = require("./sql.functions");
const sql_keywords_1 = require("./sql.keywords");
const reservedSelect = (0, expandPhrases_1.expandPhrases)(["SELECT [ALL | DISTINCT]"]);
const reservedClauses = (0, expandPhrases_1.expandPhrases)([
    // queries
    "WITH [RECURSIVE]",
    "FROM",
    "WHERE",
    "GROUP BY [ALL | DISTINCT]",
    "HAVING",
    "WINDOW",
    "PARTITION BY",
    "ORDER BY",
    "LIMIT",
    "OFFSET",
    "FETCH {FIRST | NEXT}",
    // Data manipulation
    // - insert:
    "INSERT INTO",
    "VALUES",
    // - update:
    "SET",
]);
const standardOnelineClauses = (0, expandPhrases_1.expandPhrases)([
    "CREATE [GLOBAL TEMPORARY | LOCAL TEMPORARY] TABLE",
]);
const tabularOnelineClauses = (0, expandPhrases_1.expandPhrases)([
    // - create:
    "CREATE [RECURSIVE] VIEW",
    // - update:
    "UPDATE",
    "WHERE CURRENT OF",
    // - delete:
    "DELETE FROM",
    // - drop table:
    "DROP TABLE",
    // - alter table:
    "ALTER TABLE",
    "ADD COLUMN",
    "DROP [COLUMN]",
    "RENAME COLUMN",
    "RENAME TO",
    "ALTER [COLUMN]",
    "{SET | DROP} DEFAULT", // for alter column
    "ADD SCOPE", // for alter column
    "DROP SCOPE {CASCADE | RESTRICT}", // for alter column
    "RESTART WITH", // for alter column
    // - truncate:
    "TRUNCATE TABLE",
    // other
    "SET SCHEMA",
]);
const reservedSetOperations = (0, expandPhrases_1.expandPhrases)([
    "UNION [ALL | DISTINCT]",
    "EXCEPT [ALL | DISTINCT]",
    "INTERSECT [ALL | DISTINCT]",
]);
const reservedJoins = (0, expandPhrases_1.expandPhrases)([
    "JOIN",
    "{LEFT | RIGHT | FULL} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "NATURAL [INNER] JOIN",
    "NATURAL {LEFT | RIGHT | FULL} [OUTER] JOIN",
]);
const reservedKeywordPhrases = (0, expandPhrases_1.expandPhrases)([
    "ON {UPDATE | DELETE} [SET NULL | SET DEFAULT]",
    "{ROWS | RANGE} BETWEEN",
]);
const reservedDataTypePhrases = (0, expandPhrases_1.expandPhrases)([]);
exports.sql = {
    name: "sql",
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
        reservedKeywords: sql_keywords_1.keywords,
        reservedDataTypes: sql_keywords_1.dataTypes,
        reservedFunctionNames: sql_functions_1.functions,
        stringTypes: [
            { quote: "''-qq-bs", prefixes: ["N", "U&"] },
            { quote: "''-raw", prefixes: ["X"], requirePrefix: true },
        ],
        identTypes: [`""-qq`, "``"],
        paramTypes: { positional: true },
        operators: ["||"],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
};
//# sourceMappingURL=sql.formatter.js.map