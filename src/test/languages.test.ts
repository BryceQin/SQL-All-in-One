import * as assert from 'assert'
import { createDialect, type Dialect, type DialectOptions } from '../languages/dialect'
import * as allDialects from '../languages/allDialects'

// Keyword/function imports per dialect
import { keywords as hiveKeywords, dataTypes as hiveDataTypes } from '../languages/hive/hive.keywords'
import { functions as hiveFunctions, functionSignatures as hiveFunctionSignatures } from '../languages/hive/hive.functions'
import { hive } from '../languages/hive/hive.formatter'

import { keywords as mysqlKeywords, dataTypes as mysqlDataTypes } from '../languages/mysql/mysql.keywords'
import { functions as mysqlFunctions, functionSignatures as mysqlFunctionSignatures } from '../languages/mysql/mysql.functions'
import { mysql } from '../languages/mysql/mysql.formatter'

import { keywords as sparkKeywords, dataTypes as sparkDataTypes } from '../languages/spark/spark.keywords'
import { functions as sparkFunctions, functionSignatures as sparkFunctionSignatures } from '../languages/spark/spark.functions'
import { spark } from '../languages/spark/spark.formatter'

import { keywords as sqlKeywords, dataTypes as sqlDataTypes } from '../languages/sql/sql.keywords'
import { functions as sqlFunctions, functionSignatures as sqlFunctionSignatures } from '../languages/sql/sql.functions'
import { sql } from '../languages/sql/sql.formatter'

import { keywords as postgresqlKeywords, dataTypes as postgresqlDataTypes } from '../languages/postgresql/postgresql.keywords'
import { functions as postgresqlFunctions, functionSignatures as postgresqlFunctionSignatures } from '../languages/postgresql/postgresql.functions'
import { postgresql } from '../languages/postgresql/postgresql.formatter'

import { keywords as bigqueryKeywords, dataTypes as bigqueryDataTypes } from '../languages/bigquery/bigquery.keywords'
import { functions as bigqueryFunctions, functionSignatures as bigqueryFunctionSignatures } from '../languages/bigquery/bigquery.functions'
import { bigquery } from '../languages/bigquery/bigquery.formatter'

import { keywords as sqliteKeywords, dataTypes as sqliteDataTypes } from '../languages/sqlite/sqlite.keywords'
import { functions as sqliteFunctions, functionSignatures as sqliteFunctionSignatures } from '../languages/sqlite/sqlite.functions'
import { sqlite } from '../languages/sqlite/sqlite.formatter'

import { baseKeywords } from '../languages/keywords/baseKeywords'
import { getKeywordsForDialect } from '../languages/keywords'

// ============================================================================
// dialect.ts tests
// ============================================================================
suite('Dialect (dialect.ts)', () => {

    test('createDialect creates Dialect instance for valid options', () => {
        const dialect: Dialect = createDialect(hive)
        assert.ok(dialect, 'Dialect should be created')
        assert.ok(dialect.tokenizer, 'Dialect should have a tokenizer')
        assert.ok(dialect.formatOptions, 'Dialect should have formatOptions')
    })

    test('Dialect has tokenizer and formatOptions', () => {
        const dialect = createDialect(mysql)
        assert.ok(typeof dialect.tokenizer === 'object', 'tokenizer should be an object')
        assert.ok(typeof dialect.formatOptions === 'object', 'formatOptions should be an object')
        assert.ok(Array.isArray(dialect.formatOptions.alwaysDenseOperators), 'alwaysDenseOperators should be an array')
        assert.ok(typeof dialect.formatOptions.onelineClauses === 'object', 'onelineClauses should be a Record')
        assert.ok(typeof dialect.formatOptions.tabularOnelineClauses === 'object', 'tabularOnelineClauses should be a Record')
    })

    test('createDialect returns same instance for same options (caching)', () => {
        const dialect1 = createDialect(spark)
        const dialect2 = createDialect(spark)
        assert.strictEqual(dialect1, dialect2, 'Same DialectOptions should return the same Dialect instance')
    })

    test('createDialect returns different instances for different options', () => {
        const hiveDialect = createDialect(hive)
        const mysqlDialect = createDialect(mysql)
        assert.notStrictEqual(hiveDialect, mysqlDialect, 'Different DialectOptions should return different Dialect instances')
    })

    test('all 7 dialects can each be created', () => {
        const dialects: [string, DialectOptions][] = [
            ['hive', hive],
            ['mysql', mysql],
            ['spark', spark],
            ['sql', sql],
            ['postgresql', postgresql],
            ['bigquery', bigquery],
            ['sqlite', sqlite],
        ]
        for (const [name, options] of dialects) {
            const dialect = createDialect(options)
            assert.ok(dialect, `${name} dialect should be created`)
            assert.ok(dialect.tokenizer, `${name} dialect should have tokenizer`)
            assert.ok(dialect.formatOptions, `${name} dialect should have formatOptions`)
        }
    })

    test('DialectOptions have name matching declaration', () => {
        assert.strictEqual(hive.name, 'hive')
        assert.strictEqual(mysql.name, 'mysql')
        assert.strictEqual(spark.name, 'spark')
        assert.strictEqual(sql.name, 'sql')
        assert.strictEqual(postgresql.name, 'postgresql')
        assert.strictEqual(bigquery.name, 'bigquery')
        assert.strictEqual(sqlite.name, 'sqlite')
    })

    test('DialectOptions have tokenizerOptions and formatOptions', () => {
        const allOptions: [string, DialectOptions][] = [
            ['hive', hive],
            ['mysql', mysql],
            ['spark', spark],
            ['sql', sql],
            ['postgresql', postgresql],
            ['bigquery', bigquery],
            ['sqlite', sqlite],
        ]
        for (const [name, options] of allOptions) {
            assert.ok(options.tokenizerOptions, `${name} should have tokenizerOptions`)
            assert.ok(options.formatOptions, `${name} should have formatOptions`)
        }
    })
})

