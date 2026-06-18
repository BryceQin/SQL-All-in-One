const SINGLE_QUOTE_REGEX = /'/g;

export function formatSqlValue(value: unknown): string {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }
    if (value instanceof Date) {
        return `'${value.toISOString()}'`;
    }
    return `'${String(value).replace(SINGLE_QUOTE_REGEX, "''")}'`;
}
