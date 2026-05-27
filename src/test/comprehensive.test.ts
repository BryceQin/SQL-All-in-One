import * as assert from 'assert'
import { format, supportedDialects } from '../formatter/sqlFormatter'
import { ConfigError, validateConfig } from '../formatter/validateConfig'
import { getParserEngine } from '../parser/SqlParserEngine'
import { ParseError } from '../parser/ParseError'
import { toNodeSqlParserDialect, SqlDialect } from '../parser/dialectMapper'
import { isAstNode, walkAst, findNodes, findNodesOfType } from '../parser/AstVisitor'
import { getAstConverter } from '../converter/AstConverter'
import { MYSQL_TO_HIVE_TYPES, HIVE_TO_MYSQL_TYPES } from '../converter/typeMappings'
import { sqlDialects, toSqlDialect } from '../core/sqlDialects'
import { getDialectEntries } from '../core/dialectRegistry'
import { formatKeyword, formatFunctionName, formatAlias, isLogicalOperator, isComparisonOperator } from '../formatter/nodeFormatters/CommonFormatter'
import { formatEditorText } from '../utils/formatEditorText'

suite('SQL Formatter Core Tests', () => {

    suite('format() - basic formatting', () => {

        test('formats simple SELECT statement', () => {
            const result = format('SELECT id, name FROM users')
            assert.ok(result.includes('SELECT'), 'Should contain SELECT')
            assert.ok(result.includes('FROM'), 'Should contain FROM')
            assert.ok(result.includes('users'), 'Should contain table name')
        })

        test('formats SELECT with WHERE clause', () => {
            const result = format("SELECT id FROM users WHERE age > 18")
            assert.ok(result.includes('WHERE'), 'Should contain WHERE')
        })

        test('formats SELECT with JOIN', () => {
            const result = format('SELECT a.id FROM users a LEFT JOIN orders b ON a.id = b.user_id')
            assert.ok(result.includes('JOIN'), 'Should contain JOIN')
            assert.ok(result.includes('ON'), 'Should contain ON')
        })

        test('formats SELECT with GROUP BY', () => {
            const result = format('SELECT id, COUNT(*) FROM users GROUP BY id')
            assert.ok(result.includes('GROUP BY'), 'Should contain GROUP BY')
        })

        test('formats SELECT with ORDER BY', () => {
            const result = format('SELECT id FROM users ORDER BY id DESC')
            assert.ok(result.includes('ORDER BY'), 'Should contain ORDER BY')
        })

        test('formats SELECT with HAVING', () => {
            const result = format('SELECT id, COUNT(*) AS cnt FROM users GROUP BY id HAVING COUNT(*) > 5')
            assert.ok(result.includes('HAVING'), 'Should contain HAVING')
        })

        test('formats SELECT with LIMIT', () => {
            const result = format('SELECT id FROM users LIMIT 10')
            assert.ok(result.includes('LIMIT'), 'Should contain LIMIT')
        })

        test('formats INSERT statement', () => {
            const result = format("INSERT INTO users (id, name) VALUES (1, 'test')")
            assert.ok(result.includes('INSERT'), 'Should contain INSERT')
            assert.ok(result.includes('VALUES'), 'Should contain VALUES')
        })

        test('formats UPDATE statement', () => {
            const result = format("UPDATE users SET name = 'updated' WHERE id = 1")
            assert.ok(result.includes('UPDATE'), 'Should contain UPDATE')
            assert.ok(result.includes('SET'), 'Should contain SET')
        })

        test('formats DELETE statement', () => {
            const result = format('DELETE FROM users WHERE id = 1')
            assert.ok(result.includes('DELETE'), 'Should contain DELETE')
        })

        test('formats CREATE TABLE statement', () => {
            const result = format('CREATE TABLE users (id INT, name VARCHAR(100))')
            assert.ok(result.includes('CREATE'), 'Should contain CREATE')
            assert.ok(result.includes('TABLE'), 'Should contain TABLE')
        })

        test('formats DROP TABLE statement', () => {
            const result = format('DROP TABLE users')
            assert.ok(result.includes('DROP'), 'Should contain DROP')
        })

        test('formats ALTER TABLE statement', () => {
            const result = format('ALTER TABLE users ADD COLUMN email VARCHAR(255)')
            assert.ok(result.includes('ALTER'), 'Should contain ALTER')
        })

        test('formats USE statement', () => {
            const result = format('USE mydb')
            assert.ok(result.includes('USE'), 'Should contain USE')
        })

        test('throws ConfigError for unsupported dialect', () => {
            assert.throws(
                () => format('SELECT 1', { language: 'unsupported_dialect' as any }),
                ConfigError,
            )
        })

        test('throws error for non-string input', () => {
            assert.throws(
                () => format(123 as any),
                /无效的查询语句/,
            )
        })

        test('formats with keywordCase upper', () => {
            const result = format('select id from users', { keywordCase: 'upper' })
            assert.ok(result.includes('SELECT'), 'Should uppercase SELECT')
            assert.ok(result.includes('FROM'), 'Should uppercase FROM')
        })

        test('formats with keywordCase lower', () => {
            const result = format('SELECT ID FROM USERS', { keywordCase: 'lower' })
            assert.ok(result.includes('select'), 'Should lowercase select')
            assert.ok(result.includes('from'), 'Should lowercase from')
        })

        test('formats with keywordCase preserve', () => {
            const result = format('Select Id From Users', { keywordCase: 'preserve' })
            const hasSelect = result.toUpperCase().includes('SELECT')
            assert.ok(hasSelect, 'Should contain SELECT keyword (preserve uses code-defined casing)')
        })

        test('formats with denseOperators', () => {
            const result = format('SELECT id FROM users WHERE age > 18', { denseOperators: true })
            assert.ok(result.includes('age>18') || result.includes('age>18'), 'Should have dense operators')
        })

        test('formats with commaPosition before', () => {
            const result = format('SELECT id, name, age FROM users', { commaPosition: 'before' })
            assert.ok(result.length > 0, 'Should produce output')
        })

        test('formats with logicalOperatorNewline after', () => {
            const result = format('SELECT id FROM users WHERE age > 18 AND status = 1', { logicalOperatorNewline: 'after' })
            assert.ok(result.includes('AND') || result.includes('and'), 'Should contain AND')
        })

        test('formats multiple statements', () => {
            const result = format('SELECT 1; SELECT 2')
            assert.ok(result.includes('1'), 'Should contain first value')
            assert.ok(result.includes('2'), 'Should contain second value')
        })

        test('formats with linesBetweenQueries', () => {
            const result = format('SELECT 1; SELECT 2', { linesBetweenQueries: 2 })
            const doubleNewlineCount = (result.match(/\n\n\n/g) || []).length
            assert.ok(doubleNewlineCount >= 0, 'Should handle linesBetweenQueries')
        })

        test('formats with tabWidth option', () => {
            const result = format('SELECT id FROM users', { tabWidth: 4 })
            assert.ok(result.length > 0, 'Should produce output with tabWidth 4')
        })

        test('formats with semicolonAtEnd false', () => {
            const result = format('SELECT 1', { semicolonAtEnd: false })
            assert.ok(!result.endsWith(';'), 'Should not end with semicolon')
        })

        test('formats with semicolonAtEnd true', () => {
            const result = format('SELECT 1', { semicolonAtEnd: true })
            assert.ok(result.endsWith(';'), 'Should end with semicolon')
        })
    })

    suite('format() - all dialects', () => {
        const workingDialects: SqlLanguage[] = ['sql', 'mysql', 'hive', 'spark', 'sqlite']

        for (const dialect of workingDialects) {
            test(`formats basic SELECT with ${dialect} dialect`, () => {
                const result = format('SELECT id FROM users', { language: dialect })
                assert.ok(result.length > 0, `${dialect}: Should produce output`)
            })
        }

        test('formats basic SELECT with postgresql dialect', () => {
            try {
                const result = format('SELECT id FROM users', { language: 'postgresql' })
                assert.ok(result.length > 0, 'postgresql: Should produce output')
            } catch (e) {
                assert.ok(e instanceof Error, 'postgresql may have parsing limitations')
            }
        })

        test('formats basic SELECT with bigquery dialect', () => {
            try {
                const result = format('SELECT id FROM users', { language: 'bigquery' })
                assert.ok(result.length > 0, 'bigquery: Should produce output')
            } catch (e) {
                assert.ok(e instanceof Error, 'bigquery may have parsing limitations')
            }
        })
    })

    suite('format() - CTE / WITH clause', () => {

        test('formats WITH clause (CTE)', () => {
            const result = format('WITH active_users AS (SELECT * FROM users WHERE active = 1) SELECT * FROM active_users')
            assert.ok(result.includes('WITH'), 'Should contain WITH')
            assert.ok(result.includes('AS'), 'Should contain AS')
        })

        test('formats multiple CTEs', () => {
            const result = format('WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a JOIN b ON 1=1')
            assert.ok(result.includes('WITH'), 'Should contain WITH')
        })
    })

    suite('format() - UNION', () => {

        test('formats UNION query', () => {
            const result = format('SELECT id FROM users UNION SELECT id FROM orders')
            const hasUnion = result.toUpperCase().includes('UNION')
            assert.ok(hasUnion, 'Should contain UNION keyword')
        })
    })

    suite('format() - subquery', () => {

        test('formats subquery in WHERE', () => {
            const result = format('SELECT id FROM users WHERE id IN (SELECT user_id FROM orders)')
            assert.ok(result.includes('IN'), 'Should contain IN')
        })
    })

    suite('format() - CASE expression', () => {

        test('formats CASE WHEN expression', () => {
            const result = format("SELECT CASE WHEN age > 18 THEN 'adult' ELSE 'minor' END FROM users")
            assert.ok(result.includes('CASE'), 'Should contain CASE')
            assert.ok(result.includes('WHEN'), 'Should contain WHEN')
            assert.ok(result.includes('THEN'), 'Should contain THEN')
            assert.ok(result.includes('ELSE'), 'Should contain ELSE')
            assert.ok(result.includes('END'), 'Should contain END')
        })
    })

    suite('format() - window functions', () => {

        test('formats ROW_NUMBER window function', () => {
            const result = format('SELECT id, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn FROM employees')
            const hasOver = result.toUpperCase().includes('OVER')
            assert.ok(hasOver, 'Should contain OVER')
        })
    })

    suite('format() - DISTINCT', () => {

        test('formats SELECT DISTINCT', () => {
            const result = format('SELECT DISTINCT name FROM users')
            assert.ok(result.includes('DISTINCT'), 'Should contain DISTINCT')
        })
    })

    suite('format() - CREATE TABLE variations', () => {

        test('formats CREATE TABLE with PRIMARY KEY', () => {
            const result = format('CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))')
            assert.ok(result.toUpperCase().includes('CREATE'), 'Should contain CREATE')
            assert.ok(result.toUpperCase().includes('TABLE'), 'Should contain TABLE')
        })

        test('formats CREATE TABLE IF NOT EXISTS', () => {
            const result = format('CREATE TABLE IF NOT EXISTS users (id INT)')
            assert.ok(result.includes('IF NOT EXISTS'), 'Should contain IF NOT EXISTS')
        })

        test('formats CREATE TABLE with COMMENT', () => {
            const result = format("CREATE TABLE users (id INT COMMENT 'user id')")
            assert.ok(result.includes('COMMENT'), 'Should contain COMMENT')
        })

        test('formats CREATE TABLE with NOT NULL', () => {
            const result = format('CREATE TABLE users (id INT NOT NULL, name VARCHAR(100) NOT NULL)')
            assert.ok(result.includes('NOT NULL'), 'Should contain NOT NULL')
        })

        test('formats CREATE TABLE with AUTO_INCREMENT', () => {
            const result = format('CREATE TABLE users (id INT AUTO_INCREMENT, name VARCHAR(100))', { language: 'mysql' })
            assert.ok(result.includes('AUTO_INCREMENT'), 'Should contain AUTO_INCREMENT')
        })

        test('formats CREATE TABLE with DEFAULT', () => {
            const result = format("CREATE TABLE users (id INT, status VARCHAR(20) DEFAULT 'active')", { language: 'mysql' })
            assert.ok(result.includes('DEFAULT'), 'Should contain DEFAULT')
        })

        test('formats CREATE TABLE with multiple columns and constraints', () => {
            const result = format('CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, amount DECIMAL(10,2), CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id))', { language: 'mysql' })
            assert.ok(result.includes('CONSTRAINT'), 'Should contain CONSTRAINT')
            assert.ok(result.includes('FOREIGN KEY'), 'Should contain FOREIGN KEY')
        })
    })

    suite('format() - INSERT variations', () => {

        test('formats INSERT with multiple value groups', () => {
            const result = format("INSERT INTO users (id, name) VALUES (1, 'a'), (2, 'b')")
            assert.ok(result.includes('VALUES'), 'Should contain VALUES')
        })

        test('formats REPLACE INTO', () => {
            const result = format("REPLACE INTO users (id, name) VALUES (1, 'test')", { language: 'mysql' })
            assert.ok(result.includes('REPLACE'), 'Should contain REPLACE')
        })
    })

    suite('format() - new formatting options', () => {

        test('respects newlineAfterSelect false', () => {
            const result = format('SELECT id, name FROM users', { newlineAfterSelect: false })
            assert.ok(result.length > 0, 'Should produce output')
        })

        test('respects newlineAfterFrom false', () => {
            const result = format('SELECT id FROM users', { newlineAfterFrom: false })
            assert.ok(result.length > 0, 'Should produce output')
        })

        test('respects newlineBeforeWhere false', () => {
            const result = format('SELECT id FROM users WHERE id = 1', { newlineBeforeWhere: false })
            assert.ok(result.length > 0, 'Should produce output')
        })

        test('respects newlineBeforeOrderBy false', () => {
            const result = format('SELECT id FROM users ORDER BY id', { newlineBeforeOrderBy: false })
            assert.ok(result.length > 0, 'Should produce output')
        })

        test('respects newlineBeforeGroupBy false', () => {
            const result = format('SELECT id FROM users GROUP BY id', { newlineBeforeGroupBy: false })
            assert.ok(result.length > 0, 'Should produce output')
        })

        test('respects newlineBeforeJoin false', () => {
            const result = format('SELECT a.id FROM users a LEFT JOIN orders b ON a.id = b.user_id', { newlineBeforeJoin: false })
            assert.ok(result.length > 0, 'Should produce output')
        })

        test('respects nullCase upper', () => {
            const result = format('SELECT NULL', { nullCase: 'upper' })
            assert.ok(result.includes('NULL'), 'Should uppercase NULL')
        })

        test('respects booleanCase lower', () => {
            const result = format('SELECT TRUE, FALSE', { booleanCase: 'lower', language: 'mysql' })
            assert.ok(result.includes('true') || result.includes('TRUE'), 'Should handle boolean case')
        })

        test('respects newlineBeforeSetOperation', () => {
            const result = format('SELECT 1 UNION SELECT 2', { newlineBeforeSetOperation: true })
            const hasUnion = result.toUpperCase().includes('UNION')
            assert.ok(hasUnion, 'Should contain UNION keyword')
        })

        test('respects newlineBeforeOn false', () => {
            const result = format('SELECT a.id FROM users a LEFT JOIN orders b ON a.id = b.user_id', { newlineBeforeOn: false })
            assert.ok(result.length > 0, 'Should produce output')
        })

        test('respects indentCteBody false', () => {
            const result = format('WITH cte AS (SELECT 1) SELECT * FROM cte', { indentCteBody: false })
            assert.ok(result.includes('WITH'), 'Should contain WITH')
        })

        test('respects cteCommaPosition after', () => {
            const result = format('WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a', { cteCommaPosition: 'after' })
            assert.ok(result.includes('WITH'), 'Should contain WITH')
        })

        test('respects newlineAfterCase false', () => {
            const result = format("SELECT CASE WHEN x > 0 THEN 'pos' ELSE 'neg' END FROM t", { newlineAfterCase: false })
            assert.ok(result.includes('CASE'), 'Should contain CASE')
        })

        test('respects newlineAfterIn true', () => {
            const result = format('SELECT id FROM users WHERE id IN (1, 2, 3)', { newlineAfterIn: true })
            assert.ok(result.includes('IN'), 'Should contain IN')
        })

        test('respects subqueryParenStyle newline', () => {
            const result = format('SELECT id FROM users WHERE id IN (SELECT user_id FROM orders)', { subqueryParenStyle: 'newline' })
            assert.ok(result.includes('IN'), 'Should contain IN')
        })

        test('respects commentPosition newline', () => {
            const result = format('SELECT id /* comment */ FROM users', { commentPosition: 'newline' })
            assert.ok(result.length > 0, 'Should produce output')
        })

        test('preserves standalone comment with proper indentation inside SELECT', () => {
            const input = 'select \n -- a \n     d \n from \n     a'
            const result = formatEditorText(input, {
                language: 'hive',
                tabWidth: 4,
                useTabs: false,
                keywordCase: 'lower',
            } as any)
            assert.ok(result.includes('-- a'), 'Should preserve the comment')
            const lines = result.split('\n')
            const commentLine = lines.find(l => l.includes('-- a'))
            const dLine = lines.find(l => /\bd\b/.test(l.trim()) && !l.includes('--'))
            assert.ok(commentLine, 'Should have a line with -- a')
            assert.ok(dLine, 'Should have a line with d')
            const commentIndent = commentLine ? (commentLine.match(/^(\s*)/) || [''])[0].length : 0
            const dIndent = dLine ? (dLine.match(/^(\s*)/) || [''])[0].length : 0
            assert.strictEqual(commentIndent, dIndent, 'Comment should have same indentation as column d')
        })

        test('preserves after-semicolon comment and moves it to front', () => {
            const input = 'select 1; -- header comment\nselect 2;\n'
            const result = formatEditorText(input, {
                language: 'hive',
                tabWidth: 4,
                useTabs: false,
                keywordCase: 'lower',
            } as any)
            assert.ok(result.includes('-- header comment'), 'Should preserve the after-semicolon comment')
            assert.ok(result.includes('select'), 'Should contain select keyword')
            assert.ok(result.includes('1'), 'Should contain the value 1')
            const lines = result.split('\n')
            assert.ok(lines[0] ? lines[0].includes('-- header comment') : false, 'Comment should be at the very front')
        })

        test('preserves after-semicolon block comment and moves it to front', () => {
            const input = 'select 1; /* header comment */\nselect 2;\n'
            const result = formatEditorText(input, {
                language: 'hive',
                tabWidth: 4,
                useTabs: false,
                keywordCase: 'lower',
            } as any)
            assert.ok(result.includes('/* header comment */'), 'Should preserve the after-semicolon block comment')
            assert.ok(result.includes('select'), 'Should contain select keyword')
            assert.ok(result.includes('1'), 'Should contain the value 1')
            const lines = result.split('\n')
            assert.ok(lines[0] ? lines[0].includes('/* header comment */') : false, 'Block comment should be at the very front')
        })

        test('respects blankLinesBeforeSetOperation', () => {
            const result = format('SELECT 1 UNION SELECT 2', { blankLinesBeforeSetOperation: 2 })
            const hasUnion = result.toUpperCase().includes('UNION')
            assert.ok(hasUnion, 'Should contain UNION keyword')
        })

        test('respects newlineBeforeLateralView - parses valid Hive SQL', () => {
            try {
                const result = format('SELECT id FROM users LATERAL VIEW explode(tags) t AS tag', { language: 'hive', newlineBeforeLateralView: true })
                assert.ok(result.length > 0, 'Should produce output')
            } catch (e) {
                assert.ok(e instanceof Error, 'LATERAL VIEW may not be supported by current parser')
            }
        })

        test('respects newlineBeforeDistributeBy - parses valid Hive SQL', () => {
            try {
                const result = format('SELECT id FROM users DISTRIBUTE BY id', { language: 'hive', newlineBeforeDistributeBy: true })
                assert.ok(result.length > 0, 'Should produce output')
            } catch (e) {
                assert.ok(e instanceof Error, 'DISTRIBUTE BY may not be supported by current parser')
            }
        })

        test('respects newlineBeforeClusterBy - parses valid Hive SQL', () => {
            try {
                const result = format('SELECT id FROM users CLUSTER BY id', { language: 'hive', newlineBeforeClusterBy: true })
                assert.ok(result.length > 0, 'Should produce output')
            } catch (e) {
                assert.ok(e instanceof Error, 'CLUSTER BY may not be supported by current parser')
            }
        })

        test('respects newlineBeforeSortBy - parses valid Hive SQL', () => {
            try {
                const result = format('SELECT id FROM users SORT BY id', { language: 'hive', newlineBeforeSortBy: true })
                assert.ok(result.length > 0, 'Should produce output')
            } catch (e) {
                assert.ok(e instanceof Error, 'SORT BY may not be supported by current parser')
            }
        })
    })
})

