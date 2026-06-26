import type { KeywordInfo } from '../../hover/HoverResolver'

// StarRocks-specific keyword info for hover/completion.
// StarRocks is MySQL-protocol compatible, so these supplement the base
// MySQL keywords with StarRocks-specific DDL and OLAP concepts.
export const starrocksKeywords: KeywordInfo[] = [
    { keyword: 'BITMAP', syntax: 'col_name BITMAP', description: 'Bitmap 类型，用于精确去重（配合 BITMAP_UNION 等聚合）', category: 'type', example: 'CREATE TABLE t (id INT, user_id BITMAP) AGGREGATE KEY (id)' },
    { keyword: 'HLL', syntax: 'col_name HLL', description: 'HyperLogLog 类型，用于近似去重（配合 HLL_UNION 聚合）', category: 'type', example: 'CREATE TABLE t (id INT, uv HLL) AGGREGATE KEY (id)' },
    { keyword: 'ROLLUP', syntax: 'ALTER TABLE table ADD ROLLUP rollup_name (col1, col2)', description: '在 OLAP 表上新增 ROLLUP（物化子表）以加速聚合查询', category: 'ddl', example: 'ALTER TABLE sales ADD ROLLUP r1 (region, SUM(amount))' },
    { keyword: 'COLOCATE', syntax: 'CREATE TABLE t (...) COLOCATE WITH (group_name)', description: '将表加入 colocate group，使分桶键相同的分片物理同机', category: 'ddl' },
    { keyword: 'DYNAMIC_PARTITION', syntax: 'PROPERTIES ("dynamic_partition.enable" = "true", ...)', description: '动态分区属性，自动创建/删除时间分区', category: 'ddl' },
    { keyword: 'PARTITION', syntax: 'PARTITION BY RANGE (col) (PARTITION p0 VALUES [...])', description: '定义表分区策略（RANGE / LIST）', category: 'ddl', example: 'PARTITION BY RANGE(dt) (PARTITION p2024 VALUES LESS THAN ("2025-01-01"))' },
    { keyword: 'BUCKETS', syntax: 'DISTRIBUTED BY HASH(col) BUCKETS n', description: '指定分桶数，控制数据并行度', category: 'ddl', example: 'DISTRIBUTED BY HASH(user_id) BUCKETS 10' },
    { keyword: 'PROPERTIES', syntax: 'PROPERTIES ("key" = "value", ...)', description: '表/物化视图属性键值对', category: 'ddl' },
    { keyword: 'ENGINE', syntax: 'ENGINE = olap|mysql|elasticsearch|hive', description: '指定表引擎类型', category: 'ddl', example: 'CREATE TABLE t (...) ENGINE = olap' },
    { keyword: 'OLAP', syntax: 'ENGINE = olap', description: 'StarRocks 原生 OLAP 引擎（默认）', category: 'ddl' },
    { keyword: 'DUPLICATE', syntax: 'DUPLICATE KEY (col1, col2)', description: '重复键模型，无聚合，所有行保留', category: 'ddl', example: 'CREATE TABLE t (...) DUPLICATE KEY(id) DISTRIBUTED BY HASH(id) BUCKETS 1' },
    { keyword: 'AGGREGATE', syntax: 'AGGREGATE KEY (col1, col2)', description: '聚合模型，相同 key 的行按聚合函数合并', category: 'ddl', example: 'CREATE TABLE t (id INT, cnt SUM(INT)) AGGREGATE KEY(id)' },
    { keyword: 'UNIQUE', syntax: 'UNIQUE KEY (col1, col2)', description: '主键模型，相同 key 的行以最新值替换', category: 'ddl', example: 'CREATE TABLE t (id INT, name VARCHAR(50)) UNIQUE KEY(id)' },
    { keyword: 'BITMAP_UNION', syntax: 'BITMAP_UNION(bitmap_col)', description: '对 bitmap 列做并集聚合，配合 BITMAP_COUNT 实现精确 UV', category: 'auxiliary', example: 'SELECT BITMAP_COUNT(BITMAP_UNION(user_id)) FROM t' },
    { keyword: 'HLL_UNION', syntax: 'HLL_UNION(hll_col)', description: '对 HLL 列做并集聚合，配合 HLL_CARDINALITY 实现近似 UV', category: 'auxiliary', example: 'SELECT HLL_CARDINALITY(HLL_UNION(uv)) FROM t' },
    { keyword: 'COLLECT_LIST', syntax: 'COLLECT_LIST(col)', description: '聚合组内值为数组（保留顺序与重复）', category: 'auxiliary' },
    { keyword: 'COLLECT_SET', syntax: 'COLLECT_SET(col)', description: '聚合组内值为去重数组', category: 'auxiliary' },
    { keyword: 'EXPLODE', syntax: 'LATERAL VIEW EXPLODE(arr) tmp AS col', description: '将数组展开为多行（配合 LATERAL VIEW）', category: 'auxiliary' },
    { keyword: 'EXPLODE_SPLIT', syntax: 'LATERAL VIEW EXPLODE_SPLIT(str, sep) tmp AS col', description: '按分隔符切分字符串并展开为多行', category: 'auxiliary' },
    { keyword: 'CREATE MATERIALIZED VIEW', syntax: 'CREATE MATERIALIZED VIEW mv_name DISTRIBUTED BY HASH(col) BUCKETS n AS SELECT ...', description: '创建物化视图，自动刷新以加速查询', category: 'ddl', example: 'CREATE MATERIALIZED VIEW mv1 DISTRIBUTED BY HASH(id) BUCKETS 10 REFRESH ASYNC AS SELECT id, COUNT(*) FROM t GROUP BY id' },
    { keyword: 'REFRESH MATERIALIZED VIEW', syntax: 'REFRESH MATERIALIZED VIEW mv_name', description: '手动刷新物化视图', category: 'ddl' },
]