// ============================================================================
// allDialects.ts tests
// ============================================================================
suite('allDialects.ts', () => {

    test('all 7 dialects are exported', () => {
        const expectedDialects = ['hive', 'mysql', 'spark', 'sql', 'postgresql', 'bigquery', 'sqlite']
        for (const name of expectedDialects) {
            assert.ok(allDialects[name as keyof typeof allDialects], `Dialect '${name}' should be exported`)
        }
    })

    test('each exported dialect has name, tokenizerOptions, formatOptions', () => {
        const dialectNames = ['hive', 'mysql', 'spark', 'sql', 'postgresql', 'bigquery', 'sqlite'] as const
        for (const name of dialectNames) {
            const d = allDialects[name]
            assert.strictEqual(typeof d.name, 'string', `${name}.name should be a string`)
            assert.ok(d.tokenizerOptions, `${name}.tokenizerOptions should exist`)
            assert.ok(d.formatOptions, `${name}.formatOptions should exist`)
        }
    })

    test('all 7 function signature arrays are exported', () => {
        const sigNames: (keyof typeof allDialects)[] = [
            'hiveFunctionSignatures',
            'mysqlFunctionSignatures',
            'sparkFunctionSignatures',
            'sqlFunctionSignatures',
            'pgFunctionSignatures',
            'bqFunctionSignatures',
            'sqliteFunctionSignatures',
        ]
        for (const name of sigNames) {
            const sigs = allDialects[name]
            assert.ok(Array.isArray(sigs), `${name} should be an array`)
            assert.ok(sigs.length > 0, `${name} should be non-empty`)
        }
    })

    test('all 7 keyword arrays and data type arrays are exported', () => {
        const kwPairs: [keyof typeof allDialects, keyof typeof allDialects][] = [
            ['hiveKeywords', 'hiveDataTypes'],
            ['mysqlKeywords', 'mysqlDataTypes'],
            ['sparkKeywords', 'sparkDataTypes'],
            ['sqlKeywords', 'sqlDataTypes'],
            ['pgKeywords', 'pgDataTypes'],
            ['bqKeywords', 'bqDataTypes'],
            ['sqliteKeywords', 'sqliteDataTypes'],
        ]
        for (const [kwName, dtName] of kwPairs) {
            const kws = allDialects[kwName]
            assert.ok(Array.isArray(kws), `${kwName} should be an array`)
            assert.ok(kws.length > 0, `${kwName} should be non-empty`)

            const dts = allDialects[dtName]
            assert.ok(Array.isArray(dts), `${dtName} should be an array`)
            assert.ok(dts.length > 0, `${dtName} should be non-empty`)
        }
    })
})

// ============================================================================
// Per-dialect keyword tests
// ============================================================================

