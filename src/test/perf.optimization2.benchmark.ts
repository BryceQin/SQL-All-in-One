/**
 * Performance benchmark for the second round of optimizations.
 *
 * This script is self-contained (no VSCode dependency) and can be run with:
 *   npx tsx src/test/perf.optimization2.benchmark.ts
 *
 * It compares the old (pre-optimization) implementations against the new
 * optimized ones to quantify the performance improvements for:
 *   - walkAst (AST traversal)
 *   - Layout (whitespace management)
 *   - expandPhrases (syntax description parser)
 *   - splitSqlStatements (statement splitter)
 *   - removeCommentsAndStrings (comment/string stripping)
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function measureTime(fn: () => void, iterations = 50): number {
    // Warmup
    for (let i = 0; i < 5; i++) fn();
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    // Use median to reduce noise
    return times[Math.floor(times.length / 2)];
}

function formatMs(ms: number): string {
    return ms.toFixed(4) + "ms";
}

function speedup(oldTime: number, newTime: number): string {
    return (oldTime / newTime).toFixed(2) + "x";
}

// ---------------------------------------------------------------------------
// Old implementations (for comparison)
// ---------------------------------------------------------------------------

function isPlainObjectOld(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAstNodeOld(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && "type" in value;
}

const MAX_STACK_DEPTH_OLD = 40000;

/** Old walkAst: uses for...in + hasOwnProperty + keysBuffer */
function walkAstOld(
    node: unknown,
    visitor: { enter?(node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): void },
): void {
    const stack: unknown[] = [];
    stack.push(node, null, null, 0);
    const keysBuffer: string[] = [];

    while (stack.length > 0) {
        if (stack.length > MAX_STACK_DEPTH_OLD) return;

        const phase = stack.pop() as number;
        const key = stack.pop();
        const parent = stack.pop();
        const currentNode = stack.pop();

        if (phase === 1) continue;

        if (!isAstNodeOld(currentNode)) {
            if (isPlainObjectOld(currentNode)) {
                keysBuffer.length = 0;
                for (const childKey in currentNode) {
                    if (Object.prototype.hasOwnProperty.call(currentNode, childKey)) {
                        keysBuffer.push(childKey);
                    }
                }
                for (let i = keysBuffer.length - 1; i >= 0; i--) {
                    const childKey = keysBuffer[i];
                    const childValue = (currentNode as Record<string, unknown>)[childKey];
                    if (Array.isArray(childValue)) {
                        for (let j = childValue.length - 1; j >= 0; j--) {
                            stack.push(childValue[j], currentNode, key, 0);
                        }
                    } else {
                        stack.push(childValue, currentNode, key, 0);
                    }
                }
            }
            continue;
        }

        visitor.enter?.(currentNode, parent as Record<string, unknown> | null, key as string | null);

        stack.push(currentNode, parent, key, 1);

        keysBuffer.length = 0;
        for (const childKey in currentNode) {
            if (Object.prototype.hasOwnProperty.call(currentNode, childKey)) {
                keysBuffer.push(childKey);
            }
        }
        for (let i = keysBuffer.length - 1; i >= 0; i--) {
            const childKey = keysBuffer[i];
            if (childKey === "type" || childKey === "loc") continue;
            const childValue = currentNode[childKey];
            if (typeof childValue === "string" || typeof childValue === "number" || typeof childValue === "boolean") continue;
            if (Array.isArray(childValue)) {
                for (let j = childValue.length - 1; j >= 0; j--) {
                    stack.push(childValue[j], currentNode, childKey, 0);
                }
            } else if (isAstNodeOld(childValue)) {
                stack.push(childValue, currentNode, childKey, 0);
            } else if (isPlainObjectOld(childValue)) {
                stack.push(childValue, currentNode, childKey, 0);
            }
        }
    }
}

// Old Layout implementation (simplified for benchmarking)
const WS_OLD = Object.freeze({
    SPACE: 0,
    NO_SPACE: 1,
    NO_NEWLINE: 2,
    NEWLINE: 3,
    MANDATORY_NEWLINE: 4,
    INDENT: 5,
    SINGLE_INDENT: 6,
} as const);

function lastOld<T>(arr: T[]): T | undefined {
    return arr[arr.length - 1];
}

