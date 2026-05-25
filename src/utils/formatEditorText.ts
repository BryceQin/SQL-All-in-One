import { FormatOptionsWithLanguage, format } from "../formatter/sqlFormatter"
import { preprocessSparkSql, postprocessSparkSql } from "../formatter/SparkSqlAdapter"
import { preprocessHiveSql, postprocessHiveSql } from "../formatter/HiveSqlAdapter"
import { extract as extractComments, restore as restoreComments } from "../formatter/CommentPreserver"
import { handleError, ErrorCategory } from "../core/errorHandler"

export function formatEditorText(
    text: string,
    config: FormatOptionsWithLanguage,
): string {
    const { processedSql, slots } = extractComments(text)

    let formatted: string
    if (config.language === 'spark') {
        formatted = formatSparkSql(processedSql, config)
    } else if (config.language === 'hive') {
        formatted = formatHiveSql(processedSql, config)
    } else if (config.language === 'flinksql') {
        formatted = formatWithFallback(processedSql, config)
    } else {
        formatted = formatWithFallback(processedSql, config)
    }

    formatted = restoreComments(formatted, slots)

    return formatted + (endsWithNewline(text) ? "\n" : "")
}

function formatSparkSql(
    sql: string,
    config: FormatOptionsWithLanguage,
): string {
    const { processedSql, state } = preprocessSparkSql(sql)

    const formatted = formatWithFallback(processedSql, config)

    return postprocessSparkSql(formatted, state)
}

function formatHiveSql(
    sql: string,
    config: FormatOptionsWithLanguage,
): string {
    const { processedSql, state } = preprocessHiveSql(sql)

    const formatted = formatWithFallback(processedSql, config)

    return postprocessHiveSql(formatted, state)
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
