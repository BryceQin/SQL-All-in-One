# 悬停提示功能（Hover Provider）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SQL All in One 扩展新增 VS Code HoverProvider，提供函数悬停、关键字悬停和参数引用悬停三类提示。

**Architecture:** 采用 Resolver 链模式，SqlHoverProvider 按优先级依次询问 ParameterHoverResolver → FunctionHoverResolver → KeywordHoverResolver，首个匹配即返回。关键字数据按 base + dialect 分层组织，首次访问时合并缓存。参数扫描结果以文档 URI+版本号缓存。

**Tech Stack:** TypeScript, VS Code Extension API (HoverProvider, MarkdownString), 现有 i18n 体系

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| 新建 | `src/hover/HoverResolver.ts` | HoverResolver 接口定义 + KeywordInfo/KeywordCategory 类型 |
| 新建 | `src/hover/hoverUtils.ts` | extractWordAtPosition、buildFunctionMarkdown、buildKeywordMarkdown、buildParameterMarkdown |
| 新建 | `src/hover/FunctionHoverResolver.ts` | 函数悬停解析器，复用 FunctionSignature 数据 |
| 新建 | `src/hover/KeywordHoverResolver.ts` | 关键字悬停解析器，使用 keywords 数据 |
| 新建 | `src/hover/ParameterHoverResolver.ts` | 参数引用悬停解析器，扫描 ${param} 引用 |
| 新建 | `src/languages/keywords/baseKeywords.ts` | SQL 标准关键字数据（~60 个） |
| 新建 | `src/languages/keywords/hiveKeywords.ts` | Hive 特有关键字 |
| 新建 | `src/languages/keywords/sparkKeywords.ts` | Spark 特有关键字 |
| 新建 | `src/languages/keywords/mysqlKeywords.ts` | MySQL 特有关键字 |
| 新建 | `src/languages/keywords/postgresqlKeywords.ts` | PostgreSQL 特有关键字 |
| 新建 | `src/languages/keywords/oracleKeywords.ts` | Oracle 特有关键字 |
| 新建 | `src/languages/keywords/bigqueryKeywords.ts` | BigQuery 特有关键字 |
| 新建 | `src/languages/keywords/snowflakeKeywords.ts` | Snowflake 特有关键字 |
| 新建 | `src/languages/keywords/prestoKeywords.ts` | Presto/Trino 特有关键字 |
| 新建 | `src/languages/keywords/sqliteKeywords.ts` | SQLite 特有关键字 |
| 新建 | `src/languages/keywords/index.ts` | 汇总导出 + getKeywordsForDialect() |
| 新建 | `src/providers/SqlHoverProvider.ts` | 主 HoverProvider，负责注册与调度 |
| 修改 | `src/extension.ts` | 注册 HoverProvider |
| 修改 | `package.json` | 新增 enableHover 配置项 |
| 修改 | `src/i18n/messages.zh.json` | 新增悬停相关中文消息 |
| 修改 | `src/i18n/messages.en.json` | 新增悬停相关英文消息 |

---

### Task 1: 创建类型定义和接口

**Files:**
- Create: `src/hover/HoverResolver.ts`

- [ ] **Step 1: 创建 HoverResolver 接口和关键字类型定义**

```typescript
import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'

export interface HoverResolver {
    resolve(
        word: string,
        dialect: SqlLanguage,
        document: vscode.TextDocument
    ): vscode.Hover | null
}

export type KeywordCategory =
    | 'query'
    | 'join'
    | 'setop'
    | 'dml'
    | 'ddl'
    | 'window'
    | 'transaction'
    | 'auxiliary'
    | 'conditional'
    | 'type'
    | 'hint'

export interface KeywordInfo {
    keyword: string
    syntax: string
    description: string
    example?: string
    category: KeywordCategory
}
```

---

### Task 2: 创建工具函数

**Files:**
- Create: `src/hover/hoverUtils.ts`

- [ ] **Step 1: 创建 hoverUtils.ts 工具函数**

```typescript
import * as vscode from 'vscode'
import { t } from '../i18n'
import type { FunctionSignature } from '../completion/functionSignatures'
import { getCategoryLabel } from '../completion/functionSignatures'
import type { KeywordInfo, KeywordCategory } from './HoverResolver'

const categoryLabelMap: Record<KeywordCategory, string> = {
    query: 'hover.keywordCategory.query',
    join: 'hover.keywordCategory.join',
    setop: 'hover.keywordCategory.setop',
    dml: 'hover.keywordCategory.dml',
    ddl: 'hover.keywordCategory.ddl',
    window: 'hover.keywordCategory.window',
    transaction: 'hover.keywordCategory.transaction',
    auxiliary: 'hover.keywordCategory.auxiliary',
    conditional: 'hover.keywordCategory.conditional',
    type: 'hover.keywordCategory.type',
    hint: 'hover.keywordCategory.hint',
}

export function getKeywordCategoryLabel(category: KeywordCategory): string {
    return t(categoryLabelMap[category])
}

export function extractWordAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): string | null {
    const range = document.getWordRangeAtPosition(position)
    if (!range) return null
    return document.getText(range).toUpperCase()
}

export function extractParameterAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): { paramName: string; range: vscode.Range } | null {
    const line = document.lineAt(position.line).text
    const paramRegex = /\$\{(\w+)\}/g
    let match: RegExpExecArray | null
    while ((match = paramRegex.exec(line)) !== null) {
        const start = match.index
        const end = start + match[0].length
        if (position.character >= start && position.character <= end) {
            const range = new vscode.Range(
                position.line, start,
                position.line, end
            )
            return { paramName: match[1], range }
        }
    }
    return null
}

export function buildFunctionMarkdown(fn: FunctionSignature): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    md.isTrusted = true
    const params = fn.params.join(', ')
    md.appendMarkdown(`### ${fn.name}(${params})\n\n`)
    md.appendMarkdown(`---\n\n`)
    md.appendMarkdown(`${getCategoryLabel(fn.category)} — ${fn.description}\n\n`)
    if (fn.returnType) {
        md.appendMarkdown(`**${t('hover.returnType')}** \`${fn.returnType}\`\n\n`)
    }
    md.appendMarkdown(`**${t('hover.syntax')}**\n`)
    md.appendCodeblock(`${fn.name}(${params})`, 'sql')
    if (fn.examples && fn.examples.length > 0) {
        md.appendMarkdown(`\n**${t('hover.example')}**\n`)
        md.appendCodeblock(fn.examples[0], 'sql')
    }
    return md
}

