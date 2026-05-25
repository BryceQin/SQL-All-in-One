import * as assert from 'assert'
import Indentation from '../formatter/Indentation'
import Layout, { WS } from '../formatter/Layout'
import InlineLayout, { InlineLayoutError } from '../formatter/InlineLayout'
import { expandSinglePhrase, expandPhrases } from '../formatter/expandPhrases'
import { indentString, isTabularStyle } from '../formatter/config'
import Params from '../formatter/Params'
import toTabularFormat, { isTabularToken } from '../formatter/tabularStyle'
import { TokenType } from '../lexer/token'

// ============================================================================
// Indentation Tests
// ============================================================================
suite('Indentation', () => {

    test('getSingleIndent returns specified indent string', () => {
        const indentation = new Indentation('    ')
        assert.strictEqual(indentation.getSingleIndent(), '    ')
    })

    test('getLevel returns current level (starts at 0)', () => {
        const indentation = new Indentation('  ')
        assert.strictEqual(indentation.getLevel(), 0)
    })

    test('increaseTopLevel increments level', () => {
        const indentation = new Indentation('  ')
        indentation.increaseTopLevel()
        assert.strictEqual(indentation.getLevel(), 1)
    })

    test('decreaseTopLevel decrements level when top-level exists', () => {
        const indentation = new Indentation('  ')
        indentation.increaseTopLevel()
        indentation.decreaseTopLevel()
        assert.strictEqual(indentation.getLevel(), 0)
    })

    test('decreaseTopLevel does nothing when stack is empty', () => {
        const indentation = new Indentation('  ')
        indentation.decreaseTopLevel()
        assert.strictEqual(indentation.getLevel(), 0)
    })

    test('decreaseTopLevel does nothing when top is not top-level', () => {
        const indentation = new Indentation('  ')
        indentation.increaseBlockLevel()
        indentation.decreaseTopLevel()
        // Should still be 1 because block-level is not popped by decreaseTopLevel
        assert.strictEqual(indentation.getLevel(), 1)
    })

    test('increaseBlockLevel increments level', () => {
        const indentation = new Indentation('  ')
        indentation.increaseBlockLevel()
        assert.strictEqual(indentation.getLevel(), 1)
    })

    test('decreaseBlockLevel decrements block level', () => {
        const indentation = new Indentation('  ')
        indentation.increaseBlockLevel()
        indentation.decreaseBlockLevel()
        assert.strictEqual(indentation.getLevel(), 0)
    })

    test('decreaseBlockLevel removes nested top-level indents within block', () => {
        // Simulate: block-level, then some top-levels inside that block
        const indentation = new Indentation('  ')
        indentation.increaseBlockLevel()
        indentation.increaseTopLevel()
        indentation.increaseTopLevel()
        assert.strictEqual(indentation.getLevel(), 3)
        indentation.decreaseBlockLevel()
        // All three should be popped: the two top-levels and the block-level
        assert.strictEqual(indentation.getLevel(), 0)
    })

    test('decreaseBlockLevel stops at first non-top-level (the block itself)', () => {
        const indentation = new Indentation('  ')
        indentation.increaseBlockLevel()  // block
        indentation.increaseTopLevel()    // top-level inside block
        indentation.increaseBlockLevel()  // nested block
        indentation.increaseTopLevel()    // top-level inside nested block
        assert.strictEqual(indentation.getLevel(), 4)
        indentation.decreaseBlockLevel()
        // Should pop: top-level (4->3), then nested block-level (3->2), stops
        // Remaining: block-level + top-level inside it = 2
        assert.strictEqual(indentation.getLevel(), 2)
    })

    test('decreaseBlockLevel does nothing on empty stack', () => {
        const indentation = new Indentation('  ')
        indentation.decreaseBlockLevel()
        assert.strictEqual(indentation.getLevel(), 0)
    })

    test('multiple top-level increments and decrements', () => {
        const indentation = new Indentation('    ')
        indentation.increaseTopLevel()
        indentation.increaseTopLevel()
        assert.strictEqual(indentation.getLevel(), 2)
        indentation.decreaseTopLevel()
        assert.strictEqual(indentation.getLevel(), 1)
        indentation.decreaseTopLevel()
        assert.strictEqual(indentation.getLevel(), 0)
    })
})

