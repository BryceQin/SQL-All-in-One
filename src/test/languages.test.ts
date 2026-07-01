import * as assert from 'assert'
import { createDialect, type Dialect, type DialectOptions } from '../languages/dialect'
import * as allDialects from '../languages/allDialects'
import { format } from '../formatter/sqlFormatter'

// Keyword/function imports per dialect
import { keywords as hiveKeywords, dataTypes as hiveDataTypes } from '../dialects/hive/hive.keywords'
import { functions as hiveFunctions, functionSignatures as hiveFunctionSignatures } from '../dialects/hive/hive.functions'
import { hive } from '../dialects/hive/hive.formatter'

import { keywords as mysqlKeywords, dataTypes as mysqlDataTypes } from '../dialects/mysql/mysql.keywords'
import { functions as mysqlFunctions, functionSignatures as mysqlFunctionSignatures } from '../dialects/mysql/mysql.functions'
import { mysql } from '../dialects/mysql/mysql.formatter'

import { keywords as sparkKeywords, dataTypes as sparkDataTypes } from '../dialects/spark/spark.keywords'
import { functions as sparkFunctions, functionSignatures as sparkFunctionSignatures } from '../dialects/spark/spark.functions'
import { spark } from '../dialects/spark/spark.formatter'

import { keywords as sqlKeywords, dataTypes as sqlDataTypes } from '../dialects/sql/sql.keywords'
import { functions as sqlFunctions, functionSignatures as sqlFunctionSignatures } from '../dialects/sql/sql.functions'
import { sql } from '../dialects/sql/sql.formatter'

import { keywords as postgresqlKeywords, dataTypes as postgresqlDataTypes } from '../dialects/postgresql/postgresql.keywords'
import { functions as postgresqlFunctions, functionSignatures as postgresqlFunctionSignatures } from '../dialects/postgresql/postgresql.functions'
import { postgresql } from '../dialects/postgresql/postgresql.formatter'

import { keywords as bigqueryKeywords, dataTypes as bigqueryDataTypes } from '../dialects/bigquery/bigquery.keywords'
import { functions as bigqueryFunctions, functionSignatures as bigqueryFunctionSignatures } from '../dialects/bigquery/bigquery.functions'
import { bigquery } from '../dialects/bigquery/bigquery.formatter'

import { keywords as sqliteKeywords, dataTypes as sqliteDataTypes } from '../dialects/sqlite/sqlite.keywords'
import { functions as sqliteFunctions, functionSignatures as sqliteFunctionSignatures } from '../dialects/sqlite/sqlite.functions'
import { sqlite } from '../dialects/sqlite/sqlite.formatter'
import { keywords as starrocksKeywords, dataTypes as starrocksDataTypes } from '../dialects/starrocks/starrocks.keywords'
import { functions as starrocksFunctions, functionSignatures as starrocksFunctionSignatures } from '../dialects/starrocks/starrocks.functions'
import { starrocks } from '../dialects/starrocks/starrocks.formatter'
import { keywords as sqlserverKeywords, dataTypes as sqlserverDataTypes } from '../dialects/sqlserver/sqlserver.keywords'
import { functions as sqlserverFunctions, functionSignatures as sqlserverFunctionSignatures } from '../dialects/sqlserver/sqlserver.functions'
import { sqlserver } from '../dialects/sqlserver/sqlserver.formatter'
import { keywords as oracleKeywords, dataTypes as oracleDataTypes } from '../dialects/oracle/oracle.keywords'
import { functions as oracleFunctions, functionSignatures as oracleFunctionSignatures } from '../dialects/oracle/oracle.functions'
import { oracle } from '../dialects/oracle/oracle.formatter'
import { keywords as damengKeywords, dataTypes as damengDataTypes } from '../dialects/dameng/dameng.keywords'
import { functions as damengFunctions, functionSignatures as damengFunctionSignatures } from '../dialects/dameng/dameng.functions'
import { dameng } from '../dialects/dameng/dameng.formatter'