export function buildKeywordMarkdown(info: KeywordInfo): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    md.isTrusted = true
    md.appendMarkdown(`### ${info.keyword}\n\n`)
    md.appendMarkdown(`---\n\n`)
    md.appendMarkdown(`${getKeywordCategoryLabel(info.category)} — ${t('hover.keyword')}\n\n`)
    md.appendMarkdown(`${info.description}\n\n`)
    md.appendMarkdown(`**${t('hover.syntax')}**\n`)
    md.appendCodeblock(info.syntax, 'sql')
    if (info.example) {
        md.appendMarkdown(`\n**${t('hover.example')}**\n`)
        md.appendCodeblock(info.example, 'sql')
    }
    return md
}

export function buildParameterMarkdown(
    paramName: string,
    locations: { line: number; context: string }[]
): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    md.isTrusted = true
    md.appendMarkdown(`### ${t('hover.parameterRef')}\n\n`)
    md.appendMarkdown(`---\n\n`)
    md.appendMarkdown(`**${t('hover.parameterName')}** \`${paramName}\`\n\n`)
    const maxDisplay = 20
    const total = locations.length
    const displayLocations = locations.slice(0, maxDisplay)
    md.appendMarkdown(`${t('hover.parameterUsage', String(total))}\n\n`)
    for (const loc of displayLocations) {
        md.appendMarkdown(`* ${t('hover.parameterLine', String(loc.line))} \`${loc.context}\`\n`)
    }
    if (total > maxDisplay) {
        md.appendMarkdown(`\n... ${t('hover.parameterMore', String(total - maxDisplay))}\n`)
    }
    md.appendMarkdown(`\n---\n\n*${t('hover.parameterTip')}*`)
    return md
}
```

---

### Task 3: 创建基础关键字数据

**Files:**
- Create: `src/languages/keywords/baseKeywords.ts`

- [ ] **Step 1: 创建 baseKeywords.ts — SQL 标准关键字数据**

```typescript
import type { KeywordInfo } from '../../hover/HoverResolver'

