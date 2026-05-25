import type { KeywordInfo } from '../../hover/HoverResolver'

export const sparkKeywords: KeywordInfo[] = [
    { keyword: 'LATERAL VIEW', syntax: 'SELECT ... FROM table LATERAL VIEW udtf(column) alias AS col_alias', description: '与表生成函数（UDTF）配合使用，将一行拆分为多行', category: 'hint', example: 'SELECT movie, category\nFROM movies\nLATERAL VIEW explode(categories) t AS category' },
    { keyword: 'EXPLODE', syntax: 'EXPLODE(array_or_map)', description: '将数组或 Map 展开为多行（UDTF）', category: 'hint' },
    { keyword: 'CLUSTER BY', syntax: 'CLUSTER BY expr1, expr2, ...', description: '对数据进行分桶并排序', category: 'hint' },
    { keyword: 'DISTRIBUTE BY', syntax: 'DISTRIBUTE BY expr1, expr2, ...', description: '按表达式将数据分配到不同的分区', category: 'hint' },
    { keyword: 'SORT BY', syntax: 'SORT BY expr [ASC|DESC], ...', description: '在每个分区内排序', category: 'hint' },
    { keyword: 'PARTITIONED BY', syntax: 'CREATE TABLE ... PARTITIONED BY (col type, ...)', description: '定义表的分区列', category: 'hint' },
    { keyword: 'USING', syntax: 'CREATE TABLE ... USING format', description: '指定数据源格式（如 parquet、json、orc）', category: 'hint', example: 'CREATE TABLE t (id INT) USING parquet' },
    { keyword: 'OPTIONS', syntax: 'OPTIONS (key = value, ...)', description: '指定数据源的选项参数', category: 'hint' },
]
