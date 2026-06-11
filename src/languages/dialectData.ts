import * as allDialects from './allDialects';
import type { FunctionSignature } from '../completion/functionSignatures';

export const keywordMap: Record<string, { keywords: string[]; dataTypes: string[] }> = {
    hive: { keywords: allDialects.hiveKeywords, dataTypes: allDialects.hiveDataTypes },
    mysql: { keywords: allDialects.mysqlKeywords, dataTypes: allDialects.mysqlDataTypes },
    spark: { keywords: allDialects.sparkKeywords, dataTypes: allDialects.sparkDataTypes },
    flinksql: { keywords: allDialects.flinksqlKeywords, dataTypes: allDialects.flinksqlDataTypes },
    sql:   { keywords: allDialects.sqlKeywords,   dataTypes: allDialects.sqlDataTypes },
    postgresql: { keywords: allDialects.pgKeywords, dataTypes: allDialects.pgDataTypes },
    bigquery: { keywords: allDialects.bqKeywords, dataTypes: allDialects.bqDataTypes },
    sqlite: { keywords: allDialects.sqliteKeywords, dataTypes: allDialects.sqliteDataTypes },
};

export const functionSigMap: Record<string, FunctionSignature[]> = {
    hive:  allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    flinksql: allDialects.flinksqlFunctionSignatures,
    sql:   allDialects.sqlFunctionSignatures,
    postgresql: allDialects.pgFunctionSignatures,
    bigquery: allDialects.bqFunctionSignatures,
    sqlite: allDialects.sqliteFunctionSignatures,
};
