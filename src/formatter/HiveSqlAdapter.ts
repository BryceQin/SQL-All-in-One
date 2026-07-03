import {
    AdapterState,
    replaceSortDistributeCluster,
    restoreSortDistributeCluster,
    escapeRegExp,
    extractLateralView as sharedExtractLateralView,
    restoreLateralView as sharedRestoreLateralView,
} from "./HiveSparkSharedAdapter"
import { SqlTextScanner } from "../utils/sqlTextScanner"

interface ReplacementSlot {
    id: string
    original: string
}

export interface HiveAdapterState extends AdapterState {
    slots: ReplacementSlot[]
}

function nextId(prefix: string, counter: { value: number }): string {
    return `__${prefix}_${counter.value++}__`
}

// 任务 1（P1）优化：将 extractWholeStatements 内的 wholeStatementPatterns
// 提升为模块级常量，避免每次调用 preprocessHiveSql 都重新编译 30+ 条正则。
// 注意：这些正则带 gi 标志，在 exec 多次调用之间会保留 lastIndex，因此在
// 每次使用前必须重置 lastIndex（见 extractWholeStatements 内的循环）。
const wholeStatementPatterns: RegExp[] = [
    /\bMSCK\s+REPAIR\s+TABLE\b/gi,
    /\bANALYZE\s+TABLE\b/gi,
    /\bSHOW\s+(?:DATABASES|SCHEMAS|TABLES|PARTITIONS|CREATE\s+TABLE|COLUMNS|FUNCTIONS|INDEXES|VIEWS|LOCKS|COMPACTIONS|TRANSACTIONS|GRANT|ROLE|PRINCIPALS|ROLES|CURRENT\s+ROLES)\b/gi,
    /\bDESCRIBE\s+(?:FORMATTED|EXTENDED|DATABASE)?\s*\w/gi,
    /\bEXPLAIN\b/gi,
    /\bSET\s+\w/gi,
    /\bUSE\s+DATABASE\b/gi,
    /\bADD\s+(?:JAR|FILE|ARCHIVE)\b/gi,
    /\bEXPORT\s+TABLE\b/gi,
    /\bIMPORT\s+(?:EXTERNAL\s+)?TABLE\b/gi,
    /\bLOAD\s+DATA\b/gi,
    /\bCREATE\s+(?:TEMPORARY\s+)?FUNCTION\b/gi,
    /\bDROP\s+(?:TEMPORARY\s+)?FUNCTION\b/gi,
    /\bDROP\s+DATABASE\b/gi,
    /\bALTER\s+DATABASE\b/gi,
    /\bCREATE\s+DATABASE\b/gi,
    /\bFROM\s+\w+\s+INSERT\b/gi,
    /\bINSERT\s+OVERWRITE\s+(?:LOCAL\s+)?DIRECTORY\b/gi,
    /\bALTER\s+TABLE\s+\w+\s+(?:ADD\s+COLUMNS|DROP\s+COLUMN|ADD\s+PARTITION|DROP\s+PARTITION|RENAME\s+TO|SET\s+TBLPROPERTIES|CHANGE\s+COLUMN|RECOVER\s+PARTITIONS|COMPACT|CONCATENATE|ARCHIVE|UNARCHIVE|TOUCH|SET\s+FILEFORMAT|CLUSTERED\s+BY|NOT\s+CLUSTERED|NOT\s+SORTED|SKEWED\s+BY|NOT\s+SKEWED|SET\s+SKEWED\s+LOCATION|EXCHANGE\s+PARTITION)\b/gi,
    /\bTRUNCATE\s+TABLE?\b/gi,
    /\bGRANT\b/gi,
    /\bREVOKE\b/gi,
    /\bCREATE\s+(?:TEMPORARY\s+)?MACRO\b/gi,
    /\bDROP\s+(?:TEMPORARY\s+)?MACRO\b/gi,
    /\bCREATE\s+ROLE\b/gi,
    /\bDROP\s+ROLE\b/gi,
    /\bSHOW\s+GRANT\b/gi,
    /\bLOCK\s+TABLE\b/gi,
    /\bUNLOCK\s+TABLE\b/gi,
    /\bCOMPILE\b/gi,
    /\bRESET\b/gi,
    /\bDFS\b/gi,
    // SOURCE <file> executes a script file in Hive CLI; it must be at the
    // start of a statement and followed by a file path (quoted or bare).
    // Anchoring with (^|;|\n) prevents matching `source` as an ordinary
    // identifier (e.g. a column alias in `SELECT source` or
    // `GROUP BY source`), which previously caused the whole remaining
    // statement to be swallowed as a __stmt_ slot and duplicated on
    // restore, exploding the output to hundreds of lines.
    /(?:^|;|\n)\s*SOURCE\s+/gi,
    /\bKILL\s+QUERY\b/gi,
]

