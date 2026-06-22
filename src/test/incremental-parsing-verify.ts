// Standalone test script for DocumentAstCache incremental parsing helpers
// These functions are duplicated here because the main module imports 'vscode'
// which is not available outside the extension host.
// Run with: npx tsx src/test/incremental-parsing-verify.ts

// -----------------------------------------------------------------------
// Duplicated pure functions from DocumentAstCache.ts for testing
// -----------------------------------------------------------------------

function splitSqlStatements(text: string): { text: string; start: number; end: number }[] {
    const statements: { text: string; start: number; end: number }[] = [];
    let statementStart = 0;
    let i = 0;
    const len = text.length;

    while (i < len) {
        const ch = text[i];

        if (ch === '-' && i + 1 < len && text[i + 1] === '-') {
            i += 2;
            while (i < len && text[i] !== '\n') i++;
            continue;
        }

        if (ch === '/' && i + 1 < len && text[i + 1] === '*') {
            i += 2;
            while (i < len && !(text[i] === '*' && i + 1 < len && text[i + 1] === '/')) i++;
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

        if (ch === '`') {
            i++;
            while (i < len && text[i] !== '`') i++;
            i++;
            continue;
        }

        if (ch === ';') {
            const stmtText = text.substring(statementStart, i + 1);
            // Only add if there is real SQL content (not just whitespace + semicolons)
            const content = stmtText.replace(/;/g, '').trim();
            if (content.length > 0) {
                statements.push({
                    text: stmtText,
                    start: statementStart,
                    end: i + 1,
                });
            }
            statementStart = i + 1;
        }

        i++;
    }

    if (statementStart < len) {
        const lastStmt = text.substring(statementStart);
        if (lastStmt.trim().length > 0) {
            statements.push({
                text: lastStmt,
                start: statementStart,
                end: len,
            });
        }
    }

    return statements;
}

function computeLineColumn(text: string, offset: number): { line: number; column: number } {
    let line = 1;
    let lastNewlinePos = -1;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
            line++;
            lastNewlinePos = i;
        }
    }
    const column = offset - lastNewlinePos;
    return { line, column };
}

function adjustAstLocationsInPlace(
    ast: unknown,
    oldStartLine: number,
    oldStartCol: number,
    newStartLine: number,
    newStartCol: number,
): void {
    const lineDelta = newStartLine - oldStartLine;
    const colDelta = newStartCol - oldStartCol;
    if (lineDelta === 0 && colDelta === 0) return;

    function adjust(obj: unknown): void {
        if (obj == null || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            for (const item of obj) adjust(item);
            return;
        }
        const record = obj as Record<string, unknown>;
        const loc = record.loc;
        if (loc != null && typeof loc === 'object') {
            const l = loc as { start?: { line: number; column: number }; end?: { line: number; column: number } };
            if (l.start && l.start.line > 0) {
                if (l.start.line === oldStartLine) {
                    l.start.column += colDelta;
                }
                l.start.line += lineDelta;
            }
            if (l.end && l.end.line > 0) {
                if (l.end.line === oldStartLine) {
                    l.end.column += colDelta;
                }
                l.end.line += lineDelta;
            }
        }
        for (const key of Object.keys(record)) {
            if (key === 'loc') continue;
            adjust(record[key]);
        }
    }

    adjust(ast);
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
    if (!condition) {
        console.error(`FAIL: ${msg}`);
        failed++;
    } else {
        passed++;
    }
}

// === splitSqlStatements ===
console.log('=== splitSqlStatements ===');

let r = splitSqlStatements('SELECT 1');
assert(r.length === 1, 'single stmt: length');
assert(r[0].text === 'SELECT 1', 'single stmt: text');
assert(r[0].start === 0, 'single stmt: start');
assert(r[0].end === 8, 'single stmt: end');

r = splitSqlStatements('SELECT 1;');
assert(r.length === 1, 'single stmt with ;: length');
assert(r[0].text === 'SELECT 1;', 'single stmt with ;: text');

r = splitSqlStatements('SELECT 1; SELECT 2;');
assert(r.length === 2, 'two stmts: length');
assert(r[0].text === 'SELECT 1;', 'two stmts: first');
assert(r[1].text === ' SELECT 2;', 'two stmts: second');

r = splitSqlStatements('SELECT 1;\nSELECT 2;\nSELECT 3;');
assert(r.length === 3, 'three stmts: length');
assert(r[0].text === 'SELECT 1;', 'three stmts: first');
assert(r[1].text === '\nSELECT 2;', 'three stmts: second');
assert(r[2].text === '\nSELECT 3;', 'three stmts: third');

r = splitSqlStatements("SELECT 'a;b' FROM t;");
assert(r.length === 1, 'string semicolon: length');

r = splitSqlStatements("SELECT 'it''s;ok' FROM t;");
assert(r.length === 1, 'escaped quote: length');

r = splitSqlStatements('SELECT "a;b" FROM t;');
assert(r.length === 1, 'double-quoted string semicolon: length');

r = splitSqlStatements('SELECT `a;b` FROM t;');
assert(r.length === 1, 'backtick semicolon: length');

r = splitSqlStatements('SELECT 1; -- comment; here\nSELECT 2;');
assert(r.length === 2, 'line comment: length');

r = splitSqlStatements('SELECT 1; /* comment; here */ SELECT 2;');
assert(r.length === 2, 'block comment: length');

r = splitSqlStatements('');
assert(r.length === 0, 'empty: length');

r = splitSqlStatements('   \n  ');
assert(r.length === 0, 'whitespace only: length');

r = splitSqlStatements('SELECT 1; SELECT 2');
assert(r.length === 2, 'trailing no ;: length');
assert(r[1].text === ' SELECT 2', 'trailing no ;: text');

