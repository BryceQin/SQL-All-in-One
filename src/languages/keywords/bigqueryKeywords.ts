import type { KeywordInfo } from '../../hover/HoverResolver'

export const bigqueryKeywords: KeywordInfo[] = [
    { keyword: 'QUALIFY', syntax: 'SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... QUALIFY window_filter', description: '在窗口函数结果上过滤行', category: 'hint', example: 'SELECT name, salary,\n  ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn\nFROM employees\nQUALIFY rn = 1' },
    { keyword: 'STRUCT', syntax: 'STRUCT<field1 type1, field2 type2>', description: '结构体类型构造', category: 'type', example: 'STRUCT<name STRING, age INT64>' },
    { keyword: 'ARRAY_AGG', syntax: 'ARRAY_AGG(expr [IGNORE NULLS] [ORDER BY ...] [LIMIT n])', description: '将值聚合为数组', category: 'hint', example: 'SELECT ARRAY_AGG(name) FROM employees GROUP BY dept' },
    { keyword: 'STRING_AGG', syntax: 'STRING_AGG(expr, delimiter [ORDER BY ...])', description: '将字符串值连接为单个字符串', category: 'hint', example: 'SELECT STRING_AGG(name, \', \') FROM employees GROUP BY dept' },
    { keyword: 'FOR SYSTEM TIME AS OF', syntax: 'FROM table FOR SYSTEM_TIME AS OF timestamp', description: '查询表的历史时间点数据', category: 'hint' },
]
