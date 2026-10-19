// 语法高亮生成器的方言配置表。
//
// 每个条目把 package.json contributes.languages 中的语言 ID 映射到现成的
// DialectOptions（各方言 formatter 的 tokenizerOptions 自带完整的关键字分类、
// 引号规则与注释配置），供 grammarBuilder 转译为 TextMate 语法。
//
// 注意：plsql 语言 ID 复用 oracle 的方言定义（与 dialectRegistry 的映射一致）。

import type { DialectOptions } from "../dialects/dialect";
import { sql } from "../dialects/sql/sql.formatter";
import { hive } from "../dialects/hive/hive.formatter";
import { mysql } from "../dialects/mysql/mysql.formatter";
import { spark } from "../dialects/spark/spark.formatter";
import { flinksql } from "../dialects/flinksql/flinksql.formatter";
import { postgresql } from "../dialects/postgresql/postgresql.formatter";
import { bigquery } from "../dialects/bigquery/bigquery.formatter";
import { sqlite } from "../dialects/sqlite/sqlite.formatter";
import { starrocks } from "../dialects/starrocks/starrocks.formatter";
import { sqlserver } from "../dialects/sqlserver/sqlserver.formatter";
import { oracle } from "../dialects/oracle/oracle.formatter";
import { dameng } from "../dialects/dameng/dameng.formatter";

export interface DialectGrammarConfig {
    /** VSCode 语言 ID（package.json contributes.languages 的 id） */
    langId: string;
    /** 语法文件名：syntaxes/<fileName>.tmLanguage.json */
    fileName: string;
    /** TextMate 语法显示名 */
    name: string;
    /** TextMate scope 名（唯一） */
    scopeName: string;
    /** 方言 tokenizer 配置（数据单一来源） */
    options: DialectOptions;
}

export const dialectGrammarConfigs: DialectGrammarConfig[] = [
    { langId: "sql", fileName: "sql", name: "SQL", scopeName: "source.sql.sql", options: sql },
    { langId: "hive", fileName: "hive", name: "HiveQL", scopeName: "source.sql.hive", options: hive },
    { langId: "mysql", fileName: "mysql", name: "MySQL", scopeName: "source.sql.mysql", options: mysql },
    { langId: "spark", fileName: "spark", name: "Spark SQL", scopeName: "source.sql.spark", options: spark },
    { langId: "flinksql", fileName: "flinksql", name: "Flink SQL", scopeName: "source.sql.flinksql", options: flinksql },
    { langId: "postgresql", fileName: "postgresql", name: "PostgreSQL", scopeName: "source.sql.postgresql", options: postgresql },
    { langId: "bigquery", fileName: "bigquery", name: "BigQuery", scopeName: "source.sql.bigquery", options: bigquery },
    { langId: "sqlite", fileName: "sqlite", name: "SQLite", scopeName: "source.sql.sqlite", options: sqlite },
    { langId: "starrocks", fileName: "starrocks", name: "StarRocks", scopeName: "source.sql.starrocks", options: starrocks },
    { langId: "sqlserver", fileName: "sqlserver", name: "Transact-SQL", scopeName: "source.sql.sqlserver", options: sqlserver },
    // plsql 语言 ID 复用 Oracle 方言定义（与 src/core/dialectRegistry.ts 的映射一致）
    { langId: "plsql", fileName: "plsql", name: "PL/SQL", scopeName: "source.sql.plsql", options: oracle },
    { langId: "dameng", fileName: "dameng", name: "Dameng SQL", scopeName: "source.sql.dameng", options: dameng },
];
