import type { FunctionSignature } from '../../completion'
import { functions as mysqlFunctions, functionSignatures as mysqlFunctionSignatures } from '../mysql/mysql.functions'

// StarRocks functions: derived from MySQL functions (StarRocks is
// MySQL-protocol compatible) and extended with StarRocks-specific functions.

export const functions: string[] = [
    ...mysqlFunctions,
    // StarRocks-specific functions
    'BITMAP_UNION',
    'BITMAP_COUNT',
    'BITMAP_TO_STRING',
    'HLL_UNION',
    'HLL_CARDINALITY',
    'COLLECT_LIST',
    'COLLECT_SET',
    'PERCENTILE_APPROX',
    'EXPLODE',
    'EXPLODE_SPLIT',
    'ARRAY_AGG',
]

export const functionSignatures: FunctionSignature[] = [
    ...mysqlFunctionSignatures,
    // StarRocks-specific function signatures
    { name: 'BITMAP_UNION', params: ['bitmap col'], returnType: 'bitmap', description: '对 bitmap 列进行并集聚合', category: 'aggregate' },
    { name: 'BITMAP_COUNT', params: ['bitmap col'], returnType: 'bigint', description: '返回 bitmap 中不同值的个数', category: 'aggregate' },
    { name: 'BITMAP_TO_STRING', params: ['bitmap col'], returnType: 'string', description: '将 bitmap 转换为逗号分隔的字符串', category: 'string' },
    { name: 'HLL_UNION', params: ['hll col'], returnType: 'hll', description: '对 HLL 列进行并集聚合', category: 'aggregate' },
    { name: 'HLL_CARDINALITY', params: ['hll col'], returnType: 'bigint', description: '返回 HLL 中不同值的近似基数', category: 'aggregate' },
    { name: 'COLLECT_LIST', params: ['T col'], returnType: 'array', description: '聚合组内值为数组（保留顺序与重复）', category: 'aggregate' },
    { name: 'COLLECT_SET', params: ['T col'], returnType: 'array', description: '聚合组内值为去重数组', category: 'aggregate' },
    { name: 'PERCENTILE_APPROX', params: ['numeric col', 'double p'], returnType: 'double', description: '返回近似百分位数', category: 'aggregate' },
    { name: 'EXPLODE', params: ['array|map col'], returnType: 'table', description: '将数组或 Map 展开为多行（配合 LATERAL VIEW 使用）', category: 'table' },
    { name: 'EXPLODE_SPLIT', params: ['string s', 'string sep'], returnType: 'table', description: '按分隔符切分字符串并展开为多行', category: 'table' },
    { name: 'ARRAY_AGG', params: ['T col'], returnType: 'array', description: '将组内值聚合为数组', category: 'aggregate' },
]