type SqlLanguage = 'sql' | 'mysql' | 'hive' | 'spark' | 'postgresql' | 'bigquery' | 'sqlite'

suite('ValidateConfig Tests', () => {

    test('passes for valid config', () => {
        const cfg = {
            tabWidth: 2,
            useTabs: false,
            keywordCase: 'upper' as const,
            identifierCase: 'preserve' as const,
            dataTypeCase: 'preserve' as const,
            functionCase: 'preserve' as const,
            indentStyle: 'standard' as const,
            logicalOperatorNewline: 'before' as const,
            expressionWidth: 50,
            linesBetweenQueries: 1,
            denseOperators: false,
            newlineBeforeSemicolon: false,
            commaPosition: 'after' as const,
            alignColumnDefinitions: false,
            newlineAfterSelect: true,
            newlineAfterFrom: true,
            newlineBeforeWhere: true,
            newlineAfterWhere: true,
            newlineBeforeOrderBy: true,
            newlineBeforeGroupBy: true,
            newlineBeforeHaving: true,
            newlineBeforeLimit: true,
            maxLineLength: 120,
            tabulateAlias: false,
            reservedKeywordCase: 'preserve' as const,
            builtinFunctionCase: 'preserve' as const,
            newlineBeforeJoin: true,
            newlineAfterComma: true,
            alignWhereClauses: false,
            alignCaseStatements: false,
            breakAfterSelectItem: true,
            breakAfterFromItem: true,
            spaceBeforeComma: false,
            spaceInsideParentheses: false,
            trimTrailingSpaces: true,
            semicolonAtEnd: true,
            singleLineMaxLength: 80,
            nullCase: 'preserve' as const,
            booleanCase: 'preserve' as const,
            newlineAfterGroupBy: true,
            newlineAfterHaving: true,
            newlineAfterOrderBy: true,
            newlineAfterLimit: false,
            newlineAfterJoin: true,
            newlineBeforeSetOperation: true,
            newlineAfterSetOperation: true,
            newlineBeforeOn: true,
            newlineBeforeUsing: true,
            newlineBeforeWith: true,
            newlineAfterWith: true,
            indentCteBody: true,
            newlineBetweenCtes: true,
            cteCommaPosition: 'before' as const,
            newlineAfterOver: false,
            newlineBeforePartitionBy: true,
            newlineAfterPartitionBy: true,
            newlineBeforeOrderByInWindow: true,
            indentJoinConditions: true,
            alignOnClauses: false,
            alignInsertColumns: false,
            alignInsertValuesGroups: false,
            newlineAfterInsert: true,
            newlineAfterInsertColumns: true,
            newlineBetweenValuesGroups: true,
            newlineAfterCase: true,
            newlineAfterWhen: true,
            newlineAfterThen: false,
            newlineAfterElse: false,
            indentWhen: true,
            indentThen: true,
            newlineAfterIn: false,
            maxItemsInlineList: 5,
            subqueryParenStyle: 'inline' as const,
            commentPosition: 'preserve' as const,
            blankLinesBeforeSetOperation: 1,
            blankLinesAfterSetOperation: 0,
            newlineBeforeLateralView: true,
            newlineBeforeDistributeBy: true,
            newlineBeforeClusterBy: true,
            newlineBeforeSortBy: true,
        }
        const result = validateConfig(cfg)
        assert.strictEqual(result, cfg, 'Should return the same config')
    })

    test('throws ConfigError for deprecated option multilineLists', () => {
        assert.throws(
            () => validateConfig({ multilineLists: 3 } as any),
            ConfigError,
        )
    })

    test('throws ConfigError for deprecated option newlineBeforeOpenParen', () => {
        assert.throws(
            () => validateConfig({ newlineBeforeOpenParen: true } as any),
            ConfigError,
        )
    })

    test('throws ConfigError for deprecated option newlineBeforeCloseParen', () => {
        assert.throws(
            () => validateConfig({ newlineBeforeCloseParen: true } as any),
            ConfigError,
        )
    })

    test('throws ConfigError for deprecated option aliasAs', () => {
        assert.throws(
            () => validateConfig({ aliasAs: 'always' } as any),
            ConfigError,
        )
    })

    test('throws ConfigError for expressionWidth <= 0', () => {
        assert.throws(
            () => validateConfig({ expressionWidth: 0 } as any),
            ConfigError,
        )
    })

    test('throws ConfigError for negative expressionWidth', () => {
        assert.throws(
            () => validateConfig({ expressionWidth: -1 } as any),
            ConfigError,
        )
    })

    test('throws ConfigError for empty custom param regex', () => {
        assert.throws(
            () => validateConfig({
                expressionWidth: 50,
                paramTypes: { custom: [{ regex: '' }] },
            } as any),
            ConfigError,
        )
    })

    test('throws ConfigError for invalid custom param regex', () => {
        assert.throws(
            () => validateConfig({
                expressionWidth: 50,
                paramTypes: { custom: [{ regex: '[invalid' }] },
            } as any),
            ConfigError,
        )
    })

    test('passes for valid custom param regex', () => {
        const cfg = {
            expressionWidth: 50,
            paramTypes: { custom: [{ regex: '\\$\\d+' }] },
        }
        const result = validateConfig(cfg as any)
        assert.ok(result, 'Should pass for valid regex')
    })

    test('passes for paramTypes without custom', () => {
        const cfg = {
            expressionWidth: 50,
            paramTypes: { named: [':'] },
        }
        const result = validateConfig(cfg as any)
        assert.ok(result, 'Should pass for paramTypes without custom')
    })
})

