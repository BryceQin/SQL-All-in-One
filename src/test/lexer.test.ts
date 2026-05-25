import * as assert from 'assert'
import { TokenType, createEofToken, testToken, isToken, isReserved, isLogicalOperator } from '../lexer/token'
import { dedupe, last, sortByLengthDesc, maxLength, equalizeWhitespace, isMultiline } from '../lexer/utils'
import { escapeRegExp, WHITESPACE_REGEX, patternToRegex, toCaseInsensitivePattern, withDashes, prefixesPattern } from '../lexer/regexUtil'
import { lineColFromIndex } from '../lexer/lineColFromIndex'
import { NestedComment } from '../lexer/NestedComment'
import {
    lineComment,
    parenthesis,
    operator,
    reservedWord,
    parameter,
    buildQStringPatterns,
    quotePatterns,
    variable,
    stringPattern,
    string,
    identifierPattern,
    identifier,
} from '../lexer/regexFactory'

suite('Lexer Tests', () => {

    // ============================================================
    // token.ts
    // ============================================================
    suite('TokenType', () => {

        test('has all expected token types', () => {
            assert.strictEqual(TokenType.QUOTED_IDENTIFIER, 'QUOTED_IDENTIFIER')
            assert.strictEqual(TokenType.IDENTIFIER, 'IDENTIFIER')
            assert.strictEqual(TokenType.STRING, 'STRING')
            assert.strictEqual(TokenType.VARIABLE, 'VARIABLE')
            assert.strictEqual(TokenType.RESERVED_DATA_TYPE, 'RESERVED_DATA_TYPE')
            assert.strictEqual(TokenType.RESERVED_PARAMETERIZED_DATA_TYPE, 'RESERVED_PARAMETERIZED_DATA_TYPE')
            assert.strictEqual(TokenType.RESERVED_KEYWORD, 'RESERVED_KEYWORD')
            assert.strictEqual(TokenType.RESERVED_FUNCTION_NAME, 'RESERVED_FUNCTION_NAME')
            assert.strictEqual(TokenType.RESERVED_KEYWORD_PHRASE, 'RESERVED_KEYWORD_PHRASE')
            assert.strictEqual(TokenType.RESERVED_DATA_TYPE_PHRASE, 'RESERVED_DATA_TYPE_PHRASE')
            assert.strictEqual(TokenType.RESERVED_SET_OPERATION, 'RESERVED_SET_OPERATION')
            assert.strictEqual(TokenType.RESERVED_CLAUSE, 'RESERVED_CLAUSE')
            assert.strictEqual(TokenType.RESERVED_SELECT, 'RESERVED_SELECT')
            assert.strictEqual(TokenType.RESERVED_JOIN, 'RESERVED_JOIN')
            assert.strictEqual(TokenType.RESERVED_COMMAND, 'RESERVED_COMMAND')
            assert.strictEqual(TokenType.ARRAY_IDENTIFIER, 'ARRAY_IDENTIFIER')
            assert.strictEqual(TokenType.ARRAY_KEYWORD, 'ARRAY_KEYWORD')
            assert.strictEqual(TokenType.CASE, 'CASE')
            assert.strictEqual(TokenType.END, 'END')
            assert.strictEqual(TokenType.WHEN, 'WHEN')
            assert.strictEqual(TokenType.ELSE, 'ELSE')
            assert.strictEqual(TokenType.THEN, 'THEN')
            assert.strictEqual(TokenType.LIMIT, 'LIMIT')
            assert.strictEqual(TokenType.BETWEEN, 'BETWEEN')
            assert.strictEqual(TokenType.AND, 'AND')
            assert.strictEqual(TokenType.OR, 'OR')
            assert.strictEqual(TokenType.XOR, 'XOR')
            assert.strictEqual(TokenType.ON, 'ON')
            assert.strictEqual(TokenType.USING, 'USING')
            assert.strictEqual(TokenType.OPERATOR, 'OPERATOR')
            assert.strictEqual(TokenType.COMMA, 'COMMA')
            assert.strictEqual(TokenType.ASTERISK, 'ASTERISK')
            assert.strictEqual(TokenType.PROPERTY_ACCESS_OPERATOR, 'PROPERTY_ACCESS_OPERATOR')
            assert.strictEqual(TokenType.OPEN_PAREN, 'OPEN_PAREN')
            assert.strictEqual(TokenType.CLOSE_PAREN, 'CLOSE_PAREN')
            assert.strictEqual(TokenType.LINE_COMMENT, 'LINE_COMMENT')
            assert.strictEqual(TokenType.BLOCK_COMMENT, 'BLOCK_COMMENT')
            assert.strictEqual(TokenType.DISABLE_COMMENT, 'DISABLE_COMMENT')
            assert.strictEqual(TokenType.NUMBER, 'NUMBER')
            assert.strictEqual(TokenType.NAMED_PARAMETER, 'NAMED_PARAMETER')
            assert.strictEqual(TokenType.QUOTED_PARAMETER, 'QUOTED_PARAMETER')
            assert.strictEqual(TokenType.NUMBERED_PARAMETER, 'NUMBERED_PARAMETER')
            assert.strictEqual(TokenType.POSITIONAL_PARAMETER, 'POSITIONAL_PARAMETER')
            assert.strictEqual(TokenType.CUSTOM_PARAMETER, 'CUSTOM_PARAMETER')
            assert.strictEqual(TokenType.DELIMITER, 'DELIMITER')
            assert.strictEqual(TokenType.EOF, 'EOF')
        })

    })

    suite('createEofToken', () => {

        test('creates token with type EOF at given index', () => {
            const token = createEofToken(42)
            assert.strictEqual(token.type, TokenType.EOF)
            assert.strictEqual(token.raw, '\u00ABEOF\u00BB')
            assert.strictEqual(token.text, '\u00ABEOF\u00BB')
            assert.strictEqual(token.start, 42)
        })

        test('creates token at index 0', () => {
            const token = createEofToken(0)
            assert.strictEqual(token.type, TokenType.EOF)
            assert.strictEqual(token.start, 0)
        })

    })

    suite('testToken', () => {

        test('returns a function', () => {
            const fn = testToken({ type: TokenType.IDENTIFIER, text: 'foo' })
            assert.strictEqual(typeof fn, 'function')
        })

        test('returned function matches correct token', () => {
            const fn = testToken({ type: TokenType.RESERVED_KEYWORD, text: 'SELECT' })
            const result = fn({
                type: TokenType.RESERVED_KEYWORD,
                raw: 'SELECT',
                text: 'SELECT',
                start: 0,
            })
            assert.strictEqual(result, true)
        })

        test('returned function rejects wrong type', () => {
            const fn = testToken({ type: TokenType.RESERVED_KEYWORD, text: 'SELECT' })
            const result = fn({
                type: TokenType.IDENTIFIER,
                raw: 'SELECT',
                text: 'SELECT',
                start: 0,
            })
            assert.strictEqual(result, false)
        })

        test('returned function rejects wrong text', () => {
            const fn = testToken({ type: TokenType.RESERVED_KEYWORD, text: 'SELECT' })
            const result = fn({
                type: TokenType.RESERVED_KEYWORD,
                raw: 'FROM',
                text: 'FROM',
                start: 0,
            })
            assert.strictEqual(result, false)
        })

    })

    suite('isToken', () => {

        test('isToken.ARRAY matches ARRAY token', () => {
            const result = isToken.ARRAY({
                type: TokenType.RESERVED_DATA_TYPE,
                raw: 'ARRAY',
                text: 'ARRAY',
                start: 0,
            })
            assert.strictEqual(result, true)
        })

        test('isToken.ARRAY rejects non-ARRAY token', () => {
            const result = isToken.ARRAY({
                type: TokenType.RESERVED_DATA_TYPE,
                raw: 'INT',
                text: 'INT',
                start: 0,
            })
            assert.strictEqual(result, false)
        })

        test('isToken.BY matches BY token', () => {
            const result = isToken.BY({
                type: TokenType.RESERVED_KEYWORD,
                raw: 'BY',
                text: 'BY',
                start: 0,
            })
            assert.strictEqual(result, true)
        })

        test('isToken.WINDOW matches WINDOW token', () => {
            const result = isToken.WINDOW({
                type: TokenType.RESERVED_CLAUSE,
                raw: 'WINDOW',
                text: 'WINDOW',
                start: 0,
            })
            assert.strictEqual(result, true)
        })

    })

    suite('isReserved', () => {

        test('returns true for all reserved types', () => {
            assert.strictEqual(isReserved(TokenType.RESERVED_DATA_TYPE), true)
            assert.strictEqual(isReserved(TokenType.RESERVED_KEYWORD), true)
            assert.strictEqual(isReserved(TokenType.RESERVED_FUNCTION_NAME), true)
            assert.strictEqual(isReserved(TokenType.RESERVED_KEYWORD_PHRASE), true)
            assert.strictEqual(isReserved(TokenType.RESERVED_DATA_TYPE_PHRASE), true)
            assert.strictEqual(isReserved(TokenType.RESERVED_CLAUSE), true)
            assert.strictEqual(isReserved(TokenType.RESERVED_SELECT), true)
            assert.strictEqual(isReserved(TokenType.RESERVED_SET_OPERATION), true)
            assert.strictEqual(isReserved(TokenType.RESERVED_JOIN), true)
            assert.strictEqual(isReserved(TokenType.ARRAY_KEYWORD), true)
            assert.strictEqual(isReserved(TokenType.CASE), true)
            assert.strictEqual(isReserved(TokenType.END), true)
            assert.strictEqual(isReserved(TokenType.WHEN), true)
            assert.strictEqual(isReserved(TokenType.ELSE), true)
            assert.strictEqual(isReserved(TokenType.THEN), true)
            assert.strictEqual(isReserved(TokenType.LIMIT), true)
            assert.strictEqual(isReserved(TokenType.BETWEEN), true)
            assert.strictEqual(isReserved(TokenType.AND), true)
            assert.strictEqual(isReserved(TokenType.OR), true)
            assert.strictEqual(isReserved(TokenType.XOR), true)
        })

        test('returns false for non-reserved types', () => {
            assert.strictEqual(isReserved(TokenType.IDENTIFIER), false)
            assert.strictEqual(isReserved(TokenType.STRING), false)
            assert.strictEqual(isReserved(TokenType.NUMBER), false)
            assert.strictEqual(isReserved(TokenType.OPERATOR), false)
            assert.strictEqual(isReserved(TokenType.COMMA), false)
            assert.strictEqual(isReserved(TokenType.ASTERISK), false)
            assert.strictEqual(isReserved(TokenType.OPEN_PAREN), false)
            assert.strictEqual(isReserved(TokenType.CLOSE_PAREN), false)
            assert.strictEqual(isReserved(TokenType.LINE_COMMENT), false)
            assert.strictEqual(isReserved(TokenType.BLOCK_COMMENT), false)
            assert.strictEqual(isReserved(TokenType.EOF), false)
            assert.strictEqual(isReserved(TokenType.QUOTED_IDENTIFIER), false)
            assert.strictEqual(isReserved(TokenType.VARIABLE), false)
        })

    })

    suite('isLogicalOperator', () => {

        test('returns true for AND, OR, XOR', () => {
            assert.strictEqual(isLogicalOperator(TokenType.AND), true)
            assert.strictEqual(isLogicalOperator(TokenType.OR), true)
            assert.strictEqual(isLogicalOperator(TokenType.XOR), true)
        })

        test('returns false for non-logical types', () => {
            assert.strictEqual(isLogicalOperator(TokenType.BETWEEN), false)
            assert.strictEqual(isLogicalOperator(TokenType.OPERATOR), false)
            assert.strictEqual(isLogicalOperator(TokenType.RESERVED_KEYWORD), false)
            assert.strictEqual(isLogicalOperator(TokenType.IDENTIFIER), false)
        })

    })

    // ============================================================
    // utils.ts
    // ============================================================
    suite('dedupe', () => {

        test('removes duplicate elements from array', () => {
            assert.deepStrictEqual(dedupe(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c'])
        })

        test('returns same array when no duplicates', () => {
            assert.deepStrictEqual(dedupe(['x', 'y', 'z']), ['x', 'y', 'z'])
        })

        test('handles empty array', () => {
            assert.deepStrictEqual(dedupe([]), [])
        })

        test('handles single element array', () => {
            assert.deepStrictEqual(dedupe(['only']), ['only'])
        })

        test('handles all duplicates', () => {
            assert.deepStrictEqual(dedupe(['dup', 'dup', 'dup']), ['dup'])
        })

    })

    suite('last', () => {

        test('returns last element of array', () => {
            assert.strictEqual(last([1, 2, 3]), 3)
        })

        test('returns only element for single-element array', () => {
            assert.strictEqual(last(['solo']), 'solo')
        })

        test('returns undefined for empty array', () => {
            assert.strictEqual(last([]), undefined)
        })

    })

    suite('sortByLengthDesc', () => {

        test('sorts strings by length descending', () => {
            assert.deepStrictEqual(sortByLengthDesc(['a', 'bb', 'ccc']), ['ccc', 'bb', 'a'])
        })

        test('breaks ties alphabetically ascending', () => {
            assert.deepStrictEqual(sortByLengthDesc(['bbb', 'aaa']), ['aaa', 'bbb'])
        })

        test('handles empty array', () => {
            assert.deepStrictEqual(sortByLengthDesc([]), [])
        })

        test('handles single element', () => {
            assert.deepStrictEqual(sortByLengthDesc(['hello']), ['hello'])
        })

        test('handles mixed-length array', () => {
            const result = sortByLengthDesc(['x', 'abc', 'yz', 'def', 'w'])
            // Expected: 'abc'(3), 'def'(3), 'yz'(2), 'w'(1), 'x'(1)
            // Ties: 'abc' < 'def' alphabetically; 'w' < 'x' alphabetically
            assert.deepStrictEqual(result, ['abc', 'def', 'yz', 'w', 'x'])
        })

    })

    suite('maxLength', () => {

        test('returns max string length', () => {
            assert.strictEqual(maxLength(['a', 'bb', 'ccc']), 3)
        })

        test('returns 0 for empty array', () => {
            assert.strictEqual(maxLength([]), 0)
        })

        test('returns length of single element', () => {
            assert.strictEqual(maxLength(['hello']), 5)
        })

        test('returns 0 for array of empty strings', () => {
            assert.strictEqual(maxLength(['', '', '']), 0)
        })

    })

    suite('equalizeWhitespace', () => {

        test('replaces multiple spaces with single space', () => {
            assert.strictEqual(equalizeWhitespace('hello   world'), 'hello world')
        })

        test('replaces tabs with space', () => {
            assert.strictEqual(equalizeWhitespace('hello\t\tworld'), 'hello world')
        })

        test('replaces newlines with space', () => {
            assert.strictEqual(equalizeWhitespace('hello\nworld'), 'hello world')
        })

        test('replaces mixed whitespace with single space', () => {
            assert.strictEqual(equalizeWhitespace('a  \t\n\r b'), 'a b')
        })

        test('does not modify string with single spaces', () => {
            assert.strictEqual(equalizeWhitespace('hello world'), 'hello world')
        })

    })

    suite('isMultiline', () => {

        test('returns true for string with newline', () => {
            assert.strictEqual(isMultiline('line1\nline2'), true)
        })

        test('returns true for string with carriage return + newline', () => {
            assert.strictEqual(isMultiline('line1\r\nline2'), true)
        })

        test('returns false for single-line string', () => {
            assert.strictEqual(isMultiline('hello world'), false)
        })

        test('returns false for empty string', () => {
            assert.strictEqual(isMultiline(''), false)
        })

    })

    // ============================================================
    // regexUtil.ts
    // ============================================================
    suite('escapeRegExp', () => {

        test('escapes dot character', () => {
            assert.strictEqual(escapeRegExp('.'), '\\.')
        })

        test('escapes asterisk', () => {
            assert.strictEqual(escapeRegExp('*'), '\\*')
        })

        test('escapes plus sign', () => {
            assert.strictEqual(escapeRegExp('+'), '\\+')
        })

        test('escapes question mark', () => {
            assert.strictEqual(escapeRegExp('?'), '\\?')
        })

        test('escapes caret', () => {
            assert.strictEqual(escapeRegExp('^'), '\\^')
        })

        test('escapes dollar sign', () => {
            assert.strictEqual(escapeRegExp('$'), '\\$')
        })

        test('escapes braces', () => {
            assert.strictEqual(escapeRegExp('{}'), '\\{\\}')
        })

        test('escapes parentheses', () => {
            assert.strictEqual(escapeRegExp('()'), '\\(\\)')
        })

        test('escapes square brackets', () => {
            assert.strictEqual(escapeRegExp('[]'), '\\[\\]')
        })

        test('escapes pipe character', () => {
            assert.strictEqual(escapeRegExp('|'), '\\|')
        })

        test('escapes backslash', () => {
            assert.strictEqual(escapeRegExp('\\'), '\\\\')
        })

        test('does not modify normal characters', () => {
            assert.strictEqual(escapeRegExp('hello'), 'hello')
        })

    })

    suite('WHITESPACE_REGEX', () => {

        test('matches spaces', () => {
            WHITESPACE_REGEX.lastIndex = 0
            const m = WHITESPACE_REGEX.exec('   hello')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '   ')
        })

        test('matches tabs and newlines', () => {
            WHITESPACE_REGEX.lastIndex = 0
            const m = WHITESPACE_REGEX.exec('\t\n  x')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '\t\n  ')
        })

        test('does not match non-whitespace', () => {
            WHITESPACE_REGEX.lastIndex = 0
            const m = WHITESPACE_REGEX.exec('hello')
            assert.strictEqual(m, null)
        })

    })

    suite('patternToRegex', () => {

        test('creates a RegExp with uy flags', () => {
            const re = patternToRegex('abc')
            assert.ok(re instanceof RegExp)
            assert.strictEqual(re.flags, 'uy')
        })

        test('matches the given pattern', () => {
            const re = patternToRegex('\\d+')
            re.lastIndex = 0
            const m = re.exec('123abc')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '123')
        })

        test('does not match if pattern does not fit', () => {
            const re = patternToRegex('\\d+')
            re.lastIndex = 0
            const m = re.exec('abc')
            assert.strictEqual(m, null)
        })

    })

    suite('toCaseInsensitivePattern', () => {

        test('converts simple prefix to case-insensitive pattern', () => {
            assert.strictEqual(toCaseInsensitivePattern('ab'), '[Aa][Bb]')
        })

        test('converts single character', () => {
            assert.strictEqual(toCaseInsensitivePattern('a'), '[Aa]')
        })

        test('converts spaces to \\s+', () => {
            assert.strictEqual(toCaseInsensitivePattern('a b'), '[Aa]\\s+[Bb]')
        })

        test('handles mixed case input', () => {
            assert.strictEqual(toCaseInsensitivePattern('Ab'), '[Aa][Bb]')
        })

    })

    suite('withDashes', () => {

        test('creates dash-separated repeating pattern', () => {
            assert.strictEqual(withDashes('abc'), 'abc(?:-abc)*')
        })

        test('works with single character pattern', () => {
            assert.strictEqual(withDashes('x'), 'x(?:-x)*')
        })

    })

    suite('prefixesPattern', () => {

        test('generates optional prefix pattern when requirePrefix is false', () => {
            const result = prefixesPattern({ prefixes: ['a', 'b'], quote: '``', requirePrefix: false })
            assert.strictEqual(result, '(?:[Aa]|[Bb]|)')
        })

        test('generates required prefix pattern when requirePrefix is true', () => {
            const result = prefixesPattern({ prefixes: ['a'], quote: '``', requirePrefix: true })
            assert.strictEqual(result, '(?:[Aa])')
        })

        test('handles empty prefixes array', () => {
            const result = prefixesPattern({ prefixes: [], quote: '``', requirePrefix: false })
            assert.strictEqual(result, '(?:|)')
        })

    })

    // ============================================================
    // lineColFromIndex.ts
    // ============================================================
    suite('lineColFromIndex', () => {

        test('returns line 1 col 1 at start of string', () => {
            assert.deepStrictEqual(lineColFromIndex('hello', 0), { line: 1, col: 1 })
        })

        test('returns correct position in single-line string', () => {
            assert.deepStrictEqual(lineColFromIndex('hello world', 6), { line: 1, col: 7 })
        })

        test('returns correct position at end of single-line string', () => {
            assert.deepStrictEqual(lineColFromIndex('hello', 5), { line: 1, col: 6 })
        })

        test('returns correct position in multiline string', () => {
            const src = 'line1\nline2\nline3'
            // 'line1\n' = 6 chars; index 8 = 'li' on line 2
            assert.deepStrictEqual(lineColFromIndex(src, 8), { line: 2, col: 3 })
        })

        test('returns correct position at start of second line', () => {
            const src = 'first\nsecond'
            // 'first\n' = 6 chars; index 6 = start of 'second'
            assert.deepStrictEqual(lineColFromIndex(src, 6), { line: 2, col: 1 })
        })

        test('returns correct position on third line', () => {
            const src = 'a\nb\nc'
            assert.deepStrictEqual(lineColFromIndex(src, 4), { line: 3, col: 1 })
        })

        test('handles empty string', () => {
            assert.deepStrictEqual(lineColFromIndex('', 0), { line: 1, col: 1 })
        })

        test('handles index at newline character', () => {
            const src = 'hello\nworld'
            // index 5 is the \n character
            // slice(0,5) = 'hello', split gives ['hello'], lines.length=1, col=6
            assert.deepStrictEqual(lineColFromIndex(src, 5), { line: 1, col: 6 })
        })

        test('handles consecutive newlines', () => {
            const src = 'a\n\nb'
            // index 2: slice(0,2) = 'a\n', split gives ['a', ''], lines.length=2, lines[1]='', col=1
            assert.deepStrictEqual(lineColFromIndex(src, 2), { line: 2, col: 1 })
        })

    })

    // ============================================================
    // NestedComment.ts
    // ============================================================
    suite('NestedComment', () => {

        test('matches flat block comment', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const result = nc.exec('/* comment */')
            assert.ok(result !== null)
            assert.strictEqual(result[0], '/* comment */')
        })

        test('advances lastIndex after matching flat comment', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            nc.exec('/* x */')
            assert.strictEqual(nc.lastIndex, 7) // '/* x */' = 7 chars
        })

        test('matches nested block comments (two levels)', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const result = nc.exec('/* outer /* inner */ more */')
            assert.ok(result !== null)
            assert.strictEqual(result[0], '/* outer /* inner */ more */')
        })

        test('advances lastIndex after matching nested comment', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const input = '/* a /* b */ c */'
            nc.exec(input)
            assert.strictEqual(nc.lastIndex, input.length)
        })

        test('returns null for non-comment text', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const result = nc.exec('hello world')
            assert.strictEqual(result, null)
        })

        test('returns null for unclosed comment', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const result = nc.exec('/* unclosed')
            assert.strictEqual(result, null)
        })

        test('returns null for text that does not start with /*', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const result = nc.exec('not a comment */')
            assert.strictEqual(result, null)
        })

        test('lastIndex tracks position after match', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const result1 = nc.exec('/* A */ extra /* B */')
            assert.ok(result1 !== null)
            assert.strictEqual(result1[0], '/* A */')
            // lastIndex should now be past '/* A */', i.e., at position 7
            assert.strictEqual(nc.lastIndex, 7)
        })

        test('matches second comment when lastIndex is set after first', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const result1 = nc.exec('/* A */ extra /* B */')
            assert.ok(result1 !== null)
            assert.strictEqual(result1[0], '/* A */')
            // Manually set lastIndex to the start of the second comment
            nc.lastIndex = 14 // '/* A */ extra ' = 14 chars, then '/* B */' starts
            const result2 = nc.exec('/* A */ extra /* B */')
            assert.ok(result2 !== null)
            assert.strictEqual(result2[0], '/* B */')
        })

        test('exec returns array with single element (RegExp-like format)', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const result = nc.exec('/* test */')
            assert.ok(Array.isArray(result))
            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0], '/* test */')
        })

        test('handles deeply nested comments', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const result = nc.exec('/* a /* b /* c */ d */ e */')
            assert.ok(result !== null)
            // nestLevel: 1(a) -> 2(b) -> 3(c) -> 2(d) -> 1(e) -> 0
            assert.strictEqual(result[0], '/* a /* b /* c */ d */ e */')
        })

        test('can reuse same NestedComment instance', () => {
            const nc = new NestedComment()
            nc.lastIndex = 0
            const r1 = nc.exec('/* first */')
            assert.ok(r1 !== null)
            assert.strictEqual(r1[0], '/* first */')

            nc.lastIndex = 0
            const r2 = nc.exec('/* second */')
            assert.ok(r2 !== null)
            assert.strictEqual(r2[0], '/* second */')
        })

    })

    // ============================================================
    // regexFactory.ts
    // ============================================================
    suite('lineComment', () => {

        test('generates valid regex for single line comment type', () => {
            const re = lineComment(['--'])
            assert.ok(re instanceof RegExp)
            assert.strictEqual(re.flags, 'uy')
        })

        test('matches line comment with --', () => {
            const re = lineComment(['--'])
            re.lastIndex = 0
            const m = re.exec('-- this is a comment\n')
            assert.ok(m !== null)
            assert.ok(m[0].startsWith('--'))
        })

        test('matches line comment with #', () => {
            const re = lineComment(['#'])
            re.lastIndex = 0
            const m = re.exec('# comment\nSELECT')
            assert.ok(m !== null)
            assert.ok(m[0].startsWith('#'))
        })

        test('supports multiple comment types', () => {
            const re = lineComment(['--', '#'])
            re.lastIndex = 0
            const m1 = re.exec('-- dash comment\n')
            assert.ok(m1 !== null)

            re.lastIndex = 0
            const m2 = re.exec('# hash comment\n')
            assert.ok(m2 !== null)
        })

    })

    suite('parenthesis', () => {

        test('open parenthesis matches (', () => {
            const re = parenthesis('open')
            re.lastIndex = 0
            const m = re.exec('(expr)')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '(')
        })

        test('close parenthesis matches )', () => {
            const re = parenthesis('close')
            re.lastIndex = 0
            const m = re.exec(')')
            assert.ok(m !== null)
            assert.strictEqual(m[0], ')')
        })

        test('open parenthesis with extra [] matches [', () => {
            const re = parenthesis('open', ['[]'])
            re.lastIndex = 0
            const m = re.exec('[col]')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '[')
        })

        test('close parenthesis with extra [] matches ]', () => {
            const re = parenthesis('close', ['[]'])
            re.lastIndex = 0
            const m = re.exec(']')
            assert.ok(m !== null)
            assert.strictEqual(m[0], ']')
        })

        test('open parenthesis with extra {} matches {', () => {
            const re = parenthesis('open', ['{}'])
            re.lastIndex = 0
            const m = re.exec('{key}')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '{')
        })

        test('close parenthesis with extra {} matches }', () => {
            const re = parenthesis('close', ['{}'])
            re.lastIndex = 0
            const m = re.exec('}')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '}')
        })

    })

    suite('operator', () => {

        test('matches operators in given list', () => {
            const re = operator(['>=', '<=', '=', '<', '>'])
            re.lastIndex = 0
            const m = re.exec('>= 5')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '>=')
        })

        test('longest operator matches first (>= before >)', () => {
            const re = operator(['>=', '>', '='])
            re.lastIndex = 0
            const m = re.exec('>= 1')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '>=')
        })

        test('matches single character operator', () => {
            const re = operator(['=', '<', '>'])
            re.lastIndex = 0
            const m = re.exec('= 42')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '=')
        })

        test('handles special regex characters in operators', () => {
            const re = operator(['||', '&&'])
            re.lastIndex = 0
            const m = re.exec('|| x')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '||')
        })

    })

    suite('reservedWord', () => {

        test('matches reserved keyword', () => {
            const re = reservedWord(['SELECT', 'FROM', 'WHERE'])
            re.lastIndex = 0
            const m = re.exec('SELECT *')
            assert.ok(m !== null)
            assert.strictEqual(m[0], 'SELECT')
        })

        test('matches case-insensitively', () => {
            const re = reservedWord(['SELECT'])
            re.lastIndex = 0
            const m = re.exec('select 1')
            assert.ok(m !== null)
            assert.strictEqual(m[0], 'select')
        })

        test('respects word boundary (does not match prefix)', () => {
            const re = reservedWord(['SELECT'])
            re.lastIndex = 0
            const m = re.exec('SELECTx')
            assert.strictEqual(m, null)
        })

        test('longest keyword matches first', () => {
            const re = reservedWord(['ORDER', 'ORDER BY'])
            re.lastIndex = 0
            const m = re.exec('ORDER BY col')
            assert.ok(m !== null)
            // 'ORDER BY' should match before 'ORDER'
            assert.strictEqual(m[0], 'ORDER BY')
        })

        test('returns never-matching regex for empty keywords', () => {
            const re = reservedWord([])
            re.lastIndex = 0
            const m = re.exec('anything')
            assert.strictEqual(m, null)
        })

    })

    suite('parameter', () => {

        test('generates regex for named parameter types', () => {
            const re = parameter([':', '@'], '\\w+')
            assert.ok(re !== undefined)
            assert.ok(re instanceof RegExp)
        })

        test('matches named parameter with colon prefix', () => {
            const re = parameter([':', '@'], '\\w+')
            if (!re) { assert.fail('parameter() should return a RegExp'); return }
            re.lastIndex = 0
            const m = re.exec(':param_name')
            assert.ok(m !== null)
            assert.strictEqual(m[0], ':param_name')
        })

        test('matches named parameter with at-sign prefix', () => {
            const re = parameter([':', '@'], '\\w+')
            if (!re) { assert.fail('parameter() should return a RegExp'); return }
            re.lastIndex = 0
            const m = re.exec('@id')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '@id')
        })

        test('returns undefined for empty paramTypes', () => {
            const re = parameter([], '\\w+')
            assert.strictEqual(re, undefined)
        })

    })

    suite('quotePatterns', () => {

        test('has backtick pattern', () => {
            assert.ok(typeof quotePatterns['``'] === 'string')
        })

        test('has bracket pattern', () => {
            assert.ok(typeof quotePatterns['[]'] === 'string')
        })

        test('has double-quote QQ pattern', () => {
            assert.ok(typeof quotePatterns['""-qq'] === 'string')
        })

        test('has double-quote backslash pattern', () => {
            assert.ok(typeof quotePatterns['""-bs'] === 'string')
        })

        test('has double-quote QQ+BS pattern', () => {
            assert.ok(typeof quotePatterns['""-qq-bs'] === 'string')
        })

        test('has double-quote raw pattern', () => {
            assert.ok(typeof quotePatterns['""-raw'] === 'string')
        })

        test('has single-quote QQ pattern', () => {
            assert.ok(typeof quotePatterns["''-qq"] === 'string')
        })

        test('has single-quote backslash pattern', () => {
            assert.ok(typeof quotePatterns["''-bs"] === 'string')
        })

        test('has single-quote QQ+BS pattern', () => {
            assert.ok(typeof quotePatterns["''-qq-bs"] === 'string')
        })

        test('has single-quote raw pattern', () => {
            assert.ok(typeof quotePatterns["''-raw"] === 'string')
        })

        test('has dollar-quote pattern', () => {
            assert.ok(typeof quotePatterns['$$'] === 'string')
        })

        test('has triple single-quote pattern', () => {
            assert.ok(typeof quotePatterns["'''..'''"] === 'string')
        })

        test('has triple double-quote pattern', () => {
            assert.ok(typeof quotePatterns['""".."""'] === 'string')
        })

        test('has curly brace variable pattern', () => {
            assert.ok(typeof quotePatterns['{}'] === 'string')
        })

        test('has Q-quote pattern', () => {
            assert.ok(typeof quotePatterns["q''"] === 'string')
        })

    })

    suite('buildQStringPatterns', () => {

        test('returns a non-empty string', () => {
            const pattern = buildQStringPatterns()
            assert.ok(typeof pattern === 'string')
            assert.ok(pattern.length > 0)
        })

        test('contains Q-quote prefix', () => {
            const pattern = buildQStringPatterns()
            assert.ok(pattern.includes("[Qq]'"))
        })

    })

    suite('variable', () => {

        test('generates regex that matches variable patterns', () => {
            // VariableType must be RegexPattern or PrefixedQuoteType
            const re = variable([{ quote: '``', prefixes: [] }])
            assert.ok(re instanceof RegExp)
        })

        test('generates regex for multiple variable types', () => {
            const re = variable([
                { quote: '``', prefixes: [] },
                { quote: '[]', prefixes: [] },
            ])
            assert.ok(re instanceof RegExp)
        })

    })

    suite('stringPattern', () => {

        test('returns pattern for single quote type', () => {
            const pattern = stringPattern(["''-qq"])
            assert.ok(typeof pattern === 'string')
            assert.ok(pattern.length > 0)
        })

        test('joins multiple quote types with OR operator', () => {
            const pattern = stringPattern(["''-qq", '""-qq'])
            assert.ok(pattern.includes('|'))
        })

    })

    suite('string', () => {

        test('generates regex from single quote type', () => {
            const re = string(["''-qq"])
            assert.ok(re instanceof RegExp)
            assert.strictEqual(re.flags, 'uy')
        })

        test('matches string with single quotes', () => {
            const re = string(["''-qq"])
            re.lastIndex = 0
            const m = re.exec("'hello'")
            assert.ok(m !== null)
            assert.strictEqual(m[0], "'hello'")
        })

    })

    suite('identifierPattern', () => {

        test('generates default identifier pattern', () => {
            const pattern = identifierPattern()
            assert.ok(typeof pattern === 'string')
            assert.ok(pattern.length > 0)
        })

        test('includes custom first chars', () => {
            const pattern = identifierPattern({ first: '@' })
            assert.ok(pattern.includes('@'))
        })

        test('includes custom rest chars', () => {
            const pattern = identifierPattern({ rest: '$' })
            assert.ok(pattern.includes('$'))
        })

        test('adds dash pattern when dashes is true', () => {
            const pattern = identifierPattern({ dashes: true })
            assert.ok(pattern.includes('(?:-'))
        })

        test('allows first char number when configured', () => {
            const patternDefault = identifierPattern({ allowFirstCharNumber: false })
            const patternAllow = identifierPattern({ allowFirstCharNumber: true })
            // When allowFirstCharNumber is true, number class appears in first char group
            // which means the pattern should be different
            assert.notStrictEqual(patternDefault, patternAllow)
        })

    })

    suite('identifier', () => {

        test('generates regex that matches identifier', () => {
            const re = identifier()
            assert.ok(re instanceof RegExp)
            assert.strictEqual(re.flags, 'uy')
        })

        test('matches simple identifier', () => {
            const re = identifier()
            re.lastIndex = 0
            const m = re.exec('my_table ')
            assert.ok(m !== null)
            assert.strictEqual(m[0], 'my_table')
        })

        test('matches identifier with underscores', () => {
            const re = identifier()
            re.lastIndex = 0
            const m = re.exec('_hidden_col')
            assert.ok(m !== null)
            assert.strictEqual(m[0], '_hidden_col')
        })

        test('passes custom IdentChars through', () => {
            const re = identifier({ first: '#', rest: '$' })
            assert.ok(re instanceof RegExp)
        })

    })

})