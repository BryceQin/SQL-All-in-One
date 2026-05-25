import type { KeywordInfo } from '../../hover/HoverResolver'

export const flinksqlKeywords: KeywordInfo[] = [
    { keyword: 'WATERMARK', syntax: 'WATERMARK FOR rowtime_column AS strategy', description: '定义表的水位线策略，用于事件时间处理', category: 'hint', example: 'CREATE TABLE t (\n  ts TIMESTAMP(3),\n  WATERMARK FOR ts AS ts - INTERVAL \'5\' SECOND\n)' },
    { keyword: 'WITH', syntax: 'CREATE TABLE ... WITH (key=value, ...)', description: '定义表的连接器属性', category: 'hint', example: 'CREATE TABLE t (\n  id INT\n) WITH (\n  \'connector\' = \'kafka\'\n)' },
    { keyword: 'TUMBLE', syntax: 'TUMBLE(TABLE data, DESCRIPTOR(timecol), size)', description: '滚动窗口表值函数', category: 'hint', example: 'SELECT window_start, window_end, COUNT(*)\nFROM TABLE(TUMBLE(TABLE t, DESCRIPTOR(ts), INTERVAL \'1\' HOUR))\nGROUP BY window_start, window_end' },
    { keyword: 'HOP', syntax: 'HOP(TABLE data, DESCRIPTOR(timecol), slide, size)', description: '滑动窗口表值函数', category: 'hint' },
    { keyword: 'CUMULATE', syntax: 'CUMULATE(TABLE data, DESCRIPTOR(timecol), step, size)', description: '累积窗口表值函数', category: 'hint' },
    { keyword: 'SESSION', syntax: 'SESSION(TABLE data, DESCRIPTOR(timecol), gap)', description: '会话窗口表值函数', category: 'hint' },
    { keyword: 'DESCRIPTOR', syntax: 'DESCRIPTOR(column)', description: '在窗口函数中引用时间属性列', category: 'hint' },
    { keyword: 'ENFORCED', syntax: 'PRIMARY KEY (col) NOT ENFORCED', description: '声明主键约束不强制执行', category: 'hint' },
    { keyword: 'METADATA', syntax: 'METADATA FROM \'key\'', description: '从连接器元数据中读取列', category: 'hint' },
    { keyword: 'CATALOG', syntax: 'CREATE CATALOG name WITH (props)', description: '注册外部 Catalog', category: 'hint' },
    { keyword: 'COMPUTE', syntax: 'COMPUTE PIPELINE', description: '计算管道相关操作', category: 'hint' },
    { keyword: 'PARTITIONED BY', syntax: 'CREATE TABLE ... PARTITIONED BY (col type, ...)', description: '定义表的分区列', category: 'hint' },
]
