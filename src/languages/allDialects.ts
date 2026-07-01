import { hive as _hive } from "../dialects/hive/hive.formatter"
import { mysql as _mysql } from "../dialects/mysql/mysql.formatter"
import { spark as _spark } from "../dialects/spark/spark.formatter"
import { flinksql as _flinksql } from "../dialects/flinksql/flinksql.formatter"
import { sql as _sql } from "../dialects/sql/sql.formatter"
import { postgresql as _postgresql } from "../dialects/postgresql/postgresql.formatter"
import { bigquery as _bigquery } from "../dialects/bigquery/bigquery.formatter"
import { sqlite as _sqlite } from "../dialects/sqlite/sqlite.formatter"
import { starrocks as _starrocks } from "../dialects/starrocks/starrocks.formatter"
import { sqlserver as _sqlserver } from "../dialects/sqlserver/sqlserver.formatter"
import { oracle as _oracle } from "../dialects/oracle/oracle.formatter"
import { dameng as _dameng } from "../dialects/dameng/dameng.formatter"

import { functionSignatures as _hiveFns } from "../dialects/hive/hive.functions"
import { functionSignatures as _mysqlFns } from "../dialects/mysql/mysql.functions"
import { functionSignatures as _sparkFns } from "../dialects/spark/spark.functions"
import { functionSignatures as _flinksqlFns } from "../dialects/flinksql/flinksql.functions"
import { functionSignatures as _sqlFns } from "../dialects/sql/sql.functions"
import { functionSignatures as _pgFns } from "../dialects/postgresql/postgresql.functions"
import { functionSignatures as _bqFns } from "../dialects/bigquery/bigquery.functions"
import { functionSignatures as _sqliteFns } from "../dialects/sqlite/sqlite.functions"
import { functionSignatures as _starrocksFns } from "../dialects/starrocks/starrocks.functions"
import { functionSignatures as _sqlserverFns } from "../dialects/sqlserver/sqlserver.functions"
import { functionSignatures as _oracleFns } from "../dialects/oracle/oracle.functions"
import { functionSignatures as _damengFns } from "../dialects/dameng/dameng.functions"

import { keywords as _hiveKw, dataTypes as _hiveDt } from "../dialects/hive/hive.keywords"
import { keywords as _mysqlKw, dataTypes as _mysqlDt } from "../dialects/mysql/mysql.keywords"
import { keywords as _sparkKw, dataTypes as _sparkDt } from "../dialects/spark/spark.keywords"
import { keywords as _flinksqlKw, dataTypes as _flinksqlDt } from "../dialects/flinksql/flinksql.keywords"
import { keywords as _sqlKw, dataTypes as _sqlDt } from "../dialects/sql/sql.keywords"
import { keywords as _pgKw, dataTypes as _pgDt } from "../dialects/postgresql/postgresql.keywords"
import { keywords as _bqKw, dataTypes as _bqDt } from "../dialects/bigquery/bigquery.keywords"
import { keywords as _sqliteKw, dataTypes as _sqliteDt } from "../dialects/sqlite/sqlite.keywords"
import { keywords as _starrocksKw, dataTypes as _starrocksDt } from "../dialects/starrocks/starrocks.keywords"
import { keywords as _sqlserverKw, dataTypes as _sqlserverDt } from "../dialects/sqlserver/sqlserver.keywords"
import { keywords as _oracleKw, dataTypes as _oracleDt } from "../dialects/oracle/oracle.keywords"
import { keywords as _damengKw, dataTypes as _damengDt } from "../dialects/dameng/dameng.keywords"

// Re-export dialect formatter options directly. The imported values are
// already-evaluated plain object literals, so no lazy wrapping is needed.
export const hive = _hive
export const mysql = _mysql
export const spark = _spark
export const flinksql = _flinksql
export const sql = _sql
export const postgresql = _postgresql
export const bigquery = _bigquery
export const sqlite = _sqlite
export const starrocks = _starrocks
export const sqlserver = _sqlserver
export const oracle = _oracle
export const dameng = _dameng

export const hiveFunctionSignatures = _hiveFns
export const mysqlFunctionSignatures = _mysqlFns
export const sparkFunctionSignatures = _sparkFns
export const flinksqlFunctionSignatures = _flinksqlFns
export const sqlFunctionSignatures = _sqlFns
export const pgFunctionSignatures = _pgFns
export const bqFunctionSignatures = _bqFns
export const sqliteFunctionSignatures = _sqliteFns
export const starrocksFunctionSignatures = _starrocksFns
export const sqlserverFunctionSignatures = _sqlserverFns
export const oracleFunctionSignatures = _oracleFns
export const damengFunctionSignatures = _damengFns

export const hiveKeywords = _hiveKw
export const hiveDataTypes = _hiveDt
export const mysqlKeywords = _mysqlKw
export const mysqlDataTypes = _mysqlDt
export const sparkKeywords = _sparkKw
export const sparkDataTypes = _sparkDt
export const flinksqlKeywords = _flinksqlKw
export const flinksqlDataTypes = _flinksqlDt
export const sqlKeywords = _sqlKw
export const sqlDataTypes = _sqlDt
export const pgKeywords = _pgKw
export const pgDataTypes = _pgDt
export const bqKeywords = _bqKw
export const bqDataTypes = _bqDt
export const sqliteKeywords = _sqliteKw
export const sqliteDataTypes = _sqliteDt
export const starrocksKeywords = _starrocksKw
export const starrocksDataTypes = _starrocksDt
export const sqlserverKeywords = _sqlserverKw
export const sqlserverDataTypes = _sqlserverDt
export const oracleKeywords = _oracleKw
export const oracleDataTypes = _oracleDt
export const damengKeywords = _damengKw
export const damengDataTypes = _damengDt