const isHorizontalWhitespaceOld = (item: number | string | undefined): boolean => item === WS_OLD.SPACE || item === WS_OLD.SINGLE_INDENT;
const isRemovableWhitespaceOld = (item: number | string | undefined): boolean =>
    item === WS_OLD.SPACE || item === WS_OLD.SINGLE_INDENT || item === WS_OLD.NEWLINE;

class LayoutOld {
    private items: (number | string)[] = [];
    private indentStr = "  ";
    private level = 0;

    add(...items: (number | string)[]): void {
        for (const item of items) {
            switch (item) {
                case WS_OLD.SPACE:
                    this.items.push(WS_OLD.SPACE);
                    break;
                case WS_OLD.NO_SPACE:
                    this.trimHorizontalWhitespace();
                    break;
                case WS_OLD.NO_NEWLINE:
                    this.trimWhitespace();
                    break;
                case WS_OLD.NEWLINE:
                    this.trimHorizontalWhitespace();
                    this.addNewline(WS_OLD.NEWLINE);
                    break;
                case WS_OLD.MANDATORY_NEWLINE:
                    this.trimHorizontalWhitespace();
                    this.addNewline(WS_OLD.MANDATORY_NEWLINE);
                    break;
                case WS_OLD.INDENT:
                    this.addIndentation();
                    break;
                case WS_OLD.SINGLE_INDENT:
                    this.items.push(WS_OLD.SINGLE_INDENT);
                    break;
                default:
                    this.items.push(item);
            }
        }
    }
    private trimHorizontalWhitespace(): void {
        while (isHorizontalWhitespaceOld(lastOld(this.items))) this.items.pop();
    }
    private trimWhitespace(): void {
        while (isRemovableWhitespaceOld(lastOld(this.items))) this.items.pop();
    }
    private addNewline(newline: number): void {
        if (this.items.length > 0) {
            switch (lastOld(this.items)) {
                case WS_OLD.NEWLINE:
                    this.items.pop();
                    this.items.push(newline);
                    break;
                case WS_OLD.MANDATORY_NEWLINE:
                    break;
                default:
                    this.items.push(newline);
                    break;
            }
        }
    }
    private addIndentation(): void {
        for (let i = 0; i < this.level; i++) this.items.push(WS_OLD.SINGLE_INDENT);
    }
    toString(): string {
        return this.items.map((item) => this.itemToString(item)).join("");
    }
    private itemToString(item: number | string): string {
        switch (item) {
            case WS_OLD.SPACE:
                return " ";
            case WS_OLD.NEWLINE:
            case WS_OLD.MANDATORY_NEWLINE:
                return "\n";
            case WS_OLD.SINGLE_INDENT:
                return this.indentStr;
            default:
                return item as string;
        }
    }
    increaseLevel(): void {
        this.level++;
    }
    decreaseLevel(): void {
        this.level--;
    }
}

// Old expandPhrases.parseTerm: per-character regex
function parseTermOld(text: string, index: number): [string, number] {
    let word = "";
    while (text[index] && /[A-Za-z0-9_ ]/.test(text[index])) {
        word += text[index];
        index++;
    }
    return [word, index];
}

// Old removeCommentsAndStrings: 4 regex replacements
function removeCommentsAndStringsOld(text: string): string {
    let result = text;
    result = result.replace(/'(?:[^']|'')*'/g, "''");
    result = result.replace(/"(?:[^"]|"")*"/g, '""');
    result = result.replace(/\/\*[\s\S]*?\*\//g, "");
    result = result.replace(/--[^\n]*/g, "");
    return result;
}