// ============================================================================
// Layout Tests
// ============================================================================
suite('Layout', () => {

    test('WS enum has correct values', () => {
        assert.strictEqual(WS.SPACE, 0)
        assert.strictEqual(WS.NO_SPACE, 1)
        assert.strictEqual(WS.NO_NEWLINE, 2)
        assert.strictEqual(WS.NEWLINE, 3)
        assert.strictEqual(WS.MANDATORY_NEWLINE, 4)
        assert.strictEqual(WS.INDENT, 5)
        assert.strictEqual(WS.SINGLE_INDENT, 6)
    })

    test('add() adds string items', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.SPACE, '*')
        assert.strictEqual(layout.toString(), 'SELECT *')
    })

    test('add() adds multiple items', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.SPACE, '1', WS.SPACE, '+', WS.SPACE, '2')
        assert.strictEqual(layout.toString(), 'SELECT 1 + 2')
    })

    test('toString() produces correct output with newlines and indentation', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.SPACE, '*')
        layout.add(WS.NEWLINE)
        layout.add(WS.INDENT, 'FROM', WS.SPACE, 'table1')
        assert.strictEqual(layout.toString(), 'SELECT *\nFROM table1')
    })

    test('NO_SPACE removes preceding horizontal whitespace', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.SPACE, WS.NO_SPACE, '*')
        assert.strictEqual(layout.toString(), 'SELECT*')
    })

    test('NO_NEWLINE removes preceding removable whitespace (including NEWLINE)', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.NEWLINE, WS.NO_NEWLINE, WS.SPACE, '*')
        // NO_NEWLINE removes the NEWLINE, then SPACE is added
        assert.strictEqual(layout.toString(), 'SELECT *')
    })

    test('NO_NEWLINE does not remove MANDATORY_NEWLINE', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.MANDATORY_NEWLINE, WS.NO_NEWLINE, WS.SPACE, '*')
        // MANDATORY_NEWLINE is not removed by NO_NEWLINE
        assert.strictEqual(layout.toString(), 'SELECT\n *')
    })

    test('NEWLINE adds newline and removes preceding horizontal whitespace', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.SPACE, WS.NEWLINE, '*')
        // The SPACE before NEWLINE is trimmed
        assert.strictEqual(layout.toString(), 'SELECT\n*')
    })

    test('consecutive NEWLINEs are merged (second NEWLINE replaces first)', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.NEWLINE, WS.NEWLINE, '*')
        // Two NEWLINEs should merge into one
        assert.strictEqual(layout.toString(), 'SELECT\n*')
    })

    test('NEWLINE after MANDATORY_NEWLINE is suppressed', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.MANDATORY_NEWLINE, WS.NEWLINE, '*')
        // MANDATORY_NEWLINE cannot be overridden by NEWLINE
        assert.strictEqual(layout.toString(), 'SELECT\n*')
    })

    test('MANDATORY_NEWLINE always adds newline', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.MANDATORY_NEWLINE, 'FROM')
        assert.strictEqual(layout.toString(), 'SELECT\nFROM')
    })

    test('MANDATORY_NEWLINE is not removed by NO_NEWLINE', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.MANDATORY_NEWLINE, WS.NO_NEWLINE, 'FROM')
        assert.strictEqual(layout.toString(), 'SELECT\nFROM')
    })

    test('INDENT adds indentation based on current level', () => {
        const indentation = new Indentation('  ')
        indentation.increaseTopLevel()
        const layout = new Layout(indentation)
        layout.add('SELECT', WS.NEWLINE, WS.INDENT, 'FROM')
        // One top-level indent = 2 spaces
        assert.strictEqual(layout.toString(), 'SELECT\n  FROM')
    })

    test('INDENT with multiple levels', () => {
        const indentation = new Indentation('  ')
        indentation.increaseTopLevel()
        indentation.increaseBlockLevel()
        const layout = new Layout(indentation)
        layout.add('SELECT', WS.NEWLINE, WS.INDENT, 'FROM')
        // Two levels of indent = 4 spaces
        assert.strictEqual(layout.toString(), 'SELECT\n    FROM')
    })

    test('SINGLE_INDENT adds one indent unit', () => {
        const indentation = new Indentation('----')
        const layout = new Layout(indentation)
        layout.add(WS.SINGLE_INDENT, 'text')
        assert.strictEqual(layout.toString(), '----text')
    })

    test('SINGLE_INDENT can be removed by NO_NEWLINE', () => {
        const indentation = new Indentation('  ')
        const layout = new Layout(indentation)
        layout.add('SELECT', WS.NEWLINE, WS.SINGLE_INDENT, WS.NO_NEWLINE, 'FROM')
        // NO_NEWLINE removes NEWLINE and SINGLE_INDENT
        assert.strictEqual(layout.toString(), 'SELECTFROM')
    })

    test('getLayoutItems returns internal items array', () => {
        const layout = new Layout(new Indentation('  '))
        layout.add('SELECT', WS.SPACE, '*')
        const items = layout.getLayoutItems()
        assert.deepStrictEqual(items, ['SELECT', WS.SPACE, '*'])
    })

    test('empty layout produces empty string', () => {
        const layout = new Layout(new Indentation('  '))
        assert.strictEqual(layout.toString(), '')
    })

    test('complex layout with mixed whitespace instructions', () => {
        const indentation = new Indentation('  ')
        indentation.increaseTopLevel()
        const layout = new Layout(indentation)
        layout.add('SELECT', WS.NEWLINE)
        layout.add(WS.INDENT, 'col1,', WS.NEWLINE)
        layout.add(WS.INDENT, 'col2', WS.NEWLINE)
        layout.add('FROM', WS.SPACE, 't')
        // SELECT\n  col1,\n  col2\nFROM t
        assert.strictEqual(layout.toString(), 'SELECT\n  col1,\n  col2\nFROM t')
    })
})

