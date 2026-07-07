import {
    AdapterState,
    escapeRegExp,
} from "./HiveSparkSharedAdapter"

interface ReplacementSlot {
    id: string
    original: string
}

export interface FlinkAdapterState extends AdapterState {
    slots: ReplacementSlot[]
    /** CEP (MATCH_RECOGNIZE) slot 的 id 列表，供 definition provider 快速定位 */
    cepSlotIds: string[]
}

function nextId(prefix: string, counter: { value: number }): string {
    return `__${prefix}_${counter.value++}__`
}

// Flink 特有的"整段语句"语法：这些结构内部含 parser 不识别的关键字组合，
// 整体 slot 化为 SELECT * FROM __stmt_N__，再在 postprocess 还原。
// 所有模式都自匹配到分号或字符串末尾，extractWholeStatements 直接用 m[0]。
// 每条正则带 gi 标志，exec 调用间会保留 lastIndex，必须在每次扫描前重置。
const wholeStatementPatterns: RegExp[] = [
    // CEP 模式识别：MATCH_RECOGNIZE ... — 含子句多，整体吞到分号或串尾
    /\bMATCH_RECOGNIZE\b[\s\S]*?(?:;|$)/gi,
    // CREATE TABLE ... LIKE another_table
    /\bCREATE\s+TABLE\b[^;]*?\bLIKE\b[^;]*?(?:;|$)/gi,
    // SET <key>=<value> / RESET <key>（兼容多空格）
    /(?:^|;|\n)\s*SET\s+[^\s=]+\s*=\s*[^\s;]+/gim,
    /(?:^|;|\n)\s*RESET\s+[^\s;]+/gim,
    // EXECUTE STATEMENT SET BEGIN ... END
    /\bEXECUTE\s+STATEMENT\s+SET\b[\s\S]*?\bEND\b/gi,
    // BEGIN STATEMENT SET; ... END;
    /\bBEGIN\s+STATEMENT\s+SET\b[\s\S]*?\bEND\b/gi,
    // ADD JAR 'file:///...' / REMOVE JAR '...'
    /\b(?:ADD|REMOVE)\s+JAR\s+'[^']*'/gi,
    // SHOW JARS / SHOW MODULES / SHOW CATALOGS / SHOW CURRENT CATALOG / SHOW CURRENT DATABASE
    /\bSHOW\s+(?:JARS|MODULES|CATALOGS|CURRENT\s+CATALOG|CURRENT\s+DATABASE)\b[^\n;]*/gi,
    // CREATE CATALOG ... WITH ('type'='...')
    /\bCREATE\s+CATALOG\b[^;]*?\bWITH\b\s*\([^)]*\)[^;]*(?:;|$)/gi,
    // CREATE DATABASE ... WITH (...) — Flink 1.16+ 支持 connector 配置
    /\bCREATE\s+DATABASE\b[^;]*?\bWITH\b\s*\([^)]*\)[^;]*(?:;|$)/gi,
    // DROP CATALOG [IF EXISTS] xxx
    /\bDROP\s+CATALOG\b[^;]*(?:;|$)/gi,
    // USE CATALOG xxx / USE MODULES xxx
    /\bUSE\s+(?:CATALOG|MODULES)\b[^\s;]*/gi,
    // ALTER TABLE ... ADD UNIQUE / PRIMARY KEY / ADD CONSTRAINT <name> PRIMARY KEY
    /\bALTER\s+TABLE\b[^;]*\bADD\s+(?:UNIQUE|PRIMARY\s+KEY|CONSTRAINT)[^;]*(?:;|$)/gi,
    // CREATE FUNCTION ... LANGUAGE PYTHON/JAVA/SCALA
    /\bCREATE\s+(?:TEMPORARY\s+|TEMPORARY\s+SYSTEM\s+)?FUNCTION\b[^;]*?\bLANGUAGE\s+(?:PYTHON|JAVA|SCALA)\b[^;]*(?:;|$)/gi,
    // EMIT AFTER WATERMARK / EMIT ... — 流式查询输出策略，出现在语句末尾，整体吞掉整段语句
    /\bINSERT\b[^;]*?\bEMIT\b[^;]*(?:;|$)/gi,
    /\bSELECT\b[^;]*?\bEMIT\b[^;]*(?:;|$)/gi,
    // STOP JOB '<jobId>' / CANCEL JOB '<jobId>' — Flink SQL Gateway
    /\b(?:STOP|CANCEL)\s+JOB\b[^;]*(?:;|$)/gi,
    // DESCRIBE [EXTENDED] table — 单行，匹配到分号或行尾
    /\bDESCRIBE\b[^\n;]*(?:;|$)/gim,
    // EXPLAIN [PLAN FOR | CODEGEN | EXTENDED] statement — 整段（含被解释的 SQL）
    /\bEXPLAIN\b[\s\S]*?(?:;|$)/gi,
    // CREATE VIEW ... AS SELECT ... EMIT ... — 仅当视图定义中含 EMIT 时整体 slot 化
    // 标准 CREATE VIEW 不 slot 化，让 parser 正常处理
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?VIEW\b[\s\S]*?\bEMIT\b[\s\S]*?(?:;|$)/gi,
    // LOAD MODULE / UNLOAD MODULE — Flink 模块加载
    /\b(?:LOAD|UNLOAD)\s+MODULE\b[^;]*(?:;|$)/gi,
    // ALTER TABLE ... SET TBLPROPERTIES / UNSET TBLPROPERTIES
    /\bALTER\s+TABLE\b[^;]*\b(?:SET|UNSET)\s+TBLPROPERTIES\b[^;]*(?:;|$)/gi,
    // ALTER DATABASE ... SET PROPERTIES
    /\bALTER\s+DATABASE\b[^;]*(?:;|$)/gi,
    // ALTER FUNCTION ... AS 'class' LANGUAGE PYTHON/JAVA/SCALA
    /\bALTER\s+(?:TEMPORARY\s+|TEMPORARY\s+SYSTEM\s+)?FUNCTION\b[^;]*\bLANGUAGE\b[^;]*(?:;|$)/gi,
]

