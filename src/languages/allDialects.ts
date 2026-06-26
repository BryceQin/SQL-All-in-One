import { Lazy } from '../utils/lazy'

import { hive as _hive } from "./hive/hive.formatter"
import { mysql as _mysql } from "./mysql/mysql.formatter"
import { spark as _spark } from "./spark/spark.formatter"
import { flinksql as _flinksql } from "./flinksql/flinksql.formatter"
import { sql as _sql } from "./sql/sql.formatter"
import { postgresql as _postgresql } from "./postgresql/postgresql.formatter"
import { bigquery as _bigquery } from "./bigquery/bigquery.formatter"
import { sqlite as _sqlite } from "./sqlite/sqlite.formatter"
import { starrocks as _starrocks } from "./starrocks/starrocks.formatter"
import { sqlserver as _sqlserver } from "./sqlserver/sqlserver.formatter"
import { oracle as _oracle } from "./oracle/oracle.formatter"
import { dameng as _dameng } from "./dameng/dameng.formatter"

import { functionSignatures as _hiveFns } from "./hive/hive.functions"
import { functionSignatures as _mysqlFns } from "./mysql/mysql.functions"
import { functionSignatures as _sparkFns } from "./spark/spark.functions"
import { functionSignatures as _flinksqlFns } from "./flinksql/flinksql.functions"
import { functionSignatures as _sqlFns } from "./sql/sql.functions"
import { functionSignatures as _pgFns } from "./postgresql/postgresql.functions"
import { functionSignatures as _bqFns } from "./bigquery/bigquery.functions"
import { functionSignatures as _sqliteFns } from "./sqlite/sqlite.functions"
import { functionSignatures as _starrocksFns } from "./starrocks/starrocks.functions"
import { functionSignatures as _sqlserverFns } from "./sqlserver/sqlserver.functions"
import { functionSignatures as _oracleFns } from "./oracle/oracle.functions"
import { functionSignatures as _damengFns } from "./dameng/dameng.functions"

import { keywords as _hiveKw, dataTypes as _hiveDt } from "./hive/hive.keywords"
import { keywords as _mysqlKw, dataTypes as _mysqlDt } from "./mysql/mysql.keywords"
import { keywords as _sparkKw, dataTypes as _sparkDt } from "./spark/spark.keywords"
import { keywords as _flinksqlKw, dataTypes as _flinksqlDt } from "./flinksql/flinksql.keywords"
import { keywords as _sqlKw, dataTypes as _sqlDt } from "./sql/sql.keywords"
import { keywords as _pgKw, dataTypes as _pgDt } from "./postgresql/postgresql.keywords"
import { keywords as _bqKw, dataTypes as _bqDt } from "./bigquery/bigquery.keywords"
import { keywords as _sqliteKw, dataTypes as _sqliteDt } from "./sqlite/sqlite.keywords"
import { keywords as _starrocksKw, dataTypes as _starrocksDt } from "./starrocks/starrocks.keywords"
import { keywords as _sqlserverKw, dataTypes as _sqlserverDt } from "./sqlserver/sqlserver.keywords"
import { keywords as _oracleKw, dataTypes as _oracleDt } from "./oracle/oracle.keywords"
import { keywords as _damengKw, dataTypes as _damengDt } from "./dameng/dameng.keywords"

export const hive = new Lazy(() => _hive)
export const mysql = new Lazy(() => _mysql)
export const spark = new Lazy(() => _spark)
export const flinksql = new Lazy(() => _flinksql)
export const sql = new Lazy(() => _sql)
export const postgresql = new Lazy(() => _postgresql)
export const bigquery = new Lazy(() => _bigquery)
export const sqlite = new Lazy(() => _sqlite)
export const starrocks = new Lazy(() => _starrocks)
export const sqlserver = new Lazy(() => _sqlserver)
export const oracle = new Lazy(() => _oracle)
export const dameng = new Lazy(() => _dameng)

export const hiveFunctionSignatures = new Lazy(() => _hiveFns)
export const mysqlFunctionSignatures = new Lazy(() => _mysqlFns)
export const sparkFunctionSignatures = new Lazy(() => _sparkFns)
export const flinksqlFunctionSignatures = new Lazy(() => _flinksqlFns)
export const sqlFunctionSignatures = new Lazy(() => _sqlFns)
export const pgFunctionSignatures = new Lazy(() => _pgFns)
export const bqFunctionSignatures = new Lazy(() => _bqFns)
export const sqliteFunctionSignatures = new Lazy(() => _sqliteFns)
export const starrocksFunctionSignatures = new Lazy(() => _starrocksFns)
export const sqlserverFunctionSignatures = new Lazy(() => _sqlserverFns)
export const oracleFunctionSignatures = new Lazy(() => _oracleFns)
export const damengFunctionSignatures = new Lazy(() => _damengFns)

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
export const starrocksKeywords = new Lazy(() => _starrocksKw)
export const starrocksDataTypes = new Lazy(() => _starrocksDt)
export const sqlserverKeywords = new Lazy(() => _sqlserverKw)
export const sqlserverDataTypes = new Lazy(() => _sqlserverDt)
export const oracleKeywords = new Lazy(() => _oracleKw)
export const oracleDataTypes = new Lazy(() => _oracleDt)
export const damengKeywords = new Lazy(() => _damengKw)
export const damengDataTypes = new Lazy(() => _damengDt)