// 任务 1（P1）优化：将 extractCreateTableClauses 内的 clausePatterns
// 提升为模块级常量，避免每次调用都重新编译 9 条正则。
// 同样需要在每次使用前重置 lastIndex（见 extractCreateTableClauses 内的循环）。
const createTableClausePatterns: RegExp[] = [
    /\bPARTITIONED\s+BY\s*\([^)]*(?:\([^)]*\))*[^)]*\)/gi,
    /\bCLUSTERED\s+BY\s*\([^)]*\)\s*(?:SORTED\s+BY\s*\([^)]*\)\s*)?INTO\s+\d+\s+BUCKETS/gi,
    /\bSKEWED\s+BY\s*\([^)]*\)\s+ON\s+\([^)]*\)(?:\s+STORED\s+AS\s+DIRECTORIES)?/gi,
    /\bROW\s+FORMAT\s+DELIMITED(?:\s+FIELDS\s+TERMINATED\s+BY\s+'[^']*')?(?:\s+ESCAPED\s+BY\s+'[^']*')?(?:\s+LINES\s+TERMINATED\s+BY\s+'[^']*')?(?:\s+NULL\s+DEFINED\s+AS\s+'[^']*')?/gi,
    /\bROW\s+FORMAT\s+SERDE\s+'[^']*'(?:\s+WITH\s+SERDEPROPERTIES\s*\(\s*(?:'[^']*'\s*=\s*'[^']*'(?:\s*,\s*'[^']*'\s*=\s*'[^']*')*)?\s*\))?/gi,
    /\bSTORED\s+AS\s+(?:INPUTFORMAT\s+'[^']*'\s+OUTPUTFORMAT\s+'[^']*'|ORC|PARQUET|TEXTFILE|SEQUENCEFILE|RCFILE|AVRO|\w+)/gi,
    /\bLOCATION\s+'[^']*'/gi,
    /\bTBLPROPERTIES\s*\(\s*(?:'[^']*'\s*=\s*'[^']*'(?:\s*,\s*'[^']*'\s*=\s*'[^']*')*)?\s*\)/gi,
    /\bSTORED\s+BY\s+'[^']*'(?:\s+WITH\s+COMPROPERTIES\s*\(\s*(?:'[^']*'\s*=\s*'[^']*'(?:\s*,\s*'[^']*'\s*=\s*'[^']*')*)?\s*\))?/gi,
]

// 任务 1（P1）优化：为 restore* 函数中的 new RegExp 添加缓存 Map，
// 参考 CommentPreserver.ts:154 的 hasWordRegexCache 实现。
// 由于不同 slot.id 生成不同正则，用 slot.id 作为缓存 key。
const restoreRegexCache = new Map<string, RegExp>()

function getCachedRestoreRegex(cacheKey: string, pattern: string, flags: string): RegExp {
    let regex = restoreRegexCache.get(cacheKey)
    if (!regex) {
        regex = new RegExp(pattern, flags)
        restoreRegexCache.set(cacheKey, regex)
    }
    return regex
}

