import type { SqlDialect } from "./dialectMapper";

export interface ErrorPosition {
    /** 1-based line number */
    line: number;
    /** 1-based column number */
    column: number;
}

/**
 * 方言特定的错误提示规则。
 *
 * 每条规则匹配 cause.message 中的模式，返回对应的修复建议。
 * 用于在 FlinkSQL/SparkSQL 解析失败时提供可操作的修复建议。
 */
interface DialectHintRule {
    pattern: RegExp;
    hint: string;
}

const flinksqlHintRules: DialectHintRule[] = [
    {
        pattern: /WATERMARK/i,
        hint: "WATERMARK 子句需在 CREATE TABLE 列表内，且语法为 WATERMARK FOR <col> AS <expr>。当前解析器可能未识别，请检查 slot 化预处理是否覆盖此结构。",
    },
    {
        pattern: /MATCH_RECOGNIZE/i,
        hint: "MATCH_RECOGNIZE 是 Flink CEP 语法，需在 FROM 子句后使用。检查 PATTERN/DEFINE/MEASURES 子句是否完整。",
    },
    {
        pattern: /DESCRIPTOR/i,
        hint: "DESCRIPTOR(col) 仅用于窗口表函数（TUMBLE/HOP/CUMULATE/SESSION）的参数。",
    },
    {
        pattern: /FOR\s+SYSTEM_TIME/i,
        hint: "FOR SYSTEM_TIME AS OF 是 Flink 时态表连接语法，需在 JOIN 后使用。",
    },
    {
        pattern: /EMIT/i,
        hint: "EMIT 是 Flink 流式查询输出策略，仅出现在 INSERT 或 SELECT 语句末尾。",
    },
];

const sparkHintRules: DialectHintRule[] = [
    {
        pattern: /SORT\s+BY|CLUSTER\s+BY|DISTRIBUTE\s+BY|"BY"/i,
        hint: "SORT BY / CLUSTER BY / DISTRIBUTE BY 是 Spark 独有语法。当前解析器走 Hive 方言，已通过预处理 hack 支持，若解析失败请检查子句位置。",
    },
    {
        pattern: /USING\s+\w+/i,
        hint: "USING <format> 是 Spark CREATE TABLE 语法（如 USING PARQUET）。需在列定义之后、LOCATION 之前。",
    },
    {
        pattern: /OPTIMIZE|VACUUM|ZORDER|CLONE/i,
        hint: "OPTIMIZE/VACUUM/ZORDER/CLONE 是 Delta Lake 语法，已通过 slot 化处理。检查语句是否完整（含分号或行尾）。",
    },
    {
        pattern: /MERGE\s+INTO/i,
        hint: "MERGE INTO 需包含 WHEN MATCHED / WHEN NOT MATCHED 子句。检查 ON 条件与 THEN 操作是否完整。",
    },
];

const dialectHintMap: Partial<Record<SqlDialect, DialectHintRule[]>> = {
    flinksql: flinksqlHintRules,
    spark: sparkHintRules,
};

function extractPosition(cause: unknown): ErrorPosition | undefined {
    if (!(cause instanceof Error)) return undefined;
    const match = cause.message.match(/at position (\d+)/);
    if (!match) return undefined;
    const offset = parseInt(match[1], 10);
    if (isNaN(offset) || offset < 0) return undefined;
    return { line: 1, column: offset + 1 };
}

function findDialectHint(dialect: SqlDialect, cause: unknown): string | undefined {
    const rules = dialectHintMap[dialect];
    if (!rules || !(cause instanceof Error)) return undefined;
    for (const rule of rules) {
        if (rule.pattern.test(cause.message)) {
            return rule.hint;
        }
    }
    return undefined;
}

export class ParseError extends Error {
    readonly dialect: SqlDialect;
    readonly sql: string;
    override readonly cause: unknown;
    readonly position?: ErrorPosition;
    readonly dialectHint?: string;

    constructor(dialect: SqlDialect, sql: string, cause: unknown) {
        const message = cause instanceof Error ? cause.message : String(cause);
        super(`Failed to parse SQL (${dialect}): ${message}`);
        this.name = "ParseError";
        this.dialect = dialect;
        this.sql = sql;
        this.cause = cause;
        this.position = extractPosition(cause);
        this.dialectHint = findDialectHint(dialect, cause);
    }
}
