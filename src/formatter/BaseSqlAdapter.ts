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

export {
    replaceSortDistributeCluster,
    restoreSortDistributeCluster,
    extractUntilNextClause,
    escapeRegExp,
}
