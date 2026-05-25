import type { SqlLanguage } from "../formatter/sqlFormatter"
import { getDialectEntries, isSqlDocument, toSqlDialect, getSqlLanguageIds } from "./dialectRegistry"

export { isSqlDocument, toSqlDialect, getSqlLanguageIds }

export const sqlDialects: Record<string, SqlLanguage> = Object.fromEntries(
    getDialectEntries().map(e => [e.vscodeLangId, e.sqlLanguage])
) as Record<string, SqlLanguage>