export const baseKeywords: KeywordInfo[] = [
    // query
    { keyword: 'SELECT', syntax: 'SELECT [DISTINCT] expr1, expr2, ... FROM table', description: '从表或视图中查询数据', category: 'query', example: 'SELECT name, age FROM employees WHERE dept = \'IT\'' },
    { keyword: 'FROM', syntax: 'FROM table_name [alias]', description: '指定查询的数据源表或视图', category: 'query' },
    { keyword: 'WHERE', syntax: 'WHERE condition', description: '指定查询的过滤条件', category: 'query', example: 'SELECT * FROM employees WHERE salary > 5000' },
    { keyword: 'GROUP BY', syntax: 'GROUP BY expr1, expr2, ...', description: '按一个或多个列对结果集进行分组', category: 'query', example: 'SELECT dept, COUNT(*) FROM employees GROUP BY dept' },
    { keyword: 'HAVING', syntax: 'HAVING condition', description: '对分组后的结果进行过滤（类似于 WHERE，但用于聚合后）', category: 'query', example: 'SELECT dept, COUNT(*) AS cnt FROM employees GROUP BY dept HAVING cnt > 5' },
    { keyword: 'ORDER BY', syntax: 'ORDER BY expr [ASC|DESC], ...', description: '对结果集按一个或多个列排序', category: 'query', example: 'SELECT name, salary FROM employees ORDER BY salary DESC' },
    { keyword: 'LIMIT', syntax: 'LIMIT n', description: '限制查询返回的行数', category: 'query', example: 'SELECT * FROM employees ORDER BY salary DESC LIMIT 10' },
    { keyword: 'OFFSET', syntax: 'OFFSET n', description: '跳过前 n 行结果，常与 LIMIT 配合实现分页', category: 'query' },
    { keyword: 'DISTINCT', syntax: 'SELECT DISTINCT expr1, expr2, ...', description: '去除查询结果中的重复行', category: 'query', example: 'SELECT DISTINCT dept FROM employees' },
    { keyword: 'AS', syntax: 'expr AS alias', description: '为列或表指定别名', category: 'query', example: 'SELECT COUNT(*) AS total FROM employees' },
    { keyword: 'ALL', syntax: 'SELECT ALL expr ...', description: '保留所有行（默认行为，与 DISTINCT 相对）', category: 'query' },
    { keyword: 'ANY', syntax: 'expr operator ANY (subquery)', description: '如果子查询中有任意一行满足条件则返回 true', category: 'query' },
    { keyword: 'SOME', syntax: 'expr operator SOME (subquery)', description: 'ANY 的同义词', category: 'query' },
    { keyword: 'EXISTS', syntax: 'EXISTS (subquery)', description: '判断子查询是否返回任何行', category: 'query', example: 'SELECT * FROM orders WHERE EXISTS (SELECT 1 FROM customers WHERE customers.id = orders.customer_id)' },
    { keyword: 'BETWEEN', syntax: 'expr BETWEEN low AND high', description: '判断值是否在指定范围内', category: 'query', example: 'SELECT * FROM employees WHERE salary BETWEEN 3000 AND 8000' },
    { keyword: 'LIKE', syntax: 'expr LIKE pattern', description: '使用通配符进行模式匹配（% 任意字符，_ 单个字符）', category: 'query', example: 'SELECT * FROM employees WHERE name LIKE \'张%\'' },
    { keyword: 'IN', syntax: 'expr IN (value1, value2, ...)', description: '判断值是否在指定列表或子查询结果中', category: 'query', example: 'SELECT * FROM employees WHERE dept IN (\'IT\', \'HR\')' },
    { keyword: 'IS NULL', syntax: 'expr IS NULL', description: '判断值是否为 NULL', category: 'query', example: 'SELECT * FROM employees WHERE manager_id IS NULL' },
    { keyword: 'IS NOT NULL', syntax: 'expr IS NOT NULL', description: '判断值是否不为 NULL', category: 'query' },
    { keyword: 'AND', syntax: 'condition1 AND condition2', description: '逻辑与，两个条件同时满足', category: 'query' },
    { keyword: 'OR', syntax: 'condition1 OR condition2', description: '逻辑或，任一条件满足即可', category: 'query' },
    { keyword: 'NOT', syntax: 'NOT condition', description: '逻辑非，取反条件', category: 'query' },

    // join
    { keyword: 'JOIN', syntax: 'SELECT ... FROM table1 [INNER|LEFT|RIGHT|FULL|CROSS] JOIN table2 ON condition', description: '用于根据两个或多个表之间的相关列来组合行', category: 'join', example: 'SELECT a.name, b.order_id\nFROM customers a\nINNER JOIN orders b ON a.id = b.customer_id' },
    { keyword: 'INNER JOIN', syntax: 'table1 INNER JOIN table2 ON condition', description: '内连接，仅返回两表中匹配的行', category: 'join', example: 'SELECT a.name, b.order_id FROM customers a INNER JOIN orders b ON a.id = b.customer_id' },
    { keyword: 'LEFT JOIN', syntax: 'table1 LEFT [OUTER] JOIN table2 ON condition', description: '左外连接，返回左表所有行，右表无匹配则为 NULL', category: 'join', example: 'SELECT a.name, b.order_id FROM customers a LEFT JOIN orders b ON a.id = b.customer_id' },
    { keyword: 'RIGHT JOIN', syntax: 'table1 RIGHT [OUTER] JOIN table2 ON condition', description: '右外连接，返回右表所有行，左表无匹配则为 NULL', category: 'join' },
    { keyword: 'FULL JOIN', syntax: 'table1 FULL [OUTER] JOIN table2 ON condition', description: '全外连接，返回两表所有行，无匹配则为 NULL', category: 'join' },
    { keyword: 'CROSS JOIN', syntax: 'table1 CROSS JOIN table2', description: '交叉连接，返回两表的笛卡尔积', category: 'join' },
    { keyword: 'NATURAL JOIN', syntax: 'table1 NATURAL JOIN table2', description: '自然连接，自动按两表同名列进行等值连接', category: 'join' },
    { keyword: 'ON', syntax: 'JOIN table2 ON condition', description: '指定连接条件', category: 'join' },
    { keyword: 'USING', syntax: 'JOIN table2 USING (column)', description: '使用同名列进行连接的简写', category: 'join' },

    // setop
    { keyword: 'UNION', syntax: 'query1 UNION query2', description: '合并两个查询结果集并去除重复行', category: 'setop', example: 'SELECT name FROM employees UNION SELECT name FROM contractors' },
    { keyword: 'UNION ALL', syntax: 'query1 UNION ALL query2', description: '合并两个查询结果集，保留所有行（不去重）', category: 'setop', example: 'SELECT name FROM employees UNION ALL SELECT name FROM contractors' },
    { keyword: 'INTERSECT', syntax: 'query1 INTERSECT query2', description: '返回两个查询结果集的交集', category: 'setop' },
    { keyword: 'EXCEPT', syntax: 'query1 EXCEPT query2', description: '返回在第一个查询中但不在第二个查询中的行', category: 'setop' },
    { keyword: 'MINUS', syntax: 'query1 MINUS query2', description: 'EXCEPT 的同义词（Oracle 语法）', category: 'setop' },

    // dml
    { keyword: 'INSERT INTO', syntax: 'INSERT INTO table (col1, col2) VALUES (val1, val2)', description: '向表中插入数据', category: 'dml', example: 'INSERT INTO employees (name, dept) VALUES (\'Alice\', \'IT\')' },
    { keyword: 'INSERT OVERWRITE', syntax: 'INSERT OVERWRITE TABLE target SELECT ...', description: '覆盖写入目标表数据（Hive/Spark）', category: 'dml', example: 'INSERT OVERWRITE TABLE target_table SELECT * FROM source_table' },
    { keyword: 'UPDATE', syntax: 'UPDATE table SET col1 = val1 WHERE condition', description: '修改表中满足条件的行', category: 'dml', example: 'UPDATE employees SET salary = 6000 WHERE name = \'Alice\'' },
    { keyword: 'DELETE', syntax: 'DELETE FROM table WHERE condition', description: '删除表中满足条件的行', category: 'dml', example: 'DELETE FROM employees WHERE dept = \'HR\'' },
    { keyword: 'MERGE', syntax: 'MERGE INTO target USING source ON condition WHEN MATCHED THEN ... WHEN NOT MATCHED THEN ...', description: '根据条件对目标表执行插入或更新操作', category: 'dml' },
    { keyword: 'TRUNCATE', syntax: 'TRUNCATE TABLE table_name', description: '清空表中的所有数据，但保留表结构', category: 'dml' },
    { keyword: 'VALUES', syntax: 'VALUES (val1, val2), (val3, val4)', description: '定义行值表达式，常用于 INSERT', category: 'dml' },

    // ddl
    { keyword: 'CREATE TABLE', syntax: 'CREATE TABLE [IF NOT EXISTS] table_name (col1 type, col2 type, ...)', description: '创建新表', category: 'ddl', example: 'CREATE TABLE employees (\n  id INT,\n  name STRING,\n  salary DECIMAL(10,2)\n)' },
    { keyword: 'CREATE VIEW', syntax: 'CREATE VIEW view_name AS SELECT ...', description: '创建视图', category: 'ddl' },
    { keyword: 'ALTER TABLE', syntax: 'ALTER TABLE table_name action', description: '修改表结构或属性', category: 'ddl', example: 'ALTER TABLE employees ADD COLUMN email STRING' },
    { keyword: 'DROP TABLE', syntax: 'DROP TABLE [IF EXISTS] table_name', description: '删除表及其所有数据', category: 'ddl' },
    { keyword: 'DROP VIEW', syntax: 'DROP VIEW [IF EXISTS] view_name', description: '删除视图', category: 'ddl' },

    // window
    { keyword: 'OVER', syntax: 'window_function() OVER ([PARTITION BY expr] [ORDER BY expr [frame_clause]])', description: '定义窗口函数的窗口规范', category: 'window', example: 'SELECT name, salary, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rank\nFROM employees' },
    { keyword: 'PARTITION BY', syntax: 'PARTITION BY expr1, expr2, ...', description: '在窗口函数中将结果集分区', category: 'window' },
    { keyword: 'ROWS BETWEEN', syntax: 'ROWS BETWEEN start AND end', description: '定义窗口的行范围框架', category: 'window' },
    { keyword: 'RANGE BETWEEN', syntax: 'RANGE BETWEEN start AND end', description: '定义窗口的值范围框架', category: 'window' },
    { keyword: 'UNBOUNDED PRECEDING', syntax: 'ROWS BETWEEN UNBOUNDED PRECEDING AND ...', description: '窗口框架起始边界，表示分区第一行', category: 'window' },
    { keyword: 'CURRENT ROW', syntax: 'ROWS BETWEEN ... AND CURRENT ROW', description: '窗口框架边界，表示当前行', category: 'window' },
    { keyword: 'UNBOUNDED FOLLOWING', syntax: 'ROWS BETWEEN ... AND UNBOUNDED FOLLOWING', description: '窗口框架结束边界，表示分区最后一行', category: 'window' },

    // transaction
    { keyword: 'BEGIN', syntax: 'BEGIN [TRANSACTION | WORK]', description: '开始一个事务', category: 'transaction' },
    { keyword: 'COMMIT', syntax: 'COMMIT [TRANSACTION | WORK]', description: '提交当前事务', category: 'transaction' },
    { keyword: 'ROLLBACK', syntax: 'ROLLBACK [TRANSACTION | WORK]', description: '回滚当前事务', category: 'transaction' },
    { keyword: 'SAVEPOINT', syntax: 'SAVEPOINT savepoint_name', description: '在事务中设置保存点', category: 'transaction' },

    // auxiliary
    { keyword: 'SHOW', syntax: 'SHOW TABLES | SHOW DATABASES | SHOW PARTITIONS table', description: '显示数据库对象信息', category: 'auxiliary', example: 'SHOW TABLES' },
    { keyword: 'DESCRIBE', syntax: 'DESCRIBE [FORMATTED|EXTENDED] table_name', description: '显示表或列的结构信息', category: 'auxiliary', example: 'DESCRIBE FORMATTED employees' },
    { keyword: 'EXPLAIN', syntax: 'EXPLAIN [EXTENDED] query', description: '显示查询的执行计划', category: 'auxiliary' },
    { keyword: 'ANALYZE', syntax: 'ANALYZE TABLE table_name COMPUTE STATISTICS', description: '收集表的统计信息', category: 'auxiliary' },
    { keyword: 'USE', syntax: 'USE database_name', description: '切换当前数据库', category: 'auxiliary', example: 'USE my_database' },
    { keyword: 'SET', syntax: 'SET key = value | SET -v', description: '设置或显示配置参数', category: 'auxiliary' },

    // conditional
    { keyword: 'CASE', syntax: 'CASE WHEN condition THEN result [WHEN ... THEN ...] ELSE result END', description: '条件表达式，根据条件返回不同的值', category: 'conditional', example: 'SELECT name,\n  CASE WHEN salary > 8000 THEN \'高\'\n       WHEN salary > 5000 THEN \'中\'\n       ELSE \'低\'\n  END AS level\nFROM employees' },
    { keyword: 'WHEN', syntax: 'CASE WHEN condition THEN result', description: 'CASE 表达式中的条件分支', category: 'conditional' },
    { keyword: 'THEN', syntax: 'WHEN condition THEN result', description: 'CASE 表达式中条件成立时的返回值', category: 'conditional' },
    { keyword: 'ELSE', syntax: 'CASE ... ELSE default_result END', description: 'CASE 表达式中所有条件不满足时的默认值', category: 'conditional' },
    { keyword: 'END', syntax: 'CASE ... END', description: '结束 CASE 表达式', category: 'conditional' },
    { keyword: 'IF', syntax: 'IF(condition, true_value, false_value)', description: '条件函数，根据条件返回不同的值', category: 'conditional', example: 'SELECT IF(salary > 5000, \'高\', \'低\') AS level FROM employees' },
    { keyword: 'COALESCE', syntax: 'COALESCE(val1, val2, ...)', description: '返回参数列表中第一个非 NULL 的值', category: 'conditional', example: 'SELECT COALESCE(phone, email, \'N/A\') AS contact FROM employees' },
    { keyword: 'NULLIF', syntax: 'NULLIF(expr1, expr2)', description: '如果两个表达式相等则返回 NULL，否则返回第一个表达式', category: 'conditional' },

    // type
    { keyword: 'INT', syntax: 'INT', description: '整数类型，通常为 4 字节', category: 'type' },
    { keyword: 'BIGINT', syntax: 'BIGINT', description: '大整数类型，通常为 8 字节', category: 'type' },
    { keyword: 'STRING', syntax: 'STRING', description: '可变长度字符串类型（Hive）', category: 'type' },
    { keyword: 'VARCHAR', syntax: 'VARCHAR(n)', description: '可变长度字符串类型，最大长度 n', category: 'type' },
    { keyword: 'CHAR', syntax: 'CHAR(n)', description: '定长字符串类型，长度 n', category: 'type' },
    { keyword: 'BOOLEAN', syntax: 'BOOLEAN', description: '布尔类型，值为 TRUE 或 FALSE', category: 'type' },
    { keyword: 'DOUBLE', syntax: 'DOUBLE', description: '双精度浮点数类型', category: 'type' },
    { keyword: 'FLOAT', syntax: 'FLOAT', description: '单精度浮点数类型', category: 'type' },
    { keyword: 'DECIMAL', syntax: 'DECIMAL(precision, scale)', description: '精确数值类型，指定精度和小数位数', category: 'type', example: 'DECIMAL(10, 2)' },
    { keyword: 'DATE', syntax: 'DATE', description: '日期类型（年-月-日）', category: 'type' },
    { keyword: 'TIMESTAMP', syntax: 'TIMESTAMP', description: '时间戳类型（日期+时间）', category: 'type' },
    { keyword: 'ARRAY', syntax: 'ARRAY<type>', description: '数组类型，存储同类型元素的有序集合', category: 'type', example: 'ARRAY<STRING>' },
    { keyword: 'MAP', syntax: 'MAP<key_type, value_type>', description: '映射类型，存储键值对集合', category: 'type', example: 'MAP<STRING, INT>' },
    { keyword: 'STRUCT', syntax: 'STRUCT<field1: type1, field2: type2, ...>', description: '结构体类型，存储具名字段集合', category: 'type', example: 'STRUCT<name: STRING, age: INT>' },
]
```

---

### Task 4: 创建方言特有关键字数据

**Files:**
- Create: `src/languages/keywords/hiveKeywords.ts`
- Create: `src/languages/keywords/sparkKeywords.ts`
- Create: `src/languages/keywords/mysqlKeywords.ts`
- Create: `src/languages/keywords/postgresqlKeywords.ts`
- Create: `src/languages/keywords/oracleKeywords.ts`
- Create: `src/languages/keywords/bigqueryKeywords.ts`
- Create: `src/languages/keywords/snowflakeKeywords.ts`
- Create: `src/languages/keywords/prestoKeywords.ts`
- Create: `src/languages/keywords/sqliteKeywords.ts`

- [ ] **Step 1: 创建 hiveKeywords.ts**

```typescript
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
```

- [ ] **Step 2: 创建 sparkKeywords.ts**

```typescript
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
```

- [ ] **Step 3: 创建 mysqlKeywords.ts**

```typescript
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
```

- [ ] **Step 4: 创建 postgresqlKeywords.ts**

```typescript
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
```

- [ ] **Step 5: 创建 oracleKeywords.ts**

```typescript
import type { KeywordInfo } from '../../hover/HoverResolver'