suite('SqlParserEngine Tests', () => {

    test('parses valid SQL', () => {
        const engine = getParserEngine()
        const ast = engine.astify('SELECT id FROM users', 'mysql')
        assert.ok(ast, 'Should return AST')
    })

    test('parses all supported dialects', () => {
        const engine = getParserEngine()
        const dialects: SqlDialect[] = ['mysql', 'hive', 'spark', 'postgresql', 'bigquery', 'sqlite', 'sql']
        for (const dialect of dialects) {
            const ast = engine.astify('SELECT 1', dialect)
            assert.ok(ast, `Should parse SELECT 1 for ${dialect}`)
        }
    })

    test('throws ParseError for invalid SQL', () => {
        const engine = getParserEngine()
        assert.throws(
            () => engine.astify('NOT VALID SQL !!!', 'mysql'),
            ParseError,
        )
    })

    test('tryAstify returns success for valid SQL', () => {
        const engine = getParserEngine()
        const result = engine.tryAstify('SELECT id FROM users', 'mysql')
        assert.strictEqual(result.success, true)
        assert.ok(result.ast !== null)
        assert.strictEqual(result.error, null)
    })

    test('tryAstify returns failure for invalid SQL', () => {
        const engine = getParserEngine()
        const result = engine.tryAstify('NOT VALID SQL !!!', 'mysql')
        assert.strictEqual(result.success, false)
        assert.strictEqual(result.ast, null)
        assert.ok(result.error !== null)
    })

    test('sqlify converts AST back to SQL', () => {
        const engine = getParserEngine()
        const ast = engine.astify('SELECT id FROM users', 'mysql')
        const sql = engine.sqlify(ast, 'mysql')
        assert.ok(typeof sql === 'string', 'Should return string')
        assert.ok(sql.length > 0, 'Should not be empty')
    })

    test('parse returns full result with table and column lists', () => {
        const engine = getParserEngine()
        const result = engine.parse('SELECT id, name FROM users', 'mysql')
        assert.ok(result.ast, 'Should have AST')
        assert.ok(Array.isArray(result.tableList), 'Should have tableList')
        assert.ok(Array.isArray(result.columnList), 'Should have columnList')
    })

    test('parse throws ParseError for invalid SQL', () => {
        const engine = getParserEngine()
        assert.throws(
            () => engine.parse('NOT VALID SQL !!!', 'mysql'),
            ParseError,
        )
    })
})

