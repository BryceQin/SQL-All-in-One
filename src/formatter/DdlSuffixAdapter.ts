import { escapeRegExp } from "../lexer/regexUtil";
import { SqlTextScanner } from "../utils/sqlTextScanner";

export interface DdlSuffixSlot {
    id: string;
    original: string;
}

/**
 * node-sql-parser's Hive/MySQL grammars reject dialect-specific trailing DDL
 * clauses (Hive STORED AS / ROW FORMAT, Spark USING / PARTITIONED BY,
 * StarRocks DISTRIBUTED BY / PROPERTIES). Replacing each clause with a bare
 * placeholder yields unparseable SQL; instead the whole trailing suffix is
 * replaced with one valid `COMMENT '<id>'` table option, the header/columns
 * are formatted by the AST formatter, and the original suffix is appended back.
 */
export interface CreateTableBody {
    /** Index right after the column list (or 0 when there is no column list). */
    headerEnd: number;
    /** Index where the suffix search must stop (top-level AS/LIKE or end). */
    searchEnd: number;
}

export function analyzeCreateTableBody(text: string): CreateTableBody {
    let headerEnd = -1;
    let searchEnd = text.length;
    let previousWord = "";
    let i = 0;

    while (i < text.length) {
        const ch = text[i];

        if (ch === "'" || ch === '"' || ch === "`") {
            i = skipQuoted(text, i);
            continue;
        }

        if (ch === "(") {
            if (headerEnd < 0) {
                headerEnd = skipParenthesized(text, i);
                i = headerEnd;
                continue;
            }
            i++;
            continue;
        }

        if (/[A-Za-z_]/.test(ch) && (i === 0 || !/[\w$]/.test(text[i - 1]))) {
            const word = /^[A-Za-z_]+/.exec(text.slice(i))![0];
            const upper = word.toUpperCase();
            if (upper === "AS" || upper === "LIKE") {
                // `STORED AS` is a storage clause, not the CTAS separator.
                if (upper === "AS" && previousWord.toUpperCase() === "STORED") {
                    previousWord = upper;
                    i += word.length;
                    continue;
                }
                if (headerEnd < 0) headerEnd = 0;
                searchEnd = i;
                break;
            }
            previousWord = upper;
            i += word.length;
            continue;
        }

        i++;
    }

    if (headerEnd < 0) headerEnd = 0;
    return { headerEnd, searchEnd };
}

export function extractDdlSuffix(
    sql: string,
    createTablePattern: RegExp,
    clausePatterns: RegExp[],
    nextId: () => string,
): { processedSql: string; slots: DdlSuffixSlot[] } {
    const slots: DdlSuffixSlot[] = [];
    let result = sql;

    createTablePattern.lastIndex = 0;
    const matches: { index: number; length: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = createTablePattern.exec(result)) !== null) {
        matches.push({ index: match.index, length: match[0].length });
    }

    // Edit from the end so earlier match offsets stay valid.
    for (let i = matches.length - 1; i >= 0; i--) {
        const { index, length } = matches[i];
        const stmtEnd = SqlTextScanner.findStatementEnd(result, index + length);
        const afterCreate = result.substring(index + length, stmtEnd);
        const body = analyzeCreateTableBody(afterCreate);
        const region = afterCreate.substring(body.headerEnd, body.searchEnd);
        const clauseOffset = findEarliestClause(region, clausePatterns);
        if (clauseOffset < 0) continue;

        const suffixStart = index + length + body.headerEnd + clauseOffset;
        const suffix = result.substring(suffixStart, index + length + body.searchEnd).trim();
        if (!suffix) continue;

        const id = nextId();
        slots.push({ id, original: suffix });

        const before = result.substring(0, suffixStart).replace(/\s+$/, "");
        const rest = result.substring(index + length + body.searchEnd);
        const separator = rest && !/^\s/.test(rest) ? " " : "";
        result = `${before} COMMENT '${id}'${separator}${rest}`;
    }

    return { processedSql: result, slots };
}

export function restoreDdlSuffix(formatted: string, slots: DdlSuffixSlot[]): string {
    let result = formatted;

    for (const slot of slots) {
        const id = escapeRegExp(slot.id);
        const commentPattern = new RegExp(`COMMENT\\s+['"\`]${id}['"\`]`, "gi");
        const restored = result.replace(commentPattern, () => slot.original);
        if (restored !== result) {
            result = restored;
            continue;
        }
        // Some dialects may print the placeholder without the COMMENT wrapper.
        const barePattern = new RegExp(`\`?${id}\`?`, "gi");
        result = result.replace(barePattern, () => slot.original);
    }

    return result;
}

function findEarliestClause(region: string, patterns: RegExp[]): number {
    let earliest = -1;
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(region);
        if (match && (earliest < 0 || match.index < earliest)) {
            earliest = match.index;
        }
    }
    return earliest;
}

function skipQuoted(text: string, start: number): number {
    const quote = text[start];
    let i = start + 1;
    while (i < text.length) {
        if (text[i] === "\\") {
            i += 2;
            continue;
        }
        if (text[i] === quote) {
            if (text[i + 1] === quote) {
                i += 2;
                continue;
            }
            return i + 1;
        }
        i++;
    }
    return text.length;
}

function skipParenthesized(text: string, start: number): number {
    let depth = 0;
    let i = start;
    while (i < text.length) {
        const ch = text[i];
        if (ch === "'" || ch === '"' || ch === "`") {
            i = skipQuoted(text, i);
            continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") {
            depth--;
            if (depth === 0) return i + 1;
        }
        i++;
    }
    return text.length;
}