export const oracleKeywords: KeywordInfo[] = [
    { keyword: 'CONNECT BY', syntax: 'SELECT ... FROM table START WITH condition CONNECT BY PRIOR col = parent_col', description: '层次查询，用于处理树形结构数据', category: 'hint', example: 'SELECT employee_id, manager_id FROM employees\nSTART WITH manager_id IS NULL\nCONNECT BY PRIOR employee_id = manager_id' },
    { keyword: 'START WITH', syntax: 'START WITH condition', description: '指定层次查询的起始条件', category: 'hint' },
    { keyword: 'PIVOT', syntax: 'SELECT ... FROM table PIVOT (agg_fn(col) FOR pivot_col IN (val1, val2, ...))', description: '行转列操作', category: 'hint' },
    { keyword: 'UNPIVOT', syntax: 'SELECT ... FROM table UNPIVOT (value_col FOR name_col IN (col1, col2, ...))', description: '列转行操作', category: 'hint' },
    { keyword: 'NVL', syntax: 'NVL(expr, replacement)', description: '如果 expr 为 NULL 则返回 replacement', category: 'conditional', example: 'SELECT NVL(commission, 0) FROM employees' },
    { keyword: 'DECODE', syntax: 'DECODE(expr, search1, result1, search2, result2, ..., default)', description: '条件表达式，类似于 CASE WHEN', category: 'conditional', example: 'SELECT DECODE(dept, \'IT\', 1, \'HR\', 2, 0) FROM employees' },
    { keyword: 'ROWNUM', syntax: 'WHERE ROWNUM <= n', description: '伪列，返回结果集中的行序号', category: 'hint', example: 'SELECT * FROM employees WHERE ROWNUM <= 10' },
    { keyword: 'VARCHAR2', syntax: 'VARCHAR2(n)', description: 'Oracle 可变长度字符串类型', category: 'type' },
    { keyword: 'NUMBER', syntax: 'NUMBER(precision, scale)', description: 'Oracle 数值类型', category: 'type' },
    { keyword: 'CLOB', syntax: 'CLOB', description: 'Oracle 大字符对象类型', category: 'type' },
    { keyword: 'BLOB', syntax: 'BLOB', description: 'Oracle 大二进制对象类型', category: 'type' },
]
```

- [ ] **Step 6: 创建 bigqueryKeywords.ts**

```typescript
import type { KeywordInfo } from '../../hover/HoverResolver'

