// Shared constants and helpers used by all MySQL-protocol compatible
// SQL dialects (MySQL, StarRocks, MariaDB, ...).
//
// These dialects share an identical tokenizer configuration except for
// a handful of dialect-specific DDL clauses. By extracting the shared
// pieces here we avoid duplicating hundreds of lines of configuration
// across the dialect formatter files.

import { expandPhrases } from "../formatter/expandPhrases"
import type {
    IdentChars,
    ParamTypes,
    QuoteType,
    VariableType,
} from "../lexer/TokenizerOptions"
import type { Token } from "../lexer/token"
import { EOF_TOKEN, isToken, TokenType } from "../lexer/token"

// Shared post-processing of the token stream.
//
// MySQL and its protocol-compatible derivatives both need to distinguish
// between the SET data type / SET statement and the VALUES() function /
// VALUES clause based on surrounding tokens.
export function postProcess(tokens: Token[]): Token[] {
    return tokens.map((token, i) => {
        const nextToken = tokens[i + 1] || EOF_TOKEN
        if (isToken.SET(token) && nextToken.text === "(") {
            // This is SET datatype, not SET statement
            return { ...token, type: TokenType.RESERVED_FUNCTION_NAME }
        }
        const prevToken = tokens[i - 1] || EOF_TOKEN
        if (isToken.VALUES(token) && prevToken.text === "=") {
            // This is VALUES() function, not VALUES clause
            return { ...token, type: TokenType.RESERVED_FUNCTION_NAME }
        }
        return token
    })
}

// SELECT clause shared by MySQL-protocol dialects.
export const baseReservedSelect = expandPhrases([
    "SELECT [ALL | DISTINCT | DISTINCTROW]",
])

// Reserved clauses shared by MySQL-protocol dialects (WITH, FROM, WHERE,
// GROUP BY, HAVING, ..., INSERT, REPLACE, VALUES, ON DUPLICATE KEY UPDATE,
// SET, etc.).
export const baseReservedClauses = expandPhrases([
    // queries
    "WITH [RECURSIVE]",
    "FROM",
    "WHERE",
    "GROUP BY",
    "HAVING",
    "WINDOW",
    "PARTITION BY",
    "ORDER BY",
    "LIMIT",
    "OFFSET",
    // Data manipulation
    // - insert:
    "INSERT [LOW_PRIORITY | DELAYED | HIGH_PRIORITY] [IGNORE] [INTO]",
    "REPLACE [LOW_PRIORITY | DELAYED] [INTO]",
    "VALUES",
    "ON DUPLICATE KEY UPDATE",
    // - update:
    "SET",
])

// Standard one-line clauses shared by MySQL-protocol dialects.
export const baseStandardOnelineClauses = expandPhrases([
    "CREATE [TEMPORARY] TABLE [IF NOT EXISTS]",
])

