/**
 * System database/schema names per SQL dialect.
 *
 * These are used to filter system databases out of the database explorer tree
 * when the user has not opted into showing them.
 *
 * All entries are returned in lower-case form so callers can safely compare
 * against a lower-cased database name regardless of the dialect's native casing
 * rules (e.g. Oracle's `SYS`/`SYSTEM` schemas).
 */

/**
 * Get the list of system database (or schema) names for the given dialect.
 *
 * The returned names are lower-cased so that callers can perform case-insensitive
 * comparisons by lower-casing the candidate name as well.
 *
 * @param dialect - The SQL dialect identifier (e.g. 'mysql', 'postgresql').
 * @returns Lower-cased system database names for the dialect. For dialects that
 * do not have a system database concept (e.g. SQLite) an empty array is returned.
 */
export function getSystemDatabases(dialect: string): string[] {
    switch (dialect) {
        case "mysql":
            return ["information_schema", "mysql", "performance_schema", "sys"];
        case "starrocks":
            // StarRocks does not ship the MySQL system schemas
            // (mysql / performance_schema / sys) but exposes its own
            // stats/audit schemas.
            return ["information_schema", "_statistics_", "starrocks_audit_db__"];
        case "postgresql":
            return ["postgres", "template0", "template1", "pg_catalog"];
        case "sqlserver":
            return ["master", "model", "msdb", "tempdb", "resource"];
        case "oracle":
        case "dameng":
            return [
                "sys",
                "system",
                "outln",
                "dbsnmp",
                "appqossys",
                "dbsfwmp",
                "remote_scheduler_agent",
                "sysbackup",
                "sysdg",
                "syskm",
                "sysrac",
                "audsys",
                "gsmadmin_internal",
                "anonymous",
                "ctxsys",
                "dvsys",
                "lbacsys",
                "mdsys",
                "orddata",
                "ordsys",
                "wmsys",
                "xdb",
            ];
        case "sqlite":
            return [];
        default:
            return ["information_schema", "mysql", "performance_schema", "sys", "pg_catalog"];
    }
}