r = splitSqlStatements('WITH cte AS (SELECT 1) SELECT * FROM cte; SELECT 2;');
assert(r.length === 2, 'WITH clause: length');
assert(r[0].text.includes('WITH'), 'WITH clause: first includes WITH');

// Multi-line statement
r = splitSqlStatements('SELECT\n  1,\n  2\nFROM\n  t;');
assert(r.length === 1, 'multi-line stmt: length');

// Multiple semicolons in a row with only whitespace between
r = splitSqlStatements(';;;');
assert(r.length === 0, 'only semicolons: length');

console.log('splitSqlStatements done\n');

// === computeLineColumn ===
console.log('=== computeLineColumn ===');

let lc = computeLineColumn('hello', 0);
assert(lc.line === 1 && lc.column === 1, 'start of text');

lc = computeLineColumn('hello', 3);
assert(lc.line === 1 && lc.column === 4, 'mid first line');

lc = computeLineColumn('hello\nworld', 6);
assert(lc.line === 2 && lc.column === 1, 'start of second line');

lc = computeLineColumn('hello\nworld', 8);
assert(lc.line === 2 && lc.column === 3, 'mid second line');

lc = computeLineColumn('a\nb\nc', 4);
assert(lc.line === 3 && lc.column === 1, 'third line');

console.log('computeLineColumn done\n');

// === adjustAstLocationsInPlace ===
console.log('=== adjustAstLocationsInPlace ===');

interface AstLoc { line: number; column: number }
interface AstNode { [key: string]: unknown; type: string; loc: { start: AstLoc; end: AstLoc }; from?: AstNode[]; columns?: AstNode[] }

let ast: AstNode = { type: 'select', loc: { start: { line: 5, column: 1 }, end: { line: 5, column: 10 } } };
adjustAstLocationsInPlace(ast, 5, 1, 5, 1);
assert(ast.loc.start.line === 5 && ast.loc.start.column === 1, 'no adj: start unchanged');

ast = { type: 'select', loc: { start: { line: 1, column: 1 }, end: { line: 3, column: 5 } } };
adjustAstLocationsInPlace(ast, 1, 1, 10, 1);
assert(ast.loc.start.line === 10 && ast.loc.start.column === 1, 'line shift: start');
assert(ast.loc.end.line === 12 && ast.loc.end.column === 5, 'line shift: end');

ast = { type: 'select', loc: { start: { line: 1, column: 1 }, end: { line: 2, column: 5 } } };
adjustAstLocationsInPlace(ast, 1, 1, 5, 10);
assert(ast.loc.start.line === 5 && ast.loc.start.column === 10, 'line+col shift: start');
assert(ast.loc.end.line === 6 && ast.loc.end.column === 5, 'line+col shift: end col unchanged (different line)');

ast = { type: 'select', loc: { start: { line: 3, column: 5 }, end: { line: 3, column: 20 } } };
adjustAstLocationsInPlace(ast, 3, 5, 4, 5);
assert(ast.loc.start.line === 4 && ast.loc.start.column === 5, 'reused: start line+1');
assert(ast.loc.end.line === 4 && ast.loc.end.column === 20, 'reused: end');

ast = {
    type: 'select',
    loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 50 } },
    from: [
        {
            type: 'table_ref',
            table: 'users',
            loc: { start: { line: 1, column: 15 }, end: { line: 1, column: 20 } },
        },
    ],
} as AstNode;
adjustAstLocationsInPlace(ast, 1, 1, 10, 3);
assert(ast.loc.start.line === 10 && ast.loc.start.column === 3, 'nested: root start');
assert(ast.from![0].loc.start.line === 10 && ast.from![0].loc.start.column === 17, 'nested: from start (15+2)');

ast = { type: 'select', loc: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } };
adjustAstLocationsInPlace(ast, 1, 1, 10, 5);
assert(ast.loc.start.line === 0, 'skip line 0: start');
assert(ast.loc.end.line === 0, 'skip line 0: end');

const asts: AstNode[] = [
    { type: 'select', loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } } },
    { type: 'insert', loc: { start: { line: 2, column: 1 }, end: { line: 2, column: 15 } } },
];
adjustAstLocationsInPlace(asts, 1, 1, 5, 3);
assert(asts[0].loc.start.line === 5 && asts[0].loc.start.column === 3, 'array: first start');
assert(asts[1].loc.start.line === 6 && asts[1].loc.start.column === 1, 'array: second start (different line, no col adj)');

// Multi-line statement: only first line gets column adjustment
ast = {
    type: 'select',
    loc: { start: { line: 1, column: 1 }, end: { line: 3, column: 10 } },
    columns: [
        { type: 'ref', loc: { start: { line: 1, column: 8 }, end: { line: 1, column: 12 } } },
        { type: 'ref', loc: { start: { line: 2, column: 3 }, end: { line: 2, column: 8 } } },
    ],
} as AstNode;
adjustAstLocationsInPlace(ast, 1, 1, 5, 4);
assert(ast.loc.start.line === 5 && ast.loc.start.column === 4, 'multiline: root start');
assert(ast.loc.end.line === 7 && ast.loc.end.column === 10, 'multiline: root end');
assert(ast.columns![0].loc.start.line === 5 && ast.columns![0].loc.start.column === 11, 'multiline: col1 start (8+3)');
assert(ast.columns![1].loc.start.line === 6 && ast.columns![1].loc.start.column === 3, 'multiline: col2 start (no col adj)');

console.log('adjustAstLocationsInPlace done\n');

// === Summary ===
console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
    process.exit(1);
}
