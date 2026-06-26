import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../../formatter/expandPhrases"
import { dataTypes, keywords } from "./oracle.keywords"
import { functions } from "./oracle.functions"

// Oracle SQL dialect options.
// Reference: https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SQL-Statements.html

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
    "OFFSET",
    "FETCH FIRST",
    "FETCH NEXT",
    "FOR UPDATE",
    "FOR UPDATE OF",
    // Oracle hierarchical query clauses
    "CONNECT BY",
    "CONNECT BY NOCYCLE",
    "START WITH",
    // Oracle flashback query clauses
    "AS OF",
    "VERSIONS BETWEEN",
    "VERSIONS BETWEEN TIMESTAMP",
    "VERSIONS BETWEEN SCN",
    // Data manipulation
    // - insert:
    "INSERT [INTO]",
    "VALUES",
    "INTO",
    // - update:
    "SET",
    // - merge:
    "MERGE [INTO]",
    "USING",
    "ON",
    "WHEN MATCHED [THEN]",
    "WHEN NOT MATCHED [THEN]",
    "WHEN NOT MATCHED BY TARGET [THEN]",
    // - returning
    "RETURNING",
    "RETURNING INTO",
    "BULK COLLECT INTO",
    "RETURNING BULK COLLECT INTO",
])

const standardOnelineClauses = expandPhrases([
    "CREATE [GLOBAL TEMPORARY] TABLE",
    "CREATE [GLOBAL TEMPORARY] TABLE [IF NOT EXISTS]",
])

const tabularOnelineClauses = expandPhrases([
    // - create:
    "CREATE [OR REPLACE] [NO FORCE] VIEW",
    "CREATE [OR REPLACE] [EDITIONING] VIEW",
    // - update:
    "UPDATE",
    // - delete:
    "DELETE FROM",
    // - drop table:
    "DROP TABLE [IF EXISTS]",
    // - alter table:
    "ALTER TABLE",
    "ADD [COLUMN]",
    "MODIFY [COLUMN]",
    "DROP [COLUMN]",
    "RENAME [TO]",
    "RENAME COLUMN",
    "ALTER [COLUMN]",
    // - truncate:
    "TRUNCATE [TABLE]",
    // Oracle DDL and statements
    // https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SQL-Statements.html
    "ALTER DATABASE",
    "ALTER INDEX",
    "ALTER MATERIALIZED VIEW",
    "ALTER MATERIALIZED VIEW LOG",
    "ALTER PROCEDURE",
    "ALTER PACKAGE",
    "ALTER PACKAGE BODY",
    "ALTER FUNCTION",
    "ALTER SEQUENCE",
    "ALTER SESSION",
    "ALTER SYNONYM",
    "ALTER TABLE",
    "ALTER TABLESPACE",
    "ALTER TRIGGER",
    "ALTER TYPE",
    "ALTER USER",
    "ALTER VIEW",
    "ANALYZE",
    "ANALYZE TABLE",
    "ANALYZE INDEX",
    "ANALYZE CLUSTER",
    "ASSOCIATE STATISTICS",
    "AUDIT",
    "COMMENT",
    "COMMENT ON TABLE",
    "COMMENT ON COLUMN",
    "COMMIT",
    "CREATE CLUSTER",
    "CREATE CONTEXT",
    "CREATE CONTROL FILE",
    "CREATE DATABASE",
    "CREATE DATABASE LINK",
    "CREATE DIMENSION",
    "CREATE DIRECTORY",
    "CREATE FUNCTION",
    "CREATE INDEX",
    "CREATE INDEXTYPE",
    "CREATE JAVA",
    "CREATE LIBRARY",
    "CREATE MATERIALIZED VIEW",
    "CREATE MATERIALIZED VIEW LOG",
    "CREATE OPERATOR",
    "CREATE OUTLINE",
    "CREATE PACKAGE",
    "CREATE PACKAGE BODY",
    "CREATE PFILE",
    "CREATE PROCEDURE",
    "CREATE PROFILE",
    "CREATE RESTORE POINT",
    "CREATE ROLE",
    "CREATE ROLLBACK SEGMENT",
    "CREATE SCHEMA",
    "CREATE SEQUENCE",
    "CREATE SPFILE",
    "CREATE SYNONYM",
    "CREATE TABLE",
    "CREATE TABLESPACE",
    "CREATE TRIGGER",
    "CREATE TYPE",
    "CREATE TYPE BODY",
    "CREATE USER",
    "CREATE VIEW",
    "DISASSOCIATE STATISTICS",
    "DROP CLUSTER",
    "DROP CONTEXT",
    "DROP DATABASE",
    "DROP DATABASE LINK",
    "DROP DIMENSION",
    "DROP DIRECTORY",
    "DROP FUNCTION",
    "DROP INDEX",
    "DROP INDEXTYPE",
    "DROP JAVA",
    "DROP LIBRARY",
    "DROP MATERIALIZED VIEW",
    "DROP MATERIALIZED VIEW LOG",
    "DROP OPERATOR",
    "DROP OUTLINE",
    "DROP PACKAGE",
    "DROP PACKAGE BODY",
    "DROP PROCEDURE",
    "DROP PROFILE",
    "DROP RESTORE POINT",
    "DROP ROLE",
    "DROP ROLLBACK SEGMENT",
    "DROP SEQUENCE",
    "DROP SYNONYM",
    "DROP TABLE",
    "DROP TABLESPACE",
    "DROP TRIGGER",
    "DROP TYPE",
    "DROP TYPE BODY",
    "DROP USER",
    "DROP VIEW",
    "EXPLAIN PLAN",
    "FLASHBACK DATABASE",
    "FLASHBACK TABLE",
    "FLASHBACK TABLE TO TIMESTAMP",
    "FLASHBACK TABLE TO SCN",
    "FLASHBACK TABLE TO BEFORE DROP",
    "GRANT",
    "LOCK TABLE",
    "NOAUDIT",
    "PURGE",
    "PURGE TABLE",
    "PURGE INDEX",
    "PURGE TABLESPACE",
    "PURGE RECYCLEBIN",
    "PURGE DBA_RECYCLEBIN",
    "REVOKE",
    "ROLLBACK",
    "SAVEPOINT",
    "SET CONSTRAINTS",
    "SET ROLE",
    "SET TRANSACTION",
    "TRUNCATE TABLE",
    "TRUNCATE CLUSTER",
    // PL/SQL blocks
    "BEGIN",
    "DECLARE",
    "CALL",
    "EXECUTE",
    "EXECUTE IMMEDIATE",
    // Oracle specific clauses
    "CONNECT BY",
    "START WITH",
    "MODEL",
    "MODEL DIMENSION BY",
    "MODEL PARTITION BY",
    "MODEL MEASURES",
    "MODEL RULES",
    "FOR UPDATE WAIT",
    "FOR UPDATE NOWAIT",
    "FOR UPDATE SKIP LOCKED",
    "RETURNING INTO",
    "BULK COLLECT INTO",
    "RETURNING BULK COLLECT INTO",
    "PIVOT",
    "UNPIVOT",
    "MATCH_RECOGNIZE",
    "ORDER SIBLINGS BY",
    "GROUPING SETS",
    "ROLLUP",
    "CUBE",
])

