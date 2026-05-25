export interface KeywordOccurrence {
    original: string
    hive: string
    indexInGroup: number
}

export function matchCase(template: string, target: string): string {
    if (template === template.toUpperCase()) return target.toUpperCase()
    if (template === template.toLowerCase()) return target.toLowerCase()
    return target
}

export function extractUntilNextClause(text: string): string {
    const clauseKeywords = /\b(?:WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|SORT\s+BY|CLUSTER\s+BY|DISTRIBUTE\s+BY|LIMIT|LATERAL\s+VIEW|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|UNION|INTERSECT|EXCEPT|SET|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i

    const match = clauseKeywords.exec(text)
    if (match) {
        return text.substring(0, match.index).trimEnd()
    }

    const semiIndex = text.indexOf(';')
    if (semiIndex !== -1) {
        return text.substring(0, semiIndex).trimEnd()
    }

    return text.trimEnd()
}

export function collectOrderedMatches(
    sql: string,
    patterns: { pattern: RegExp; keyword: string; hive: string }[]
): { index: number; keyword: string }[] {
    const matches: { index: number; keyword: string }[] = []

    for (const p of patterns) {
        const regex = new RegExp(p.pattern.source, p.pattern.flags)
        let m
        while ((m = regex.exec(sql)) !== null) {
            matches.push({ index: m.index, keyword: p.keyword })
        }
    }

    matches.sort((a, b) => a.index - b.index)
    return matches
}

export function cleanClusterByAscDesc(sql: string): string {
    return sql.replace(/\bCLUSTER\s+BY\s+([\w.`"]+(?:\s*,\s*[\w.`"]+)*)\s+ASC\b/gi, (_, cols) => {
        return `CLUSTER BY ${cols}`
    })
}