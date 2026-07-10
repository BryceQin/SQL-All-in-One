export interface CommentInfo {
    type: string;
    start: number;
    end: number;
    text: string;
}

export interface QuoteState {
    inSingleQuote: boolean;
    inDoubleQuote: boolean;
}

export function updateQuoteState(ch: string, nextCh: string | undefined, state: QuoteState): void {
    if (state.inSingleQuote) {
        if (ch === "'" && nextCh === "'") return;
        if (ch === "'") state.inSingleQuote = false;
        return;
    }
    if (state.inDoubleQuote) {
        if (ch === '"' && nextCh === '"') return;
        if (ch === '"') state.inDoubleQuote = false;
        return;
    }
    if (ch === "'") {
        state.inSingleQuote = true;
        return;
    }
    if (ch === '"') {
        state.inDoubleQuote = true;
        return;
    }
}

export class SqlTextScanner {
    static findAllComments(sql: string): CommentInfo[] {
        const comments: CommentInfo[] = [];
        let i = 0;
        const len = sql.length;
        const state: QuoteState = { inSingleQuote: false, inDoubleQuote: false };

        while (i < len) {
            const ch = sql[i];
            const nextCh = i + 1 < len ? sql[i + 1] : undefined;

            if (state.inSingleQuote || state.inDoubleQuote) {
                const prevSingle = state.inSingleQuote;
                const prevDouble = state.inDoubleQuote;
                updateQuoteState(ch, nextCh, state);
                if ((prevSingle && ch === "'" && nextCh === "'") || (prevDouble && ch === '"' && nextCh === '"')) {
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            if (ch === "-" && nextCh === "-") {
                const start = i;
                i += 2;
                while (i < len && sql[i] !== "\n") {
                    i++;
                }
                comments.push({
                    type: "line",
                    start,
                    end: i,
                    text: sql.substring(start, i),
                });
                continue;
            }

            if (ch === "/" && nextCh === "*") {
                const start = i;
                i += 2;
                while (i < len) {
                    if (sql[i] === "*" && i + 1 < len && sql[i + 1] === "/") {
                        i += 2;
                        break;
                    }
                    i++;
                }
                comments.push({
                    type: "block",
                    start,
                    end: i,
                    text: sql.substring(start, i),
                });
                continue;
            }

            updateQuoteState(ch, nextCh, state);
            i++;
        }

        return comments;
    }

    static findStatementEnd(sql: string, startIndex: number): number {
        let depth = 0;
        const state: QuoteState = { inSingleQuote: false, inDoubleQuote: false };
        let i = startIndex;

        while (i < sql.length) {
            const ch = sql[i];
            const nextCh = i + 1 < sql.length ? sql[i + 1] : undefined;

            if (state.inSingleQuote || state.inDoubleQuote) {
                const prevSingle = state.inSingleQuote;
                const prevDouble = state.inDoubleQuote;
                updateQuoteState(ch, nextCh, state);
                if ((prevSingle && ch === "'" && nextCh === "'") || (prevDouble && ch === '"' && nextCh === '"')) {
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            if (ch === "(") depth++;
            if (ch === ")") depth--;

            if (ch === ";" && depth <= 0) {
                return i;
            }

            updateQuoteState(ch, nextCh, state);
            i++;
        }

        return sql.length;
    }

    static removeCommentsAndStrings(sql: string): string {
        const parts: string[] = [];
        let lastEnd = 0;
        let i = 0;
        const len = sql.length;
        const state: QuoteState = { inSingleQuote: false, inDoubleQuote: false };

        while (i < len) {
            const ch = sql[i];
            const nextCh = i + 1 < len ? sql[i + 1] : undefined;

            if (state.inSingleQuote || state.inDoubleQuote) {
                const prevSingle = state.inSingleQuote;
                const prevDouble = state.inDoubleQuote;
                updateQuoteState(ch, nextCh, state);
                if ((prevSingle && ch === "'" && nextCh === "'") || (prevDouble && ch === '"' && nextCh === '"')) {
                    i += 2;
                } else {
                    if ((prevSingle || prevDouble) && !state.inSingleQuote && !state.inDoubleQuote) {
                        lastEnd = i + 1;
                    }
                    i++;
                }
                continue;
            }

            if (ch === "-" && nextCh === "-") {
                parts.push(sql.substring(lastEnd, i));
                i += 2;
                while (i < len && sql[i] !== "\n") {
                    i++;
                }
                lastEnd = i;
                continue;
            }

            if (ch === "/" && nextCh === "*") {
                parts.push(sql.substring(lastEnd, i));
                i += 2;
                while (i < len) {
                    if (sql[i] === "*" && i + 1 < len && sql[i + 1] === "/") {
                        i += 2;
                        break;
                    }
                    i++;
                }
                lastEnd = i;
                continue;
            }

            if (ch === "'" || ch === '"') {
                parts.push(sql.substring(lastEnd, i));
                updateQuoteState(ch, nextCh, state);
                i++;
                continue;
            }

            i++;
        }

        if (!state.inSingleQuote && !state.inDoubleQuote) {
            parts.push(sql.substring(lastEnd, len));
        }

        return parts.join("");
    }
}