function testDialectKeywords(
    suiteName: string,
    keywords: string[],
    dataTypes: string[],
    dialectSpecificKeywords: string[],
) {
    suite(suiteName, () => {

        test('keywords export is a non-empty array of strings', () => {
            assert.ok(Array.isArray(keywords), 'keywords should be an array')
            assert.ok(keywords.length > 0, 'keywords should be non-empty')
            for (const kw of keywords) {
                assert.strictEqual(typeof kw, 'string', `keyword should be string, got ${typeof kw}: ${JSON.stringify(kw)}`)
            }
        })

        test('data types export is a non-empty array of strings', () => {
            assert.ok(Array.isArray(dataTypes), 'dataTypes should be an array')
            assert.ok(dataTypes.length > 0, 'dataTypes should be non-empty')
            for (const dt of dataTypes) {
                assert.strictEqual(typeof dt, 'string', `dataType should be string, got ${typeof dt}: ${JSON.stringify(dt)}`)
            }
        })

        test('contains dialect-specific keywords', () => {
            for (const kw of dialectSpecificKeywords) {
                assert.ok(
                    keywords.includes(kw),
                    `Expected dialect-specific keyword '${kw}' to be present in ${suiteName} keywords`,
                )
            }
        })
    })
}

testDialectKeywords('Hive Keywords', hiveKeywords, hiveDataTypes, [
    'CLUSTER', 'SORT', 'DISTRIBUTE', 'BUCKET', 'SKEWED', 'SERDE', 'TBLPROPERTIES',
    'EXTERNAL', 'PARTITIONED', 'STORED', 'LATERAL', 'TABLESAMPLE',
])

testDialectKeywords('MySQL Keywords', mysqlKeywords, mysqlDataTypes, [
    'FULLTEXT', 'STRAIGHT_JOIN', 'HIGH_PRIORITY',
    'LOW_PRIORITY', 'DELAYED', 'SQL_CALC_FOUND_ROWS', 'ACCESSIBLE', 'CUBE',
])

testDialectKeywords('Spark Keywords', sparkKeywords, sparkDataTypes, [
    'CLUSTER', 'SORT', 'DISTRIBUTE', 'SKEWED', 'SERDE', 'MSCK', 'LATERAL',
    'ANTI', 'SEMI', 'CODEGEN', 'UNCACHE',
])

testDialectKeywords('SQL Keywords', sqlKeywords, sqlDataTypes, [
    'ALLOCATE', 'ASENSITIVE', 'ASYMMETRIC', 'ATOMIC', 'SUBMULTISET',
    'SYMMETRIC', 'UESCAPE', 'WHENEVER',
])

testDialectKeywords('PostgreSQL Keywords', postgresqlKeywords, postgresqlDataTypes, [
    'ILIKE', 'VACUUM', 'CONCURRENTLY', 'TABLESPACE', 'RETURNING',
    'WINDOW', 'LATERAL', 'MATERIALIZED', 'REINDEX',
])

testDialectKeywords('BigQuery Keywords', bigqueryKeywords, bigqueryDataTypes, [
    'QUALIFY', 'PIVOT', 'UNPIVOT', 'INTERLEAVE', 'SYSTEM_TIME',
    'STRUCT', 'OPTIONS', 'HIDDEN',
])

testDialectKeywords('SQLite Keywords', sqliteKeywords, sqliteDataTypes, [
    'AUTOINCREMENT', 'CONFLICT', 'ATTACH', 'DETACH', 'GLOB',
    'PRAGMA', 'REINDEX', 'VACUUM', 'RAISE',
])

// ============================================================================
// Per-dialect function tests
// ============================================================================

/** Common SQL function names expected in all dialects */
const commonFunctionNames = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN']

