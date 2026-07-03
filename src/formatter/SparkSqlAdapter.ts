import {
    AdapterState,
    replaceSortDistributeCluster,
    restoreSortDistributeCluster,
    escapeRegExp,
    extractLateralView as sharedExtractLateralView,
    restoreLateralView as sharedRestoreLateralView,
} from "./HiveSparkSharedAdapter"

interface UsingSlot {
    tableName: string
    usingClause: string
}

interface LateralViewSlot {
    id: string
    original: string
}

interface MergeSlot {
    original: string
}

export interface SparkAdapterState extends AdapterState {
    usingSlots: UsingSlot[]
    lateralViewSlots: LateralViewSlot[]
    mergeSlots: MergeSlot[]
}

export function preprocessSparkSql(sql: string): { processedSql: string; state: SparkAdapterState } {
    const counter = { value: 0 }
    const usingSlots: UsingSlot[] = []
    const lateralViewSlots: LateralViewSlot[] = []
    const mergeSlots: MergeSlot[] = []

    let result = sql

    result = extractMergeInto(result, mergeSlots, counter)
    result = extractLateralView(result, lateralViewSlots, counter)
    result = extractCreateTableUsing(result, usingSlots)
    const sortResult = replaceSortDistributeCluster(result)

    return {
        processedSql: sortResult.result,
        state: {
            keywordOccurrences: sortResult.keywordOccurrences,
            usingSlots,
            lateralViewSlots,
            mergeSlots,
        },
    }
}

export function postprocessSparkSql(formatted: string, state: SparkAdapterState): string {
    let result = formatted

    result = restoreSortDistributeCluster(result, state.keywordOccurrences)
    result = restoreCreateTableUsing(result, state.usingSlots)
    result = restoreLateralView(result, state.lateralViewSlots)
    result = restoreMergeInto(result, state.mergeSlots)

    return result
}

function extractLateralView(sql: string, lateralViewSlots: LateralViewSlot[], counter: { value: number }): string {
    // 任务 4（R4）：复用 HiveSparkSharedAdapter 中的共享实现。
    // 任务 2（P4）：共享实现已采用两阶段模式（先收集 matches 再倒序替换），
    // 移除了原先 exec+replace 混用对 pattern.lastIndex = 0 的脆弱依赖。
    // Spark slot id 格式为 spark_lv_N（前缀 spark_lv_，无后缀）。
    return sharedExtractLateralView(sql, lateralViewSlots, counter, 'spark_lv_', '')
}

function restoreLateralView(formatted: string, lateralViewSlots: LateralViewSlot[]): string {
    // 任务 4（R4）：复用 HiveSparkSharedAdapter 中的共享实现。
    // idMarker='' 表示不做 id 过滤（Spark 的 lateralViewSlots 数组只含 lateral view slot）。
    return sharedRestoreLateralView(formatted, lateralViewSlots, '')
}

function extractCreateTableUsing(sql: string, usingSlots: UsingSlot[]): string {
    const usingPattern = /\b(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.`"]+)\s+(USING\s+\w+)/gi
    let result = sql
    let m

    while ((m = usingPattern.exec(result)) !== null) {
        const tableName = m[1]
        const usingClause = m[2]
        usingSlots.push({ tableName, usingClause })

        result = result.replace(usingClause, '')
        usingPattern.lastIndex = 0
    }

    result = result.replace(/\b(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.`"]+)\s{2,}/gi, '$1 ')

    return result
}

function restoreCreateTableUsing(formatted: string, usingSlots: UsingSlot[]): string {
    let result = formatted

    for (const slot of usingSlots) {
        const tablePattern = escapeRegExp(slot.tableName)
        const regex = new RegExp(`(${tablePattern})`, 'i')
        result = result.replace(regex, `$1 ${slot.usingClause}`)
    }

    return result
}

function extractMergeInto(sql: string, mergeSlots: MergeSlot[], counter: { value: number }): string {
    let result = sql

    const mergePattern = /\bMERGE\s+INTO\b/gi
    let m

    while ((m = mergePattern.exec(result)) !== null) {
        const startIdx = m.index

        let endIdx = result.length
        const semiIdx = result.indexOf(';', startIdx)
        if (semiIdx !== -1) {
            endIdx = semiIdx
        }

        const original = result.substring(startIdx, endIdx).trimEnd()
        const id = `spark_merge_${counter.value++}`
        mergeSlots.push({ original })

        const escaped = escapeRegExp(original)
        const replaceRegex = new RegExp(escaped, 'i')
        result = result.replace(replaceRegex, `SELECT * FROM ${id}`)

        mergePattern.lastIndex = 0
    }

    return result
}

function restoreMergeInto(formatted: string, mergeSlots: MergeSlot[]): string {
    let result = formatted

    for (const slot of mergeSlots) {
        const selectPattern = /SELECT\s+\*\s+FROM\s+`?spark_merge_\d+`?/gi
        result = result.replace(selectPattern, slot.original)
    }

    return result
}
