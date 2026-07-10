import type { AstNode } from "./astTypes";

/**
 * Flink CEP MATCH_RECOGNIZE 语句的结构化 AST 节点。
 *
 * 由 parseMatchRecognize (见 FlinkCepAstBuilder) 从原始 SQL 文本解析得到，
 * 用于支持 definition provider / linter / hover 识别 CEP 语句的子结构。
 */
export interface MatchRecognizeNode extends AstNode {
    type: "match_recognize";
    /** PARTITION BY 列名列表 */
    partitionBy: string[];
    /** ORDER BY 列名列表 */
    orderBy: string[];
    /** MEASURES 子句项 */
    measures: MatchRecognizeMeasure[];
    /** 输出模式：'ONE ROW PER MATCH' | 'ALL ROWS PER MATCH' | '' (空串表示未指定) */
    outputMode: string;
    /** PATTERN 子句 */
    pattern: MatchRecognizePattern | null;
    /** DEFINE 子句项 */
    defines: MatchRecognizeDefine[];
    /** WITHIN 子句原文（如 "INTERVAL '5' MINUTE"） */
    within: string | null;
    /** 原始 SQL 文本 */
    raw: string;
}

export interface MatchRecognizeMeasure {
    /** 表达式原文（如 "START_ROW.rowtime"） */
    expr: string;
    /** 别名（如 "start_time"） */
    alias: string;
}

export interface MatchRecognizePattern {
    /** PATTERN 内部原文（如 "START_ROW UP DOWN+ END_ROW"） */
    raw: string;
    /** 提取的模式变量名列表（如 ["START_ROW", "UP", "DOWN", "END_ROW"]） */
    variables: string[];
}

export interface MatchRecognizeDefine {
    /** 模式变量名（如 "UP"） */
    name: string;
    /** 条件表达式原文（如 "UP.price \> START_ROW.price"） */
    condition: string;
}