export const bigqueryKeywords: KeywordInfo[] = [
    { keyword: 'QUALIFY', syntax: 'SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... QUALIFY window_filter', description: '在窗口函数结果上过滤行', category: 'hint', example: 'SELECT name, salary,\n  ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn\nFROM employees\nQUALIFY rn = 1' },
    { keyword: 'STRUCT', syntax: 'STRUCT<field1 type1, field2 type2>', description: '结构体类型构造', category: 'type', example: 'STRUCT<name STRING, age INT64>' },
    { keyword: 'ARRAY_AGG', syntax: 'ARRAY_AGG(expr [IGNORE NULLS] [ORDER BY ...] [LIMIT n])', description: '将值聚合为数组', category: 'hint', example: 'SELECT ARRAY_AGG(name) FROM employees GROUP BY dept' },
    { keyword: 'STRING_AGG', syntax: 'STRING_AGG(expr, delimiter [ORDER BY ...])', description: '将字符串值连接为单个字符串', category: 'hint', example: 'SELECT STRING_AGG(name, \', \') FROM employees GROUP BY dept' },
    { keyword: 'FOR SYSTEM TIME AS OF', syntax: 'FROM table FOR SYSTEM_TIME AS OF timestamp', description: '查询表的历史时间点数据', category: 'hint' },
]
```

- [ ] **Step 7: 创建 snowflakeKeywords.ts**

```typescript
import type { KeywordInfo } from '../../hover/HoverResolver'