// CREATE TABLE 内部子句，会被 parser 误判：watermark、computed column、metadata、primary key、unique、
// constraint、WITH connector 等。整体 slot 化后让 parser 只看到列定义骨架。
// 匹配模式以最朴素的形式覆盖常见写法；对极长 WITH (...) 用平衡括号扫描兜底。
const createTableClausePatterns: RegExp[] = [
    // WATERMARK FOR <col> AS <expr>
    /\bWATERMARK\s+FOR\s+[\w.`"]+\s+AS\s+[^\s,)]+(?:\s*[-+]\s*INTERVAL\s+'[^']*'\s+\w+)*/gi,
    // PRIMARY KEY (<cols>) NOT ENFORCED
    /\bPRIMARY\s+KEY\s*\([^)]*\)\s*(?:NOT\s+ENFORCED)?/gi,
    // UNIQUE (<cols>)
    /\bUNIQUE\s*\([^)]*\)/gi,
    // CONSTRAINT <name> PRIMARY KEY (<cols>)
    /\bCONSTRAINT\s+[\w.`"]+\s+(?:PRIMARY\s+KEY|UNIQUE)\s*\([^)]*\)(?:\s+NOT\s+ENFORCED)?/gi,
    // METADATA FROM 'key' VIRTUAL / METADATA VIRTUAL
    /\bMETADATA\s+(?:FROM\s+'[^']*'\s+)?VIRTUAL\b/gi,
    // computed column: <col> AS <expr> — 在列定义上下文中识别，避免误伤 SELECT alias AS
    // 仅在 CREATE TABLE 列表内匹配由前置括号触发，这里简化为：行首 col AS <expr>(...)
    /^\s*[\w.`"]+\s+AS\s+[\w.`"]+\s*\([^)]*\)/gim,
]

export function preprocessFlinkSql(sql: string): { processedSql: string; state: FlinkAdapterState } {
    const counter = { value: 0 }
    const slots: ReplacementSlot[] = []

    let result = sql

    // 1) 整段语句先 slot 化（必须在 CREATE TABLE 子句之前，因为 CREATE TABLE ... LIKE 整体要被吞掉）
    result = extractWholeStatements(result, slots, counter)
    // 2) CREATE TABLE 内部子句 slot 化（含 WATERMARK / PK / WITH）
    result = extractCreateTableClauses(result, slots, counter)
    // 3) 窗口表函数：TUMBLE/HOP/CUMULATE/SESSION(TABLE t, DESCRIPTOR(col), ...) 包裹的整段
    result = extractWindowTableFunctions(result, slots, counter)
    // 4) Temporal join: FOR SYSTEM_TIME AS OF xxx AS alias
    result = extractTemporalJoin(result, slots, counter)

    return {
        processedSql: result,
        state: {
            keywordOccurrences: [],
            slots,
            cepSlotIds: slots
                .filter(s => /MATCH_RECOGNIZE/i.test(s.original))
                .map(s => s.id),
        },
    }
}

export function postprocessFlinkSql(formatted: string, state: FlinkAdapterState): string {
    let result = formatted

    // 按预处理逆序还原（slots 中可能混杂各类 slot，统一按 id 模式扫描替换即可）
    result = restoreSlots(result, state.slots)

    return result
}

// ---------------------------------------------------------------------------
// extractors
// ---------------------------------------------------------------------------

function extractWholeStatements(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    let result = sql

    for (const pattern of wholeStatementPatterns) {
        pattern.lastIndex = 0
        const matches: { index: number; end: number; text: string }[] = []
        let m

        while ((m = pattern.exec(result)) !== null) {
            // 所有 wholeStatement 模式都自匹配到分号或字符串末尾，直接用 m[0]
            const matchedText = m[0]
            const end = m.index + matchedText.length
            const text = matchedText.trimEnd()
            if (text) {
                matches.push({ index: m.index, end, text })
            }
        }

        if (matches.length === 0) continue

        // 倒序替换，避免索引偏移
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i]
            const id = nextId('stmt', counter)
            slots.push({ id, original: match.text })
            result =
                result.substring(0, match.index) +
                `SELECT * FROM ${id}` +
                result.substring(match.end)
        }
    }

    return result
}

