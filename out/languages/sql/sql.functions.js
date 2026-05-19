"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.functionSignatures = exports.functions = void 0;
exports.functions = [
    // https://jakewheat.github.io/sql-overview/sql-2008-foundation-grammar.html#_6_9_set_function_specification
    'GROUPING',
    // https://jakewheat.github.io/sql-overview/sql-2008-foundation-grammar.html#_6_10_window_function
    'RANK',
    'DENSE_RANK',
    'PERCENT_RANK',
    'CUME_DIST',
    'ROW_NUMBER',
    // https://jakewheat.github.io/sql-overview/sql-2008-foundation-grammar.html#_6_27_numeric_value_function
    'POSITION',
    'OCCURRENCES_REGEX',
    'POSITION_REGEX',
    'EXTRACT',
    'CHAR_LENGTH',
    'CHARACTER_LENGTH',
    'OCTET_LENGTH',
    'CARDINALITY',
    'ABS',
    'MOD',
    'LN',
    'EXP',
    'POWER',
    'SQRT',
    'FLOOR',
    'CEIL',
    'CEILING',
    'WIDTH_BUCKET',
    // https://jakewheat.github.io/sql-overview/sql-2008-foundation-grammar.html#_6_29_string_value_function
    'SUBSTRING',
    'SUBSTRING_REGEX',
    'UPPER',
    'LOWER',
    'CONVERT',
    'TRANSLATE',
    'TRANSLATE_REGEX',
    'TRIM',
    'OVERLAY',
    'NORMALIZE',
    'SPECIFICTYPE',
    // https://jakewheat.github.io/sql-overview/sql-2008-foundation-grammar.html#_6_31_datetime_value_function
    'CURRENT_DATE',
    'CURRENT_TIME',
    'LOCALTIME',
    'CURRENT_TIMESTAMP',
    'LOCALTIMESTAMP',
    // https://jakewheat.github.io/sql-overview/sql-2008-foundation-grammar.html#_6_38_multiset_value_function
    // SET serves multiple roles: a SET() function and a SET keyword e.g. in UPDATE table SET ...
    // multiset
    // 'SET', (disabled for now)
    // https://jakewheat.github.io/sql-overview/sql-2008-foundation-grammar.html#_10_9_aggregate_function
    'COUNT',
    'AVG',
    'MAX',
    'MIN',
    'SUM',
    // 'EVERY',
    // 'ANY',
    // 'SOME',
    'STDDEV_POP',
    'STDDEV_SAMP',
    'VAR_SAMP',
    'VAR_POP',
    'COLLECT',
    'FUSION',
    'INTERSECTION',
    'COVAR_POP',
    'COVAR_SAMP',
    'CORR',
    'REGR_SLOPE',
    'REGR_INTERCEPT',
    'REGR_COUNT',
    'REGR_R2',
    'REGR_AVGX',
    'REGR_AVGY',
    'REGR_SXX',
    'REGR_SYY',
    'REGR_SXY',
    'PERCENTILE_CONT',
    'PERCENTILE_DISC',
    // CAST is a pretty complex case, involving multiple forms:
    // - CAST(col AS int)
    // - CAST(...) WITH ...
    // - CAST FROM int
    // - CREATE CAST(mycol AS int) WITH ...
    'CAST',
    // Shorthand functions to use in place of CASE expression
    'COALESCE',
    'NULLIF',
    // Non-standard functions that have widespread support
    'ROUND',
    'SIN',
    'COS',
    'TAN',
    'ASIN',
    'ACOS',
    'ATAN'
];
exports.functionSignatures = [
    // --- MATH (10) ---
    { name: 'ABS', params: ['numeric a'], returnType: 'numeric', description: '返回绝对值', category: 'math' },
    { name: 'CEIL', params: ['double a'], returnType: 'bigint', description: '向上取整', category: 'math' },
    { name: 'CEILING', params: ['double a'], returnType: 'bigint', description: 'CEIL 的别名', category: 'math' },
    { name: 'EXP', params: ['double a'], returnType: 'double', description: '返回 e 的 a 次幂', category: 'math' },
    { name: 'FLOOR', params: ['double a'], returnType: 'bigint', description: '向下取整', category: 'math' },
    { name: 'LN', params: ['double a'], returnType: 'double', description: '返回自然对数', category: 'math' },
    { name: 'MOD', params: ['numeric a', 'numeric b'], returnType: 'numeric', description: '返回 a mod b', category: 'math' },
    { name: 'POWER', params: ['double a', 'double b'], returnType: 'double', description: '返回 a 的 b 次幂', category: 'math' },
    { name: 'SQRT', params: ['double a'], returnType: 'double', description: '返回平方根', category: 'math' },
    { name: 'WIDTH_BUCKET', params: ['double expr', 'double min', 'double max', 'int buckets'], returnType: 'int', description: '返回等宽直方图桶编号', category: 'math' },
    // --- STRING (9) ---
    { name: 'SUBSTRING', params: ['string s', 'int start', 'int len'], returnType: 'string', description: '返回子串', category: 'string' },
    { name: 'UPPER', params: ['string s'], returnType: 'string', description: '转大写', category: 'string' },
    { name: 'LOWER', params: ['string s'], returnType: 'string', description: '转小写', category: 'string' },
    { name: 'TRIM', params: ['string s'], returnType: 'string', description: '去除空白', category: 'string' },
    { name: 'TRANSLATE', params: ['string s', 'string from', 'string to'], returnType: 'string', description: '字符替换', category: 'string' },
    { name: 'CONVERT', params: ['string s', 'charset cs'], returnType: 'string', description: '字符集转换', category: 'string' },
    { name: 'CHAR_LENGTH', params: ['string s'], returnType: 'int', description: '返回字符长度', category: 'string' },
    { name: 'OCTET_LENGTH', params: ['string s'], returnType: 'int', description: '返回字节长度', category: 'string' },
    { name: 'POSITION', params: ['string substr', 'string s'], returnType: 'int', description: '返回子串位置', category: 'string' },
    // --- DATE (4) ---
    { name: 'EXTRACT', params: ['string unit', 'timestamp t'], returnType: 'int', description: '提取时间单位', category: 'date' },
    { name: 'CURRENT_DATE', params: [], returnType: 'date', description: '返回当前日期', category: 'date' },
    { name: 'CURRENT_TIME', params: [], returnType: 'time', description: '返回当前时间', category: 'date' },
    { name: 'CURRENT_TIMESTAMP', params: [], returnType: 'timestamp', description: '返回当前时间戳', category: 'date' },
    // --- AGGREGATE (11) ---
    { name: 'COUNT', params: ['*|expr'], returnType: 'bigint', description: '返回行数', category: 'aggregate' },
    { name: 'AVG', params: ['numeric col'], returnType: 'numeric', description: '返回平均值', category: 'aggregate' },
    { name: 'MAX', params: ['T col'], returnType: 'T', description: '返回最大值', category: 'aggregate' },
    { name: 'MIN', params: ['T col'], returnType: 'T', description: '返回最小值', category: 'aggregate' },
    { name: 'SUM', params: ['numeric col'], returnType: 'numeric', description: '返回总和', category: 'aggregate' },
    { name: 'STDDEV_POP', params: ['numeric col'], returnType: 'double', description: '返回总体标准差', category: 'aggregate' },
    { name: 'STDDEV_SAMP', params: ['numeric col'], returnType: 'double', description: '返回样本标准差', category: 'aggregate' },
    { name: 'VAR_POP', params: ['numeric col'], returnType: 'double', description: '返回总体方差', category: 'aggregate' },
    { name: 'VAR_SAMP', params: ['numeric col'], returnType: 'double', description: '返回样本方差', category: 'aggregate' },
    { name: 'COVAR_POP', params: ['numeric a', 'numeric b'], returnType: 'double', description: '返回总体协方差', category: 'aggregate' },
    { name: 'COVAR_SAMP', params: ['numeric a', 'numeric b'], returnType: 'double', description: '返回样本协方差', category: 'aggregate' },
    // --- WINDOW (5) ---
    { name: 'RANK', params: [], returnType: 'bigint', description: '排序名次（有间隔）', category: 'window' },
    { name: 'DENSE_RANK', params: [], returnType: 'bigint', description: '排序名次（无间隔）', category: 'window' },
    { name: 'PERCENT_RANK', params: [], returnType: 'double', description: '相对排名百分比', category: 'window' },
    { name: 'CUME_DIST', params: [], returnType: 'double', description: '累积分布值', category: 'window' },
    { name: 'ROW_NUMBER', params: [], returnType: 'bigint', description: '行号', category: 'window' },
    // --- CONDITIONAL (2) ---
    { name: 'COALESCE', params: ['T v1', 'T v2', '...'], returnType: 'T', description: '返回第一个非 NULL 值', category: 'conditional' },
    { name: 'NULLIF', params: ['T a', 'T b'], returnType: 'T', description: '若 a=b 返回 NULL，否则返回 a', category: 'conditional' },
    // --- TYPE CONVERSION (1) ---
    { name: 'CAST', params: ['T expr', 'TYPE type'], returnType: 'TYPE', description: '类型转换', category: 'type-conversion' },
];
//# sourceMappingURL=sql.functions.js.map