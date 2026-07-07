import * as assert from 'assert'
import { parseMatchRecognize } from '../parser/FlinkCepAstBuilder'
import { preprocessFlinkSql } from '../formatter/FlinkSqlAdapter'

suite('Flink CEP AST Builder Tests', () => {

    test('解析基本 MATCH_RECOGNIZE 结构', () => {
        const sql = `MATCH_RECOGNIZE (
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
        const node = parseMatchRecognize(sql)
        assert.ok(node !== null)
        assert.strictEqual(node.type, 'match_recognize')
        assert.deepStrictEqual(node.partitionBy, ['symbol'])
        assert.deepStrictEqual(node.orderBy, ['rowtime'])
        assert.strictEqual(node.measures.length, 2)
        assert.strictEqual(node.measures[0].alias, 'start_time')
        assert.strictEqual(node.outputMode, 'ONE ROW PER MATCH')
        assert.ok(node.pattern !== null)
        assert.strictEqual(node.pattern!.raw, 'START_ROW UP DOWN+ END_ROW')
        assert.strictEqual(node.defines.length, 2)
        assert.strictEqual(node.defines[0].name, 'UP')
    })

    test('解析无 PARTITION BY 的 MATCH_RECOGNIZE', () => {
        const sql = `MATCH_RECOGNIZE (
    ORDER BY ts
    MEASURES A.id AS aid
    PATTERN (A B)
    DEFINE B AS B.val > A.val
)`
        const node = parseMatchRecognize(sql)
        assert.ok(node !== null)
        assert.deepStrictEqual(node.partitionBy, [])
        assert.deepStrictEqual(node.orderBy, ['ts'])
    })

    test('解析 ALL ROWS PER MATCH', () => {
        const sql = `MATCH_RECOGNIZE (
    MEASURES A.id AS aid
    ALL ROWS PER MATCH
    PATTERN (A)
    DEFINE A AS A.id > 0
)`
        const node = parseMatchRecognize(sql)
        assert.ok(node !== null)
        assert.strictEqual(node.outputMode, 'ALL ROWS PER MATCH')
    })

    test('解析 WITHIN 子句', () => {
        const sql = `MATCH_RECOGNIZE (
    PATTERN (A B)
    WITHIN INTERVAL '5' MINUTE
    DEFINE A AS A.id > 0
)`
        const node = parseMatchRecognize(sql)
        assert.ok(node !== null)
        assert.ok(node.within !== null)
        assert.ok(node.within!.includes('INTERVAL'))
    })

    test('解析无 DEFINE 的简单模式', () => {
        const sql = `MATCH_RECOGNIZE (
    PATTERN (A+)
    MEASURES A.id AS aid
)`
        const node = parseMatchRecognize(sql)
        assert.ok(node !== null)
        assert.strictEqual(node.defines.length, 0)
        assert.ok(node.pattern !== null)
    })

    test('提取 PATTERN 中的模式变量名', () => {
        const sql = `MATCH_RECOGNIZE (
    PATTERN (START_ROW UP DOWN+ END_ROW)
    MEASURES START_ROW.id AS sid
)`
        const node = parseMatchRecognize(sql)
        assert.ok(node !== null)
        assert.ok(node.pattern !== null)
        assert.deepStrictEqual(node.pattern!.variables, ['START_ROW', 'UP', 'DOWN', 'END_ROW'])
    })

    test('非 MATCH_RECOGNIZE 输入返回 null', () => {
        const node = parseMatchRecognize('SELECT 1')
        assert.strictEqual(node, null)
    })

    test('不完整的 MATCH_RECOGNIZE 返回 null', () => {
        const node = parseMatchRecognize('MATCH_RECOGNIZE (')
        assert.strictEqual(node, null)
    })
})

suite('Flink CEP Slot Integration Tests', () => {

    test('slot 化的 CEP 语句可通过 state 还原原始文本', () => {
        const sql = `SELECT *
FROM ticker
MATCH_RECOGNIZE (
    PARTITION BY symbol
    ORDER BY rowtime
    MEASURES START_ROW.rowtime AS start_time
    ONE ROW PER MATCH
    PATTERN (START_ROW UP DOWN+ END_ROW)
    DEFINE UP AS UP.price > START_ROW.price
)`
        const { state } = preprocessFlinkSql(sql)
        // 找到包含 MATCH_RECOGNIZE 的 slot
        const cepSlot = state.slots.find(s => /MATCH_RECOGNIZE/i.test(s.original))
        assert.ok(cepSlot, 'should have CEP slot')
        // 从 slot 原文解析结构化 AST
        const node = parseMatchRecognize(cepSlot!.original)
        assert.ok(node !== null)
        assert.strictEqual(node!.partitionBy.length, 1)
        assert.strictEqual(node!.pattern!.variables.length, 4)
    })

    test('无 CEP 语句时不产生 CEP slot', () => {
        const sql = 'SELECT id FROM t'
        const { state } = preprocessFlinkSql(sql)
        const cepSlot = state.slots.find(s => /MATCH_RECOGNIZE/i.test(s.original))
        assert.ok(!cepSlot, 'should not have CEP slot')
    })

    test('cepSlotIds 包含 CEP slot 的 id', () => {
        const sql = `SELECT * FROM t MATCH_RECOGNIZE (PATTERN (A) DEFINE A AS A.id > 0)`
        const { state } = preprocessFlinkSql(sql)
        const cepSlot = state.slots.find(s => /MATCH_RECOGNIZE/i.test(s.original))
        assert.ok(cepSlot, 'should have CEP slot')
        assert.ok(
            state.cepSlotIds && state.cepSlotIds.includes(cepSlot!.id),
            'cepSlotIds should contain the CEP slot id'
        )
    })
})