function extractCreateTableClauses(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    let result = sql

    // 先处理 WITH (...) connector 子句（在 CREATE TABLE 中且需平衡括号扫描）
    result = extractWithConnectorInCreateTable(result, slots, counter)

    for (const pattern of createTableClausePatterns) {
        pattern.lastIndex = 0
        const matches: { index: number; end: number; text: string }[] = []
        let m

        while ((m = pattern.exec(result)) !== null) {
            const text = m[0]
            matches.push({ index: m.index, end: m.index + text.length, text })
        }

        if (matches.length === 0) continue

        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i]
            const id = nextId('ct', counter)
            slots.push({ id, original: match.text })
            result =
                result.substring(0, match.index) +
                `/* ${id} */` +
                result.substring(match.end)
        }
    }

    return result
}

// 在 CREATE TABLE 语句范围内提取 WITH ('...'='...') connector 子句。
// 仅在 CREATE TABLE 的列定义右括号之后到下一个分号之间搜索 WITH (，
// 避免误伤 SELECT/CTE 中的 WITH。
function extractWithConnectorInCreateTable(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    // 先定位所有 CREATE TABLE ... ( ... ) 语句的右括号位置
    const createPattern = /\bCREATE\s+(?:EXTERNAL\s+)?TABLE\b[^;]*?\(/gi
    const matches: { index: number; end: number; text: string }[] = []
    let m

    while ((m = createPattern.exec(sql)) !== null) {
        // 列定义块的左括号位置
        const openParenIdx = m.index + m[0].length - 1
        const closeIdx = findMatchingParen(sql, openParenIdx)
        if (closeIdx === -1) continue

        // 在列定义右括号之后到下一个分号之间搜索 WITH (
        const searchStart = closeIdx + 1
        let searchEnd = sql.indexOf(';', searchStart)
        if (searchEnd === -1) searchEnd = sql.length

        const segment = sql.substring(searchStart, searchEnd)
        const withPattern = /\bWITH\s*\(/gi
        let wm
        while ((wm = withPattern.exec(segment)) !== null) {
            const withOpenInSegment = wm.index + wm[0].length - 1
            const withOpenInSql = searchStart + withOpenInSegment
            const withCloseIdx = findMatchingParen(sql, withOpenInSql)
            if (withCloseIdx === -1) continue
            const fullText = sql.substring(withOpenInSql - wm[0].length + 1, withCloseIdx + 1)
            matches.push({
                index: withOpenInSql - wm[0].length + 1,
                end: withCloseIdx + 1,
                text: fullText,
            })
        }
    }

    if (matches.length === 0) return sql

    let result = sql
    for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i]
        const id = nextId('with', counter)
        slots.push({ id, original: match.text })
        result =
            result.substring(0, match.index) +
            `/* ${id} */` +
            result.substring(match.end)
    }
    return result
}