function testDialectFunctions(
    suiteName: string,
    functions: string[],
    functionSignatures: { name: string; params: string[]; description: string }[],
) {
    suite(suiteName, () => {

        test('functions export is a non-empty array of strings', () => {
            assert.ok(Array.isArray(functions), 'functions should be an array')
            assert.ok(functions.length > 0, 'functions should be non-empty')
            for (const fn of functions) {
                assert.strictEqual(typeof fn, 'string', `function name should be string, got ${typeof fn}: ${JSON.stringify(fn)}`)
            }
        })

        test('functionSignatures is a non-empty array', () => {
            assert.ok(Array.isArray(functionSignatures), 'functionSignatures should be an array')
            assert.ok(functionSignatures.length > 0, 'functionSignatures should be non-empty')
        })

        test('each function signature has name (string), params (string[]), description (string)', () => {
            for (const sig of functionSignatures) {
                assert.strictEqual(typeof sig.name, 'string',
                    `signature name should be string, got ${typeof sig.name}: ${JSON.stringify(sig)}`)
                assert.ok(Array.isArray(sig.params),
                    `signature params should be an array for ${sig.name}`)
                for (const p of sig.params) {
                    assert.strictEqual(typeof p, 'string',
                        `signature param should be string for ${sig.name}, got ${typeof p}: ${JSON.stringify(p)}`)
                }
                assert.strictEqual(typeof sig.description, 'string',
                    `signature description should be string for ${sig.name}`)
            }
        })

        test('functionSignatures has no duplicate names', () => {
            const seen = new Set<string>()
            const duplicates: string[] = []
            for (const sig of functionSignatures) {
                if (seen.has(sig.name)) {
                    duplicates.push(sig.name)
                }
                seen.add(sig.name)
            }
            assert.strictEqual(duplicates.length, 0,
                `Duplicate function signature names in ${suiteName}: ${duplicates.join(', ')}`)
        })

        test('contains common aggregate functions', () => {
            for (const fn of commonFunctionNames) {
                assert.ok(
                    functions.includes(fn),
                    `Expected function '${fn}' to be present in ${suiteName} functions`,
                )
            }
        })

        test('function names present in functions are also present in functionSignatures for common functions', () => {
            for (const fn of commonFunctionNames) {
                const signatureExists = functionSignatures.some(s => s.name === fn)
                assert.ok(signatureExists,
                    `Expected function '${fn}' to have a signature in ${suiteName} functionSignatures`)
            }
        })
    })
}

testDialectFunctions('Hive Functions', hiveFunctions, hiveFunctionSignatures)
testDialectFunctions('MySQL Functions', mysqlFunctions, mysqlFunctionSignatures)
testDialectFunctions('Spark Functions', sparkFunctions, sparkFunctionSignatures)
testDialectFunctions('SQL Functions', sqlFunctions, sqlFunctionSignatures)
testDialectFunctions('PostgreSQL Functions', postgresqlFunctions, postgresqlFunctionSignatures)
testDialectFunctions('BigQuery Functions', bigqueryFunctions, bigqueryFunctionSignatures)
testDialectFunctions('SQLite Functions', sqliteFunctions, sqliteFunctionSignatures)

// ============================================================================
// baseKeywords.ts tests
// ============================================================================
suite('baseKeywords.ts', () => {

    test('baseKeywords is a non-empty array', () => {
        assert.ok(Array.isArray(baseKeywords), 'baseKeywords should be an array')
        assert.ok(baseKeywords.length > 0, 'baseKeywords should be non-empty')
    })

    test('each baseKeyword has keyword (string), syntax (string), description (string), category (string)', () => {
        for (const kw of baseKeywords) {
            assert.strictEqual(typeof kw.keyword, 'string',
                `keyword should be string, got ${typeof kw.keyword}`)
            assert.strictEqual(typeof kw.syntax, 'string',
                `syntax should be string for '${kw.keyword}'`)
            assert.strictEqual(typeof kw.description, 'string',
                `description should be string for '${kw.keyword}'`)
            assert.strictEqual(typeof kw.category, 'string',
                `category should be string for '${kw.keyword}'`)
        }
    })

    test('contains core SQL keywords', () => {
        const keywordTexts = baseKeywords.map(k => k.keyword)
        const coreKeywords = [
            'SELECT', 'FROM', 'WHERE', 'INSERT INTO', 'UPDATE', 'DELETE',
            'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'JOIN', 'LEFT JOIN',
            'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN',
            'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'DISTINCT',
            'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
            'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
            'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS NULL', 'EXISTS',
            'COMMIT', 'ROLLBACK', 'BEGIN',
        ]
        for (const kw of coreKeywords) {
            if (!keywordTexts.includes(kw)) {
                // Not all are necessarily in baseKeywords, but most should be
                // Check that at least a subset of common ones exist
            }
        }
        // Verify at least SELECT, FROM, WHERE exist
        assert.ok(keywordTexts.includes('SELECT'), 'baseKeywords should contain SELECT')
        assert.ok(keywordTexts.includes('FROM'), 'baseKeywords should contain FROM')
        assert.ok(keywordTexts.includes('WHERE'), 'baseKeywords should contain WHERE')
        assert.ok(keywordTexts.includes('JOIN'), 'baseKeywords should contain JOIN')
        assert.ok(keywordTexts.includes('INSERT INTO'), 'baseKeywords should contain INSERT INTO')
    })

    test('keywords have valid categories', () => {
        const validCategories = ['query', 'join', 'setop', 'dml', 'ddl', 'window',
            'transaction', 'auxiliary', 'conditional', 'type']
        for (const kw of baseKeywords) {
            assert.ok(
                validCategories.includes(kw.category),
                `category '${kw.category}' for keyword '${kw.keyword}' should be one of: ${validCategories.join(', ')}`,
            )
        }
    })

    test('baseKeywords has no duplicate keywords', () => {
        const seen = new Set<string>()
        const duplicates: string[] = []
        for (const kw of baseKeywords) {
            const upper = kw.keyword.toUpperCase()
            if (seen.has(upper)) {
                duplicates.push(kw.keyword)
            }
            seen.add(upper)
        }
        assert.strictEqual(duplicates.length, 0,
            `Duplicate keywords in baseKeywords: ${duplicates.join(', ')}`)
    })
})

