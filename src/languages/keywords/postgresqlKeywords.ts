import type { KeywordInfo } from '../../hover/HoverResolver'

export const postgresqlKeywords: KeywordInfo[] = [
    { keyword: 'RETURNING', syntax: 'INSERT/UPDATE/DELETE ... RETURNING expr1, expr2', description: '在 DML 语句后返回受影响行的指定列', category: 'dml', example: 'INSERT INTO employees (name) VALUES (\'Alice\') RETURNING id' },
    { keyword: 'ILIKE', syntax: 'expr ILIKE pattern', description: '不区分大小写的模式匹配', category: 'query', example: 'SELECT * FROM employees WHERE name ILIKE \'alice\'' },
    { keyword: 'SIMILAR TO', syntax: 'expr SIMILAR TO pattern', description: '使用正则表达式进行模式匹配', category: 'query' },
    { keyword: 'SERIAL', syntax: 'col_name SERIAL', description: '自增整数类型（4 字节）', category: 'type', example: 'CREATE TABLE t (id SERIAL PRIMARY KEY)' },
    { keyword: 'BIGSERIAL', syntax: 'col_name BIGSERIAL', description: '自增大整数类型（8 字节）', category: 'type' },
    { keyword: 'JSONB', syntax: 'JSONB', description: '二进制 JSON 类型，支持索引和高效查询', category: 'type', example: 'CREATE TABLE t (data JSONB)' },
    { keyword: 'ON CONFLICT', syntax: 'INSERT INTO ... ON CONFLICT (col) DO UPDATE SET ...', description: '冲突处理（UPSERT）', category: 'dml', example: 'INSERT INTO employees (id, name) VALUES (1, \'Alice\')\nON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name' },
    { keyword: 'DO UPDATE', syntax: 'ON CONFLICT ... DO UPDATE SET col = EXCLUDED.col', description: '冲突时执行更新操作', category: 'dml' },
]
