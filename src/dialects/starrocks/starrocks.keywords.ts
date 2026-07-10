// StarRocks keywords: derived from MySQL keywords (StarRocks is MySQL-protocol
// compatible) and extended with StarRocks-specific identifiers.

import { keywords as mysqlKeywords, dataTypes as mysqlDataTypes } from "../mysql/mysql.keywords";

export const keywords: string[] = [
    ...mysqlKeywords,
    // StarRocks-specific keywords
    "BITMAP",
    "HLL",
    "ROLLUP",
    "COLOCATE",
    "DYNAMIC_PARTITION",
    "PARTITION",
    "BUCKETS",
    "PROPERTIES",
    "ENGINE",
    "OLAP",
    "DUPLICATE",
    "AGGREGATE",
    "UNIQUE",
];

export const dataTypes: string[] = [
    ...mysqlDataTypes,
    // StarRocks-specific data types
    "BITMAP",
    "HLL",
    "PERCENTILE",
    "JSON",
];
