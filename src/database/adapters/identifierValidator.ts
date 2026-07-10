/**
 * Shared identifier validation helper.
 *
 * Extracted so that both {@link BaseDatabaseAdapter} (which exposes it as a
 * protected method for top-level adapters) and the standalone schema
 * sub-adapters ({@link MysqlSchemaAdapter}, {@link OracleSchemaAdapter},
 * {@link SqlServerSchemaAdapter}, ...) can share a single implementation
 * without the schema sub-adapters having to inherit from
 * {@link BaseDatabaseAdapter}.
 *
 * The dialect-specific maximum identifier length is passed in by the caller:
 *   - MySQL / StarRocks: 64
 *   - Oracle / Dameng / SQL Server: 128
 *   - PostgreSQL: no fixed cap (callers pass a large value or skip length)
 *
 * @throws Error when the identifier is empty, too long, or contains a NUL
 *     byte.
 */
export function validateIdentifier(identifier: string, maxLength = 128): void {
    if (!identifier || typeof identifier !== "string") {
        throw new Error("Invalid identifier: identifier must be a non-empty string");
    }
    if (identifier.length > maxLength) {
        throw new Error("Invalid identifier: identifier exceeds maximum length");
    }
    // eslint-disable-next-line no-control-regex
    if (/\u0000/.test(identifier)) {
        throw new Error("Invalid identifier: identifier contains null bytes");
    }
}