export const snowflakeKeywords: KeywordInfo[] = [
    { keyword: 'QUALIFY', syntax: 'SELECT ... FROM ... QUALIFY window_filter', description: '在窗口函数结果上过滤行', category: 'hint', example: 'SELECT name, salary,\n  ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn\nFROM employees\nQUALIFY rn = 1' },
    { keyword: 'LATERAL FLATTEN', syntax: 'SELECT ... FROM table, LATERAL FLATTEN(input => array_col) alias', description: '将数组或 VARIANT 展开为多行', category: 'hint', example: 'SELECT id, val::STRING\nFROM raw_table,\nLATERAL FLATTEN(input => parsed:items) f' },
    { keyword: 'SAMPLE', syntax: 'FROM table SAMPLE (n ROWS | n PERCENT)', description: '对表进行随机采样', category: 'hint' },
    { keyword: 'CLONE', syntax: 'CREATE TABLE ... CLONE source_table', description: '克隆表（零拷贝）', category: 'ddl', example: 'CREATE TABLE employees_backup CLONE employees' },
    { keyword: 'UNDROP', syntax: 'UNDROP TABLE table_name', description: '恢复已删除的表（在 Time Travel 期内）', category: 'ddl' },
    { keyword: 'TIME TRAVEL', syntax: 'FROM table AT (TIMESTAMP => ts) | BEFORE (STATEMENT => id)', description: '查询历史数据（在数据保留期内）', category: 'hint' },
    { keyword: 'AT', syntax: 'FROM table AT (TIMESTAMP => timestamp)', description: '查询指定时间点的表数据', category: 'hint' },
    { keyword: 'BEFORE', syntax: 'FROM table BEFORE (STATEMENT => statement_id)', description: '查询指定语句之前状态的表数据', category: 'hint' },
]
```

- [ ] **Step 8: 创建 prestoKeywords.ts**

```typescript
import type { KeywordInfo } from '../../hover/HoverResolver'

export const prestoKeywords: KeywordInfo[] = [
    { keyword: 'CROSS JOIN UNNEST', syntax: 'FROM table CROSS JOIN UNNEST(array_col) AS t(alias)', description: '将数组展开为多行', category: 'hint', example: 'SELECT id, val\nFROM src\nCROSS JOIN UNNEST(array_col) AS t(val)' },
    { keyword: 'LATERAL', syntax: 'FROM table, LATERAL (subquery)', description: '关联子查询，引用外部表的列', category: 'hint' },
    { keyword: 'UNNEST', syntax: 'UNNEST(array_or_map) [WITH ORDINALITY]', description: '将数组或 Map 展开为关系', category: 'hint', example: 'SELECT * FROM UNNEST(ARRAY[1, 2, 3]) AS t(x)' },
    { keyword: 'WITH ORDINALITY', syntax: 'UNNEST(...) WITH ORDINALITY', description: '在 UNNEST 结果中附加行序号列', category: 'hint', example: 'SELECT * FROM UNNEST(ARRAY[\'a\', \'b\']) WITH ORDINALITY AS t(val, ord)' },
]
```

- [ ] **Step 9: 创建 sqliteKeywords.ts**

```typescript
import type { KeywordInfo } from '../../hover/HoverResolver'

export const sqliteKeywords: KeywordInfo[] = [
    { keyword: 'REPLACE', syntax: 'REPLACE INTO table (col1, col2) VALUES (val1, val2)', description: '插入或替换行（UPSERT 语义）', category: 'dml', example: 'REPLACE INTO employees (id, name) VALUES (1, \'Alice\')' },
    { keyword: 'AUTOINCREMENT', syntax: 'col_name INTEGER PRIMARY KEY AUTOINCREMENT', description: '自动递增列属性', category: 'hint', example: 'CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT)' },
    { keyword: 'IF NOT EXISTS', syntax: 'CREATE TABLE IF NOT EXISTS table_name (...)', description: '仅在表不存在时创建', category: 'ddl', example: 'CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY)' },
    { keyword: 'ATTACH', syntax: 'ATTACH DATABASE \'path\' AS alias', description: '附加外部数据库文件', category: 'auxiliary', example: 'ATTACH DATABASE \'./other.db\' AS other' },
    { keyword: 'DETACH', syntax: 'DETACH DATABASE alias', description: '分离已附加的数据库', category: 'auxiliary' },
    { keyword: 'ROWID', syntax: 'ROWID', description: '表行的内置整数标识符', category: 'hint', example: 'SELECT ROWID, * FROM employees' },
]
```

---

### Task 5: 创建关键字汇总导出

**Files:**
- Create: `src/languages/keywords/index.ts`

- [ ] **Step 1: 创建 index.ts — 汇总导出 + getKeywordsForDialect()**

```typescript
import type { KeywordInfo } from '../../hover/HoverResolver'
import type { SqlLanguage } from '../../formatter/sqlFormatter'
import { baseKeywords } from './baseKeywords'
import { hiveKeywords } from './hiveKeywords'
import { sparkKeywords } from './sparkKeywords'
import { mysqlKeywords } from './mysqlKeywords'
import { postgresqlKeywords } from './postgresqlKeywords'
import { oracleKeywords } from './oracleKeywords'
import { bigqueryKeywords } from './bigqueryKeywords'
import { snowflakeKeywords } from './snowflakeKeywords'
import { prestoKeywords } from './prestoKeywords'
import { sqliteKeywords } from './sqliteKeywords'

const dialectKeywordMap: Record<string, KeywordInfo[]> = {
    hive: hiveKeywords,
    mysql: mysqlKeywords,
    spark: sparkKeywords,
    sql: [],
    postgresql: postgresqlKeywords,
    oracle: oracleKeywords,
    bigquery: bigqueryKeywords,
    snowflake: snowflakeKeywords,
    presto: prestoKeywords,
    sqlite: sqliteKeywords,
}

const cache = new Map<SqlLanguage, KeywordInfo[]>()

