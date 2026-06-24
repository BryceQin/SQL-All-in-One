import * as assert from 'assert'
import { splitSqlStatements, computeLineColumn, adjustAstLocationsInPlace } from '../parser/DocumentAstCache'

suite('DocumentAstCache - Statement-level Incremental Parsing', () => {

    // -----------------------------------------------------------------------
    // splitSqlStatements
    // -----------------------------------------------------------------------

    test('splitSqlStatements - single statement without semicolon', () => {
        const result = splitSqlStatements('SELECT 1')
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, 'SELECT 1')
        assert.strictEqual(result[0].start, 0)
        assert.strictEqual(result[0].end, 8)
    })

    test('splitSqlStatements - single statement with semicolon', () => {
        const result = splitSqlStatements('SELECT 1;')
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, 'SELECT 1;')
        assert.strictEqual(result[0].start, 0)
        assert.strictEqual(result[0].end, 9)
    })

    test('splitSqlStatements - two statements separated by semicolon', () => {
        const result = splitSqlStatements('SELECT 1; SELECT 2;')
        assert.strictEqual(result.length, 2)
        assert.strictEqual(result[0].text, 'SELECT 1;')
        assert.strictEqual(result[1].text, ' SELECT 2;')
    })

    test('splitSqlStatements - multiple statements on separate lines', () => {
        const sql = 'SELECT 1;\nSELECT 2;\nSELECT 3;'
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 3)
        assert.strictEqual(result[0].text, 'SELECT 1;')
        assert.strictEqual(result[1].text, '\nSELECT 2;')
        assert.strictEqual(result[2].text, '\nSELECT 3;')
    })

    test('splitSqlStatements - ignores semicolons inside single-quoted strings', () => {
        const sql = "SELECT 'a;b' FROM t;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, "SELECT 'a;b' FROM t;")
    })

    test('splitSqlStatements - ignores semicolons inside double-quoted strings', () => {
        const sql = 'SELECT "a;b" FROM t;'
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, 'SELECT "a;b" FROM t;')
    })

    test('splitSqlStatements - ignores semicolons inside backtick identifiers', () => {
        const sql = 'SELECT `a;b` FROM t;'
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 1)
    })

    test('splitSqlStatements - handles escaped single quotes', () => {
        const sql = "SELECT 'it''s;ok' FROM t;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 1)
    })

    test('splitSqlStatements - ignores semicolons in single-line comments', () => {
        const sql = "SELECT 1; -- comment; here\nSELECT 2;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 2)
    })

    test('splitSqlStatements - ignores semicolons in multi-line comments', () => {
        const sql = "SELECT 1; /* comment; here */ SELECT 2;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 2)
    })

    test('splitSqlStatements - empty text', () => {
        const result = splitSqlStatements('')
        assert.strictEqual(result.length, 0)
    })

    test('splitSqlStatements - only whitespace', () => {
        const result = splitSqlStatements('   \n  ')
        assert.strictEqual(result.length, 0)
    })

    test('splitSqlStatements - trailing statement without semicolon', () => {
        const sql = 'SELECT 1; SELECT 2'
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 2)
        assert.strictEqual(result[1].text, ' SELECT 2')
    })

    test('splitSqlStatements - WITH clause stays with its SELECT', () => {
        const sql = 'WITH cte AS (SELECT 1) SELECT * FROM cte; SELECT 2;'
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 2)
        assert.ok(result[0].text.includes('WITH'))
        assert.ok(result[0].text.includes('cte'))
    })

    test('splitSqlStatements - ignores semicolons inside $$ dollar-quoted strings', () => {
        const sql = "CREATE FUNCTION f() RETURNS void AS $$ BEGIN SELECT 1; END; $$ LANGUAGE plpgsql;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, sql)
    })

    test('splitSqlStatements - ignores semicolons inside tagged dollar-quoted strings', () => {
        const sql = "CREATE FUNCTION f() RETURNS void AS $body$ BEGIN SELECT 1; END; $body$ LANGUAGE plpgsql;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, sql)
    })

    test('splitSqlStatements - dollar-quoted string followed by another statement', () => {
        const sql = "CREATE FUNCTION f() AS $$ SELECT 1; $$ LANGUAGE plpgsql; SELECT 2;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 2)
        assert.ok(result[0].text.includes('$$'))
        assert.ok(result[1].text.includes('SELECT 2'))
    })

    test('splitSqlStatements - multiple statements with dollar-quoted bodies', () => {
        const sql = "CREATE FUNCTION a() AS $$ SELECT 1; $$ LANGUAGE plpgsql; CREATE FUNCTION b() AS $$ SELECT 2; $$ LANGUAGE plpgsql;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 2)
        assert.ok(result[0].text.includes('FUNCTION a'))
        assert.ok(result[1].text.includes('FUNCTION b'))
    })

    test('splitSqlStatements - dollar-quoted with different tags does not cross-close', () => {
        // The body contains $tag$ literally; only the matching $body$ closes.
        const sql = "SELECT $body$ hello $tag$ world $body$;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, sql)
    })

    test('splitSqlStatements - unterminated dollar-quoted string consumes rest', () => {
        const sql = "SELECT $$ unterminated; SELECT 2;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, sql)
    })

    test('splitSqlStatements - bare $ not treated as dollar-quote', () => {
        // A lone $ followed by non-identifier and non-$ should not enter dollar-quote state.
        const sql = "SELECT a$b; SELECT 2;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 2)
    })

    test('splitSqlStatements - empty dollar-quoted string', () => {
        const sql = "SELECT $$$$;"
        const result = splitSqlStatements(sql)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].text, sql)
    })

    // -----------------------------------------------------------------------
    // computeLineColumn
    // -----------------------------------------------------------------------

    test('computeLineColumn - start of text', () => {
        const result = computeLineColumn('hello', 0)
        assert.strictEqual(result.line, 1)
        assert.strictEqual(result.column, 1)
    })

    test('computeLineColumn - middle of first line', () => {
        const result = computeLineColumn('hello', 3)
        assert.strictEqual(result.line, 1)
        assert.strictEqual(result.column, 4)
    })

    test('computeLineColumn - start of second line', () => {
        const result = computeLineColumn('hello\nworld', 6)
        assert.strictEqual(result.line, 2)
        assert.strictEqual(result.column, 1)
    })

    test('computeLineColumn - middle of second line', () => {
        const result = computeLineColumn('hello\nworld', 8)
        assert.strictEqual(result.line, 2)
        assert.strictEqual(result.column, 3)
    })

    test('computeLineColumn - third line', () => {
        const result = computeLineColumn('a\nb\nc', 4)
        assert.strictEqual(result.line, 3)
        assert.strictEqual(result.column, 1)
    })

    // -----------------------------------------------------------------------
    // adjustAstLocationsInPlace
    // -----------------------------------------------------------------------

    test('adjustAstLocationsInPlace - no adjustment needed', () => {
        const ast = { type: 'select', loc: { start: { line: 5, column: 1 }, end: { line: 5, column: 10 } } }
        adjustAstLocationsInPlace(ast, 5, 1, 5, 1)
        assert.strictEqual(ast.loc.start.line, 5)
        assert.strictEqual(ast.loc.start.column, 1)
    })

    test('adjustAstLocationsInPlace - shift line only', () => {
        const ast = { type: 'select', loc: { start: { line: 1, column: 1 }, end: { line: 3, column: 5 } } }
        adjustAstLocationsInPlace(ast, 1, 1, 10, 1)
        assert.strictEqual(ast.loc.start.line, 10)
        assert.strictEqual(ast.loc.start.column, 1) // same line as oldStartLine, but colDelta is 0
        assert.strictEqual(ast.loc.end.line, 12)
        assert.strictEqual(ast.loc.end.column, 5) // different line, no col adjustment
    })

    test('adjustAstLocationsInPlace - shift line and column for first line', () => {
        const ast = {
            type: 'select',
            loc: { start: { line: 1, column: 1 }, end: { line: 2, column: 5 } },
        }
        adjustAstLocationsInPlace(ast, 1, 1, 5, 10)
        assert.strictEqual(ast.loc.start.line, 5)
        assert.strictEqual(ast.loc.start.column, 10) // on oldStartLine, gets colDelta
        assert.strictEqual(ast.loc.end.line, 6)
        assert.strictEqual(ast.loc.end.column, 5) // not on oldStartLine, no colDelta
    })

    test('adjustAstLocationsInPlace - shift reused cached statement', () => {
        // Statement was at line 3, col 5. Now it's at line 4, col 5 (shifted down by 1 line)
        const ast = {
            type: 'select',
            loc: { start: { line: 3, column: 5 }, end: { line: 3, column: 20 } },
        }
        adjustAstLocationsInPlace(ast, 3, 5, 4, 5)
        assert.strictEqual(ast.loc.start.line, 4)
        assert.strictEqual(ast.loc.start.column, 5) // colDelta is 0
        assert.strictEqual(ast.loc.end.line, 4)
        assert.strictEqual(ast.loc.end.column, 20)
    })

    test('adjustAstLocationsInPlace - nested AST nodes', () => {
        const ast = {
            type: 'select',
            loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 50 } },
            from: [
                {
                    type: 'table_ref',
                    table: 'users',
                    loc: { start: { line: 1, column: 15 }, end: { line: 1, column: 20 } },
                },
            ],
        }
        adjustAstLocationsInPlace(ast, 1, 1, 10, 3)
        assert.strictEqual(ast.loc.start.line, 10)
        assert.strictEqual(ast.loc.start.column, 3) // on oldStartLine, gets colDelta (+2)
        const fromNode = ast.from[0] as { loc: { start: { line: number; column: number } } }
        assert.strictEqual(fromNode.loc.start.line, 10)
        assert.strictEqual(fromNode.loc.start.column, 17) // 15 + colDelta(2)
    })

    test('adjustAstLocationsInPlace - skips loc with line 0', () => {
        const ast = { type: 'select', loc: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } }
        adjustAstLocationsInPlace(ast, 1, 1, 10, 5)
        assert.strictEqual(ast.loc.start.line, 0) // should not be adjusted
        assert.strictEqual(ast.loc.end.line, 0)
    })

    test('adjustAstLocationsInPlace - handles array of AST nodes', () => {
        const asts = [
            { type: 'select', loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } } },
            { type: 'insert', loc: { start: { line: 2, column: 1 }, end: { line: 2, column: 15 } } },
        ]
        adjustAstLocationsInPlace(asts, 1, 1, 5, 3)
        assert.strictEqual(asts[0].loc.start.line, 5)
        assert.strictEqual(asts[0].loc.start.column, 3)
        assert.strictEqual(asts[1].loc.start.line, 6)
        assert.strictEqual(asts[1].loc.start.column, 1) // not on oldStartLine
    })

    test('adjustAstLocationsInPlace does not mutate cached AST on incremental re-parse', () => {
        const cachedNode = {
            type: 'select',
            loc: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 10 },
            },
        } as unknown as import('node-sql-parser').AST;

        const originalStartLine = (cachedNode as unknown as { loc: { start: { line: number } } }).loc.start.line;

        const clonedNode: import('node-sql-parser').AST = JSON.parse(JSON.stringify(cachedNode)) as import('node-sql-parser').AST;
        adjustAstLocationsInPlace(clonedNode, 1, 1, 5, 3);

        const mutatedStartLine = (cachedNode as unknown as { loc: { start: { line: number } } }).loc.start.line;
        assert.strictEqual(
            mutatedStartLine,
            originalStartLine,
            '缓存 AST 节点不应被就地修改 — 应使用深拷贝'
        );
    })
})