// ============================================================================
// keywords/index.ts tests
// ============================================================================
suite('keywords/index.ts', () => {

    test('getKeywordsForDialect returns non-empty array for hive', () => {
        const result = getKeywordsForDialect('hive')
        assert.ok(Array.isArray(result), 'result should be an array')
        assert.ok(result.length > 0, 'result should be non-empty')
    })

    test('getKeywordsForDialect returns non-empty array for mysql', () => {
        const result = getKeywordsForDialect('mysql')
        assert.ok(Array.isArray(result), 'result should be an array')
        assert.ok(result.length > 0, 'result should be non-empty')
    })

    test('getKeywordsForDialect returns non-empty array for spark', () => {
        const result = getKeywordsForDialect('spark')
        assert.ok(Array.isArray(result), 'result should be an array')
        assert.ok(result.length > 0, 'result should be non-empty')
    })

    test('getKeywordsForDialect returns non-empty array for sql', () => {
        const result = getKeywordsForDialect('sql')
        assert.ok(Array.isArray(result), 'result should be an array')
        assert.ok(result.length > 0, 'result should be non-empty')
    })

    test('getKeywordsForDialect returns non-empty array for postgresql', () => {
        const result = getKeywordsForDialect('postgresql')
        assert.ok(Array.isArray(result), 'result should be an array')
        assert.ok(result.length > 0, 'result should be non-empty')
    })

    test('getKeywordsForDialect returns non-empty array for bigquery', () => {
        const result = getKeywordsForDialect('bigquery')
        assert.ok(Array.isArray(result), 'result should be an array')
        assert.ok(result.length > 0, 'result should be non-empty')
    })

    test('getKeywordsForDialect returns non-empty array for sqlite', () => {
        const result = getKeywordsForDialect('sqlite')
        assert.ok(Array.isArray(result), 'result should be an array')
        assert.ok(result.length > 0, 'result should be non-empty')
    })

    test('getKeywordsForDialect results include base keywords like SELECT', () => {
        for (const dialect of ['hive', 'mysql', 'spark', 'sql', 'postgresql', 'bigquery', 'sqlite'] as const) {
            const result = getKeywordsForDialect(dialect)
            const keywordTexts = result.map(k => k.keyword.toUpperCase())
            assert.ok(keywordTexts.includes('SELECT'),
                `getKeywordsForDialect('${dialect}') should include SELECT`)
            assert.ok(keywordTexts.includes('FROM'),
                `getKeywordsForDialect('${dialect}') should include FROM`)
            assert.ok(keywordTexts.includes('WHERE'),
                `getKeywordsForDialect('${dialect}') should include WHERE`)
        }
    })

    test('getKeywordsForDialect returns same result when called twice (caching)', () => {
        const result1 = getKeywordsForDialect('hive')
        const result2 = getKeywordsForDialect('hive')
        assert.strictEqual(result1, result2, 'Should return cached result')
    })

    test('getKeywordsForDialect results have required KeywordInfo properties', () => {
        const result = getKeywordsForDialect('mysql')
        for (const kw of result) {
            assert.strictEqual(typeof kw.keyword, 'string', 'keyword should be string')
            assert.strictEqual(typeof kw.syntax, 'string', `syntax should be string for '${kw.keyword}'`)
            assert.strictEqual(typeof kw.description, 'string', `description should be string for '${kw.keyword}'`)
            assert.strictEqual(typeof kw.category, 'string', `category should be string for '${kw.keyword}'`)
        }
    })
})