// Base one-line tabular clauses shared by MySQL-protocol dialects.
//
// StarRocks and any other MySQL-protocol derivative can extend this array
// with their own dialect-specific clauses (see starrocks.formatter.ts for
// an example).
export const baseTabularOnelineClauses = expandPhrases([
    // - create:
    "CREATE [OR REPLACE] [SQL SECURITY DEFINER | SQL SECURITY INVOKER] VIEW [IF NOT EXISTS]",
    // - update:
    "UPDATE [LOW_PRIORITY] [IGNORE]",
    // - delete:
    "DELETE [LOW_PRIORITY] [QUICK] [IGNORE] FROM",
    // - drop table:
    "DROP [TEMPORARY] TABLE [IF EXISTS]",
    // - alter table:
    "ALTER TABLE",
    "ADD [COLUMN]",
    "{CHANGE | MODIFY} [COLUMN]",
    "DROP [COLUMN]",
    "RENAME [TO | AS]",
    "RENAME COLUMN",
    "ALTER [COLUMN]",
    "{SET | DROP} DEFAULT", // for alter column
    // - truncate:
    "TRUNCATE [TABLE]",
    // https://dev.mysql.com/doc/refman/8.0/en/sql-statements.html
    "ALTER DATABASE",
    "ALTER EVENT",
    "ALTER FUNCTION",
    "ALTER INSTANCE",
    "ALTER LOGFILE GROUP",
    "ALTER PROCEDURE",
    "ALTER RESOURCE GROUP",
    "ALTER SERVER",
    "ALTER TABLESPACE",
    "ALTER USER",
    "ALTER VIEW",
    "ANALYZE TABLE",
    "BINLOG",
    "CACHE INDEX",
    "CALL",
    "CHANGE MASTER TO",
    "CHANGE REPLICATION FILTER",
    "CHANGE REPLICATION SOURCE TO",
    "CHECK TABLE",
    "CHECKSUM TABLE",
    "CLONE",
    "COMMIT",
    "CREATE DATABASE",
    "CREATE EVENT",
    "CREATE FUNCTION",
    "CREATE FUNCTION",
    "CREATE INDEX",
    "CREATE LOGFILE GROUP",
    "CREATE PROCEDURE",
    "CREATE RESOURCE GROUP",
    "CREATE ROLE",
    "CREATE SERVER",
    "CREATE SPATIAL REFERENCE SYSTEM",
    "CREATE TABLESPACE",
    "CREATE TRIGGER",
    "CREATE USER",
    "DEALLOCATE PREPARE",
    "DESCRIBE",
    "DROP DATABASE",
    "DROP EVENT",
    "DROP FUNCTION",
    "DROP FUNCTION",
    "DROP INDEX",
    "DROP LOGFILE GROUP",
    "DROP PROCEDURE",
    "DROP RESOURCE GROUP",
    "DROP ROLE",
    "DROP SERVER",
    "DROP SPATIAL REFERENCE SYSTEM",
    "DROP TABLESPACE",
    "DROP TRIGGER",
    "DROP USER",
    "DROP VIEW",
    "EXECUTE",
    "EXPLAIN",
    "FLUSH",
    "GRANT",
    "HANDLER",
    "HELP",
    "IMPORT TABLE",
    "INSTALL COMPONENT",
    "INSTALL PLUGIN",
    "KILL",
    "LOAD DATA",
    "LOAD INDEX INTO CACHE",
    "LOAD XML",
    "LOCK INSTANCE FOR BACKUP",
    "LOCK TABLES",
    "MASTER_POS_WAIT",
    "OPTIMIZE TABLE",
    "PREPARE",
    "PURGE BINARY LOGS",
    "RELEASE SAVEPOINT",
    "RENAME TABLE",
    "RENAME USER",
    "REPAIR TABLE",
    "RESET",
    "RESET MASTER",
    "RESET PERSIST",
    "RESET REPLICA",
    "RESET SLAVE",
    "RESTART",
    "REVOKE",
    "ROLLBACK",
    "ROLLBACK TO SAVEPOINT",
    "SAVEPOINT",
    "SET CHARACTER SET",
    "SET DEFAULT ROLE",
    "SET NAMES",
    "SET PASSWORD",
    "SET RESOURCE GROUP",
    "SET ROLE",
    "SET TRANSACTION",
    "SHOW",
    "SHOW BINARY LOGS",
    "SHOW BINLOG EVENTS",
    "SHOW CHARACTER SET",
    "SHOW COLLATION",
    "SHOW COLUMNS",
    "SHOW CREATE DATABASE",
    "SHOW CREATE EVENT",
    "SHOW CREATE FUNCTION",
    "SHOW CREATE PROCEDURE",
    "SHOW CREATE TABLE",
    "SHOW CREATE TRIGGER",
    "SHOW CREATE USER",
    "SHOW CREATE VIEW",
    "SHOW DATABASES",
    "SHOW ENGINE",
    "SHOW ENGINES",
    "SHOW ERRORS",
    "SHOW EVENTS",
    "SHOW FUNCTION CODE",
    "SHOW FUNCTION STATUS",
    "SHOW GRANTS",
    "SHOW INDEX",
    "SHOW MASTER STATUS",
    "SHOW OPEN TABLES",
    "SHOW PLUGINS",
    "SHOW PRIVILEGES",
    "SHOW PROCEDURE CODE",
    "SHOW PROCEDURE STATUS",
    "SHOW PROCESSLIST",
    "SHOW PROFILE",
    "SHOW PROFILES",
    "SHOW RELAYLOG EVENTS",
    "SHOW REPLICA STATUS",
    "SHOW REPLICAS",
    "SHOW SLAVE",
    "SHOW SLAVE HOSTS",
    "SHOW STATUS",
    "SHOW TABLE STATUS",
    "SHOW TABLES",
    "SHOW TRIGGERS",
    "SHOW VARIABLES",
    "SHOW WARNINGS",
    "SHUTDOWN",
    "SOURCE_POS_WAIT",
    "START GROUP_REPLICATION",
    "START REPLICA",
    "START SLAVE",
    "START TRANSACTION",
    "STOP GROUP_REPLICATION",
    "STOP REPLICA",
    "STOP SLAVE",
    "TABLE",
    "UNINSTALL COMPONENT",
    "UNINSTALL PLUGIN",
    "UNLOCK INSTANCE",
    "UNLOCK TABLES",
    "USE",
    "XA",
    // flow control
    // 'IF',
    "ITERATE",
    "LEAVE",
    "LOOP",
    "REPEAT",
    "RETURN",
    "WHILE",
])