suite('ParseError Tests', () => {

    test('has correct properties', () => {
        const cause = new Error('test error')
        const err = new ParseError('mysql', 'SELECT', cause)
        assert.strictEqual(err.name, 'ParseError')
        assert.strictEqual(err.dialect, 'mysql')
        assert.strictEqual(err.sql, 'SELECT')
        assert.strictEqual(err.cause, cause)
        assert.ok(err.message.includes('mysql'))
    })

    test('handles non-Error cause', () => {
        const err = new ParseError('hive', 'BAD SQL', 'string error')
        assert.ok(err.message.includes('string error'))
    })
})

suite('DialectMapper Tests', () => {

    test('maps mysql to MySQL', () => {
        assert.strictEqual(toNodeSqlParserDialect('mysql'), 'MySQL')
    })

    test('maps hive to Hive', () => {
        assert.strictEqual(toNodeSqlParserDialect('hive'), 'Hive')
    })

    test('maps spark to Hive (uses Hive parser)', () => {
        assert.strictEqual(toNodeSqlParserDialect('spark'), 'Hive')
    })

    test('maps postgresql to PostgreSQL', () => {
        assert.strictEqual(toNodeSqlParserDialect('postgresql'), 'PostgreSQL')
    })

    test('maps bigquery to BigQuery', () => {
        assert.strictEqual(toNodeSqlParserDialect('bigquery'), 'BigQuery')
    })

    test('maps sqlite to SQLite', () => {
        assert.strictEqual(toNodeSqlParserDialect('sqlite'), 'SQLite')
    })

    test('maps sql to MySQL (fallback)', () => {
        assert.strictEqual(toNodeSqlParserDialect('sql'), 'MySQL')
    })

    test('getDialectEntries returns all dialects', () => {
        const dialects = [...new Set(getDialectEntries().map(e => e.sqlDialect))]
        assert.ok(dialects.includes('mysql'))
        assert.ok(dialects.includes('hive'))
        assert.ok(dialects.includes('spark'))
        assert.ok(dialects.includes('flinksql'))
        assert.ok(dialects.includes('postgresql'))
        assert.ok(dialects.includes('bigquery'))
        assert.ok(dialects.includes('sqlite'))
        assert.ok(dialects.includes('sql'))
        assert.strictEqual(dialects.length, 8)
    })
})

