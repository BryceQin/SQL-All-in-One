import * as assert from 'assert'
import { preprocessFlinkSql, postprocessFlinkSql } from '../formatter/FlinkSqlAdapter'
import { formatEditorText } from '../utils/formatEditorText'
import type { FormatOptionsWithLanguage } from '../formatter/sqlFormatter'

// Flink 格式化用的默认配置
const flinkConfig: FormatOptionsWithLanguage = {
    language: 'flinksql',
    tabWidth: 4,
    useTabs: false,
    keywordCase: 'upper',
    identifierCase: 'preserve',
    dataTypeCase: 'preserve',
    functionCase: 'preserve',
}

suite('FlinkSqlAdapter Tests', () => {

    suite('preprocess/postprocess round-trip', () => {

        test('窗口表函数 TUMBLE(TABLE ...) 整段 slot 化后能还原', () => {
            // Flink TVF 标准语法：TUMBLE(TABLE t, DESCRIPTOR(col), INTERVAL ...)
            const sql = `SELECT window_start, COUNT(*)
FROM TABLE(
    TUMBLE(TABLE bid, DESCRIPTOR(bidtime), INTERVAL '10' MINUTES)
)
GROUP BY window_start`
            const { processedSql, state } = preprocessFlinkSql(sql)
            // 预处理后内层 TUMBLE(TABLE ...) 被 slot id 替换
            assert.ok(!/\bTUMBLE\s*\(\s*TABLE\b/i.test(processedSql),
                'processed SQL should not contain TUMBLE(TABLE ...)')
            assert.ok(state.slots.length > 0, 'should produce at least one slot')

            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bTUMBLE\s*\(\s*TABLE\b/i.test(restored),
                'restored SQL should contain TUMBLE(TABLE ...)')
        })

        test('WATERMARK 子句被 slot 化后能还原', () => {
            const sql = `CREATE TABLE events (
    ts TIMESTAMP(3),
    WATERMARK FOR ts AS ts - INTERVAL '5' SECOND
) WITH ('connector'='kafka')`
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bWATERMARK\b/i.test(processedSql),
                'processed SQL should not contain WATERMARK keyword')
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bWATERMARK\s+FOR\s+ts\b/i.test(restored),
                'restored SQL should contain WATERMARK FOR ts')
        })

        test('WITH connector 子句被 slot 化后能还原', () => {
            const sql = `CREATE TABLE t (
    id INT
) WITH (
    'connector' = 'kafka',
    'topic' = 'test'
)`
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bWITH\s*\(/i.test(processedSql),
                'processed SQL should not contain WITH (')
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/'connector'\s*=\s*'kafka'/.test(restored),
                "restored SQL should contain 'connector' = 'kafka'")
        })

        test('PRIMARY KEY NOT ENFORCED 被处理', () => {
            const sql = `CREATE TABLE t (
    id BIGINT,
    name STRING,
    PRIMARY KEY (id) NOT ENFORCED
) WITH ('connector'='jdbc')`
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bPRIMARY\s+KEY\b/i.test(processedSql),
                'processed SQL should not contain PRIMARY KEY')
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bPRIMARY\s+KEY\s*\(id\)\s*NOT\s+ENFORCED\b/i.test(restored),
                'restored SQL should contain PRIMARY KEY (id) NOT ENFORCED')
        })

        test('Temporal join FOR SYSTEM_TIME AS OF 被处理', () => {
            const sql = `SELECT s.id, p.name
FROM orders AS s
JOIN dim_products FOR SYSTEM_TIME AS OF s.proc_time AS p
ON s.pid = p.id`
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bFOR\s+SYSTEM_TIME\b/i.test(processedSql),
                'processed SQL should not contain FOR SYSTEM_TIME')
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bFOR\s+SYSTEM_TIME\s+AS\s+OF\b/i.test(restored),
                'restored SQL should contain FOR SYSTEM_TIME AS OF')
        })

        test('MATCH_RECOGNIZE 整段被 slot 化', () => {
            const sql = `SELECT *
FROM ticker
MATCH_RECOGNIZE (
    PARTITION BY symbol
    ORDER BY rowtime
    MEASURES
        START_ROW.rowtime AS start_time,
        END_ROW.rowtime AS end_time
    ONE ROW PER MATCH
    PATTERN (START_ROW UP DOWN+ END_ROW)
    DEFINE
        UP AS UP.price > START_ROW.price,
        DOWN AS DOWN.price < START_ROW.price
)`
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bMATCH_RECOGNIZE\b/i.test(processedSql),
                'processed SQL should not contain MATCH_RECOGNIZE')
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bMATCH_RECOGNIZE\b/i.test(restored),
                'restored SQL should contain MATCH_RECOGNIZE')
            assert.ok(/\bPATTERN\b/i.test(restored), 'restored should contain PATTERN')
            assert.ok(/\bDEFINE\b/i.test(restored), 'restored should contain DEFINE')
        })

        test('CREATE TABLE ... LIKE 整段被 slot 化', () => {
            const sql = `CREATE TABLE new_table WITH ('connector'='kafka')
LIKE old_table;`
            const { processedSql, state } = preprocessFlinkSql(sql)
            // LIKE 表达式整体被 slot 化：至少一个 slot 包含 LIKE
            const hasLikeSlot = state.slots.some(s => /\bLIKE\b/i.test(s.original))
            assert.ok(hasLikeSlot, 'some slot should contain LIKE')
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bLIKE\b/i.test(restored), 'restored SQL should contain LIKE')
        })
    })

    suite('P3 长尾语法 slot 化', () => {

        test('EMIT AFTER WATERMARK (INSERT)', () => {
            const sql = 'INSERT INTO sink SELECT id FROM source EMIT AFTER WATERMARK'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bEMIT\b/i.test(processedSql), 'processed should not contain EMIT')
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bEMIT\s+AFTER\s+WATERMARK\b/i.test(restored))
        })

        test('EMIT AFTER WATERMARK (SELECT)', () => {
            const sql = 'SELECT id FROM source EMIT AFTER WATERMARK'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bEMIT\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bEMIT\s+AFTER\s+WATERMARK\b/i.test(restored))
        })

        test('CREATE VIEW with EMIT 整段 slot 化', () => {
            const sql = 'CREATE VIEW v AS SELECT id FROM source EMIT AFTER WATERMARK'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bEMIT\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bEMIT\b/i.test(restored))
            assert.ok(/\bCREATE\s+VIEW\b/i.test(restored))
        })

        test('普通 CREATE VIEW (无 EMIT) 不被 slot 化', () => {
            const sql = 'CREATE VIEW v AS SELECT id FROM t'
            const { state } = preprocessFlinkSql(sql)
            // 无 EMIT 的标准 CREATE VIEW 走 parser 正常处理，不 slot 化
            const hasViewSlot = state.slots.some(s => /CREATE\s+VIEW/i.test(s.original))
            assert.ok(!hasViewSlot, 'standard CREATE VIEW should not be slotted')
        })

        test('CREATE DATABASE WITH connector', () => {
            const sql = "CREATE DATABASE db WITH ('connector'='jdbc')"
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/'connector'/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/'connector'\s*=\s*'jdbc'/i.test(restored))
        })

        test('ALTER TABLE ADD CONSTRAINT PRIMARY KEY', () => {
            const sql = 'ALTER TABLE t ADD CONSTRAINT pk PRIMARY KEY (id) NOT ENFORCED'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bCONSTRAINT\s+pk\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bCONSTRAINT\s+pk\s+PRIMARY\s+KEY\b/i.test(restored))
        })

        test('STOP JOB', () => {
            const sql = "STOP JOB 'job-id-123'"
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bSTOP\s+JOB\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bSTOP\s+JOB\b/i.test(restored))
        })

        test('CANCEL JOB', () => {
            const sql = "CANCEL JOB 'job-id-123'"
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bCANCEL\s+JOB\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bCANCEL\s+JOB\b/i.test(restored))
        })

        test('DESCRIBE table', () => {
            const sql = 'DESCRIBE my_table'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bDESCRIBE\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bDESCRIBE\s+my_table\b/i.test(restored))
        })

        test('DESCRIBE EXTENDED table', () => {
            const sql = 'DESCRIBE EXTENDED my_table'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bDESCRIBE\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bDESCRIBE\s+EXTENDED\s+my_table\b/i.test(restored))
        })

        test('EXPLAIN SELECT', () => {
            const sql = 'EXPLAIN SELECT * FROM t'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bEXPLAIN\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bEXPLAIN\b[\s\S]*\bSELECT\b/i.test(restored))
        })

        test('EXPLAIN CODEGEN', () => {
            const sql = 'EXPLAIN CODEGEN SELECT * FROM t'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bEXPLAIN\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bEXPLAIN\s+CODEGEN\b/i.test(restored))
        })

        test('LOAD MODULE', () => {
            const sql = "LOAD MODULE my_module WITH ('type'='core')"
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bLOAD\s+MODULE\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bLOAD\s+MODULE\b/i.test(restored))
        })

        test('UNLOAD MODULE', () => {
            const sql = 'UNLOAD MODULE my_module'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bUNLOAD\s+MODULE\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bUNLOAD\s+MODULE\s+my_module\b/i.test(restored))
        })

        test('ALTER TABLE SET TBLPROPERTIES', () => {
            const sql = "ALTER TABLE t SET TBLPROPERTIES ('k'='v')"
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bSET\s+TBLPROPERTIES\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bSET\s+TBLPROPERTIES\b/i.test(restored))
        })

        test('ALTER TABLE UNSET TBLPROPERTIES', () => {
            const sql = "ALTER TABLE t UNSET TBLPROPERTIES ('k')"
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bUNSET\s+TBLPROPERTIES\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bUNSET\s+TBLPROPERTIES\b/i.test(restored))
        })

        test('ALTER FUNCTION LANGUAGE PYTHON', () => {
            const sql = "ALTER FUNCTION my_fn AS 'com.example.MyFn' LANGUAGE PYTHON"
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bALTER\s+FUNCTION\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bLANGUAGE\s+PYTHON\b/i.test(restored))
        })

        test('ALTER DATABASE', () => {
            const sql = "ALTER DATABASE db SET PROPERTIES ('k'='v')"
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bALTER\s+DATABASE\b/i.test(processedSql))
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bALTER\s+DATABASE\s+db\b/i.test(restored))
        })

        test('SET with multiple spaces', () => {
            const sql = 'SET table.exec.runtime-mode  =  streaming'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/^SET\b/im.test(processedSql), 'processed should not contain SET')
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/table\.exec\.runtime-mode\s*=\s*streaming/i.test(restored))
        })

        test('多语句共存：EXPLAIN + 普通 SELECT', () => {
            const sql = 'EXPLAIN SELECT * FROM t1;\nSELECT * FROM t2'
            const { processedSql, state } = preprocessFlinkSql(sql)
            assert.ok(!/\bEXPLAIN\b/i.test(processedSql))
            assert.ok(/\bSELECT\b/i.test(processedSql), 'normal SELECT should remain')
            const restored = postprocessFlinkSql(processedSql, state)
            assert.ok(/\bEXPLAIN\b[\s\S]*\bSELECT\s+\*\s+FROM\s+t2\b/i.test(restored))
        })
    })

    suite('formatEditorText integration', () => {

        test('Flink SELECT 能正常格式化', () => {
            const sql = 'select id, name from users where age > 18'
            const result = formatEditorText(sql, flinkConfig)
            assert.ok(result.toUpperCase().includes('SELECT'), 'should contain SELECT')
            assert.ok(result.toUpperCase().includes('FROM'), 'should contain FROM')
        })

        test('Flink CREATE TABLE with WATERMARK 不抛异常', () => {
            const sql = `CREATE TABLE events (ts TIMESTAMP(3), WATERMARK FOR ts AS ts - INTERVAL '5' SECOND) WITH ('connector'='kafka')`
            // 不应抛异常，且结果包含原始结构
            const result = formatEditorText(sql, flinkConfig)
            assert.ok(result.toUpperCase().includes('CREATE'), 'should contain CREATE')
            assert.ok(/WATERMARK/i.test(result), 'should preserve WATERMARK')
        })

        test('Flink TUMBLE 窗口查询不抛异常', () => {
            const sql = `SELECT TUMBLE_START(ts, INTERVAL '10' MINUTE) AS w, COUNT(*) FROM events GROUP BY TUMBLE(ts, INTERVAL '10' MINUTE)`
            const result = formatEditorText(sql, flinkConfig)
            assert.ok(/TUMBLE/i.test(result), 'should preserve TUMBLE')
            assert.ok(/COUNT/i.test(result), 'should preserve COUNT')
        })
    })
})
