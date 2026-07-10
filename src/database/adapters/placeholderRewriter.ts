/**
 * Shared `?`-placeholder rewrite parser used by Oracle (`:1, :2, …`) and
 * SQL Server (`@p1, @p2, …`) query adapters.
 *
 * Both dialects receive SQL with positional `?` placeholders (the shape
 * produced by the upstream query layer) but their drivers require named
 * placeholders. The quote-state-tracking loop body is byte-for-byte
 * identical between the two adapters; only the replacement target differs.
 * Centralising it here removes ~25 LOC of duplication and ensures any future
 * fix to string-literal / comment handling lands in one place.
 */

/**
 * Rewrite `?` placeholders in `sql` using `nameForIndex(1-based-index)` to
 * produce the replacement token for each placeholder, in order.
 *
 * Skips `?` characters that appear inside single-quoted string literals
 * (`'...'` with `''` escape). `?` characters beyond the available parameter
 * count (i.e. when `nameForIndex` returns `undefined`) are left as `?`.
 *
 * @returns The rewritten SQL and the 1-based indexes of the placeholders
 *          that were replaced, in replacement order. Callers that need to
 *          collect bind values (Oracle) iterate the indexes; callers that
 *          pre-computed names (SQL Server) pass `nameForIndex` that closes
 *          over their `paramNames` array and ignore the returned indexes.
 */
export function replaceQuestionMarkPlaceholders(
    sql: string,
    nameForIndex: (index: number) => string | undefined,
): { sql: string; consumedIndexes: number[] } {
    let result = "";
    const consumedIndexes: number[] = [];
    let paramIndex = 0;
    let inString = false;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];

        if (ch === "'") {
            // Toggle string state (handle escaped '' inside strings).
            if (inString && sql[i + 1] === "'") {
                result += "''";
                i++;
                continue;
            }
            inString = !inString;
            result += ch;
            continue;
        }

        if (ch === "?" && !inString) {
            paramIndex++;
            const replacement = nameForIndex(paramIndex);
            if (replacement !== undefined) {
                result += replacement;
                consumedIndexes.push(paramIndex);
            } else {
                // No matching parameter; preserve the `?` and rewind the
                // counter so the next `?` also tries the same slot.
                paramIndex--;
                result += ch;
            }
            continue;
        }

        result += ch;
    }

    return { sql: result, consumedIndexes };
}
