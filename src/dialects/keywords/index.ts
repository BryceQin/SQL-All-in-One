// NOTE: This file is part of the HOVER keyword system (KeywordInfo[] with
// syntax/description/example metadata for tooltips). It is deliberately
// separate from the TOKENIZER keyword system at
//   <dialect>/<dialect>.keywords.ts (plain string[] for lexer
// regex/trie construction).
//
// Do NOT merge these two systems. The tokenizer needs a flat string array
// for hot-path performance; the hover system needs rich metadata that
// would bloat the lexer if combined. Both are intentionally maintained
// per-dialect.

import type { KeywordInfo } from "../../hover/HoverResolver";
import type { SqlLanguage } from "../../core/dialectRegistry";
import { baseKeywords } from "./baseKeywords";
import { hiveKeywords } from "./hiveKeywords";
import { sparkKeywords } from "./sparkKeywords";
import { flinksqlKeywords } from "./flinksqlKeywords";
import { mysqlKeywords } from "./mysqlKeywords";
import { postgresqlKeywords } from "./postgresqlKeywords";
import { bigqueryKeywords } from "./bigqueryKeywords";
import { sqliteKeywords } from "./sqliteKeywords";
import { starrocksKeywords } from "./starrocksKeywords";
import { sqlserverKeywords } from "./sqlserverKeywords";
import { oracleKeywords } from "./oracleKeywords";
import { damengKeywords } from "./damengKeywords";

const dialectKeywordMap: Record<string, KeywordInfo[]> = {
    hive: hiveKeywords,
    mysql: mysqlKeywords,
    spark: sparkKeywords,
    flinksql: flinksqlKeywords,
    sql: [],
    postgresql: postgresqlKeywords,
    bigquery: bigqueryKeywords,
    sqlite: sqliteKeywords,
    starrocks: starrocksKeywords,
    sqlserver: sqlserverKeywords,
    oracle: oracleKeywords,
    dameng: damengKeywords,
};

const cache = new Map<SqlLanguage, KeywordInfo[]>();

export function getKeywordsForDialect(dialect: SqlLanguage): KeywordInfo[] {
    const cached = cache.get(dialect);
    if (cached) return cached;

    const dialectSpecific = dialectKeywordMap[dialect] || [];
    const merged = new Map<string, KeywordInfo>();

    for (const kw of baseKeywords) {
        merged.set(kw.keyword.toUpperCase(), kw);
    }
    for (const kw of dialectSpecific) {
        merged.set(kw.keyword.toUpperCase(), kw);
    }

    const result = Array.from(merged.values());
    cache.set(dialect, result);
    return result;
}
