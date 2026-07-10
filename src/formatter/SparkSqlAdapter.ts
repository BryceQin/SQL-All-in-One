import {
    AdapterState,
    replaceSortDistributeCluster,
    restoreSortDistributeCluster,
    escapeRegExp,
    extractLateralView as sharedExtractLateralView,
    restoreLateralView as sharedRestoreLateralView,
} from "./HiveSparkSharedAdapter";

interface UsingSlot {
    tableName: string;
    usingClause: string;
}

interface LateralViewSlot {
    id: string;
    original: string;
}

interface MergeSlot {
    original: string;
}

interface DeltaStmtSlot {
    id: string;
    original: string;
}

export interface SparkAdapterState extends AdapterState {
    usingSlots: UsingSlot[];
    lateralViewSlots: LateralViewSlot[];
    mergeSlots: MergeSlot[];
    deltaStmtSlots: DeltaStmtSlot[];
}

// Delta Lake / Iceberg / Hudi 特有整段语句：parser 完全不识别，整体 slot 化。
// 每条正则带 gi 标志，exec 调用间会保留 lastIndex，必须在每次扫描前重置。
const deltaStatementPatterns: RegExp[] = [
    // OPTIMIZE table [WHERE predicate] [ZORDER BY (cols)]
    /\bOPTIMIZE\b[^;]*?(?:\bZORDER\s+BY\b[^;]*)?;?/gi,
    // VACUUM table [RETAIN N HOURS] [DRY RUN]
    /\bVACUUM\b[^;]*?(?:\bRETAIN\b[^;]*?\bHOURS\b)?(?:\s+DRY\s+RUN)?;?/gi,
    // CONVERT TO DELTA table [PARTITIONED BY (cols)]
    /\bCONVERT\s+TO\s+DELTA\b[^;]*?(?:\bPARTITIONED\s+BY\b\s*\([^)]*\))?;?/gi,
    // DESCRIBE HISTORY table / DESCRIBE DETAIL table
    /\bDESCRIBE\s+(?:HISTORY|DETAIL)\b[^;]*;?/gi,
    // CREATE TABLE ... (DEEP|SHALLOW) CLONE source [LOCATION ...] [TBLPROPERTIES ...]
    /\bCREATE\s+TABLE\b[^;]*?\b(?:DEEP|SHALLOW)\s+CLONE\b[^;]*;?/gi,
    // CREATE OR REPLACE TABLE ... (DEEP|SHALLOW) CLONE source
    /\bCREATE\s+OR\s+REPLACE\s+TABLE\b[^;]*?\b(?:DEEP|SHALLOW)\s+CLONE\b[^;]*;?/gi,
    // GENERATE symlink_format_manifest FOR TABLE table
    /\bGENERATE\s+symlink_format_manifest\s+FOR\s+TABLE\b[^;]*;?/gi,
    // ALTER TABLE ... ADD COLUMNS / CHANGE COLUMN 在 Delta 上下文也走标准语法，无需 slot 化
];

export function preprocessSparkSql(sql: string): { processedSql: string; state: SparkAdapterState } {
    const counter = { value: 0 };
    const usingSlots: UsingSlot[] = [];
    const lateralViewSlots: LateralViewSlot[] = [];
    const mergeSlots: MergeSlot[] = [];
    const deltaStmtSlots: DeltaStmtSlot[] = [];

    let result = sql;

    // Delta 特有语句先整段 slot 化（必须在其他处理之前，避免后续正则误匹配）
    result = extractDeltaStatements(result, deltaStmtSlots, counter);
    result = extractMergeInto(result, mergeSlots, counter);
    result = extractLateralView(result, lateralViewSlots, counter);
    result = extractCreateTableUsing(result, usingSlots);
    const sortResult = replaceSortDistributeCluster(result);

    return {
        processedSql: sortResult.result,
        state: {
            keywordOccurrences: sortResult.keywordOccurrences,
            usingSlots,
            lateralViewSlots,
            mergeSlots,
            deltaStmtSlots,
        },
    };
}

export function postprocessSparkSql(formatted: string, state: SparkAdapterState): string {
    let result = formatted;

    result = restoreSortDistributeCluster(result, state.keywordOccurrences);
    result = restoreCreateTableUsing(result, state.usingSlots);
    result = restoreLateralView(result, state.lateralViewSlots);
    result = restoreMergeInto(result, state.mergeSlots);
    result = restoreDeltaStatements(result, state.deltaStmtSlots);

    return result;
}