// Shared set operations (UNION [ALL | DISTINCT]).
export const baseReservedSetOperations = expandPhrases([
    "UNION [ALL | DISTINCT]",
])

// Shared join clauses (JOIN, LEFT/RIGHT [OUTER] JOIN, INNER/CROSS JOIN,
// NATURAL JOIN variants, plus the non-standard STRAIGHT_JOIN).
export const baseReservedJoins = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "NATURAL [INNER] JOIN",
    "NATURAL {LEFT | RIGHT} [OUTER] JOIN",
    // non-standard joins
    "STRAIGHT_JOIN",
])

// Shared multi-word reserved keyword phrases.
export const baseReservedKeywordPhrases = expandPhrases([
    "ON {UPDATE | DELETE} [SET NULL]",
    "CHARACTER SET",
    "{ROWS | RANGE} BETWEEN",
    "IDENTIFIED BY",
])

// Shared data type phrases (currently empty for MySQL-protocol dialects).
export const baseReservedDataTypePhrases = expandPhrases([])

// Shared string literal types.
export const baseStringTypes: QuoteType[] = [
    '""-qq-bs',
    { quote: "''-qq-bs", prefixes: ["N"] },
    { quote: "''-raw", prefixes: ["B", "X"], requirePrefix: true },
]

// Shared identifier types (backtick-quoted identifiers).
export const baseIdentTypes: QuoteType[] = ["``"]

// Shared identifier character rules (allow $ anywhere, including as the
// first character, and allow identifiers to start with a digit).
export const baseIdentChars: IdentChars = {
    first: "$",
    rest: "$",
    allowFirstCharNumber: true,
}

// Shared variable types (@var, @@var, @'var', @"var", @`var`).
export const baseVariableTypes: VariableType[] = [
    { regex: "@@?[A-Za-z0-9_.$]+" },
    { quote: '""-qq-bs', prefixes: ["@"], requirePrefix: true },
    { quote: "''-qq-bs", prefixes: ["@"], requirePrefix: true },
    { quote: "``", prefixes: ["@"], requirePrefix: true },
]

// Shared parameter types (positional ? placeholders).
export const baseParamTypes: ParamTypes = { positional: true }

// Shared line comment types (--, #).
export const baseLineCommentTypes: string[] = ["--", "#"]

// Shared operators (MySQL-protocol arithmetic, bitwise, logical, JSON
// access, assignment, and the non-operator *.* sequence).
export const baseOperators = [
    "%",
    ":=",
    "&",
    "|",
    "^",
    "~",
    "<<",
    ">>",
    "<=>",
    "->",
    "->>",
    "&&",
    "||",
    "!",
    "*.*", // Not actually an operator
]
