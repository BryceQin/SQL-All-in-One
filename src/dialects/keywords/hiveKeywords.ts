import type { KeywordInfo } from '../../hover/HoverResolver'

export const hiveKeywords: KeywordInfo[] = [
    { keyword: 'LATERAL VIEW', syntax: 'SELECT ... FROM table LATERAL VIEW udtf(column) alias AS col_alias', description: '与表生成函数（UDTF）配合使用，将一行拆分为多行', category: 'hint', example: 'SELECT movie, category\nFROM movies\nLATERAL VIEW explode(categories) t AS category' },
    { keyword: 'EXPLODE', syntax: 'EXPLODE(array_or_map)', description: '将数组或 Map 展开为多行（UDTF）', category: 'hint', example: 'SELECT id, val FROM src LATERAL VIEW EXPLODE(array_col) t AS val' },
    { keyword: 'CLUSTER BY', syntax: 'CLUSTER BY expr1, expr2, ...', description: '对数据进行分桶并排序（等价于 DISTRIBUTE BY + SORT BY）', category: 'hint', example: 'SELECT * FROM employees CLUSTER BY dept' },
    { keyword: 'DISTRIBUTE BY', syntax: 'DISTRIBUTE BY expr1, expr2, ...', description: '按表达式将数据分配到不同的 Reducer', category: 'hint' },
    { keyword: 'SORT BY', syntax: 'SORT BY expr [ASC|DESC], ...', description: '在每个 Reducer 内部排序（不同于全局 ORDER BY）', category: 'hint' },
    { keyword: 'PARTITIONED BY', syntax: 'CREATE TABLE ... PARTITIONED BY (col type, ...)', description: '定义表的分区列', category: 'hint', example: 'CREATE TABLE logs (msg STRING) PARTITIONED BY (dt STRING)' },
    { keyword: 'STORED AS', syntax: 'STORED AS format', description: '指定表的存储格式（如 ORC、PARQUET、TEXTFILE）', category: 'hint', example: 'CREATE TABLE t (id INT) STORED AS ORC' },
    { keyword: 'ROW FORMAT', syntax: 'ROW FORMAT DELIMITED FIELDS TERMINATED BY \',\'', description: '指定行的序列化/反序列化格式', category: 'hint' },
    { keyword: 'SERDE', syntax: 'ROW FORMAT SERDE \'serde_class\'', description: '指定序列化/反序列化器类', category: 'hint' },
    { keyword: 'TABLESAMPLE', syntax: 'FROM table TABLESAMPLE (n PERCENT | n ROWS)', description: '对表进行采样查询', category: 'hint' },
]
