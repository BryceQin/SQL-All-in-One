import { FormatOptionsWithLanguage, format } from "../formatter/sqlFormatter"
import { SparkSqlAdapter } from "../formatter/SparkSqlAdapter"
import { HiveSqlAdapter } from "../formatter/HiveSqlAdapter"
import { CommentPreserver } from "../formatter/CommentPreserver"
import { handleError, ErrorCategory } from "../core/errorHandler"

export function formatEditorText(
    text: string,
    config: FormatOptionsWithLanguage,
): string {
    const commentPreserver = new CommentPreserver()
    const extracted = commentPreserver.extract(text)

    let formatted: string
    if (config.language === 'spark') {
        formatted = formatSparkSql(extracted, config)
    } else if (config.language === 'hive') {
        formatted = formatHiveSql(extracted, config)
    } else if (config.language === 'flinksql') {
        formatted = formatWithFallback(extracted, config)
    } else {
        formatted = formatWithFallback(extracted, config)
    }

    formatted = commentPreserver.restore(formatted)

    return formatted + (endsWithNewline(text) ? "\n" : "")
}

function formatSparkSql(
    sql: string,
    config: FormatOptionsWithLanguage,
): string {
    const adapter = new SparkSqlAdapter()
    const preprocessed = adapter.preprocess(sql)

    const formatted = formatWithFallback(preprocessed, config)

    return adapter.postprocess(formatted)
}

function formatHiveSql(
    sql: string,
    config: FormatOptionsWithLanguage,
): string {
    const adapter = new HiveSqlAdapter()
    const preprocessed = adapter.preprocess(sql)

    const formatted = formatWithFallback(preprocessed, config)

    return adapter.postprocess(formatted)
}

function formatWithFallback(
    sql: string,
    config: FormatOptionsWithLanguage,
): string {
    try {
        return format(sql, config)
    } catch (e) {
        handleError(e, 'formatWithFallback', ErrorCategory.CRITICAL)
        return sql
    }
}

const endsWithNewline = (text: string) => /\n$/.test(text)
