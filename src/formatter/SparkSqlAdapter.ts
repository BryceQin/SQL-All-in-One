import { BaseSqlAdapter } from "./BaseSqlAdapter"

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

export class SparkSqlAdapter extends BaseSqlAdapter {
    private usingSlots: UsingSlot[] = []
    private lateralViewSlots: LateralViewSlot[] = []
    private mergeSlots: MergeSlot[] = []
    private clauseCounter = 0

    preprocess(sql: string): string {
        this.keywordOccurrences = []
        this.usingSlots = []
        this.lateralViewSlots = []
        this.mergeSlots = []
        this.clauseCounter = 0

        let result = sql

        result = this.extractMergeInto(result)
        result = this.extractLateralView(result)
        result = this.extractCreateTableUsing(result)
        result = this.replaceSortDistributeCluster(result)

        return result
    }

    postprocess(formatted: string): string {
        let result = formatted

        result = this.restoreSortDistributeCluster(result)
        result = this.restoreCreateTableUsing(result)
        result = this.restoreLateralView(result)
        result = this.restoreMergeInto(result)

        return result
    }

    private extractLateralView(sql: string): string {
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
                const clauseRest = this.extractUntilNextClause(afterMatch)
                const fullClause = matchText + clauseRest

                const id = `spark_lv_${this.clauseCounter++}`
                this.lateralViewSlots.push({ id, original: fullClause })

                const escaped = this.escapeRegExp(fullClause)
                const replaceRegex = new RegExp(escaped, 'i')
                result = result.replace(replaceRegex, `CROSS JOIN ${id}`)

                pattern.lastIndex = 0
            }
        }

        return result
    }

    private restoreLateralView(formatted: string): string {
        let result = formatted

        for (const slot of this.lateralViewSlots) {
            const escapedId = this.escapeRegExp(slot.id)
            const withBackticks = new RegExp(
                `CROSS\\s+JOIN\\s+\`?${escapedId}\`?`,
                'gi'
            )
            result = result.replace(withBackticks, slot.original)
        }

        return result
    }

    private extractCreateTableUsing(sql: string): string {
        const usingPattern = /\b(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.`"]+)\s+(USING\s+\w+)/gi
        let result = sql
        let m

        while ((m = usingPattern.exec(result)) !== null) {
            const tableName = m[1]
            const usingClause = m[2]
            this.usingSlots.push({ tableName, usingClause })

            result = result.replace(usingClause, '')
            usingPattern.lastIndex = 0
        }

        result = result.replace(/\b(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.`"]+)\s{2,}/gi, '$1 ')

        return result
    }

    private restoreCreateTableUsing(formatted: string): string {
        let result = formatted

        for (const slot of this.usingSlots) {
            const tablePattern = this.escapeRegExp(slot.tableName)
            const regex = new RegExp(`(${tablePattern})`, 'i')
            result = result.replace(regex, `$1 ${slot.usingClause}`)
        }

        return result
    }

    private extractMergeInto(sql: string): string {
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
            const id = `spark_merge_${this.clauseCounter++}`
            this.mergeSlots.push({ original })

            const escaped = this.escapeRegExp(original)
            const replaceRegex = new RegExp(escaped, 'i')
            result = result.replace(replaceRegex, `SELECT * FROM ${id}`)

            mergePattern.lastIndex = 0
        }

        return result
    }

    private restoreMergeInto(formatted: string): string {
        let result = formatted

        for (const slot of this.mergeSlots) {
            const selectPattern = /SELECT\s+\*\s+FROM\s+`?spark_merge_\d+`?/gi
            result = result.replace(selectPattern, slot.original)
        }

        return result
    }
}