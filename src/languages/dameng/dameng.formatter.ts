import type { DialectOptions } from "../dialect"
import { expandPhrases } from "../../formatter/expandPhrases"
import { dataTypes, keywords } from "./dameng.keywords"
import { functions } from "./dameng.functions"

// 达梦数据库（DM）SQL dialect options.
// 基于 Oracle 方言派生，保留 Oracle 兼容语法（CONNECT BY / ROWNUM / DUAL / || / := 等），
// 增补达梦特有语法（SELECT TOP n、LIMIT 子句）。
// 参考：
// - Oracle SQL：https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SQL-Statements.html
// - 达梦 SQL 语言手册：https://eco.dameng.com/document/dm/zh-cn/sql-reference
// 注意：达梦对 q'[...]' 替代引号机制支持有限，因此移除相关配置。

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
    // 达梦兼容 MySQL 模式时的 LIMIT 子句
    "LIMIT",
    "FOR UPDATE",
    "FOR UPDATE OF",
    // Oracle hierarchical query clauses（达梦兼容）
    "CONNECT BY",
    "CONNECT BY NOCYCLE",
    "START WITH",
    // Oracle flashback query clauses（达梦兼容）
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
    // Oracle 兼容 DDL 与语句（达梦保留支持）
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
    // PL/SQL blocks（达梦兼容）
    "BEGIN",
    "DECLARE",
    "CALL",
    "EXECUTE",
    "EXECUTE IMMEDIATE",
    // Oracle specific clauses（达梦兼容）
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
    // 达梦特有：TOP 子句（达梦 8 支持 SELECT TOP n）
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
        // 达梦字符串类型：
        // - ''-qq-bs: 标准单引号字符串，支持 '' 和 \ 转义
        // - N''-qq-bs: 国家字符集字符串（N 前缀）
        // 注意：达梦对 Oracle 的 q'[...]' 替代引号机制支持有限，已移除相关配置。
        stringTypes: [
            "''-qq-bs",
            { quote: "''-qq-bs", prefixes: ["N"], requirePrefix: false },
        ],
        // 达梦标识符类型：
        // - ""-qq: 双引号标识符（SQL 标准，达梦默认）
        identTypes: ['""-qq'],
        // 达梦变量：
        // - :name: 绑定变量（例如 :1, :emp_id）
        // - &name: 替换变量
        variableTypes: [
            { regex: ":[A-Za-z0-9_.$]+" },
            { regex: "&[A-Za-z0-9_.$]+" },
        ],
        paramTypes: { named: [":"], positional: false },
        lineCommentTypes: ["--"],
        operators: [
            "||", // 字符串拼接（Oracle 兼容）
            ":=", // 赋值（PL/SQL 兼容）
            "**", // 指数运算
            "(+)", // 旧式外连接操作符
            "..", // 范围操作符（PL/SQL）
            "%", // 属性 / 取模
            "@", // 数据库链接分隔符
        ],
    },
    formatOptions: {
        onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
        tabularOnelineClauses,
    },
}