// ============================================================================
// InlineLayout Tests
// ============================================================================
suite('InlineLayout', () => {

    test('add() adds text items within expressionWidth', () => {
        const layout = new InlineLayout(50)
        layout.add('SELECT', WS.SPACE, '*', WS.SPACE, 'FROM', WS.SPACE, 't')
        assert.strictEqual(layout.toString(), 'SELECT * FROM t')
    })

    test('throws InlineLayoutError when content exceeds expressionWidth', () => {
        const layout = new InlineLayout(5)
        assert.throws(
            () => layout.add('SELECT'),
            InlineLayoutError
        )
    })

    test('throws InlineLayoutError on NEWLINE', () => {
        const layout = new InlineLayout(100)
        assert.throws(
            () => layout.add('SELECT', WS.NEWLINE, 'FROM'),
            InlineLayoutError
        )
    })

    test('throws InlineLayoutError on MANDATORY_NEWLINE', () => {
        const layout = new InlineLayout(100)
        assert.throws(
            () => layout.add('SELECT', WS.MANDATORY_NEWLINE, 'FROM'),
            InlineLayoutError
        )
    })

    test('works within width limit (boundary case)', () => {
        // "SELECT" is 6 chars, expressionWidth=6 should be OK (<=)
        const layout = new InlineLayout(6)
        layout.add('SELECT')
        assert.strictEqual(layout.toString(), 'SELECT')
    })

    test('NO_SPACE reduces tracked length', () => {
        // "a" (1) + SPACE (1) + NO_SPACE (-1) + "b" (1) = 2 chars
        const layout = new InlineLayout(5)
        layout.add('a', WS.SPACE, WS.NO_SPACE, 'b')
        assert.strictEqual(layout.toString(), 'ab')
    })

    test('NO_NEWLINE reduces tracked length when trailing space exists', () => {
        const layout = new InlineLayout(10)
        layout.add('a', WS.SPACE, WS.NO_NEWLINE, 'b')
        // NO_NEWLINE removes the tracked space
        assert.strictEqual(layout.toString(), 'ab')
    })

    test('InlineLayoutError is an instance of Error', () => {
        const err = new InlineLayoutError()
        assert.ok(err instanceof Error)
    })
})

