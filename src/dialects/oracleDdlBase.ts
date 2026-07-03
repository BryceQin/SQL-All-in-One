import { expandPhrases } from "./expandPhrases"

/**
 * Shared Oracle-compatible DDL clause lists.
 *
 * Both the Oracle and Dameng dialects derive their `tabularOnelineClauses`
 * (and the Oracle-PL/SQL statement block) from this common base. Dameng
 * retains Oracle-compatible syntax (CONNECT BY / DUAL / PL/SQL blocks) but
 * adds its own extensions (TOP / LIMIT); the dialect-specific extensions
 * are appended by the caller after spreading this base.
 *
 * Keeping the shared 200+ line DDL list in one place eliminates the
 * copy-paste drift between oracle.formatter.ts and dameng.formatter.ts.
 */
export const ORACLE_DDL_TABULAR_ONELINE_CLAUSES = expandPhrases([
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

/**
 * Standard one-line clauses shared by Oracle and Dameng.
 */
export const ORACLE_STANDARD_ONELINE_CLAUSES = expandPhrases([
    "CREATE [GLOBAL TEMPORARY] TABLE",
    "CREATE [GLOBAL TEMPORARY] TABLE [IF NOT EXISTS]",
])

/**
 * Shared Oracle/Dameng reserved clauses (WITH/FROM/WHERE/...).
 * Dameng appends `LIMIT` and uses a `[TOP]` select form.
 */
export const ORACLE_RESERVED_CLAUSES = expandPhrases([
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

/**
 * Shared Oracle/Dameng set operations, joins, keyword phrases.
 */
export const ORACLE_RESERVED_SET_OPERATIONS = expandPhrases([
    "UNION [ALL]",
    "INTERSECT",
    "MINUS",
])

export const ORACLE_RESERVED_JOINS = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT | FULL} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "NATURAL [INNER] JOIN",
    "NATURAL {LEFT | RIGHT | FULL} [OUTER] JOIN",
])

export const ORACLE_RESERVED_KEYWORD_PHRASES = expandPhrases([
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

/**
 * Shared Oracle/Dameng operators.
 */
export const ORACLE_OPERATORS = [
    "||", // string concatenation
    ":=", // assignment (PL/SQL)
    "**", // exponentiation
    "(+)", // old-style outer join operator
    "..", // range operator (PL/SQL)
    "%", // attribute / modulo
    "@", // database link separator
]