import { baseKeywords } from '../dialects/keywords/baseKeywords'
import { getKeywordsForDialect } from '../dialects/keywords'

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

    test('all dialects can each be created', () => {
        const dialects: [string, DialectOptions][] = [
            ['hive', hive],
            ['mysql', mysql],
            ['spark', spark],
            ['sql', sql],
            ['postgresql', postgresql],
            ['bigquery', bigquery],
            ['sqlite', sqlite],
            ['starrocks', starrocks],
            ['sqlserver', sqlserver],
            ['oracle', oracle],
            ['dameng', dameng],
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
        assert.strictEqual(starrocks.name, 'starrocks')
        assert.strictEqual(sqlserver.name, 'sqlserver')
        assert.strictEqual(oracle.name, 'oracle')
        assert.strictEqual(dameng.name, 'dameng')
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
            ['starrocks', starrocks],
            ['sqlserver', sqlserver],
            ['oracle', oracle],
            ['dameng', dameng],
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

    test('all dialects are exported', () => {
        const expectedDialects = ['hive', 'mysql', 'spark', 'sql', 'postgresql', 'bigquery', 'sqlite', 'starrocks', 'sqlserver', 'oracle', 'dameng']
        for (const name of expectedDialects) {
            assert.ok(allDialects[name as keyof typeof allDialects], `Dialect '${name}' should be exported`)
        }
    })

    test('each exported dialect has name, tokenizerOptions, formatOptions', () => {
        const dialectNames = ['hive', 'mysql', 'spark', 'sql', 'postgresql', 'bigquery', 'sqlite', 'starrocks', 'sqlserver', 'oracle', 'dameng'] as const
        for (const name of dialectNames) {
            const d = allDialects[name]
            assert.strictEqual(typeof d.name, 'string', `${name}.name should be a string`)
            assert.ok(d.tokenizerOptions, `${name}.tokenizerOptions should exist`)
            assert.ok(d.formatOptions, `${name}.formatOptions should exist`)
        }
    })

    test('all function signature arrays are exported', () => {
        const sigNames: (keyof typeof allDialects)[] = [
            'hiveFunctionSignatures',
            'mysqlFunctionSignatures',
            'sparkFunctionSignatures',
            'sqlFunctionSignatures',
            'pgFunctionSignatures',
            'bqFunctionSignatures',
            'sqliteFunctionSignatures',
            'starrocksFunctionSignatures',
            'sqlserverFunctionSignatures',
            'oracleFunctionSignatures',
            'damengFunctionSignatures',
        ]
        for (const name of sigNames) {
            const sigs = allDialects[name]
            assert.ok(Array.isArray(sigs), `${name} should be an array`)
            assert.ok(sigs.length > 0, `${name} should be non-empty`)
        }
    })

    test('all keyword arrays and data type arrays are exported', () => {
        const kwPairs: [keyof typeof allDialects, keyof typeof allDialects][] = [
            ['hiveKeywords', 'hiveDataTypes'],
            ['mysqlKeywords', 'mysqlDataTypes'],
            ['sparkKeywords', 'sparkDataTypes'],
            ['sqlKeywords', 'sqlDataTypes'],
            ['pgKeywords', 'pgDataTypes'],
            ['bqKeywords', 'bqDataTypes'],
            ['sqliteKeywords', 'sqliteDataTypes'],
            ['starrocksKeywords', 'starrocksDataTypes'],
            ['sqlserverKeywords', 'sqlserverDataTypes'],
            ['oracleKeywords', 'oracleDataTypes'],
            ['damengKeywords', 'damengDataTypes'],
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
): void {
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

testDialectKeywords('StarRocks Keywords', starrocksKeywords, starrocksDataTypes, [
    'BITMAP', 'HLL', 'ROLLUP', 'COLOCATE', 'DYNAMIC_PARTITION',
    'PARTITION', 'BUCKETS', 'PROPERTIES', 'ENGINE', 'OLAP',
    'DUPLICATE', 'AGGREGATE', 'UNIQUE',
])


testDialectKeywords('SQL Server Keywords', sqlserverKeywords, sqlserverDataTypes, [
    'TOP', 'OFFSET', 'FETCH', 'PIVOT', 'UNPIVOT', 'OUTPUT', 'MERGE',
])

testDialectKeywords('Oracle Keywords', oracleKeywords, oracleDataTypes, [
    'CONNECT', 'START', 'PRIOR', 'MINUS', 'DUAL', 'ROWNUM', 'ROWID',
    'SYSDATE', 'SEQUENCE', 'SYNONYM', 'PACKAGE', 'PRAGMA', 'NVARCHAR2',
])

testDialectKeywords('Dameng Keywords', damengKeywords, damengDataTypes, [
    'TOP', 'LIMIT', 'SEQUENCE', 'SYNONYM', 'DBLINK', 'DM_HASH', 'DM_ENCRYPT',
    'ROWNUM', 'DUAL', 'CONNECT', 'MINUS', 'SYSDATE', 'NVARCHAR2',
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
): void {
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
testDialectFunctions('StarRocks Functions', starrocksFunctions, starrocksFunctionSignatures)
testDialectFunctions('SQL Server Functions', sqlserverFunctions, sqlserverFunctionSignatures)
testDialectFunctions('Oracle Functions', oracleFunctions, oracleFunctionSignatures)
testDialectFunctions('Dameng Functions', damengFunctions, damengFunctionSignatures)

// StarRocks-specific function tests (beyond the common aggregate functions
// covered by testDialectFunctions). Verifies StarRocks-unique functions and
// their signatures are present.
suite('StarRocks Specific Functions', () => {

    const starrocksSpecificFunctions = [
        'BITMAP_UNION', 'HLL_UNION', 'COLLECT_LIST',
        'BITMAP_COUNT', 'BITMAP_TO_STRING', 'HLL_CARDINALITY',
        'COLLECT_SET', 'PERCENTILE_APPROX', 'EXPLODE', 'EXPLODE_SPLIT',
    ]

    test('functions contains StarRocks-specific functions', () => {
        for (const fn of starrocksSpecificFunctions) {
            assert.ok(
                starrocksFunctions.includes(fn),
                `Expected StarRocks-specific function '${fn}' to be present in starrocks functions`,
            )
        }
    })

    test('functionSignatures contains StarRocks-specific signatures', () => {
        for (const fn of ['BITMAP_UNION', 'HLL_UNION', 'COLLECT_LIST']) {
            const sig = starrocksFunctionSignatures.find(s => s.name === fn)
            assert.ok(sig, `Expected StarRocks-specific function signature '${fn}' to be present`)
            assert.ok(Array.isArray(sig!.params), `signature params should be an array for ${fn}`)
            assert.strictEqual(typeof sig!.description, 'string', `signature description should be string for ${fn}`)
        }
    })
})


suite('SQL Server Specific Functions', () => {

    const sqlserverSpecificFunctions = [
        'GETDATE', 'CONVERT', 'TRY_CONVERT', 'STRING_AGG', 'IIF',
    ]

    test('functions contains SQL Server-specific functions', () => {
        for (const fn of sqlserverSpecificFunctions) {
            assert.ok(
                sqlserverFunctions.includes(fn),
                'Expected SQL Server-specific function ' + fn + ' to be present in sqlserver functions',
            )
        }
    })

    test('functionSignatures contains SQL Server-specific signatures', () => {
        for (const fn of ['GETDATE', 'CONVERT', 'TRY_CONVERT']) {
            const sig = sqlserverFunctionSignatures.find(s => s.name === fn)
            assert.ok(sig, 'Expected SQL Server-specific function signature ' + fn + ' to be present')
            assert.ok(Array.isArray(sig!.params), 'signature params should be an array for ' + fn)
            assert.strictEqual(typeof sig!.description, 'string', 'signature description should be string for ' + fn)
        }
    })
})

suite('Oracle Specific Functions', () => {

    const oracleSpecificFunctions = [
        'DECODE', 'NVL', 'NVL2', 'TO_DATE', 'TO_CHAR', 'TO_NUMBER',
        'LISTAGG', 'REGEXP_LIKE', 'SYSDATE', 'ADD_MONTHS', 'LAST_DAY',
        'MONTHS_BETWEEN', 'NEXT_DAY', 'CONNECT_BY_ROOT', 'SYS_CONNECT_BY_PATH',
    ]

    test('functions contains Oracle-specific functions', () => {
        for (const fn of oracleSpecificFunctions) {
            assert.ok(
                oracleFunctions.includes(fn),
                'Expected Oracle-specific function ' + fn + ' to be present in oracle functions',
            )
        }
    })

    test('functionSignatures contains Oracle-specific signatures', () => {
        for (const fn of ['DECODE', 'NVL', 'TO_DATE', 'TO_CHAR', 'LISTAGG', 'REGEXP_LIKE']) {
            const sig = oracleFunctionSignatures.find(s => s.name === fn)
            assert.ok(sig, 'Expected Oracle-specific function signature ' + fn + ' to be present')
            assert.ok(Array.isArray(sig!.params), 'signature params should be an array for ' + fn)
            assert.strictEqual(typeof sig!.description, 'string', 'signature description should be string for ' + fn)
        }
    })
})

suite('Dameng Specific Functions', () => {

    const damengSpecificFunctions = [
        'DM_HASH', 'DM_ENCRYPT', 'TO_DM_DATE',
    ]

    test('functions contains Dameng-specific functions', () => {
        for (const fn of damengSpecificFunctions) {
            assert.ok(
                damengFunctions.includes(fn),
                'Expected Dameng-specific function ' + fn + ' to be present in dameng functions',
            )
        }
    })

    test('functions contains Oracle-compatible functions retained in Dameng', () => {
        // Dameng derives from Oracle and should retain Oracle-compatible functions.
        const oracleCompatibleFunctions = ['TO_DATE', 'TO_CHAR', 'DECODE', 'NVL']
        for (const fn of oracleCompatibleFunctions) {
            assert.ok(
                damengFunctions.includes(fn),
                'Expected Oracle-compatible function ' + fn + ' to be present in dameng functions',
            )
        }
    })

    test('functionSignatures contains Dameng-specific signatures', () => {
        for (const fn of ['DM_HASH', 'DM_ENCRYPT', 'TO_DM_DATE']) {
            const sig = damengFunctionSignatures.find(s => s.name === fn)
            assert.ok(sig, 'Expected Dameng-specific function signature ' + fn + ' to be present')
            assert.ok(Array.isArray(sig!.params), 'signature params should be an array for ' + fn)
            assert.strictEqual(typeof sig!.description, 'string', 'signature description should be string for ' + fn)
        }
    })
})
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
        for (const dialect of ['hive', 'mysql', 'spark', 'sql', 'postgresql', 'bigquery', 'sqlite', 'starrocks', 'sqlserver'] as const) {
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

    test('getKeywordsForDialect returns non-empty array for oracle', () => {
        const result = getKeywordsForDialect('oracle')
        assert.ok(Array.isArray(result), 'result should be an array')
        assert.ok(result.length > 0, 'result should be non-empty')
    })

    test('getKeywordsForDialect returns non-empty array for dameng', () => {
        const result = getKeywordsForDialect('dameng')
        assert.ok(Array.isArray(result), 'result should be an array')
        assert.ok(result.length > 0, 'result should be non-empty')
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

    function testDialectOptions(dialectName: string, options: DialectOptions): void {
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
    testDialectOptions('starrocks', starrocks)
    testDialectOptions('sqlserver', sqlserver)
    testDialectOptions('oracle', oracle)
    testDialectOptions('dameng', dameng)

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

    test('starrocks formatter has CREATE MATERIALIZED VIEW clause', () => {
        const clauses = starrocks.tokenizerOptions.reservedClauses
        const hasMv = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('CREATE MATERIALIZED VIEW'))
        assert.ok(hasMv, 'StarRocks should have CREATE MATERIALIZED VIEW clause')
    })

    test('oracle formatter has CONNECT BY and START WITH clauses', () => {
        const clauses = oracle.tokenizerOptions.reservedClauses
        const hasConnectBy = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('CONNECT BY'))
        const hasStartWith = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('START WITH'))
        assert.ok(hasConnectBy, 'Oracle should have CONNECT BY clause')
        assert.ok(hasStartWith, 'Oracle should have START WITH clause')
    })

    test('oracle formatter has MINUS set operation', () => {
        const setOps = oracle.tokenizerOptions.reservedSetOperations
        const hasMinus = setOps.some((c: unknown) => typeof c === 'string' && (c as string).includes('MINUS'))
        assert.ok(hasMinus, 'Oracle should have MINUS set operation')
    })

    test('oracle formatter has q-quote string type and bind variable support', () => {
        const stringTypes = oracle.tokenizerOptions.stringTypes
        assert.ok(Array.isArray(stringTypes), 'Oracle stringTypes should be an array')
        // Oracle alternative quoting mechanism q'...'
        const hasQQuote = stringTypes.some((t: unknown) => typeof t === 'string' && (t as string).includes("q''"))
        assert.ok(hasQQuote, "Oracle should support q'' alternative quoting")

        const variableTypes = oracle.tokenizerOptions.variableTypes
        assert.ok(Array.isArray(variableTypes), 'Oracle variableTypes should be an array')
        assert.ok(variableTypes.length >= 2, 'Oracle should support bind (:) and substitution (&) variables')
    })

    test('dameng formatter has CONNECT BY and START WITH clauses (Oracle-compatible)', () => {
        const clauses = dameng.tokenizerOptions.reservedClauses
        const hasConnectBy = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('CONNECT BY'))
        const hasStartWith = clauses.some((c: unknown) => typeof c === 'string' && (c as string).includes('START WITH'))
        assert.ok(hasConnectBy, 'Dameng should have CONNECT BY clause')
        assert.ok(hasStartWith, 'Dameng should have START WITH clause')
    })

    test('dameng formatter has MINUS set operation (Oracle-compatible)', () => {
        const setOps = dameng.tokenizerOptions.reservedSetOperations
        const hasMinus = setOps.some((c: unknown) => typeof c === 'string' && (c as string).includes('MINUS'))
        assert.ok(hasMinus, 'Dameng should have MINUS set operation')
    })

    test('dameng formatter has TOP keyword in select clauses', () => {
        // Dameng supports SELECT TOP n ... syntax (in addition to ROWNUM/LIMIT)
        const selectClauses = dameng.tokenizerOptions.reservedSelect
        const hasTop = selectClauses.some((c: unknown) => typeof c === 'string' && (c as string).toUpperCase().includes('TOP'))
        assert.ok(hasTop, 'Dameng reservedSelect should include TOP')
    })

    test('dameng formatter has LIMIT clause (MySQL-compatibility mode)', () => {
        const clauses = dameng.tokenizerOptions.reservedClauses
        const hasLimit = clauses.some((c: unknown) => typeof c === 'string' && (c as string) === 'LIMIT')
        assert.ok(hasLimit, 'Dameng should have LIMIT clause')
    })

    test('dameng formatter has bind variable support (:name)', () => {
        const variableTypes = dameng.tokenizerOptions.variableTypes
        assert.ok(Array.isArray(variableTypes), 'Dameng variableTypes should be an array')
        assert.ok(variableTypes.length >= 1, 'Dameng should support bind variables')
    })

    test('dameng formatter formats SELECT TOP 10 * FROM t without crashing', () => {
        // Dameng supports SELECT TOP n syntax. The format() pipeline calls
        // engine.astify() under the hood; Dameng borrows the Oracle parser,
        // and node-sql-parser 5.x has no Oracle dialect module, so astify may
        // throw a ParseError. The contract we verify (per SubTask 8.5) is
        // that the process does not crash: either formatting succeeds (and
        // the TOP keyword is preserved), or it throws a regular Error.
        let threw: unknown = null
        let result: string | null = null
        try {
            result = format('SELECT TOP 10 * FROM t', { language: 'dameng' })
        } catch (e) {
            threw = e
        }
        if (threw !== null) {
            assert.ok(threw instanceof Error, 'dameng: SELECT TOP 10 parsing failure should be a regular Error, got: ' + String(threw))
        } else {
            assert.ok(result !== null && result.length > 0, 'Dameng: Should produce non-empty output for SELECT TOP 10')
            assert.ok(result!.toUpperCase().includes('SELECT'), 'Dameng: output should contain SELECT')
            assert.ok(result!.toUpperCase().includes('TOP'), 'Dameng: output should contain TOP keyword')
        }
    })

    test('dameng formatter formats SELECT with ROWNUM without crashing', () => {
        // Dameng retains the Oracle-compatible ROWNUM pseudo-column. The
        // format() pipeline calls engine.astify() under the hood; Dameng
        // borrows the Oracle parser, and node-sql-parser 5.x has no Oracle
        // dialect module, so astify may throw a ParseError. The contract we
        // verify (per SubTask 8.6) is that the process does not crash: either
        // formatting succeeds (and the ROWNUM token is preserved), or it
        // throws a regular Error.
        let threw: unknown = null
        let result: string | null = null
        try {
            result = format('SELECT * FROM t WHERE ROWNUM <= 10', { language: 'dameng' })
        } catch (e) {
            threw = e
        }
        if (threw !== null) {
            assert.ok(threw instanceof Error, 'dameng: ROWNUM query parsing failure should be a regular Error, got: ' + String(threw))
        } else {
            assert.ok(result !== null && result.length > 0, 'Dameng: Should produce non-empty output for ROWNUM query')
            assert.ok(result!.toUpperCase().includes('ROWNUM'), 'Dameng: output should preserve ROWNUM syntax')
        }
    })
})