// Old splitSqlStatements content check
function splitSqlStatementsOld(text: string): { text: string; start: number; end: number }[] {
    const statements: { text: string; start: number; end: number }[] = [];
    let statementStart = 0;
    let i = 0;
    const len = text.length;
    while (i < len) {
        const ch = text[i];
        if (ch === "-" && i + 1 < len && text[i + 1] === "-") {
            i += 2;
            while (i < len && text[i] !== "\n") i++;
            continue;
        }
        if (ch === "/" && i + 1 < len && text[i + 1] === "*") {
            i += 2;
            while (i < len && !(text[i] === "*" && i + 1 < len && text[i + 1] === "/")) i++;
            i += 2;
            continue;
        }
        if (ch === "'") {
            i++;
            while (i < len) {
                if (text[i] === "'") {
                    if (i + 1 < len && text[i + 1] === "'") {
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        if (ch === '"') {
            i++;
            while (i < len && text[i] !== '"') i++;
            i++;
            continue;
        }
        if (ch === "`") {
            i++;
            while (i < len && text[i] !== "`") i++;
            i++;
            continue;
        }
        if (ch === ";") {
            const stmtText = text.substring(statementStart, i + 1);
            const content = stmtText.replace(/;/g, "").trim();
            if (content.length > 0) {
                statements.push({ text: stmtText, start: statementStart, end: i + 1 });
            }
            statementStart = i + 1;
        }
        i++;
    }
    if (statementStart < len) {
        const lastStmt = text.substring(statementStart);
        if (lastStmt.trim().length > 0) {
            statements.push({ text: lastStmt, start: statementStart, end: len });
        }
    }
    return statements;
}

// ---------------------------------------------------------------------------
// Test data generators
// ---------------------------------------------------------------------------

function generateAst(depth: number, breadth: number): Record<string, unknown> {
    const node: Record<string, unknown> = {
        type: "select",
        loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
    };
    const columns: unknown[] = [];
    for (let i = 0; i < breadth; i++) {
        columns.push({
            type: "column_ref",
            table: null,
            column: `col${i}`,
            loc: { start: { line: 1, column: i * 10 }, end: { line: 1, column: i * 10 + 5 } },
        });
    }
    node.columns = columns;
    if (depth > 0) {
        node.from = [
            {
                type: "table",
                db: null,
                table: `table_${depth}`,
                as: null,
                loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
            },
        ];
        node.where = generateAst(depth - 1, breadth);
    }
    return node;
}

function generateSqlStatements(count: number): string {
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
        parts.push(`SELECT col${i}_1, col${i}_2 FROM table_${i} WHERE id = ${i};`);
    }
    return parts.join("\n");
}

function generateSqlWithCommentsAndStrings(count: number): string {
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
        parts.push(`-- comment ${i}\nSELECT 'string; with; semicolons' /* block comment */ FROM table_${i};`);
    }
    return parts.join("\n");
}

// ---------------------------------------------------------------------------
// New implementations (inlined to avoid vscode dependency)
// ---------------------------------------------------------------------------

function isPlainObjectNew(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAstNodeNew(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && "type" in value;
}

/** New walkAst: uses Object.keys + typeof checks */
function walkAstNew(
    node: unknown,
    visitor: { enter?(node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): void },
): void {
    const stack: unknown[] = [];
    stack.push(node, null, null, 0);

    while (stack.length > 0) {
        if (stack.length > MAX_STACK_DEPTH_OLD) return;

        const phase = stack.pop() as number;
        const key = stack.pop();
        const parent = stack.pop();
        const currentNode = stack.pop();

        if (phase === 1) continue;

        if (!isAstNodeNew(currentNode)) {
            if (isPlainObjectNew(currentNode)) {
                const childKeys = Object.keys(currentNode);
                for (let i = childKeys.length - 1; i >= 0; i--) {
                    const childKey = childKeys[i];
                    const childValue = (currentNode as Record<string, unknown>)[childKey];
                    if (Array.isArray(childValue)) {
                        for (let j = childValue.length - 1; j >= 0; j--) {
                            stack.push(childValue[j], currentNode, key, 0);
                        }
                    } else {
                        stack.push(childValue, currentNode, key, 0);
                    }
                }
            }
            continue;
        }

        visitor.enter?.(currentNode, parent as Record<string, unknown> | null, key as string | null);

        stack.push(currentNode, parent, key, 1);

        const childKeys = Object.keys(currentNode);
        for (let i = childKeys.length - 1; i >= 0; i--) {
            const childKey = childKeys[i];
            if (childKey === "type" || childKey === "loc") continue;
            const childValue = currentNode[childKey];
            const childType = typeof childValue;
            if (childType === "string" || childType === "number" || childType === "boolean") continue;
            if (childValue == null) continue;
            if (Array.isArray(childValue)) {
                for (let j = childValue.length - 1; j >= 0; j--) {
                    stack.push(childValue[j], currentNode, childKey, 0);
                }
            } else if (childType === "object") {
                stack.push(childValue, currentNode, childKey, 0);
            }
        }
    }
}

class LayoutNew {
    private items: (number | string)[] = [];
    private indentStr = "  ";
    private level = 0;

    add(...items: (number | string)[]): void {
        for (const item of items) {
            switch (item) {
                case WS_OLD.SPACE:
                    this.items.push(WS_OLD.SPACE);
                    break;
                case WS_OLD.NO_SPACE:
                    this.trimHorizontalWhitespace();
                    break;
                case WS_OLD.NO_NEWLINE:
                    this.trimWhitespace();
                    break;
                case WS_OLD.NEWLINE:
                    this.trimHorizontalWhitespace();
                    this.addNewline(WS_OLD.NEWLINE);
                    break;
                case WS_OLD.MANDATORY_NEWLINE:
                    this.trimHorizontalWhitespace();
                    this.addNewline(WS_OLD.MANDATORY_NEWLINE);
                    break;
                case WS_OLD.INDENT:
                    this.addIndentation();
                    break;
                case WS_OLD.SINGLE_INDENT:
                    this.items.push(WS_OLD.SINGLE_INDENT);
                    break;
                default:
                    this.items.push(item);
            }
        }
    }
    private trimHorizontalWhitespace(): void {
        const items = this.items;
        let i = items.length - 1;
        while (i >= 0) {
            const item = items[i];
            if (item === WS_OLD.SPACE || item === WS_OLD.SINGLE_INDENT) {
                i--;
            } else {
                break;
            }
        }
        if (i < items.length - 1) items.length = i + 1;
    }
    private trimWhitespace(): void {
        const items = this.items;
        let i = items.length - 1;
        while (i >= 0) {
            const item = items[i];
            if (item === WS_OLD.SPACE || item === WS_OLD.SINGLE_INDENT || item === WS_OLD.NEWLINE) {
                i--;
            } else {
                break;
            }
        }
        if (i < items.length - 1) items.length = i + 1;
    }
    private addNewline(newline: number): void {
        const items = this.items;
        const n = items.length;
        if (n > 0) {
            const lastItem = items[n - 1];
            if (lastItem === WS_OLD.NEWLINE) {
                items[n - 1] = newline;
            } else if (lastItem !== WS_OLD.MANDATORY_NEWLINE) {
                items.push(newline);
            }
        }
    }
    private addIndentation(): void {
        for (let i = 0; i < this.level; i++) this.items.push(WS_OLD.SINGLE_INDENT);
    }
    toString(): string {
        const items = this.items;
        const n = items.length;
        const parts: string[] = [];
        for (let i = 0; i < n; i++) parts.push(this.itemToString(items[i]));
        return n === 0 ? "" : parts.join("");
    }
    private itemToString(item: number | string): string {
        switch (item) {
            case WS_OLD.SPACE:
                return " ";
            case WS_OLD.NEWLINE:
            case WS_OLD.MANDATORY_NEWLINE:
                return "\n";
            case WS_OLD.SINGLE_INDENT:
                return this.indentStr;
            default:
                return item as string;
        }
    }
    increaseLevel(): void {
        this.level++;
    }
    decreaseLevel(): void {
        this.level--;
    }
}

function parseTermNew(text: string, index: number): [string, number] {
    const start = index;
    const len = text.length;
    while (index < len) {
        const code = text.charCodeAt(index);
        if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95 || code === 32) {
            index++;
        } else {
            break;
        }
    }
    return [text.substring(start, index), index];
}

function removeCommentsAndStringsNew(text: string): string {
    const len = text.length;
    let result = "";
    let i = 0;
    while (i < len) {
        const code = text.charCodeAt(i);
        if (code === 39) {
            result += "''";
            i++;
            while (i < len) {
                if (text.charCodeAt(i) === 39) {
                    if (i + 1 < len && text.charCodeAt(i + 1) === 39) {
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        if (code === 34) {
            result += '""';
            i++;
            while (i < len && text.charCodeAt(i) !== 34) i++;
            i++;
            continue;
        }
        if (code === 47 && i + 1 < len && text.charCodeAt(i + 1) === 42) {
            i += 2;
            while (i < len && !(text.charCodeAt(i) === 42 && i + 1 < len && text.charCodeAt(i + 1) === 47)) i++;
            i += 2;
            continue;
        }
        if (code === 45 && i + 1 < len && text.charCodeAt(i + 1) === 45) {
            while (i < len && text.charCodeAt(i) !== 10) i++;
            continue;
        }
        result += text[i];
        i++;
    }
    return result;
}

function hasNonTrivialContent(text: string, start: number, end: number): boolean {
    for (let k = start; k <= end; k++) {
        const c = text.charCodeAt(k);
        if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 59) return true;
    }
    return false;
}

function splitSqlStatementsNew(text: string): { text: string; start: number; end: number }[] {
    const statements: { text: string; start: number; end: number }[] = [];
    let statementStart = 0;
    let i = 0;
    const len = text.length;
    while (i < len) {
        const code = text.charCodeAt(i);
        if (code === 45 && i + 1 < len && text.charCodeAt(i + 1) === 45) {
            i += 2;
            while (i < len && text.charCodeAt(i) !== 10) i++;
            continue;
        }
        if (code === 47 && i + 1 < len && text.charCodeAt(i + 1) === 42) {
            i += 2;
            while (i < len && !(text.charCodeAt(i) === 42 && i + 1 < len && text.charCodeAt(i + 1) === 47)) i++;
            i += 2;
            continue;
        }
        if (code === 39) {
            i++;
            while (i < len) {
                if (text.charCodeAt(i) === 39) {
                    if (i + 1 < len && text.charCodeAt(i + 1) === 39) {
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        if (code === 34) {
            i++;
            while (i < len && text.charCodeAt(i) !== 34) i++;
            i++;
            continue;
        }
        if (code === 96) {
            i++;
            while (i < len && text.charCodeAt(i) !== 96) i++;
            i++;
            continue;
        }
        if (code === 59) {
            if (hasNonTrivialContent(text, statementStart, i)) {
                statements.push({ text: text.substring(statementStart, i + 1), start: statementStart, end: i + 1 });
            }
            statementStart = i + 1;
        }
        i++;
    }
    if (statementStart < len) {
        if (hasNonTrivialContent(text, statementStart, len - 1)) {
            statements.push({ text: text.substring(statementStart), start: statementStart, end: len });
        }
    }
    return statements;
}

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

console.log("=".repeat(70));
console.log("Performance Optimization Benchmarks (Round 2)");
console.log("=".repeat(70));
console.log("");

// --- Benchmark 1: walkAst ---
{
    const ast = generateAst(5, 10);
    let oldCount = 0;
    let newCount = 0;

    const oldTime = measureTime(() => {
        oldCount = 0;
        walkAstOld(ast, {
            enter() {
                oldCount++;
            },
        });
    }, 30);

    const newTime = measureTime(() => {
        newCount = 0;
        walkAstNew(ast, {
            enter() {
                newCount++;
            },
        });
    }, 30);

    console.log("[Benchmark 1] walkAst (depth=5, breadth=10):");
    console.log(`  Old (for...in + hasOwnProperty): ${formatMs(oldTime)} median (${oldCount} nodes)`);
    console.log(`  New (Object.keys + typeof):       ${formatMs(newTime)} median (${newCount} nodes)`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log(`  Correctness: ${oldCount === newCount ? "PASS ✓" : "FAIL ✗"}`);
    console.log("");
}

// --- Benchmark 2: walkAst on larger AST ---
{
    const ast = generateAst(8, 15);
    let oldCount = 0;
    let newCount = 0;

    const oldTime = measureTime(() => {
        oldCount = 0;
        walkAstOld(ast, {
            enter() {
                oldCount++;
            },
        });
    }, 30);

    const newTime = measureTime(() => {
        newCount = 0;
        walkAstNew(ast, {
            enter() {
                newCount++;
            },
        });
    }, 30);

    console.log("[Benchmark 2] walkAst (depth=8, breadth=15):");
    console.log(`  Old (for...in + hasOwnProperty): ${formatMs(oldTime)} median (${oldCount} nodes)`);
    console.log(`  New (Object.keys + typeof):       ${formatMs(newTime)} median (${newCount} nodes)`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log(`  Correctness: ${oldCount === newCount ? "PASS ✓" : "FAIL ✗"}`);
    console.log("");
}

// --- Benchmark 3: Layout toString ---
{
    const oldLayout = new LayoutOld();
    const newLayout = new LayoutNew();
    // Build identical content
    for (let i = 0; i < 50; i++) {
        oldLayout.add(WS_OLD.SPACE, `col${i}`, WS_OLD.NEWLINE, WS_OLD.INDENT);
        newLayout.add(WS_OLD.SPACE, `col${i}`, WS_OLD.NEWLINE, WS_OLD.INDENT);
    }

    const oldTime = measureTime(() => {
        oldLayout.toString();
    }, 100);

    const newTime = measureTime(() => {
        newLayout.toString();
    }, 100);

    console.log("[Benchmark 3] Layout.toString (50 items):");
    console.log(`  Old (.map().join()):       ${formatMs(oldTime)} median`);
    console.log(`  New (preallocated array):  ${formatMs(newTime)} median`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log("");
}

// --- Benchmark 4: Layout trim operations ---
{
    const oldTime = measureTime(() => {
        const layout = new LayoutOld();
        for (let i = 0; i < 100; i++) {
            layout.add(WS_OLD.SPACE, WS_OLD.SINGLE_INDENT, WS_OLD.NO_SPACE, `text${i}`, WS_OLD.NEWLINE);
        }
        layout.toString();
    }, 50);

    const newTime = measureTime(() => {
        const layout = new LayoutNew();
        for (let i = 0; i < 100; i++) {
            layout.add(WS_OLD.SPACE, WS_OLD.SINGLE_INDENT, WS_OLD.NO_SPACE, `text${i}`, WS_OLD.NEWLINE);
        }
        layout.toString();
    }, 50);

    console.log("[Benchmark 4] Layout with trim operations (100 iterations):");
    console.log(`  Old (pop() loop + last()):  ${formatMs(oldTime)} median`);
    console.log(`  New (length truncation):    ${formatMs(newTime)} median`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log("");
}

// --- Benchmark 5: expandPhrases parseTerm ---
{
    const phrases = [
        "CREATE [OR REPLACE] [TEMP|TEMPORARY] TABLE",
        "INSERT [INTO] [OR REPLACE] TABLE",
        "SELECT [ALL|DISTINCT] [column1, column2] FROM",
    ];

    const oldTime = measureTime(() => {
        for (const phrase of phrases) {
            for (let i = 0; i < 100; i++) {
                let idx = 0;
                while (idx < phrase.length) {
                    const [word, newIdx] = parseTermOld(phrase, idx);
                    idx = newIdx;
                    if (idx === newIdx && word === "") break;
                }
            }
        }
    }, 30);

    const newTime = measureTime(() => {
        for (const phrase of phrases) {
            for (let i = 0; i < 100; i++) {
                let idx = 0;
                while (idx < phrase.length) {
                    const [word, newIdx] = parseTermNew(phrase, idx);
                    idx = newIdx;
                    if (idx === newIdx && word === "") break;
                }
            }
        }
    }, 30);

    console.log("[Benchmark 5] expandPhrases parseTerm (300 phrase scans):");
    console.log(`  Old (per-char regex test):  ${formatMs(oldTime)} median`);
    console.log(`  New (charCodeAt ranges):    ${formatMs(newTime)} median`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log("");
}

// --- Benchmark 6: splitSqlStatements ---
{
    const sql = generateSqlStatements(100);

    const oldTime = measureTime(() => {
        splitSqlStatementsOld(sql);
    }, 50);

    const newTime = measureTime(() => {
        splitSqlStatementsNew(sql);
    }, 50);

    const oldResult = splitSqlStatementsOld(sql);
    const newResult = splitSqlStatementsNew(sql);

    console.log("[Benchmark 6] splitSqlStatements (100 statements):");
    console.log(`  Old (regex replace + trim):  ${formatMs(oldTime)} median`);
    console.log(`  New (charCode scan):         ${formatMs(newTime)} median`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log(`  Correctness: ${oldResult.length === newResult.length ? "PASS ✓" : "FAIL ✗"}`);
    console.log("");
}

// --- Benchmark 7: removeCommentsAndStrings (reverted - regex is faster) ---
{
    const text = generateSqlWithCommentsAndStrings(50);

    const oldTime = measureTime(() => {
        removeCommentsAndStringsOld(text);
    }, 50);

    const newTime = measureTime(() => {
        removeCommentsAndStringsNew(text);
    }, 50);

    console.log("[Benchmark 7] removeCommentsAndStrings (50 statements with comments/strings):");
    console.log(`  Old (4 regex replaces):     ${formatMs(oldTime)} median`);
    console.log(`  New (single charCode scan): ${formatMs(newTime)} median`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log(`  Note: Reverted to regex approach (V8 regex engine is faster for this case)`);
    console.log("");
}

// --- Benchmark 8: splitSqlStatements on large input ---
{
    const sql = generateSqlStatements(500);

    const oldTime = measureTime(() => {
        splitSqlStatementsOld(sql);
    }, 20);

    const newTime = measureTime(() => {
        splitSqlStatementsNew(sql);
    }, 20);

    console.log("[Benchmark 8] splitSqlStatements (500 statements):");
    console.log(`  Old (regex replace + trim):  ${formatMs(oldTime)} median`);
    console.log(`  New (charCode scan):         ${formatMs(newTime)} median`);
    console.log(`  Speedup: ${speedup(oldTime, newTime)}`);
    console.log("");
}

// --- Benchmark 9: lineColFromIndex (TokenizerEngine / SqlDiagnosticsProvider) ---
{
    // Generate a large SQL file with many lines
    const lines: string[] = [];
    for (let i = 0; i < 2000; i++) {
        lines.push(`SELECT col${i} FROM table_${i} WHERE id = ${i};`);
    }
    const text = lines.join("\n");

    // Old: O(n) linear scan per call (used in TokenizerEngine.createParseError)
    function lineColOld(source: string, index: number): { line: number; col: number } {
        let line = 1;
        let lastNewline = -1;
        const limit = Math.min(index, source.length);
        for (let i = 0; i < limit; i++) {
            if (source.charCodeAt(i) === 10) {
                line++;
                lastNewline = i;
            }
        }
        return { line, col: index - lastNewline };
    }

    // New: O(log n) binary search with precomputed line starts
    function precomputeLineStarts(text: string): number[] {
        const starts: number[] = [0];
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) starts.push(i + 1);
        }
        return starts;
    }
    function lineColNew(lineStarts: number[], index: number): { line: number; col: number } {
        let low = 0,
            high = lineStarts.length - 1;
        while (low <= high) {
            const mid = (low + high) >>> 1;
            if (lineStarts[mid] <= index) {
                if (mid + 1 >= lineStarts.length || lineStarts[mid + 1] > index) {
                    return { line: mid + 1, col: index - lineStarts[mid] + 1 };
                }
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return { line: 1, col: 1 };
    }

    // Simulate error at end of file (worst case for linear scan)
    const errorOffset = text.length - 10;
    const lineStarts = precomputeLineStarts(text);

    const oldTime = measureTime(() => {
        lineColOld(text, errorOffset);
    }, 100);

    const newTimeExcludingPrecompute = measureTime(() => {
        lineColNew(lineStarts, errorOffset);
    }, 100);

    const newTimeIncludingPrecompute = measureTime(() => {
        const starts = precomputeLineStarts(text);
        lineColNew(starts, errorOffset);
    }, 100);

    console.log("[Benchmark 9] lineColFromIndex (error at end of 2000-line SQL):");
    console.log(`  Old (O(n) linear scan):              ${formatMs(oldTime)} median`);
    console.log(`  New (O(log n), precompute excluded): ${formatMs(newTimeExcludingPrecompute)} median`);
    console.log(`  New (O(log n), precompute included): ${formatMs(newTimeIncludingPrecompute)} median`);
    console.log(`  Speedup (precompute excluded): ${speedup(oldTime, newTimeExcludingPrecompute)}`);
    console.log(`  Speedup (precompute included): ${speedup(oldTime, newTimeIncludingPrecompute)}`);
    console.log("");
}

console.log("=".repeat(70));
console.log("Benchmark complete.");
console.log("=".repeat(70));
