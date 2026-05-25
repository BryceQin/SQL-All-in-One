import type { KeywordInfo } from '../../hover/HoverResolver'

export const sqliteKeywords: KeywordInfo[] = [
    { keyword: 'REPLACE', syntax: 'REPLACE INTO table (col1, col2) VALUES (val1, val2)', description: '插入或替换行（UPSERT 语义）', category: 'dml', example: 'REPLACE INTO employees (id, name) VALUES (1, \'Alice\')' },
    { keyword: 'AUTOINCREMENT', syntax: 'col_name INTEGER PRIMARY KEY AUTOINCREMENT', description: '自动递增列属性', category: 'hint', example: 'CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT)' },
    { keyword: 'IF NOT EXISTS', syntax: 'CREATE TABLE IF NOT EXISTS table_name (...)', description: '仅在表不存在时创建', category: 'ddl', example: 'CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY)' },
    { keyword: 'ATTACH', syntax: 'ATTACH DATABASE \'path\' AS alias', description: '附加外部数据库文件', category: 'auxiliary', example: 'ATTACH DATABASE \'./other.db\' AS other' },
    { keyword: 'DETACH', syntax: 'DETACH DATABASE alias', description: '分离已附加的数据库', category: 'auxiliary' },
    { keyword: 'ROWID', syntax: 'ROWID', description: '表行的内置整数标识符', category: 'hint', example: 'SELECT ROWID, * FROM employees' },
]