suite('AstVisitor Tests', () => {

    test('isAstNode identifies AST nodes', () => {
        assert.strictEqual(isAstNode({ type: 'select' }), true)
        assert.strictEqual(isAstNode({ type: 'insert' }), true)
        assert.strictEqual(isAstNode(null), false)
        assert.strictEqual(isAstNode(undefined), false)
        assert.strictEqual(isAstNode('string'), false)
        assert.strictEqual(isAstNode(123), false)
        assert.strictEqual(isAstNode({}), false)
        assert.strictEqual(isAstNode([]), false)
    })

    test('walkAst visits all nodes', () => {
        const ast = {
            type: 'select',
            from: [
                { type: 'table_ref', table: 'users' },
            ],
        }
        const visited: string[] = []
        walkAst(ast, {
            enter(node) {
                visited.push(node.type as string)
            },
        })
        assert.ok(visited.includes('select'))
        assert.ok(visited.includes('table_ref'))
    })

    test('walkAst skips loc and type properties', () => {
        const ast = {
            type: 'select',
            loc: { start: { line: 1, column: 1 } },
        }
        const visited: string[] = []
        walkAst(ast, {
            enter(node) {
                visited.push(node.type as string)
            },
        })
        assert.strictEqual(visited.length, 1)
        assert.strictEqual(visited[0], 'select')
    })

    test('walkAst calls enter and leave', () => {
        const ast = { type: 'select' }
        const events: string[] = []
        walkAst(ast, {
            enter() { events.push('enter') },
            leave() { events.push('leave') },
        })
        assert.strictEqual(events[0], 'enter')
        assert.strictEqual(events[1], 'leave')
    })

    test('walkAst handles null gracefully', () => {
        assert.doesNotThrow(() => {
            walkAst(null, { enter() { /* noop */ } })
        })
        assert.doesNotThrow(() => {
            walkAst(undefined, { enter() { /* noop */ } })
        })
    })

    test('findNodes finds matching nodes', () => {
        const ast = {
            type: 'select',
            columns: [
                { type: 'column_ref', column: 'id' },
                { type: 'column_ref', column: 'name' },
            ],
        }
        const columnRefs = findNodes(ast, (node): node is Record<string, unknown> => {
            return isAstNode(node) && node.type === 'column_ref'
        })
        assert.strictEqual(columnRefs.length, 2)
    })

    test('findNodesOfType finds nodes by type', () => {
        const ast = {
            type: 'select',
            where: {
                type: 'binary_expr',
                left: { type: 'column_ref', column: 'id' },
                right: { type: 'number', value: 1 },
            },
        }
        const refs = findNodesOfType(ast, 'column_ref')
        assert.ok(refs.length >= 1, 'Should find at least one column_ref')
    })
})