// ============================================================================
// expandPhrases Tests
// ============================================================================
suite('expandPhrases', () => {

    test('expandSinglePhrase handles plain text', () => {
        const result = expandSinglePhrase('SELECT')
        assert.deepStrictEqual(result, ['SELECT'])
    })

    test('expandSinglePhrase expands optional blocks [...]', () => {
        // "CREATE [OR REPLACE] TABLE" should produce:
        // "CREATE TABLE" and "CREATE OR REPLACE TABLE"
        const result = expandSinglePhrase('CREATE [OR REPLACE] TABLE')
        assert.deepStrictEqual(result, [
            'CREATE TABLE',
            'CREATE OR REPLACE TABLE',
        ])
    })

    test('expandSinglePhrase expands choices A|B', () => {
        const result = expandSinglePhrase('CREATE [TEMP|TEMPORARY] TABLE')
        assert.deepStrictEqual(result, [
            'CREATE TABLE',
            'CREATE TEMP TABLE',
            'CREATE TEMPORARY TABLE',
        ])
    })

    test('expandSinglePhrase handles nested combinations', () => {
        const result = expandSinglePhrase('CREATE [OR REPLACE] [TEMP|TEMPORARY] TABLE')
        // All combinations of optional + choices
        assert.deepStrictEqual(result, [
            'CREATE TABLE',
            'CREATE TEMP TABLE',
            'CREATE TEMPORARY TABLE',
            'CREATE OR REPLACE TABLE',
            'CREATE OR REPLACE TEMP TABLE',
            'CREATE OR REPLACE TEMPORARY TABLE',
        ])
    })

    test('expandSinglePhrase handles mandatory blocks {}', () => {
        // {} is mandatory_block - must pick one, no empty option
        const result = expandSinglePhrase('CREATE {OR REPLACE} TABLE')
        assert.deepStrictEqual(result, ['CREATE OR REPLACE TABLE'])
    })

    test('expandSinglePhrase strips extra whitespace', () => {
        const result = expandSinglePhrase('SELECT   col   FROM  t')
        assert.deepStrictEqual(result, ['SELECT col FROM t'])
    })

    test('expandPhrases processes arrays', () => {
        const phrases = ['CREATE [OR REPLACE] TABLE', 'DROP TABLE']
        const result = expandPhrases(phrases)
        assert.deepStrictEqual(result, [
            'CREATE TABLE',
            'CREATE OR REPLACE TABLE',
            'DROP TABLE',
        ])
    })

    test('expandSinglePhrase with deeply nested optional and choice', () => {
        const result = expandSinglePhrase('A [B [C|D] E]')
        assert.deepStrictEqual(result, [
            'A',
            'A B E',
            'A B C E',
            'A B D E',
        ])
    })

    test('expandPhrases with empty array', () => {
        const result = expandPhrases([])
        assert.deepStrictEqual(result, [])
    })
})

// ============================================================================
// config Tests
// ============================================================================
suite('config', () => {

    test('indentString returns spaces string for tabWidth', () => {
        const result = indentString({ tabWidth: 4, useTabs: false } as any)
        assert.strictEqual(result, '    ')
    })

    test('indentString returns 2 spaces for tabWidth=2', () => {
        const result = indentString({ tabWidth: 2, useTabs: false } as any)
        assert.strictEqual(result, '  ')
    })

    test('indentString returns tab for useTabs', () => {
        const result = indentString({ tabWidth: 4, useTabs: true } as any)
        assert.strictEqual(result, '\t')
    })

    test('indentString returns 10 spaces for tabularLeft style', () => {
        const result = indentString({
            tabWidth: 4,
            useTabs: false,
            indentStyle: 'tabularLeft',
        } as any)
        assert.strictEqual(result, '          ') // 10 spaces
    })

    test('indentString returns 10 spaces for tabularRight style', () => {
        const result = indentString({
            tabWidth: 4,
            useTabs: false,
            indentStyle: 'tabularRight',
        } as any)
        assert.strictEqual(result, '          ') // 10 spaces
    })

    test('isTabularStyle returns true for tabularLeft', () => {
        assert.strictEqual(
            isTabularStyle({ indentStyle: 'tabularLeft' } as any),
            true
        )
    })

    test('isTabularStyle returns true for tabularRight', () => {
        assert.strictEqual(
            isTabularStyle({ indentStyle: 'tabularRight' } as any),
            true
        )
    })

    test('isTabularStyle returns false for standard', () => {
        assert.strictEqual(
            isTabularStyle({ indentStyle: 'standard' } as any),
            false
        )
    })
})

