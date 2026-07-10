import type { MatchRecognizeNode, MatchRecognizeMeasure, MatchRecognizePattern, MatchRecognizeDefine } from "./astTypesExtended";

/**
 * 解析 Flink MATCH_RECOGNIZE 子句为结构化 AST 节点。
 *
 * 输入应为 MATCH_RECOGNIZE (...) 的完整子句（含关键字与括号）。
 * 解析失败返回 null，不抛异常（供调用方优雅降级）。
 *
 * 解析策略：正则提取各子句，再分别解析。不依赖 node-sql-parser
 * （其不支持 MATCH_RECOGNIZE 语法）。
 */
export function parseMatchRecognize(sql: string): MatchRecognizeNode | null {
    const trimmed = sql.trim();
    // 必须以 MATCH_RECOGNIZE 开头并包含完整括号对
    const headerMatch = /^MATCH_RECOGNIZE\s*\(/i.exec(trimmed);
    if (!headerMatch) return null;

    const openParenIdx = headerMatch.index + headerMatch[0].length - 1;
    const closeIdx = findMatchingParen(trimmed, openParenIdx);
    if (closeIdx === -1) return null;

    const body = trimmed.substring(openParenIdx + 1, closeIdx);

    const partitionBy = extractPartitionBy(body);
    const orderBy = extractOrderBy(body);
    const measures = extractMeasures(body);
    const outputMode = extractOutputMode(body);
    const pattern = extractPattern(body);
    const defines = extractDefines(body);
    const within = extractWithin(body);

    return {
        type: "match_recognize",
        partitionBy,
        orderBy,
        measures,
        outputMode,
        pattern,
        defines,
        within,
        raw: trimmed,
    };
}

function extractPartitionBy(body: string): string[] {
    const m = /\bPARTITION\s+BY\s+([^;\n]+?)(?=\s+(?:ORDER|MEASURES|ONE|ALL|PATTERN|DEFINE|WITHIN)\b|$)/i.exec(body);
    if (!m) return [];
    return m[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function extractOrderBy(body: string): string[] {
    const m = /\bORDER\s+BY\s+([^;\n]+?)(?=\s+(?:MEASURES|ONE|ALL|PATTERN|DEFINE|WITHIN)\b|$)/i.exec(body);
    if (!m) return [];
    return m[1]
        .split(",")
        .map((s) => s.trim().replace(/\s+(ASC|DESC)$/i, ""))
        .filter(Boolean);
}

function extractMeasures(body: string): MatchRecognizeMeasure[] {
    const m = /\bMEASURES\b([\s\S]*?)(?=\s+(?:ONE|ALL|PATTERN|DEFINE|WITHIN)\b|$)/i.exec(body);
    if (!m) return [];
    const measuresText = m[1].trim();
    if (!measuresText) return [];

    const measures: MatchRecognizeMeasure[] = [];
    // 按逗号切分，但忽略括号内的逗号
    const parts = splitByComma(measuresText);
    for (const part of parts) {
        const asMatch = /^(.+?)\s+AS\s+(\w+)$/i.exec(part.trim());
        if (asMatch) {
            measures.push({
                expr: asMatch[1].trim(),
                alias: asMatch[2].trim(),
            });
        }
    }
    return measures;
}

function extractOutputMode(body: string): string {
    const m = /\b(ONE\s+ROW\s+PER\s+MATCH|ALL\s+ROWS\s+PER\s+MATCH)\b/i.exec(body);
    return m ? m[1].toUpperCase().replace(/\s+/g, " ") : "";
}

function extractPattern(body: string): MatchRecognizePattern | null {
    // 定位 PATTERN 关键字后的 '('，再用 findMatchingParen 找匹配的 ')'
    // 避免 non-greedy 正则在嵌套括号处截断（如 PATTERN ((A B)+ C)）
    const headerMatch = /\bPATTERN\s*\(/i.exec(body);
    if (!headerMatch) return null;
    const openParenIdx = headerMatch.index + headerMatch[0].length - 1;
    const closeIdx = findMatchingParen(body, openParenIdx);
    if (closeIdx === -1) return null;
    const raw = body.substring(openParenIdx + 1, closeIdx).trim();

    // 提取模式变量名：大小写敏感的标识符，后跟可选量词（* + ? {n,m}）
    // 过滤掉正则操作符和 SQL 关键字
    const reservedWords = new Set(["PER", "MATCH", "WITHIN", "DEFINE", "MEASURES", "PARTITION", "ORDER", "BY"]);
    const variables = Array.from(raw.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g))
        .map((match) => match[1])
        .filter((v) => !reservedWords.has(v.toUpperCase()));
    // 去重，保持顺序
    const seen = new Set<string>();
    const uniqueVars: string[] = [];
    for (const v of variables) {
        if (!seen.has(v)) {
            seen.add(v);
            uniqueVars.push(v);
        }
    }
    return { raw, variables: uniqueVars };
}

function extractDefines(body: string): MatchRecognizeDefine[] {
    const m = /\bDEFINE\b([\s\S]*?)(?=\s+WITHIN\b|$)/i.exec(body);
    if (!m) return [];
    const definesText = m[1].trim();
    if (!definesText) return [];

    const defines: MatchRecognizeDefine[] = [];
    const parts = splitByComma(definesText);
    for (const part of parts) {
        const asMatch = /^(\w+)\s+AS\s+([\s\S]+)$/i.exec(part.trim());
        if (asMatch) {
            defines.push({
                name: asMatch[1].trim(),
                condition: asMatch[2].trim(),
            });
        }
    }
    return defines;
}

function extractWithin(body: string): string | null {
    const m = /\bWITHIN\s+(INTERVAL\s+[^;\n,]+)/i.exec(body);
    return m ? m[1].trim() : null;
}

/** 按逗号切分，忽略括号内的逗号 */
function splitByComma(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === "," && depth === 0) {
            parts.push(text.substring(start, i));
            start = i + 1;
        }
    }
    parts.push(text.substring(start));
    return parts.filter((p) => p.trim().length > 0);
}

/** 从 openParenIdx（指向 '('）开始找匹配的 ')'，考虑字符串字面量 */
function findMatchingParen(sql: string, openParenIdx: number): number {
    if (sql[openParenIdx] !== "(") return -1;
    let depth = 0;
    let inSingle = false;
    let i = openParenIdx;
    while (i < sql.length) {
        const ch = sql[i];
        const nextCh = i + 1 < sql.length ? sql[i + 1] : undefined;
        if (inSingle) {
            if (ch === "'" && nextCh === "'") {
                i += 2;
                continue;
            }
            if (ch === "'") inSingle = false;
            i++;
            continue;
        }
        if (ch === "'") {
            inSingle = true;
            i++;
            continue;
        }
        if (ch === "(") depth++;
        if (ch === ")") {
            depth--;
            if (depth === 0) return i;
        }
        i++;
    }
    return -1;
}