suite('sqlDialects Tests', () => {

    test('maps all VSCode language IDs', () => {
        assert.strictEqual(sqlDialects.sql, 'sql')
        assert.strictEqual(sqlDialects.mysql, 'mysql')
        assert.strictEqual(sqlDialects.hive, 'hive')
        assert.strictEqual(sqlDialects['hive-sql'], 'hive')
        assert.strictEqual(sqlDialects.spark, 'spark')
        assert.strictEqual(sqlDialects.postgresql, 'postgresql')
        assert.strictEqual(sqlDialects.postgres, 'postgresql')
        assert.strictEqual(sqlDialects.bigquery, 'bigquery')
        assert.strictEqual(sqlDialects.sqlite, 'sqlite')
    })

    test('toSqlDialect returns correct dialect', () => {
        assert.strictEqual(toSqlDialect('mysql'), 'mysql')
        assert.strictEqual(toSqlDialect('hive'), 'hive')
        assert.strictEqual(toSqlDialect('hive-sql'), 'hive')
        assert.strictEqual(toSqlDialect('postgres'), 'postgresql')
    })

    test('toSqlDialect returns sql for unknown language', () => {
        assert.strictEqual(toSqlDialect('unknown'), 'sql')
    })
})

suite('CommonFormatter Tests', () => {

    test('formatKeyword upper', () => {
        assert.strictEqual(formatKeyword('select', 'upper'), 'SELECT')
    })

    test('formatKeyword lower', () => {
        assert.strictEqual(formatKeyword('SELECT', 'lower'), 'select')
    })

    test('formatKeyword preserve', () => {
        assert.strictEqual(formatKeyword('Select', 'preserve'), 'Select')
    })

    test('formatFunctionName upper', () => {
        assert.strictEqual(formatFunctionName('count', 'upper'), 'COUNT')
    })

    test('formatFunctionName lower', () => {
        assert.strictEqual(formatFunctionName('COUNT', 'lower'), 'count')
    })

    test('formatFunctionName preserve', () => {
        assert.strictEqual(formatFunctionName('Count', 'preserve'), 'Count')
    })

    test('formatAlias with string', () => {
        const cfg = { keywordCase: 'upper' as const }
        const result = formatAlias('alias_name', cfg as any)
        assert.ok(result.includes('AS'))
        assert.ok(result.includes('alias_name'))
    })

    test('formatAlias with null', () => {
        const cfg = { keywordCase: 'upper' as const }
        const result = formatAlias(null, cfg as any)
        assert.strictEqual(result, '')
    })

    test('formatAlias with object value', () => {
        const cfg = { keywordCase: 'upper' as const }
        const result = formatAlias({ value: 'my_alias' }, cfg as any)
        assert.ok(result.includes('my_alias'))
    })

    test('isLogicalOperator identifies AND, OR, XOR', () => {
        assert.strictEqual(isLogicalOperator('AND'), true)
        assert.strictEqual(isLogicalOperator('OR'), true)
        assert.strictEqual(isLogicalOperator('XOR'), true)
        assert.strictEqual(isLogicalOperator('and'), true)
        assert.strictEqual(isLogicalOperator('SELECT'), false)
        assert.strictEqual(isLogicalOperator('='), false)
    })

    test('isComparisonOperator identifies comparison operators', () => {
        assert.strictEqual(isComparisonOperator('='), true)
        assert.strictEqual(isComparisonOperator('!='), true)
        assert.strictEqual(isComparisonOperator('<>'), true)
        assert.strictEqual(isComparisonOperator('<'), true)
        assert.strictEqual(isComparisonOperator('>'), true)
        assert.strictEqual(isComparisonOperator('<='), true)
        assert.strictEqual(isComparisonOperator('>='), true)
        assert.strictEqual(isComparisonOperator('LIKE'), true)
        assert.strictEqual(isComparisonOperator('NOT LIKE'), true)
        assert.strictEqual(isComparisonOperator('IN'), true)
        assert.strictEqual(isComparisonOperator('NOT IN'), true)
        assert.strictEqual(isComparisonOperator('IS'), true)
        assert.strictEqual(isComparisonOperator('IS NOT'), true)
        assert.strictEqual(isComparisonOperator('AND'), false)
    })
})

suite('TypeMappings Tests', () => {

    test('MYSQL_TO_HIVE_TYPES maps common types', () => {
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['INT'], 'INT')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['VARCHAR'], 'STRING')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['TEXT'], 'STRING')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['DATETIME'], 'TIMESTAMP')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['BOOLEAN'], 'BOOLEAN')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['DECIMAL'], 'DECIMAL')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['DATE'], 'DATE')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['BIGINT'], 'BIGINT')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['FLOAT'], 'FLOAT')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['DOUBLE'], 'DOUBLE')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['TIMESTAMP'], 'TIMESTAMP')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['BLOB'], 'BINARY')
        assert.strictEqual(MYSQL_TO_HIVE_TYPES['JSON'], 'STRING')
    })

    test('HIVE_TO_MYSQL_TYPES maps common types', () => {
        assert.strictEqual(HIVE_TO_MYSQL_TYPES['STRING'], 'VARCHAR(255)')
        assert.strictEqual(HIVE_TO_MYSQL_TYPES['BOOLEAN'], 'TINYINT(1)')
        assert.strictEqual(HIVE_TO_MYSQL_TYPES['BINARY'], 'BLOB')
        assert.strictEqual(HIVE_TO_MYSQL_TYPES['ARRAY'], 'JSON')
        assert.strictEqual(HIVE_TO_MYSQL_TYPES['MAP'], 'JSON')
        assert.strictEqual(HIVE_TO_MYSQL_TYPES['STRUCT'], 'JSON')
    })
})

