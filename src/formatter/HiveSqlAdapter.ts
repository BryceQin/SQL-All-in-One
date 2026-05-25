import { BaseSqlAdapter } from "./BaseSqlAdapter"

interface ReplacementSlot {
    id: string
    original: string
}

export class HiveSqlAdapter extends BaseSqlAdapter {
    private slots: ReplacementSlot[] = []
    private slotCounter = 0

    preprocess(sql: string): string {
        this.keywordOccurrences = []
        this.slots = []
        this.slotCounter = 0

        let result = sql

        result = this.extractWholeStatements(result)
        result = this.extractCreateTableClauses(result)
        result = this.extractLateralView(result)
        result = this.replaceSortDistributeCluster(result)
        result = this.replaceComplexTypes(result)

        return result
    }

    postprocess(formatted: string): string {
        let result = formatted

        result = this.restoreComplexTypes(result)
        result = this.restoreSortDistributeCluster(result)
        result = this.restoreLateralView(result)
        result = this.restoreCreateTableClauses(result)
        result = this.restoreWholeStatements(result)

        return result
    }

    private nextId(prefix: string): string {
        return `__${prefix}_${this.slotCounter++}__`
    }

    private extractWholeStatements(sql: string): string {
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
                const end = this.findStatementEnd(result, m.index)
                const text = result.substring(m.index, end).trimEnd()
                if (text) {
                    matches.push({ index: m.index, end, text })
                }
            }

            for (let i = matches.length - 1; i >= 0; i--) {
                const match = matches[i]
                const id = this.nextId('stmt')
                this.slots.push({ id, original: match.text })
                result = result.substring(0, match.index) + `SELECT * FROM ${id}` + result.substring(match.end)
            }
        }

        return result
    }

    private restoreWholeStatements(formatted: string): string {
        let result = formatted

        for (const slot of this.slots) {
            if (!slot.id.includes('__stmt_')) continue

            const escapedId = this.escapeRegExp(slot.id)
            const pattern = new RegExp(
                `SELECT\\s+\\*\\s+FROM\\s+\`?${escapedId}\`?`,
                'gi'
            )
            result = result.replace(pattern, slot.original)
        }

        return result
    }

    private extractCreateTableClauses(sql: string): string {
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
            const stmtEnd = this.findStatementEnd(result, match.index)
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
                    const id = this.nextId('ddl')
                    this.slots.push({ id, original: clauseMatch.text })
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

    private restoreCreateTableClauses(formatted: string): string {
        let result = formatted

        for (const slot of this.slots) {
            if (!slot.id.includes('__ddl_')) continue

            const escapedId = this.escapeRegExp(slot.id)
            const pattern = new RegExp(`\`?${escapedId}\`?`, 'gi')
            result = result.replace(pattern, slot.original)
        }

        return result
    }

    private extractLateralView(sql: string): string {
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
                const clauseRest = this.extractUntilNextClause(afterMatch)
                const fullClause = matchText + clauseRest

                matches.push({ index: m.index, text: fullClause })
            }

            for (let i = matches.length - 1; i >= 0; i--) {
                const lvMatch = matches[i]
                const id = this.nextId('lv')
                this.slots.push({ id, original: lvMatch.text })

                const escaped = this.escapeRegExp(lvMatch.text)
                const replaceRegex = new RegExp(escaped, 'i')
                result = result.replace(replaceRegex, `CROSS JOIN ${id}`)
            }
        }

        return result
    }

    private restoreLateralView(formatted: string): string {
        let result = formatted

        for (const slot of this.slots) {
            if (!slot.id.includes('__lv_')) continue

            const escapedId = this.escapeRegExp(slot.id)
            const withBackticks = new RegExp(
                `CROSS\\s+JOIN\\s+\`?${escapedId}\`?`,
                'gi'
            )
            result = result.replace(withBackticks, slot.original)
        }

        return result
    }

    private replaceComplexTypes(sql: string): string {
        let result = sql

        const complexTypePattern = /\b(MAP|ARRAY|STRUCT)\s*</gi
        const typeMatches: { index: number; text: string }[] = []

        let m: RegExpExecArray | null
        while ((m = complexTypePattern.exec(result)) !== null) {
            const startIndex = m.index
            const bracketStart = m.index + m[0].length - 1
            const fullText = this.extractNestedAngleBrackets(result, bracketStart)
            if (fullText) {
                const typeText = result.substring(startIndex, bracketStart + fullText.length)
                typeMatches.push({ index: startIndex, text: typeText })
            }
        }

        for (let i = typeMatches.length - 1; i >= 0; i--) {
            const typeMatch = typeMatches[i]
            const id = this.nextId('type')
            this.slots.push({ id, original: typeMatch.text })
            result =
                result.substring(0, typeMatch.index) +
                `VARCHAR ${id}` +
                result.substring(typeMatch.index + typeMatch.text.length)
        }

        return result
    }

    private extractNestedAngleBrackets(sql: string, openBracketIndex: number): string | null {
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

    private restoreComplexTypes(formatted: string): string {
        let result = formatted

        for (const slot of this.slots) {
            if (!slot.id.includes('__type_')) continue

            const escapedId = this.escapeRegExp(slot.id)
            const pattern = new RegExp(`VARCHAR\\s+\`?${escapedId}\`?`, 'gi')
            result = result.replace(pattern, slot.original)
        }

        return result
    }

    private findStatementEnd(sql: string, startIdx: number): number {
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
}