export function preprocessHiveSql(sql: string): { processedSql: string; state: HiveAdapterState } {
    const counter = { value: 0 }
    const slots: ReplacementSlot[] = []

    let result = sql

    result = extractWholeStatements(result, slots, counter)
    result = extractCreateTableClauses(result, slots, counter)
    result = extractLateralView(result, slots, counter)
    result = extractJsonStrings(result, slots, counter)
    const sortResult = replaceSortDistributeCluster(result)
    result = sortResult.result
    result = replaceComplexTypes(result, slots, counter)
    result = replaceInsertOverwriteTable(result)
    result = replaceRegexpOperator(result)

    return {
        processedSql: result,
        state: {
            keywordOccurrences: sortResult.keywordOccurrences,
            slots,
        },
    }
}

export function postprocessHiveSql(formatted: string, state: HiveAdapterState): string {
    let result = formatted

    result = restoreRegexpOperator(result)
    result = restoreInsertOverwriteTable(result)
    result = restoreComplexTypes(result, state.slots)
    result = restoreJsonStrings(result, state.slots)
    result = restoreSortDistributeCluster(result, state.keywordOccurrences)
    result = restoreLateralView(result, state.slots)
    result = restoreCreateTableClauses(result, state.slots)
    result = restoreWholeStatements(result, state.slots)

    return result
}

function extractWholeStatements(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    let result = sql

    for (const pattern of wholeStatementPatterns) {
        // 正则提升为模块级常量后，gi 标志会在 exec 调用之间保留 lastIndex，
        // 必须在每次扫描前重置，避免遗漏匹配或进入无限循环。
        pattern.lastIndex = 0
        const matches: { index: number; end: number; text: string }[] = []
        let m

        while ((m = pattern.exec(result)) !== null) {
            const end = findStatementEnd(result, m.index)
            const text = result.substring(m.index, end).trimEnd()
            if (text) {
                matches.push({ index: m.index, end, text })
            }
        }

        if (matches.length === 0) continue

        const replacements: { index: number; end: number; replacement: string }[] = []
        for (const match of matches) {
            const id = nextId('stmt', counter)
            slots.push({ id, original: match.text })
            replacements.push({ index: match.index, end: match.end, replacement: `SELECT * FROM ${id}` })
        }

        const parts: string[] = []
        let lastEnd = 0
        for (const rep of replacements) {
            parts.push(result.substring(lastEnd, rep.index))
            parts.push(rep.replacement)
            lastEnd = rep.end
        }
        parts.push(result.substring(lastEnd))
        result = parts.join('')
    }

    return result
}

function restoreWholeStatements(formatted: string, slots: ReplacementSlot[]): string {
    let result = formatted

    for (const slot of slots) {
        if (!slot.id.includes('__stmt_')) continue

        const escapedId = escapeRegExp(slot.id)
        const pattern = getCachedRestoreRegex(
            slot.id,
            `SELECT\\s+\\*\\s+FROM\\s+\`?${escapedId}\`?`,
            'gi'
        )
        pattern.lastIndex = 0
        result = result.replace(pattern, slot.original)
    }

    return result
}