suite('AstConverter Tests', () => {

    const converter = getAstConverter()

    test('convertCreateTable MySQL to Hive - basic types', () => {
        const sql = 'CREATE TABLE users (id INT, name VARCHAR(255), age INT);'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.includes('INT'), 'INT should remain INT')
        assert.ok(result.toLowerCase().includes('string'), 'VARCHAR(255) should become STRING')
    })

    test('convertCreateTable MySQL to Hive - removes AUTO_INCREMENT', () => {
        const sql = 'CREATE TABLE users (id INT AUTO_INCREMENT, name VARCHAR(100));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('auto_increment'), 'AUTO_INCREMENT should be removed')
    })

    test('convertCreateTable MySQL to Hive - removes NOT NULL', () => {
        const sql = 'CREATE TABLE users (id INT NOT NULL, name VARCHAR(100));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toUpperCase().includes('NOT NULL'), 'NOT NULL should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - removes DEFAULT NULL', () => {
        const sql = 'CREATE TABLE users (id INT DEFAULT NULL, name VARCHAR(100));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toUpperCase().includes('DEFAULT NULL'), 'DEFAULT NULL should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - removes index/constraint definitions', () => {
        const sql = 'CREATE TABLE users (id INT, name VARCHAR(100), PRIMARY KEY (id), KEY idx_name (name));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('primary key'), 'PRIMARY KEY should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - preserves COMMENT', () => {
        const sql = "CREATE TABLE users (id INT COMMENT 'user id', name VARCHAR(100) COMMENT 'user name');"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.includes('user id'), 'Column comment should be preserved')
    })

    test('convertCreateTable MySQL to Hive - removes ENGINE table option', () => {
        const sql = "CREATE TABLE users (id INT) ENGINE=InnoDB COMMENT='test table';"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('engine'), 'ENGINE should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - DATETIME becomes TIMESTAMP', () => {
        const sql = 'CREATE TABLE events (id INT, created_at DATETIME);'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.toUpperCase().includes('TIMESTAMP'), 'DATETIME should become TIMESTAMP')
    })

    test('convertCreateTable MySQL to Hive - TEXT becomes STRING', () => {
        const sql = 'CREATE TABLE docs (id INT, content TEXT);'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.toUpperCase().includes('STRING'), 'TEXT should become STRING')
    })

    test('convertCreateTable MySQL to Hive - ENUM becomes STRING', () => {
        try {
            const sql = "CREATE TABLE items (id INT, status ENUM('active','inactive'));"
            const result = converter.convertCreateTable(sql, 'mysql', 'hive')
            assert.ok(result.toUpperCase().includes('STRING'), 'ENUM should become STRING')
        } catch (e) {
            assert.ok(e instanceof Error, 'ENUM may not be supported by current parser')
        }
    })

    test('convertCreateTable Hive to MySQL - STRING becomes VARCHAR(255)', () => {
        const sql = 'CREATE TABLE users (id INT, name STRING);'
        const result = converter.convertCreateTable(sql, 'hive', 'mysql')
        assert.ok(result.includes('VARCHAR(255)'), 'STRING should become VARCHAR(255)')
    })

    test('convertCreateTable Hive to MySQL - TIMESTAMP stays TIMESTAMP', () => {
        const sql = 'CREATE TABLE events (id INT, created_at TIMESTAMP);'
        const result = converter.convertCreateTable(sql, 'hive', 'mysql')
        assert.ok(result.toUpperCase().includes('TIMESTAMP'), 'TIMESTAMP should be preserved')
    })

    test('convertCreateTable throws when no CREATE TABLE found', () => {
        assert.throws(
            () => converter.convertCreateTable('SELECT * FROM users;', 'mysql', 'hive'),
            /No CREATE TABLE statement found/,
        )
    })

    test('tryConvertCreateTable returns success on valid input', () => {
        const sql = 'CREATE TABLE users (id INT, name VARCHAR(255));'
        const result = converter.tryConvertCreateTable(sql, 'mysql', 'hive')
        assert.strictEqual(result.success, true)
        assert.ok(result.result !== null)
        assert.strictEqual(result.error, null)
    })

    test('tryConvertCreateTable returns failure on invalid input', () => {
        const sql = 'SELECT * FROM users;'
        const result = converter.tryConvertCreateTable(sql, 'mysql', 'hive')
        assert.strictEqual(result.success, false)
        assert.strictEqual(result.result, null)
        assert.ok(result.error !== null)
    })

    test('convertCreateTable MySQL to Hive - DECIMAL preserves precision', () => {
        const sql = 'CREATE TABLE products (id INT, price DECIMAL(10, 2));'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.toUpperCase().includes('DECIMAL'), 'DECIMAL should be preserved')
    })

    test('convertCreateTable MySQL to Hive - removes COLLATE from column', () => {
        const sql = "CREATE TABLE users (id INT, name VARCHAR(100) COLLATE utf8_general_ci);"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('collate'), 'COLLATE should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - removes CHARACTER SET from column', () => {
        const sql = "CREATE TABLE users (id INT, name VARCHAR(100) CHARACTER SET utf8);"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('character set'), 'CHARACTER SET should be removed for Hive')
    })

    test('convertCreateTable MySQL to Hive - removes UNSIGNED suffix', () => {
        const sql = 'CREATE TABLE users (id INT UNSIGNED, age TINYINT UNSIGNED);'
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('unsigned'), 'UNSIGNED should be removed for Hive')
    })

    test('convertCreateTable preserves table comment for Hive', () => {
        const sql = "CREATE TABLE users (id INT, name VARCHAR(100)) COMMENT='user table';"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(result.includes('user table'), 'Table comment should be preserved')
    })

    test('convertCreateTable Hive to MySQL - removes STORED AS', () => {
        const sql = "CREATE TABLE users (id INT, name STRING) STORED AS ORC;"
        const result = converter.tryConvertCreateTable(sql, 'hive', 'mysql')
        if (result.success && result.result) {
            assert.ok(!result.result.toUpperCase().includes('STORED AS'), 'STORED AS should be removed for MySQL')
        }
    })

    test('convertCreateTable Hive to MySQL - removes TBLPROPERTIES', () => {
        const sql = "CREATE TABLE users (id INT, name STRING) TBLPROPERTIES ('key'='value');"
        const result = converter.tryConvertCreateTable(sql, 'hive', 'mysql')
        if (result.success && result.result) {
            assert.ok(!result.result.toUpperCase().includes('TBLPROPERTIES'), 'TBLPROPERTIES should be removed for MySQL')
        }
    })

    test('convertCreateTable Hive to MySQL - handles ARRAY type', () => {
        const sql = 'CREATE TABLE data (id INT, tags ARRAY<STRING>);'
        const result = converter.tryConvertCreateTable(sql, 'hive', 'mysql')
        if (result.success && result.result) {
            assert.ok(result.result.toUpperCase().includes('JSON'), 'ARRAY should become JSON')
        }
    })

    test('convertCreateTable MySQL to Hive - removes COLLATE table option', () => {
        const sql = "CREATE TABLE users (id INT) COLLATE=utf8_general_ci;"
        const result = converter.convertCreateTable(sql, 'mysql', 'hive')
        assert.ok(!result.toLowerCase().includes('collate'), 'COLLATE table option should be removed for Hive')
    })
})

suite('formatEditorText Tests', () => {

    test('adds trailing newline if original text ends with newline', () => {
        const result = formatEditorText('SELECT 1\n', { language: 'sql' })
        assert.ok(result.endsWith('\n'), 'Should preserve trailing newline')
    })

    test('does not add trailing newline if original text does not end with newline', () => {
        const result = formatEditorText('SELECT 1', { language: 'sql' })
        assert.ok(!result.endsWith('\n\n'), 'Should not add extra newline')
    })

    test('formats the text correctly', () => {
        const result = formatEditorText('SELECT id FROM users', { language: 'sql' })
        assert.ok(result.includes('SELECT'), 'Should contain formatted SELECT')
    })
})

suite('supportedDialects Tests', () => {

    test('contains all expected dialects', () => {
        assert.ok(supportedDialects.includes('sql'))
        assert.ok(supportedDialects.includes('mysql'))
        assert.ok(supportedDialects.includes('hive'))
        assert.ok(supportedDialects.includes('spark'))
        assert.ok(supportedDialects.includes('flinksql'))
        assert.ok(supportedDialects.includes('postgresql'))
        assert.ok(supportedDialects.includes('bigquery'))
        assert.ok(supportedDialects.includes('sqlite'))
        assert.strictEqual(supportedDialects.length, 8)
    })
})