const reservedSetOperations = expandPhrases([
    "UNION [ALL]",
    "INTERSECT",
    "MINUS",
])

const reservedJoins = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT | FULL} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "NATURAL [INNER] JOIN",
    "NATURAL {LEFT | RIGHT | FULL} [OUTER] JOIN",
])

const reservedKeywordPhrases = expandPhrases([
    "ON {UPDATE | DELETE} [SET NULL]",
    "{ROWS | RANGE} BETWEEN",
    "CONNECT BY ROOT",
    "CONNECT_BY_ROOT",
    "CONNECT_BY_ISLEAF",
    "CONNECT_BY_ISCYCLE",
    "WITHIN GROUP",
    "PIVOT XML",
    "UNPIVOT XML",
])

const reservedDataTypePhrases = expandPhrases([])

// https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SQL-Statements.html
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
        // Oracle string types:
        // - ''-qq-bs: standard single-quoted strings with '' and \ escaping
        // - N''-qq-bs: National character string (N prefix)
        // - q'': Oracle alternative quoting mechanism (q'[...]', q'{...}', q'<...>', q'(...)', q'!...!')
        //   Supported via the prebuilt "q''" quote pattern (buildQStringPatterns).
        stringTypes: [
            "''-qq-bs",
            { quote: "''-qq-bs", prefixes: ["N"], requirePrefix: false },
            "q''",
        ],
        // Oracle identifier types:
        // - ""-qq: double-quoted identifiers (SQL standard, Oracle default)
        identTypes: ['""-qq'],
        // Oracle variables:
        // - :name: bind variables (e.g., :1, :emp_id)
        // - &name: substitution variables (SQL*Plus / SQL Developer)
        variableTypes: [
            { regex: ":[A-Za-z0-9_.$]+" },
            { regex: "&[A-Za-z0-9_.$]+" },
        ],
        paramTypes: { named: [":"], positional: false },
        lineCommentTypes: ["--"],
        operators: [
            "||", // string concatenation
            ":=", // assignment (PL/SQL)
            "**", // exponentiation
            "(+)", // old-style outer join operator
            "..", // range operator (PL/SQL)
            "%", // attribute / modulo
            "@", // database link separator
        ],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}