export function getKeywordsForDialect(dialect: SqlLanguage): KeywordInfo[] {
    const cached = cache.get(dialect)
    if (cached) return cached

    const dialectSpecific = dialectKeywordMap[dialect] || []
    const merged = new Map<string, KeywordInfo>()

    for (const kw of baseKeywords) {
        merged.set(kw.keyword.toUpperCase(), kw)
    }
    for (const kw of dialectSpecific) {
        merged.set(kw.keyword.toUpperCase(), kw)
    }

    const result = Array.from(merged.values())
    cache.set(dialect, result)
    return result
}
```

---

### Task 6: 创建 FunctionHoverResolver

**Files:**
- Create: `src/hover/FunctionHoverResolver.ts`

- [ ] **Step 1: 创建 FunctionHoverResolver.ts**

```typescript
import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from './HoverResolver'
import { buildFunctionMarkdown } from './hoverUtils'
import type { FunctionSignature } from '../completion/functionSignatures'
import * as allDialects from '../languages/allDialects'

const functionSigMap: Record<string, FunctionSignature[]> = {
    hive: allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    sql: allDialects.sqlFunctionSignatures,
    postgresql: allDialects.pgFunctionSignatures,
    oracle: allDialects.oracleFunctionSignatures,
    bigquery: allDialects.bqFunctionSignatures,
    snowflake: allDialects.sfFunctionSignatures,
    presto: allDialects.prestoFunctionSignatures,
    sqlite: allDialects.sqliteFunctionSignatures,
}

export class FunctionHoverResolver implements HoverResolver {
    resolve(word: string, dialect: SqlLanguage, _document: vscode.TextDocument): vscode.Hover | null {
        const signatures = functionSigMap[dialect]
        if (!signatures) return null

        const upperWord = word.toUpperCase()
        const fn = signatures.find(s => s.name.toUpperCase() === upperWord)
        if (!fn) return null

        const md = buildFunctionMarkdown(fn)
        return new vscode.Hover(md)
    }
}
```

---

### Task 7: 创建 KeywordHoverResolver

**Files:**
- Create: `src/hover/KeywordHoverResolver.ts`

- [ ] **Step 1: 创建 KeywordHoverResolver.ts**

```typescript
import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from './HoverResolver'
import type { KeywordInfo } from './HoverResolver'
import { buildKeywordMarkdown } from './hoverUtils'
import { getKeywordsForDialect } from '../languages/keywords'

export class KeywordHoverResolver implements HoverResolver {
    resolve(word: string, dialect: SqlLanguage, _document: vscode.TextDocument): vscode.Hover | null {
        const keywords = getKeywordsForDialect(dialect)
        const upperWord = word.toUpperCase()
        const info = keywords.find(k => k.keyword.toUpperCase() === upperWord)
        if (!info) return null

        const md = buildKeywordMarkdown(info)
        return new vscode.Hover(md)
    }
}
```

---

### Task 8: 创建 ParameterHoverResolver

**Files:**
- Create: `src/hover/ParameterHoverResolver.ts`

- [ ] **Step 1: 创建 ParameterHoverResolver.ts**

```typescript
import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from './HoverResolver'
import { extractParameterAtPosition, buildParameterMarkdown } from './hoverUtils'

interface ParamScanResult {
    paramName: string
    locations: { line: number; context: string }[]
}

const scanCache = new Map<string, { version: number; result: Map<string, ParamScanResult> }>()

function scanDocumentParameters(document: vscode.TextDocument): Map<string, ParamScanResult> {
    const cacheKey = document.uri.toString()
    const cached = scanCache.get(cacheKey)
    if (cached && cached.version === document.version) {
        return cached.result
    }

    const paramMap = new Map<string, ParamScanResult>()
    const paramRegex = /\$\{(\w+)\}/g
    const lineCount = document.lineCount

    for (let i = 0; i < lineCount; i++) {
        const line = document.lineAt(i).text
        let match: RegExpExecArray | null
        paramRegex.lastIndex = 0
        while ((match = paramRegex.exec(line)) !== null) {
            const name = match[1]
            const existing = paramMap.get(name)
            const location = { line: i + 1, context: line.trim() }
            if (existing) {
                existing.locations.push(location)
            } else {
                paramMap.set(name, { paramName: name, locations: [location] })
            }
        }
    }

    scanCache.set(cacheKey, { version: document.version, result: paramMap })
    return paramMap
}

export class ParameterHoverResolver implements HoverResolver {
    resolve(word: string, _dialect: SqlLanguage, document: vscode.TextDocument): vscode.Hover | null {
        const position = vscode.window.activeTextEditor?.selection.active
        if (!position) return null

        const paramInfo = extractParameterAtPosition(document, position)
        if (!paramInfo) return null

        const paramMap = scanDocumentParameters(document)
        const scanResult = paramMap.get(paramInfo.paramName)
        if (!scanResult) return null

        const md = buildParameterMarkdown(scanResult.paramName, scanResult.locations)
        return new vscode.Hover(md, paramInfo.range)
    }
}
```

---

### Task 9: 创建 SqlHoverProvider

**Files:**
- Create: `src/providers/SqlHoverProvider.ts`

- [ ] **Step 1: 创建 SqlHoverProvider.ts**

```typescript
import * as vscode from 'vscode'
import { sqlDialects } from '../core/sqlDialects'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from '../hover/HoverResolver'
import { ParameterHoverResolver } from '../hover/ParameterHoverResolver'
import { FunctionHoverResolver } from '../hover/FunctionHoverResolver'
import { KeywordHoverResolver } from '../hover/KeywordHoverResolver'
import { extractWordAtPosition } from '../hover/hoverUtils'

export class SqlHoverProvider implements vscode.HoverProvider {
    private resolvers: HoverResolver[]