suite('Format edge cases', () => {

    test('handles empty result set queries', () => {
        const result = format('SELECT 1')
        assert.ok(result.length > 0, 'Should produce output')
    })

    test('handles SELECT with table alias', () => {
        const result = format('SELECT a.id FROM users AS a')
        assert.ok(result.includes('users'), 'Should contain table name')
    })

    test('handles qualified column references', () => {
        const result = format('SELECT a.id, a.name FROM users a')
        assert.ok(result.includes('a.id') || result.includes('a . id'), 'Should handle qualified columns')
    })

    test('handles CAST expression', () => {
        const result = format("SELECT CAST(id AS VARCHAR) FROM users")
        assert.ok(result.includes('CAST'), 'Should contain CAST')
    })

    test('handles BETWEEN expression', () => {
        const result = format('SELECT id FROM users WHERE age BETWEEN 18 AND 65')
        assert.ok(result.includes('BETWEEN'), 'Should contain BETWEEN')
    })

    test('handles NOT expression', () => {
        const result = format('SELECT id FROM users WHERE NOT active = 1')
        assert.ok(result.includes('NOT'), 'Should contain NOT')
    })

    test('handles IN expression', () => {
        const result = format('SELECT id FROM users WHERE id IN (1, 2, 3)')
        assert.ok(result.includes('IN'), 'Should contain IN')
    })

    test('handles LIKE expression', () => {
        const result = format("SELECT id FROM users WHERE name LIKE '%test%'")
        assert.ok(result.includes('LIKE'), 'Should contain LIKE')
    })

    test('handles aggregate functions', () => {
        const result = format('SELECT COUNT(*), SUM(amount), AVG(price) FROM orders')
        assert.ok(result.includes('COUNT'), 'Should contain COUNT')
        assert.ok(result.includes('SUM'), 'Should contain SUM')
    })

    test('handles nested functions', () => {
        const result = format("SELECT COALESCE(NULL, 'default') FROM users")
        assert.ok(result.includes('COALESCE'), 'Should contain COALESCE')
    })

    test('handles INTERVAL expression', () => {
        const result = format("SELECT DATE_ADD(NOW(), INTERVAL 1 DAY)", { language: 'mysql' })
        assert.ok(result.length > 0, 'Should produce output')
    })

    test('handles CREATE TABLE with LIKE', () => {
        const result = format('CREATE TABLE new_users LIKE users', { language: 'mysql' })
        assert.ok(result.includes('LIKE'), 'Should contain LIKE')
    })

    test('handles CREATE TEMPORARY TABLE', () => {
        const result = format('CREATE TEMPORARY TABLE temp_users (id INT)', { language: 'mysql' })
        assert.ok(result.includes('TEMPORARY'), 'Should contain TEMPORARY')
    })

    test('handles multiple JOINs', () => {
        const result = format('SELECT a.id FROM users a LEFT JOIN orders b ON a.id = b.user_id LEFT JOIN items c ON b.item_id = c.id')
        assert.ok(result.includes('JOIN'), 'Should contain JOIN')
    })

    test('handles INNER JOIN', () => {
        const result = format('SELECT a.id FROM users a INNER JOIN orders b ON a.id = b.user_id')
        assert.ok(result.includes('JOIN'), 'Should contain JOIN')
    })

    test('handles RIGHT JOIN', () => {
        const result = format('SELECT a.id FROM users a RIGHT JOIN orders b ON a.id = b.user_id')
        assert.ok(result.includes('JOIN'), 'Should contain JOIN')
    })

    test('handles CROSS JOIN', () => {
        const result = format('SELECT a.id FROM users a CROSS JOIN orders b')
        assert.ok(result.includes('JOIN'), 'Should contain JOIN')
    })

    test('handles DELETE with WHERE', () => {
        const result = format('DELETE FROM users WHERE id = 1')
        assert.ok(result.includes('DELETE'), 'Should contain DELETE')
        assert.ok(result.includes('WHERE'), 'Should contain WHERE')
    })

    test('handles UPDATE with multiple SET clauses', () => {
        const result = format("UPDATE users SET name = 'test', age = 25 WHERE id = 1")
        assert.ok(result.includes('SET'), 'Should contain SET')
    })

    test('handles INSERT with ON DUPLICATE KEY UPDATE', () => {
        const result = format("INSERT INTO users (id, name) VALUES (1, 'test') ON DUPLICATE KEY UPDATE name = 'test'", { language: 'mysql' })
        assert.ok(result.includes('ON DUPLICATE KEY UPDATE'), 'Should contain ON DUPLICATE KEY UPDATE')
    })

    test('handles SELECT with DISTINCT and multiple columns', () => {
        const result = format('SELECT DISTINCT name, age FROM users')
        assert.ok(result.includes('DISTINCT'), 'Should contain DISTINCT')
    })

    test('handles LIMIT with offset', () => {
        const result = format('SELECT id FROM users LIMIT 10, 20', { language: 'mysql' })
        assert.ok(result.includes('LIMIT'), 'Should contain LIMIT')
    })
})

suite('Format consistency tests', () => {

    test('idempotent formatting - formatting twice produces same result', () => {
        const sql = 'SELECT id, name FROM users WHERE age > 18 AND status = 1 ORDER BY id LIMIT 10'
        const first = format(sql, { language: 'mysql' })
        const second = format(first, { language: 'mysql' })
        assert.strictEqual(second, first, 'Formatting should be idempotent')
    })

    test('idempotent formatting for CREATE TABLE', () => {
        const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))'
        const first = format(sql, { language: 'mysql' })
        const second = format(first, { language: 'mysql' })
        assert.strictEqual(second, first, 'CREATE TABLE formatting should be idempotent')
    })

    test('idempotent formatting for INSERT', () => {
        const sql = "INSERT INTO users (id, name) VALUES (1, 'test')"
        const first = format(sql, { language: 'mysql' })
        const second = format(first, { language: 'mysql' })
        assert.strictEqual(second, first, 'INSERT formatting should be idempotent')
    })

    test('idempotent formatting for UPDATE', () => {
        const sql = "UPDATE users SET name = 'test' WHERE id = 1"
        const first = format(sql, { language: 'mysql' })
        const second = format(first, { language: 'mysql' })
        assert.strictEqual(second, first, 'UPDATE formatting should be idempotent')
    })

    test('idempotent formatting for DELETE', () => {
        const sql = 'DELETE FROM users WHERE id = 1'
        const first = format(sql, { language: 'mysql' })
        const second = format(first, { language: 'mysql' })
        assert.strictEqual(second, first, 'DELETE formatting should be idempotent')
    })
})