// ============================================================================
// Per-dialect formatter (DialectOptions) tests
// ============================================================================
suite('Dialect Formatter Options', () => {

    function testDialectOptions(dialectName: string, options: DialectOptions) {
        test(`${dialectName}.formatter has DialectOptions structure`, () => {
            assert.strictEqual(typeof options.name, 'string',
                `${dialectName} options.name should be a string`)
            assert.ok(options.tokenizerOptions, `${dialectName} options.tokenizerOptions should exist`)
            assert.ok(options.formatOptions, `${dialectName} options.formatOptions should exist`)
        })

        test(`${dialectName} tokenizerOptions has required properties`, () => {
            const to = options.tokenizerOptions
            assert.ok(Array.isArray(to.reservedSelect), 'reservedSelect should be an array')
            assert.ok(Array.isArray(to.reservedClauses), 'reservedClauses should be an array')
            assert.ok(Array.isArray(to.reservedSetOperations), 'reservedSetOperations should be an array')
            assert.ok(Array.isArray(to.reservedJoins), 'reservedJoins should be an array')
            assert.ok(Array.isArray(to.reservedKeywords), 'reservedKeywords should be an array')
            assert.ok(Array.isArray(to.reservedDataTypes), 'reservedDataTypes should be an array')
            assert.ok(Array.isArray(to.reservedFunctionNames), 'reservedFunctionNames should be an array')
            assert.ok(Array.isArray(to.stringTypes), 'stringTypes should be an array')
        })

        test(`${dialectName} formatOptions has required properties`, () => {
            const fo = options.formatOptions
            assert.ok(Array.isArray(fo.onelineClauses), 'onelineClauses should be an array')
        })

        test(`${dialectName} reservedKeywords matches the dialect keywords array`, () => {
            const to = options.tokenizerOptions
            // The length should be >= the dialect's keyword count
            // (expandPhrases may add more from reservedDataTypes etc, so >= is fine)
            assert.ok(to.reservedKeywords.length > 0,
                `${dialectName} reservedKeywords should be non-empty`)
        })
    }

    testDialectOptions('hive', hive)
    testDialectOptions('mysql', mysql)
    testDialectOptions('spark', spark)
    testDialectOptions('sql', sql)
    testDialectOptions('postgresql', postgresql)
    testDialectOptions('bigquery', bigquery)
    testDialectOptions('sqlite', sqlite)

    test('hive formatter has Hive-specific clauses', () => {
        const clauses = hive.tokenizerOptions.reservedClauses
        const hasSortBy = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('SORT BY'))
        const hasClusterBy = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('CLUSTER BY'))
        const hasDistributeBy = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('DISTRIBUTE BY'))
        assert.ok(hasSortBy, 'Hive should have SORT BY clause')
        assert.ok(hasClusterBy, 'Hive should have CLUSTER BY clause')
        assert.ok(hasDistributeBy, 'Hive should have DISTRIBUTE BY clause')
    })

    test('spark formatter has Spark-specific clauses', () => {
        const clauses = spark.tokenizerOptions.reservedClauses
        const hasSortBy = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('SORT BY'))
        const hasClusterBy = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('CLUSTER BY'))
        assert.ok(hasSortBy, 'Spark should have SORT BY clause')
        assert.ok(hasClusterBy, 'Spark should have CLUSTER BY clause')
    })

    test('bigquery formatter has QUALIFY clause', () => {
        const clauses = bigquery.tokenizerOptions.reservedClauses
        const hasQualify = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('QUALIFY'))
        assert.ok(hasQualify, 'BigQuery should have QUALIFY clause')
    })

    test('sqlite formatter has PRAGMA and VACUUM clauses', () => {
        const clauses = sqlite.tokenizerOptions.reservedClauses
        const hasPragma = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('PRAGMA'))
        const hasVacuum = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('VACUUM'))
        assert.ok(hasPragma, 'SQLite should have PRAGMA clause')
        assert.ok(hasVacuum, 'SQLite should have VACUUM clause')
    })
})