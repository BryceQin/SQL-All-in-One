import { escapeRegExp } from "../lexer/regexUtil"
import {
    KeywordOccurrence,
    matchCase,
    extractUntilNextClause,
    collectOrderedMatches,
    cleanClusterByAscDesc,
} from "./adapterUtils"

export type { KeywordOccurrence }

export interface AdapterState {
    keywordOccurrences: KeywordOccurrence[]
}

const orderByFamily: { pattern: RegExp; keyword: string; hive: string }[] = [
    { pattern: /\bSORT\s+BY\b/gi, keyword: 'SORT BY', hive: 'ORDER BY' },
    { pattern: /\bCLUSTER\s+BY\b/gi, keyword: 'CLUSTER BY', hive: 'ORDER BY' },
]

const groupByFamily: { pattern: RegExp; keyword: string; hive: string }[] = [
    { pattern: /\bDISTRIBUTE\s+BY\b/gi, keyword: 'DISTRIBUTE BY', hive: 'GROUP BY' },
]

const allOrderByPatterns = [
    { pattern: /\bORDER\s+BY\b/gi, keyword: 'ORDER BY', hive: 'ORDER BY' },
    ...orderByFamily,
]
const allGroupByPatterns = [
    { pattern: /\bGROUP\s+BY\b/gi, keyword: 'GROUP BY', hive: 'GROUP BY' },
    ...groupByFamily,
]

function replaceSortDistributeCluster(sql: string): { result: string; keywordOccurrences: KeywordOccurrence[] } {
    const orderByMatches = collectOrderedMatches(sql, allOrderByPatterns)
    const groupByMatches = collectOrderedMatches(sql, allGroupByPatterns)

    const orderByOccurrences: KeywordOccurrence[] = []
    let orderByIndex = 0
    for (const m of orderByMatches) {
        if (m.keyword !== 'ORDER BY') {
            orderByOccurrences.push({
                original: m.keyword,
                hive: 'ORDER BY',
                indexInGroup: orderByIndex,
            })
        }
        orderByIndex++
    }

    const groupByOccurrences: KeywordOccurrence[] = []
    let groupByIndex = 0
    for (const m of groupByMatches) {
        if (m.keyword !== 'GROUP BY') {
            groupByOccurrences.push({
                original: m.keyword,
                hive: 'GROUP BY',
                indexInGroup: groupByIndex,
            })
        }
        groupByIndex++
    }

    const keywordOccurrences = [...orderByOccurrences, ...groupByOccurrences]

    let result = sql
    for (const item of orderByFamily) {
        result = result.replace(item.pattern, 'ORDER BY')
    }
    for (const item of groupByFamily) {
        result = result.replace(item.pattern, 'GROUP BY')
    }

    return { result, keywordOccurrences }
}

function restoreSortDistributeCluster(formatted: string, keywordOccurrences: KeywordOccurrence[]): string {
    if (keywordOccurrences.length === 0) return formatted

    const orderByRestorations = keywordOccurrences.filter(
        o => o.hive === 'ORDER BY'
    )
    const groupByRestorations = keywordOccurrences.filter(
        o => o.hive === 'GROUP BY'
    )

    let result = formatted

    if (orderByRestorations.length > 0) {
        result = restoreKeywordGroup(result, 'ORDER BY', orderByRestorations)
    }
    if (groupByRestorations.length > 0) {
        result = restoreKeywordGroup(result, 'GROUP BY', groupByRestorations)
    }

    result = cleanClusterByAscDesc(result)

    return result
}

function restoreKeywordGroup(
    sql: string,
    hiveKeyword: string,
    restorations: KeywordOccurrence[]
): string {
    const pattern = new RegExp(`\\b${hiveKeyword.replace(' ', '\\s+')}\\b`, 'gi')
    const restorationSet = new Set(restorations.map(r => r.indexInGroup))

    let occurrenceIndex = 0
    return sql.replace(pattern, (match) => {
        const currentIdx = occurrenceIndex++
        if (restorationSet.has(currentIdx)) {
            const restoration = restorations.find(r => r.indexInGroup === currentIdx)
            if (restoration) {
                return matchCase(match, restoration.original)
            }
        }
        return match
    })
}

// 任务 4（R4）：HiveSqlAdapter 与 SparkSqlAdapter 共用的 extractLateralView/restoreLateralView
// 通过参数化 slot id 前缀/后缀处理差异（Hive 用 __lv_N__，Spark 用 spark_lv_N）。
// 使用两阶段模式（先收集 matches 再倒序替换），与 HiveSqlAdapter 风格一致，
// 避免 exec+replace 混用导致的 lastIndex 脆弱性（见 P4 任务）。
export interface LateralViewSlotBase {
    id: string
    original: string
}

const lateralViewPatterns: RegExp[] = [
    /\bLATERAL\s+VIEW\s+OUTER\b/gi,
    /\bLATERAL\s+VIEW\b/gi,
]

// restoreLateralView 正则缓存（key 为 slot.id），参考 CommentPreserver.ts 的 hasWordRegexCache。
const lateralViewRestoreRegexCache = new Map<string, RegExp>()

export function extractLateralView(
    sql: string,
    slots: LateralViewSlotBase[],
    counter: { value: number },
    idPrefix: string,
    idSuffix = ''
): string {
    let result = sql

    for (const pattern of lateralViewPatterns) {
        // gi 标志会在 exec 调用之间保留 lastIndex，必须每次扫描前重置。
        pattern.lastIndex = 0
        const matches: { index: number; text: string }[] = []
        let m

        while ((m = pattern.exec(result)) !== null) {
            const matchText = m[0]
            const afterMatch = result.substring(m.index + matchText.length)
            const clauseRest = extractUntilNextClause(afterMatch)
            const fullClause = matchText + clauseRest

            matches.push({ index: m.index, text: fullClause })
        }

        // 倒序替换，避免索引偏移；直接按索引做子串替换，比 escapeRegExp+new RegExp 更稳健。
        for (let i = matches.length - 1; i >= 0; i--) {
            const lvMatch = matches[i]
            const id = `${idPrefix}${counter.value++}${idSuffix}`
            slots.push({ id, original: lvMatch.text })

            result =
                result.substring(0, lvMatch.index) +
                `CROSS JOIN ${id}` +
                result.substring(lvMatch.index + lvMatch.text.length)
        }
    }

    return result
}

export function restoreLateralView(
    formatted: string,
    slots: LateralViewSlotBase[],
    idMarker: string
): string {
    let result = formatted

    for (const slot of slots) {
        if (idMarker && !slot.id.includes(idMarker)) continue

        const escapedId = escapeRegExp(slot.id)
        let pattern = lateralViewRestoreRegexCache.get(slot.id)
        if (!pattern) {
            pattern = new RegExp(`CROSS\\s+JOIN\\s+\`?${escapedId}\`?`, 'gi')
            lateralViewRestoreRegexCache.set(slot.id, pattern)
        }
        pattern.lastIndex = 0
        result = result.replace(pattern, slot.original)
    }

    return result
}

export {
    replaceSortDistributeCluster,
    restoreSortDistributeCluster,
    extractUntilNextClause,
    escapeRegExp,
}