function extractCreateTableClauses(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    const createPattern = /\bCREATE\s+(EXTERNAL\s+)?(TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.`"]+)/gi
    let result = sql

    const createMatches: { index: number; fullMatch: string; isExternal: boolean; isTemporary: boolean }[] = []
    let cm

    while ((cm = createPattern.exec(result)) !== null) {
        createMatches.push({
            index: cm.index,
            fullMatch: cm[0],
            isExternal: !!cm[1],
            isTemporary: !!cm[2],
        })
    }

    for (let ci = createMatches.length - 1; ci >= 0; ci--) {
        const match = createMatches[ci]
        const stmtEnd = findStatementEnd(result, match.index)
        const afterCreateStart = match.index + match.fullMatch.length
        const afterCreateText = result.substring(afterCreateStart, stmtEnd)

        let modifiedAfter = afterCreateText
        let hasModification = false

        for (const clausePattern of createTableClausePatterns) {
            // 正则提升为模块级常量后，gi 标志会在 exec 调用之间保留 lastIndex，
            // 必须在每次扫描前重置。
            clausePattern.lastIndex = 0
            const clauseMatches: { index: number; text: string }[] = []
            let m

            while ((m = clausePattern.exec(modifiedAfter)) !== null) {
                clauseMatches.push({ index: m.index, text: m[0] })
            }

            for (let i = clauseMatches.length - 1; i >= 0; i--) {
                const clauseMatch = clauseMatches[i]
                const id = nextId('ddl', counter)
                slots.push({ id, original: clauseMatch.text })
                modifiedAfter =
                    modifiedAfter.substring(0, clauseMatch.index) +
                    id +
                    modifiedAfter.substring(clauseMatch.index + clauseMatch.text.length)
                hasModification = true
            }
        }

        if (match.isExternal || match.isTemporary) {
            const prefix = match.isExternal ? 'EXTERNAL ' : (match.isTemporary ? 'TEMPORARY ' : '')
            const prefixRegex = new RegExp(`\\bCREATE\\s+${prefix}TABLE`, 'i')
            result = result.replace(prefixRegex, 'CREATE TABLE')
        }

        if (hasModification) {
            result =
                result.substring(0, afterCreateStart) +
                modifiedAfter +
                result.substring(stmtEnd)
        }
    }

    return result
}

function restoreCreateTableClauses(formatted: string, slots: ReplacementSlot[]): string {
    let result = formatted

    for (const slot of slots) {
        if (!slot.id.includes('__ddl_')) continue

        const escapedId = escapeRegExp(slot.id)
        const pattern = getCachedRestoreRegex(slot.id, `\`?${escapedId}\`?`, 'gi')
        pattern.lastIndex = 0
        result = result.replace(pattern, slot.original)
    }

    return result
}

function extractLateralView(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    // 任务 4（R4）：复用 HiveSparkSharedAdapter 中的共享实现。
    // Hive slot id 格式为 __lv_N__（前缀 __lv_，后缀 __），与原 nextId('lv', counter) 行为一致。
    return sharedExtractLateralView(sql, slots, counter, '__lv_', '__')
}

function restoreLateralView(formatted: string, slots: ReplacementSlot[]): string {
    // 任务 4（R4）：复用 HiveSparkSharedAdapter 中的共享实现。
    // idMarker='__lv_' 用于在混合 slots 数组中过滤出 lateral view slot。
    return sharedRestoreLateralView(formatted, slots, '__lv_')
}

function replaceComplexTypes(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    let result = sql

    const complexTypePattern = /\b(MAP|ARRAY|STRUCT)\s*</gi
    const typeMatches: { index: number; text: string }[] = []

    let m: RegExpExecArray | null
    while ((m = complexTypePattern.exec(result)) !== null) {
        const startIndex = m.index
        const bracketStart = m.index + m[0].length - 1
        const fullText = extractNestedAngleBrackets(result, bracketStart)
        if (fullText) {
            const typeText = result.substring(startIndex, bracketStart + fullText.length)
            typeMatches.push({ index: startIndex, text: typeText })
        }
    }

    for (let i = typeMatches.length - 1; i >= 0; i--) {
        const typeMatch = typeMatches[i]
        const id = nextId('type', counter)
        slots.push({ id, original: typeMatch.text })
        result =
            result.substring(0, typeMatch.index) +
            `VARCHAR ${id}` +
            result.substring(typeMatch.index + typeMatch.text.length)
    }

    return result
}

function extractNestedAngleBrackets(sql: string, openBracketIndex: number): string | null {
    let depth = 1
    let i = openBracketIndex + 1
    while (i < sql.length && depth > 0) {
        const ch = sql[i]
        if (ch === '<') {
            depth++
        } else if (ch === '>') {
            depth--
        }
        i++
    }
    if (depth === 0) {
        return sql.substring(openBracketIndex, i)
    }
    return null
}

