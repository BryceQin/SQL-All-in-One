import { Lazy } from '../utils/lazy'

import { hive as _hive } from "./hive/hive.formatter"
import { mysql as _mysql } from "./mysql/mysql.formatter"
import { spark as _spark } from "./spark/spark.formatter"
import { flinksql as _flinksql } from "./flinksql/flinksql.formatter"
import { sql as _sql } from "./sql/sql.formatter"
import { postgresql as _postgresql } from "./postgresql/postgresql.formatter"
import { bigquery as _bigquery } from "./bigquery/bigquery.formatter"
import { sqlite as _sqlite } from "./sqlite/sqlite.formatter"

import { functionSignatures as _hiveFns } from "./hive/hive.functions"
import { functionSignatures as _mysqlFns } from "./mysql/mysql.functions"
import { functionSignatures as _sparkFns } from "./spark/spark.functions"
import { functionSignatures as _flinksqlFns } from "./flinksql/flinksql.functions"
import { functionSignatures as _sqlFns } from "./sql/sql.functions"
import { functionSignatures as _pgFns } from "./postgresql/postgresql.functions"
import { functionSignatures as _bqFns } from "./bigquery/bigquery.functions"
import { functionSignatures as _sqliteFns } from "./sqlite/sqlite.functions"

import { keywords as _hiveKw, dataTypes as _hiveDt } from "./hive/hive.keywords"
import { keywords as _mysqlKw, dataTypes as _mysqlDt } from "./mysql/mysql.keywords"
import { keywords as _sparkKw, dataTypes as _sparkDt } from "./spark/spark.keywords"
import { keywords as _flinksqlKw, dataTypes as _flinksqlDt } from "./flinksql/flinksql.keywords"
import { keywords as _sqlKw, dataTypes as _sqlDt } from "./sql/sql.keywords"
import { keywords as _pgKw, dataTypes as _pgDt } from "./postgresql/postgresql.keywords"
import { keywords as _bqKw, dataTypes as _bqDt } from "./bigquery/bigquery.keywords"
import { keywords as _sqliteKw, dataTypes as _sqliteDt } from "./sqlite/sqlite.keywords"

export const hive = new Lazy(() => _hive)
export const mysql = new Lazy(() => _mysql)
export const spark = new Lazy(() => _spark)
export const flinksql = new Lazy(() => _flinksql)
export const sql = new Lazy(() => _sql)
export const postgresql = new Lazy(() => _postgresql)
export const bigquery = new Lazy(() => _bigquery)
export const sqlite = new Lazy(() => _sqlite)

export const hiveFunctionSignatures = new Lazy(() => _hiveFns)
export const mysqlFunctionSignatures = new Lazy(() => _mysqlFns)
export const sparkFunctionSignatures = new Lazy(() => _sparkFns)
export const flinksqlFunctionSignatures = new Lazy(() => _flinksqlFns)
export const sqlFunctionSignatures = new Lazy(() => _sqlFns)
export const pgFunctionSignatures = new Lazy(() => _pgFns)
export const bqFunctionSignatures = new Lazy(() => _bqFns)
export const sqliteFunctionSignatures = new Lazy(() => _sqliteFns)

export const hiveKeywords = new Lazy(() => _hiveKw)
export const hiveDataTypes = new Lazy(() => _hiveDt)
export const mysqlKeywords = new Lazy(() => _mysqlKw)
export const mysqlDataTypes = new Lazy(() => _mysqlDt)
export const sparkKeywords = new Lazy(() => _sparkKw)
export const sparkDataTypes = new Lazy(() => _sparkDt)
export const flinksqlKeywords = new Lazy(() => _flinksqlKw)
export const flinksqlDataTypes = new Lazy(() => _flinksqlDt)
export const sqlKeywords = new Lazy(() => _sqlKw)
export const sqlDataTypes = new Lazy(() => _sqlDt)
export const pgKeywords = new Lazy(() => _pgKw)
export const pgDataTypes = new Lazy(() => _pgDt)
export const bqKeywords = new Lazy(() => _bqKw)
export const bqDataTypes = new Lazy(() => _bqDt)
export const sqliteKeywords = new Lazy(() => _sqliteKw)
export const sqliteDataTypes = new Lazy(() => _sqliteDt)