// ============================================================================
// Params Tests
// ============================================================================
suite('Params', () => {

    test('get returns value for named param', () => {
        const params = new Params({ name: 'Alice', age: '30' })
        const result = params.get({ key: 'name', text: ':name' })
        assert.strictEqual(result, 'Alice')
    })

    test('get returns value for indexed param', () => {
        const params = new Params(['first', 'second', 'third'])
        const result = params.get({ text: '?' })
        assert.strictEqual(result, 'first')
    })

    test('get increments index for positional params', () => {
        const params = new Params(['a', 'b', 'c'])
        assert.strictEqual(params.get({ text: '?' }), 'a')
        assert.strictEqual(params.get({ text: '?' }), 'b')
        assert.strictEqual(params.get({ text: '?' }), 'c')
    })

    test('get returns original text when no params provided', () => {
        const params = new Params(undefined)
        const result = params.get({ key: 'name', text: ':name' })
        assert.strictEqual(result, ':name')
    })

    test('get returns original text when key not found in named params', () => {
        const params = new Params({ name: 'Alice' })
        const result = params.get({ key: 'unknown', text: ':unknown' })
        assert.strictEqual(result, undefined)
    })

    test('getPositionalParameterIndex returns current index', () => {
        const params = new Params(['a', 'b', 'c'])
        assert.strictEqual(params.getPositionalParameterIndex(), 0)
        params.get({ text: '?' })
        assert.strictEqual(params.getPositionalParameterIndex(), 1)
    })

    test('setPositionalParameterIndex sets index', () => {
        const params = new Params(['a', 'b', 'c'])
        params.setPositionalParameterIndex(2)
        assert.strictEqual(params.getPositionalParameterIndex(), 2)
        assert.strictEqual(params.get({ text: '?' }), 'c')
    })
})

// ============================================================================
// tabularStyle Tests
// ============================================================================
suite('tabularStyle', () => {

    test('toTabularFormat with standard returns unchanged', () => {
        const result = toTabularFormat('SELECT', 'standard')
        assert.strictEqual(result, 'SELECT')
    })

    test('toTabularFormat with tabularLeft left-aligns (padEnd)', () => {
        const result = toTabularFormat('FROM', 'tabularLeft')
        // "FROM" is 4 chars, padEnd to 9 => "FROM     "
        assert.strictEqual(result, 'FROM     ')
    })

    test('toTabularFormat with tabularRight right-aligns (padStart)', () => {
        const result = toTabularFormat('FROM', 'tabularRight')
        // "FROM" is 4 chars, padStart to 9 => "     FROM"
        assert.strictEqual(result, '     FROM')
    })

    test('toTabularFormat with tabularLeft handles token >= 10 chars with spaces', () => {
        // e.g. "INNER JOIN" - splits into "INNER" + ["JOIN"], pads "INNER"
        const result = toTabularFormat('INNER JOIN', 'tabularLeft')
        // "INNER" is 5 chars, padEnd to 9 => "INNER    ", then " JOIN"
        assert.strictEqual(result, 'INNER     JOIN')
    })

    test('toTabularFormat with tabularRight handles token >= 10 chars with spaces', () => {
        const result = toTabularFormat('INNER JOIN', 'tabularRight')
        // "INNER" is 5 chars, padStart to 9 => "    INNER", then " JOIN"
        assert.strictEqual(result, '    INNER JOIN')
    })

    test('isTabularToken returns true for RESERVED_CLAUSE', () => {
        assert.strictEqual(
            isTabularToken(TokenType.RESERVED_CLAUSE),
            true
        )
    })

    test('isTabularToken returns true for RESERVED_SELECT', () => {
        assert.strictEqual(
            isTabularToken(TokenType.RESERVED_SELECT),
            true
        )
    })

    test('isTabularToken returns true for RESERVED_SET_OPERATION', () => {
        assert.strictEqual(
            isTabularToken(TokenType.RESERVED_SET_OPERATION),
            true
        )
    })

    test('isTabularToken returns true for RESERVED_JOIN', () => {
        assert.strictEqual(
            isTabularToken(TokenType.RESERVED_JOIN),
            true
        )
    })

    test('isTabularToken returns true for LIMIT', () => {
        assert.strictEqual(
            isTabularToken(TokenType.LIMIT),
            true
        )
    })

    test('isTabularToken returns false for regular token types', () => {
        assert.strictEqual(
            isTabularToken(TokenType.OPEN_PAREN),
            false
        )
        assert.strictEqual(
            isTabularToken(TokenType.COMMA),
            false
        )
    })

    test('toTabularFormat short token padEnd to 9 chars total with space', () => {
        const result = toTabularFormat('ON', 'tabularLeft')
        // "ON" is 2 chars, padEnd to 9 => "ON       " (7 spaces after)
        assert.strictEqual(result.length, 9)
        assert.strictEqual(result, 'ON       ')
    })
})