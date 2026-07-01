import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../expandPhrases"
import { dataTypes, keywords } from "./dameng.keywords"
import { functions } from "./dameng.functions"

// Dameng (DM) SQL dialect options.
// Derived from the Oracle dialect, retaining Oracle-compatible syntax
// (CONNECT BY / ROWNUM / DUAL / || / :=, etc.) and adding Dameng-specific
// syntax (SELECT TOP n, LIMIT clause).
// References:
// - Oracle SQL: https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SQL-Statements.html
// - Dameng SQL Language Manual: https://eco.dameng.com/document/dm/zh-cn/sql-reference
// Note: Dameng has limited support for the Oracle q'[...]' alternative quoting
// mechanism, so the related configuration has been removed.

const reservedSelect = expandPhrases(["SELECT [ALL | DISTINCT | UNIQUE] [TOP]"])

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
    // LIMIT clause (Dameng MySQL-compatibility mode)
    "LIMIT",
    "FOR UPDATE",
    "FOR UPDATE OF",
    // Oracle hierarchical query clauses (Dameng-compatible)
    "CONNECT BY",
    "CONNECT BY NOCYCLE",
    "START WITH",
    // Oracle flashback query clauses (Dameng-compatible)
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
    // Oracle-compatible DDL and statements (retained by Dameng)
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
    // PL/SQL blocks (Dameng-compatible)
    "BEGIN",
    "DECLARE",
    "CALL",
    "EXECUTE",
    "EXECUTE IMMEDIATE",
    // Oracle specific clauses (Dameng-compatible)
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
    // Dameng-specific: TOP clause (Dameng 8 supports SELECT TOP n)
    "TOP",
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
        operators: [
            "||", // string concatenation (Oracle-compatible)
            ":=", // assignment (PL/SQL-compatible)
            "**", // exponentiation
            "(+)", // legacy outer-join operator
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
