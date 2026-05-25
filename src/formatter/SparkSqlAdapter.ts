import {
    AdapterState,
    replaceSortDistributeCluster,
    restoreSortDistributeCluster,
    extractUntilNextClause,
    escapeRegExp,
} from "./BaseSqlAdapter"

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
    let result = sql

    const patterns = [
        /\bLATERAL\s+VIEW\s+OUTER\b/gi,
        /\bLATERAL\s+VIEW\b/gi,
    ]

    for (const pattern of patterns) {
        let m
        while ((m = pattern.exec(result)) !== null) {
            const matchText = m[0]
            const afterMatch = result.substring(m.index + matchText.length)
            const clauseRest = extractUntilNextClause(afterMatch)
            const fullClause = matchText + clauseRest

            const id = `spark_lv_${counter.value++}`
            lateralViewSlots.push({ id, original: fullClause })

            const escaped = escapeRegExp(fullClause)
            const replaceRegex = new RegExp(escaped, 'i')
            result = result.replace(replaceRegex, `CROSS JOIN ${id}`)

            pattern.lastIndex = 0
        }
    }

    return result
}

function restoreLateralView(formatted: string, lateralViewSlots: LateralViewSlot[]): string {
    let result = formatted

    for (const slot of lateralViewSlots) {
        const escapedId = escapeRegExp(slot.id)
        const withBackticks = new RegExp(
            `CROSS\\s+JOIN\\s+\`?${escapedId}\`?`,
            'gi'
        )
        result = result.replace(withBackticks, slot.original)
    }

    return result
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