function extractDeltaStatements(sql: string, slots: DeltaStmtSlot[], counter: { value: number }): string {
    let result = sql;

    for (const pattern of deltaStatementPatterns) {
        pattern.lastIndex = 0;
        const matches: { index: number; end: number; text: string }[] = [];
        let m;

        while ((m = pattern.exec(result)) !== null) {
            const text = m[0];
            matches.push({ index: m.index, end: m.index + text.length, text });
        }

        if (matches.length === 0) continue;

        // 倒序替换，避免索引偏移
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const id = `spark_delta_${counter.value++}`;
            slots.push({ id, original: match.text });
            result = result.substring(0, match.index) + `SELECT * FROM ${id}` + result.substring(match.end);
        }
    }

    return result;
}

function restoreDeltaStatements(formatted: string, slots: DeltaStmtSlot[]): string {
    if (slots.length === 0) return formatted;

    let result = formatted;

    for (const slot of slots) {
        const escapedId = escapeRegExp(slot.id);
        // 占位形式：SELECT * FROM spark_delta_N
        const pattern = new RegExp(`SELECT\\s+\\*\\s+FROM\\s+\`?${escapedId}\`?`, "gi");
        pattern.lastIndex = 0;
        result = result.replace(pattern, () => slot.original);
    }

    return result;
}

function extractLateralView(sql: string, lateralViewSlots: LateralViewSlot[], counter: { value: number }): string {
    // 任务 4（R4）：复用 HiveSparkSharedAdapter 中的共享实现。
    // 任务 2（P4）：共享实现已采用两阶段模式（先收集 matches 再倒序替换），
    // 移除了原先 exec+replace 混用对 pattern.lastIndex = 0 的脆弱依赖。
    // Spark slot id 格式为 spark_lv_N（前缀 spark_lv_，无后缀）。
    return sharedExtractLateralView(sql, lateralViewSlots, counter, "spark_lv_", "");
}

function restoreLateralView(formatted: string, lateralViewSlots: LateralViewSlot[]): string {
    // 任务 4（R4）：复用 HiveSparkSharedAdapter 中的共享实现。
    // idMarker='' 表示不做 id 过滤（Spark 的 lateralViewSlots 数组只含 lateral view slot）。
    return sharedRestoreLateralView(formatted, lateralViewSlots, "");
}

function extractCreateTableUsing(sql: string, usingSlots: UsingSlot[]): string {
    const usingPattern = /\b(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.`"]+)\s+(USING\s+\w+)/gi;
    let result = sql;
    let m;

    while ((m = usingPattern.exec(result)) !== null) {
        const tableName = m[1];
        const usingClause = m[2];
        usingSlots.push({ tableName, usingClause });

        result = result.replace(usingClause, "");
        usingPattern.lastIndex = 0;
    }

    result = result.replace(/\b(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.`"]+)\s{2,}/gi, "$1 ");

    return result;
}

function restoreCreateTableUsing(formatted: string, usingSlots: UsingSlot[]): string {
    let result = formatted;

    for (const slot of usingSlots) {
        const tablePattern = escapeRegExp(slot.tableName);
        const regex = new RegExp(`(${tablePattern})`, "i");
        result = result.replace(regex, `$1 ${slot.usingClause}`);
    }

    return result;
}

function extractMergeInto(sql: string, mergeSlots: MergeSlot[], counter: { value: number }): string {
    let result = sql;

    const mergePattern = /\bMERGE\s+INTO\b/gi;
    let m;

    while ((m = mergePattern.exec(result)) !== null) {
        const startIdx = m.index;

        let endIdx = result.length;
        const semiIdx = result.indexOf(";", startIdx);
        if (semiIdx !== -1) {
            endIdx = semiIdx;
        }

        const original = result.substring(startIdx, endIdx).trimEnd();
        const id = `spark_merge_${counter.value++}`;
        mergeSlots.push({ original });

        const escaped = escapeRegExp(original);
        const replaceRegex = new RegExp(escaped, "i");
        result = result.replace(replaceRegex, `SELECT * FROM ${id}`);

        mergePattern.lastIndex = 0;
    }

    return result;
}

function restoreMergeInto(formatted: string, mergeSlots: MergeSlot[]): string {
    let result = formatted;

    for (const slot of mergeSlots) {
        const selectPattern = /SELECT\s+\*\s+FROM\s+`?spark_merge_\d+`?/gi;
        result = result.replace(selectPattern, slot.original);
    }

    return result;
}
