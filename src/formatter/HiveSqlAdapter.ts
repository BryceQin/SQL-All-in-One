import {
    AdapterState,
    replaceSortDistributeCluster,
    restoreSortDistributeCluster,
    extractUntilNextClause,
    escapeRegExp,
} from "./BaseSqlAdapter"

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

    result = restoreComplexTypes(result, state.slots)
    result = restoreJsonStrings(result, state.slots)
    result = restoreSortDistributeCluster(result, state.keywordOccurrences)
    result = restoreLateralView(result, state.slots)
    result = restoreCreateTableClauses(result, state.slots)
    result = restoreWholeStatements(result, state.slots)

    return result
}

function extractWholeStatements(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    const wholeStatementPatterns = [
        /\bMSCK\s+REPAIR\s+TABLE\b/gi,
        /\bANALYZE\s+TABLE\b/gi,
        /\bSHOW\s+(?:DATABASES|SCHEMAS|TABLES|PARTITIONS|CREATE\s+TABLE|COLUMNS)\b/gi,
        /\bDESCRIBE\s+(?:FORMATTED|EXTENDED)?\s*\w/gi,
        /\bEXPLAIN\b/gi,
        /\bSET\s+\w/gi,
        /\bUSE\s+DATABASE\b/gi,
        /\bADD\s+JAR\b/gi,
        /\bEXPORT\s+TABLE\b/gi,
        /\bIMPORT\s+TABLE\b/gi,
        /\bLOAD\s+DATA\b/gi,
        /\bCREATE\s+(?:TEMPORARY\s+)?FUNCTION\b/gi,
        /\bDROP\s+(?:TEMPORARY\s+)?FUNCTION\b/gi,
        /\bDROP\s+DATABASE\b/gi,
        /\bALTER\s+DATABASE\b/gi,
        /\bCREATE\s+DATABASE\b/gi,
        /\bFROM\s+\w+\s+INSERT\b/gi,
        /\bINSERT\s+OVERWRITE\s+LOCAL\s+DIRECTORY\b/gi,
        /\bALTER\s+TABLE\s+\w+\s+(?:ADD\s+COLUMNS|DROP\s+COLUMN|ADD\s+PARTITION|DROP\s+PARTITION|RENAME\s+TO|SET\s+TBLPROPERTIES|CHANGE\s+COLUMN)\b/gi,
    ]

    let result = sql

    for (const pattern of wholeStatementPatterns) {
        const matches: { index: number; end: number; text: string }[] = []
        let m

        while ((m = pattern.exec(result)) !== null) {
            const end = findStatementEnd(result, m.index)
            const text = result.substring(m.index, end).trimEnd()
            if (text) {
                matches.push({ index: m.index, end, text })
            }
        }

        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i]
            const id = nextId('stmt', counter)
            slots.push({ id, original: match.text })
            result = result.substring(0, match.index) + `SELECT * FROM ${id}` + result.substring(match.end)
        }
    }

    return result
}

function restoreWholeStatements(formatted: string, slots: ReplacementSlot[]): string {
    let result = formatted

    for (const slot of slots) {
        if (!slot.id.includes('__stmt_')) continue

        const escapedId = escapeRegExp(slot.id)
        const pattern = new RegExp(
            `SELECT\\s+\\*\\s+FROM\\s+\`?${escapedId}\`?`,
            'gi'
        )
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

        const clausePatterns: RegExp[] = [
            /\bPARTITIONED\s+BY\s*\([^)]*(?:\([^)]*\))*[^)]*\)/gi,
            /\bCLUSTERED\s+BY\s*\([^)]*\)\s*(?:SORTED\s+BY\s*\([^)]*\)\s*)?INTO\s+\d+\s+BUCKETS/gi,
            /\bSKEWED\s+BY\s*\([^)]*\)\s+ON\s+\([^)]*\)(?:\s+STORED\s+AS\s+DIRECTORIES)?/gi,
            /\bROW\s+FORMAT\s+DELIMITED(?:\s+FIELDS\s+TERMINATED\s+BY\s+'[^']*')?(?:\s+LINES\s+TERMINATED\s+BY\s+'[^']*')?/gi,
            /\bSTORED\s+AS\s+\w+/gi,
            /\bLOCATION\s+'[^']*'/gi,
            /\bTBLPROPERTIES\s*\(\s*(?:'[^']*'\s*=\s*'[^']*'(?:\s*,\s*'[^']*'\s*=\s*'[^']*')*)?\s*\)/gi,
        ]

        let modifiedAfter = afterCreateText
        let hasModification = false

        for (const clausePattern of clausePatterns) {
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
        const pattern = new RegExp(`\`?${escapedId}\`?`, 'gi')
        result = result.replace(pattern, slot.original)
    }

    return result
}

function extractLateralView(sql: string, slots: ReplacementSlot[], counter: { value: number }): string {
    let result = sql

    const patterns = [
        /\bLATERAL\s+VIEW\s+OUTER\b/gi,
        /\bLATERAL\s+VIEW\b/gi,
    ]

    for (const pattern of patterns) {
        const matches: { index: number; text: string }[] = []
        let m

        while ((m = pattern.exec(result)) !== null) {
            const matchText = m[0]
            const afterMatch = result.substring(m.index + matchText.length)
            const clauseRest = extractUntilNextClause(afterMatch)
            const fullClause = matchText + clauseRest

            matches.push({ index: m.index, text: fullClause })
        }

        for (let i = matches.length - 1; i >= 0; i--) {
            const lvMatch = matches[i]
            const id = nextId('lv', counter)
            slots.push({ id, original: lvMatch.text })

            const escaped = escapeRegExp(lvMatch.text)
            const replaceRegex = new RegExp(escaped, 'i')
            result = result.replace(replaceRegex, `CROSS JOIN ${id}`)
        }
    }

    return result
}

function restoreLateralView(formatted: string, slots: ReplacementSlot[]): string {
    let result = formatted

    for (const slot of slots) {
        if (!slot.id.includes('__lv_')) continue

        const escapedId = escapeRegExp(slot.id)
        const withBackticks = new RegExp(
            `CROSS\\s+JOIN\\s+\`?${escapedId}\`?`,
            'gi'
        )
        result = result.replace(withBackticks, slot.original)
    }

    return result
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
        const pattern = new RegExp(`VARCHAR\\s+\`?${escapedId}\`?`, 'gi')
        result = result.replace(pattern, slot.original)
    }

    return result
}

function findStatementEnd(sql: string, startIdx: number): number {
    let depth = 0
    let inSingleQuote = false
    let inDoubleQuote = false
    let i = startIdx

    while (i < sql.length) {
        const ch = sql[i]

        if (inSingleQuote) {
            if (ch === "'" && (i + 1 >= sql.length || sql[i + 1] !== "'")) {
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
            inSingleQuote = true
            i++
            continue
        }

        if (ch === '"') {
            inDoubleQuote = true
            i++
            continue
        }

        if (ch === '(') depth++
        if (ch === ')') depth--

        if (ch === ';' && depth <= 0) {
            return i
        }

        i++
    }

    return sql.length
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
        const pattern = new RegExp("'" + escapedId + "'", 'gi')
        result = result.replace(pattern, slot.original)
    }

    return result
}