    constructor() {
        this.resolvers = [
            new ParameterHoverResolver(),
            new FunctionHoverResolver(),
            new KeywordHoverResolver(),
        ]
    }

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | null {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        if (!config.get<boolean>('enableHover', true)) return null

        const dialectName = sqlDialects[document.languageId as keyof typeof sqlDialects]
        if (!dialectName) return null

        const word = extractWordAtPosition(document, position)
        if (!word) return null

        for (const resolver of this.resolvers) {
            const result = resolver.resolve(word, dialectName as SqlLanguage, document)
            if (result) return result
        }
        return null
    }
}
```

---

### Task 10: 添加 i18n 消息

**Files:**
- Modify: `src/i18n/messages.zh.json`
- Modify: `src/i18n/messages.en.json`

- [ ] **Step 1: 在 messages.zh.json 末尾（`configEditor.panelTitle` 行后）添加悬停相关消息**

在 `"configEditor.panelTitle": "SQL All in One - 配置编辑器"` 后添加：

```json
    "hover.keywordCategory.query": "查询子句",
    "hover.keywordCategory.join": "连接",
    "hover.keywordCategory.setop": "集合运算",
    "hover.keywordCategory.dml": "数据操作",
    "hover.keywordCategory.ddl": "数据定义",
    "hover.keywordCategory.window": "窗口函数",
    "hover.keywordCategory.transaction": "事务",
    "hover.keywordCategory.auxiliary": "辅助命令",
    "hover.keywordCategory.conditional": "条件表达式",
    "hover.keywordCategory.type": "数据类型",
    "hover.keywordCategory.hint": "方言特有",
    "hover.keyword": "关键字",
    "hover.returnType": "返回类型",
    "hover.syntax": "语法",
    "hover.example": "示例",
    "hover.parameterRef": "参数引用",
    "hover.parameterName": "参数名",
    "hover.parameterUsage": "该参数在以下位置被使用（共 {0} 处）：",
    "hover.parameterLine": "第 {0} 行:",
    "hover.parameterMore": "还有 {0} 处",
    "hover.parameterTip": "提示：使用 \"SQL-All-in-One: 替换 SQL 参数\" 命令可批量替换"
```

- [ ] **Step 2: 在 messages.en.json 末尾（`configEditor.panelTitle` 行后）添加悬停相关消息**

在 `"configEditor.panelTitle": "SQL All in One - Configuration Editor"` 后添加：

```json
    "hover.keywordCategory.query": "Query Clause",
    "hover.keywordCategory.join": "Join",
    "hover.keywordCategory.setop": "Set Operation",
    "hover.keywordCategory.dml": "Data Manipulation",
    "hover.keywordCategory.ddl": "Data Definition",
    "hover.keywordCategory.window": "Window Function",
    "hover.keywordCategory.transaction": "Transaction",
    "hover.keywordCategory.auxiliary": "Auxiliary Command",
    "hover.keywordCategory.conditional": "Conditional Expression",
    "hover.keywordCategory.type": "Data Type",
    "hover.keywordCategory.hint": "Dialect-Specific",
    "hover.keyword": "Keyword",
    "hover.returnType": "Return type",
    "hover.syntax": "Syntax",
    "hover.example": "Example",
    "hover.parameterRef": "Parameter Reference",
    "hover.parameterName": "Parameter",
    "hover.parameterUsage": "This parameter is used in the following locations (total {0}):",
    "hover.parameterLine": "Line {0}:",
    "hover.parameterMore": "... and {0} more",
    "hover.parameterTip": "Tip: Use \"SQL-All-in-One: Replace SQL Parameters\" command to batch replace"
```

---

### Task 11: 修改 extension.ts 注册 HoverProvider

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: 在 extension.ts 顶部添加 import**

在 `import { SqlCompletionProvider, } from "./completion"` 行后添加：

```typescript
import { SqlHoverProvider } from "./providers/SqlHoverProvider"
```

- [ ] **Step 2: 在 CompletionProvider 注册代码块之后添加 HoverProvider 注册**

在 `if (completionProvider) { context.subscriptions.push(completionProvider) }` 块之后添加：

```typescript
    try {
        const hoverProvider = new SqlHoverProvider()
        const sqlLanguages = Object.keys(sqlDialects)
        context.subscriptions.push(
            ...sqlLanguages.map(lang =>
                vscode.languages.registerHoverProvider(
                    { language: lang },
                    hoverProvider
                )
            )
        )
    } catch (e) {
        console.error('SQL All in One: failed to register HoverProvider', e)
    }
```

---

### Task 12: 修改 package.json 添加 enableHover 配置

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在 `SQL-All-in-One.enableCompletion` 配置项之前添加 `enableHover` 配置**

在 `"SQL-All-in-One.enableCompletion"` 配置项之前插入：

```json
                "SQL-All-in-One.enableHover": {
                    "type": "boolean",
                    "default": true,
                    "markdownDescription": "启用/禁用 SQL 悬停提示（函数签名、关键字说明、参数引用）"
                },
```

---

### Task 13: 编译验证

- [ ] **Step 1: 运行编译检查**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | head -50`

Expected: 编译成功，无类型错误

- [ ] **Step 2: 如有编译错误，逐一修复**

---

## 自审清单

**1. Spec 覆盖度：**
- ✅ 函数悬停（FunctionHoverResolver）— Task 6
- ✅ 关键字悬停（KeywordHoverResolver）— Task 7
- ✅ 参数引用悬停（ParameterHoverResolver）— Task 8
- ✅ 方言感知（10 种方言）— Task 4 + Task 5
- ✅ Markdown 富文本渲染 — Task 2 (hoverUtils)
- ✅ 按需加载 + 缓存 — Task 5 (keywords cache) + Task 8 (param scan cache)
- ✅ enableHover 配置开关 — Task 9 + Task 12
- ✅ i18n 国际化 — Task 10
- ✅ extension.ts 注册 — Task 11
- ✅ 大小写不敏感匹配 — Task 6/7 (toUpperCase)
- ✅ 参数引用超 20 处截断 — Task 2 (buildParameterMarkdown)
- ✅ 优先级顺序 Parameter > Function > Keyword — Task 9 (resolvers 数组顺序)

**2. Placeholder 扫描：** 无 TBD/TODO/实现稍后等占位符

**3. 类型一致性：**
- HoverResolver 接口在 Task 1 定义，Task 6/7/8 实现一致
- KeywordInfo/KeywordCategory 在 Task 1 定义，Task 3/4/5 使用一致
- SqlLanguage 类型从 sqlFormatter.ts 导入，各 Resolver 使用一致
- functionSigMap 的 key 与 SqlLanguage 一致