function restoreComplexTypes(formatted: string, slots: ReplacementSlot[]): string {
    let result = formatted

    for (const slot of slots) {
        if (!slot.id.includes('__type_')) continue

        const escapedId = escapeRegExp(slot.id)
        const pattern = getCachedRestoreRegex(slot.id, `VARCHAR\\s+\`?${escapedId}\`?`, 'gi')
        pattern.lastIndex = 0
        result = result.replace(pattern, slot.original)
    }

    return result
}

function findStatementEnd(sql: string, startIdx: number): number {
    return SqlTextScanner.findStatementEnd(sql, startIdx)
}

function extractJsonStrings(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    let result = sql
    let inSingleQuote = false
    let inDoubleQuote = false
    let i = 0

    while (i < result.length) {
        const ch = result[i]

        if (inSingleQuote) {
            if (ch === "'" && (i + 1 >= result.length || result[i + 1] !== "'")) {
                inSingleQuote = false
            }
            i++
            continue
        }

        if (inDoubleQuote) {
            if (ch === '"') {
                inDoubleQuote = false
            }
            i++
            continue
        }

        if (ch === "'") {
            const jsonStart = i
            let jsonEnd = -1
            let j = i + 1
            let tempInSingleQuote = true
            const jsonContentStart = j
            while (j < result.length) {
                const c = result[j]
                if (tempInSingleQuote) {
                    if (c === "'") {
                        if (j + 1 < result.length && result[j + 1] === "'") {
                            j += 2
                        } else {
                            jsonEnd = j
                            tempInSingleQuote = false
                            break
                        }
                    } else {
                        j++
                    }
                } else {
                    break
                }
            }
            if (jsonEnd !== -1) {
                const content = result.substring(jsonContentStart, jsonEnd)
                const trimmedContent = content.trim()
                if (
                    (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
                    (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'))
                ) {
                    const id = nextId('json', counter)
                    slots.push({
                        id,
                        original: result.substring(jsonStart, jsonEnd + 1),
                    })
                    result = result.substring(0, jsonStart) + "'" + id + "'" + result.substring(jsonEnd + 1)
                    i = jsonStart + 2 + id.length + 1
                    continue
                }
            }
            inSingleQuote = true
            i++
            continue
        }

        if (ch === '"') {
            inDoubleQuote = true
            i++
            continue
        }

        i++
    }

    return result
}

function restoreJsonStrings(formatted: string, slots: ReplacementSlot[]): string {
    let result = formatted

    for (const slot of slots) {
        if (!slot.id.includes('__json_')) continue

        const escapedId = escapeRegExp(slot.id)
        const pattern = getCachedRestoreRegex(slot.id, "'" + escapedId + "'", 'gi')
        pattern.lastIndex = 0
        result = result.replace(pattern, slot.original)
    }

    return result
}

function replaceInsertOverwriteTable(sql: string): string {
    return sql.replace(/\bINSERT\s+OVERWRITE\s+TABLE\b/gi, (match) => {
        return match.replace(/\bTABLE\b/gi, '___HIVE_TABLE___')
    })
}

function restoreInsertOverwriteTable(formatted: string): string {
    return formatted.replace(/___HIVE_TABLE___/gi, 'TABLE')
}

// node-sql-parser's Hive grammar only recognizes RLIKE (not REGEXP) as the
// regex-match operator. SQL authored for MySQL uses `REGEXP`/`NOT REGEXP`,
// which the Hive parser rejects with "Expected ... RLIKE ... but R found".
// Swap REGEXP -> RLIKE around the parse/format pass, then swap back so the
// formatted output keeps the user's original keyword.
function replaceRegexpOperator(sql: string): string {
    return sql.replace(/\bNOT\s+REGEXP\b/gi, 'NOT RLIKE').replace(/\bREGEXP\b/gi, 'RLIKE')
}

function restoreRegexpOperator(formatted: string): string {
    return formatted.replace(/\bNOT\s+RLIKE\b/gi, 'NOT REGEXP').replace(/\bRLIKE\b/gi, 'REGEXP')
}
