import type { KeywordInfo } from '../../hover/HoverResolver'

export const mysqlKeywords: KeywordInfo[] = [
    { keyword: 'REPLACE', syntax: 'REPLACE INTO table (col1, col2) VALUES (val1, val2)', description: '插入或替换行（如主键存在则删除旧行并插入新行）', category: 'dml', example: 'REPLACE INTO employees (id, name) VALUES (1, \'Alice\')' },
    { keyword: 'AUTO_INCREMENT', syntax: 'col_name INT AUTO_INCREMENT', description: '自动递增列属性', category: 'hint', example: 'CREATE TABLE t (id INT AUTO_INCREMENT PRIMARY KEY)' },
    { keyword: 'ENGINE', syntax: 'ENGINE = InnoDB | MyISAM | ...', description: '指定表的存储引擎', category: 'hint', example: 'CREATE TABLE t (id INT) ENGINE = InnoDB' },
    { keyword: 'CHARSET', syntax: 'CHARSET = utf8mb4 | ...', description: '指定表的字符集', category: 'hint', example: 'CREATE TABLE t (id INT) CHARSET = utf8mb4' },
    { keyword: 'COLLATE', syntax: 'COLLATE = collation_name', description: '指定表的排序规则', category: 'hint', example: 'CREATE TABLE t (name VARCHAR(100)) COLLATE = utf8mb4_general_ci' },
    { keyword: 'ENUM', syntax: 'ENUM(\'val1\', \'val2\', ...)', description: '枚举类型，值限定在指定列表中', category: 'type', example: 'ENUM(\'active\', \'inactive\')' },
    { keyword: 'TEXT', syntax: 'TEXT | MEDIUMTEXT | LONGTEXT', description: '长文本类型', category: 'type' },
    { keyword: 'MEDIUMTEXT', syntax: 'MEDIUMTEXT', description: '中等长度文本类型（最大 16MB）', category: 'type' },
    { keyword: 'LONGTEXT', syntax: 'LONGTEXT', description: '超长文本类型（最大 4GB）', category: 'type' },
]