// 窗口表函数：TUMBLE(TABLE t, DESCRIPTOR(col), INTERVAL '10' MINUTE)
// 这些函数第一个参数是 TABLE t，DESCRIPTOR(col) 也是 parser 不识别的关键字。
// 整体 slot 化为 __win_N__，并在还原时直接放回。
function extractWindowTableFunctions(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    const winPattern = /\b(TUMBLE|HOP|CUMULATE|SESSION)\s*\(\s*TABLE\b/gi
    const matches: { index: number; end: number; text: string }[] = []
    let m

    while ((m = winPattern.exec(sql)) !== null) {
        // m[0] 形如 "TUMBLE(TABLE"，'(' 出现在 "TUMBLE" 与 "TABLE" 之间
        const parenIdx = m.index + m[0].indexOf('(')
        const closeIdx = findMatchingParen(sql, parenIdx)
        if (closeIdx === -1) continue
        const fullText = sql.substring(m.index, closeIdx + 1)
        matches.push({ index: m.index, end: closeIdx + 1, text: fullText })
    }

    if (matches.length === 0) return sql

    let result = sql
    for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i]
        const id = nextId('win', counter)
        slots.push({ id, original: match.text })
        result =
            result.substring(0, match.index) +
            id +
            result.substring(match.end)
    }
    return result
}

// Temporal join: FROM t1 FOR SYSTEM_TIME AS OF t2.proc_time AS t2
// FOR SYSTEM_TIME AS OF 是 parser 不识别的语法，整体替换为普通别名。
function extractTemporalJoin(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    const pattern = /\bFOR\s+SYSTEM_TIME\s+AS\s+OF\s+[\w.`"]+\s+AS\b/gi
    const matches: { index: number; end: number; text: string }[] = []
    let m

    while ((m = pattern.exec(sql)) !== null) {
        // 还要吃掉后面的别名 token
        const afterMatch = sql.substring(m.index + m[0].length)
        const aliasMatch = afterMatch.match(/^\s*[\w.`"]+/)
        if (aliasMatch) {
            const end = m.index + m[0].length + aliasMatch[0].length
            const text = sql.substring(m.index, end)
            matches.push({ index: m.index, end, text })
        } else {
            matches.push({ index: m.index, end: m.index + m[0].length, text: m[0] })
        }
    }

    if (matches.length === 0) return sql

    let result = sql
    for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i]
        const id = nextId('temporal', counter)
        slots.push({ id, original: match.text })
        // 用 AS 占位，让 parser 看到合法的"表 别名"结构
        result =
            result.substring(0, match.index) +
            `AS ${id}` +
            result.substring(match.end)
    }
    return result
}

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

function restoreSlots(formatted: string, slots: ReplacementSlot[]): string {
    if (slots.length === 0) return formatted

    let result = formatted

    // 处理两种 slot 占位形式：
    //   1) SELECT * FROM __xxx_N__           (whole statement / 整段语句)
    //   2) /* __xxx_N__ */                    (CREATE TABLE 子句)
    //   3) __win_N__                          (窗口表函数裸用)
    //   4) AS __temporal_N__                  (temporal join)
    // 统一按 id 在结果中查找并替换回原文。
    for (const slot of slots) {
        const escapedId = escapeRegExp(slot.id)

        // 形式 1: SELECT * FROM __xxx_N__
        const stmtPattern = new RegExp(`SELECT\\s+\\*\\s+FROM\\s+\`?${escapedId}\`?`, 'gi')
        result = result.replace(stmtPattern, () => slot.original)

        // 形式 2: /* __xxx_N__ */
        const commentPattern = new RegExp(`/\\*\\s*${escapedId}\\s*\\*/`, 'g')
        result = result.replace(commentPattern, () => slot.original)

        // 形式 3: 裸 id（窗口函数）
        const barePattern = new RegExp(`\\b${escapedId}\\b`, 'g')
        result = result.replace(barePattern, () => slot.original)

        // 形式 4: AS __temporal_N__（被形式 3 已处理，不重复）
    }

    return result
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// 从 openParenIdx（指向 '('）开始，找到匹配的右括号位置；考虑字符串字面量与转义。
// 返回右括号在原 sql 中的索引，未找到返回 -1。
function findMatchingParen(sql: string, openParenIdx: number): number {
    if (sql[openParenIdx] !== '(') return -1

    let depth = 0
    let inSingle = false
    let inDouble = false
    let i = openParenIdx

    while (i < sql.length) {
        const ch = sql[i]
        const nextCh = i + 1 < sql.length ? sql[i + 1] : undefined

        if (inSingle) {
            if (ch === "'" && nextCh === "'") { i += 2; continue }
            if (ch === "'") inSingle = false
            i++
            continue
        }
        if (inDouble) {
            if (ch === '"' && nextCh === '"') { i += 2; continue }
            if (ch === '"') inDouble = false
            i++
            continue
        }

        if (ch === "'") { inSingle = true; i++; continue }
        if (ch === '"') { inDouble = true; i++; continue }
        if (ch === '(') depth++
        if (ch === ')') {
            depth--
            if (depth === 0) return i
        }
        i++
    }
    return -1
}
