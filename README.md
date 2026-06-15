# SQL All in One

[中文](#中文) | [English](#english)

---

## 中文

**SQL All in One** 是一款全面的 SQL 开发工具包 VSCode 扩展，集数据库连接管理、查询执行、数据导入导出、表设计器、执行计划、数据库浏览器、SQL 格式化、智能补全、语法检查、Lint 规则、快速修复、代码导航、DDL 转换、注释增强、悬停信息、代码折叠、可视化配置编辑器等功能于一体。

| | |
|---|---|
| **发布者** | bryce-qin |
| **版本** | 2.15.22 |
| **许可证** | MIT |
| **仓库** | [GitHub](https://github.com/BryceQin/SQL-All-in-One) |
| **VSCode 引擎** | ^1.85.0 |
| **分类** | Formatters, Snippets, Other, Databases |

### 支持的 SQL 方言（8 种）

| Language ID | 别名 | 扩展名 |
|------------|------|--------|
| `sql` | SQL | `.sql` |
| `hive` | Hive, hive-sql | `.hql` |
| `mysql` | MySQL | `.mysql` |
| `spark` | SparkSQL, spark | `.sparksql` |
| `flinksql` | FlinkSQL, flink-sql | `.flinksql` |
| `postgresql` | PostgreSQL, postgres | `.psql`, `.pgsql` |
| `bigquery` | BigQuery | `.bqsql` |
| `sqlite` | SQLite | `.sqlite`, `.sqlt` |

---

### 快速开始

1. 安装插件后，打开任意 `.sql`、`.hql`、`.mysql` 等 SQL 文件
2. 使用快捷键 `Shift+Alt+F`（Windows/Linux）或 `Shift+Option+F`（Mac）格式化文档
3. 或右键选择"格式化文档"
4. 或使用命令面板搜索 "Format Selection (SQL All in One)" 格式化选中内容
5. 点击侧边栏数据库图标，添加数据库连接，即可执行查询、浏览 Schema

---

### 核心功能

#### 1. 数据库连接与管理

- MySQL 数据库连接，支持连接池、SSL、SSH 隧道
- 图形化连接对话框（v2.1 新增，替代逐步输入框）
- 连接生命周期管理（添加/编辑/删除/连接/断开）
- 连接池健康检查、空闲检查、自动重连
- 自动重试，指数退避（最多 3 次）
- 活动连接管理（单活动连接模式）
- SecretStorage 密码安全存储
- 连接导入/导出（支持密码保护，导出密码时需确认）

#### 2. 查询执行与结果

- 执行 SQL（`Ctrl+Shift+E` / `Cmd+Shift+E`）和执行选中 SQL（`Ctrl+Shift+R` / `Cmd+Shift+R`）
- 查询超时控制（可配置）
- 查询取消支持（CancellationToken + KILL QUERY）
- 最大行数限制
- **查询数据面板（v2.12 新增）**：集成 Monaco SQL 编辑器，支持在结果面板中直接编写和执行 SQL
- 可拖拽分割面板：SQL 编辑器与查询结果上下分栏，比例可调
- Monaco 编辑器：SQL 语法高亮、智能提示、代码折叠，自动跟随 VS Code 主题
- **Monaco 语言特性增强（v2.13 新增）**：方言化语法高亮、智能补全、悬停提示、SQL 格式化、Lint 诊断
- 方言化 Monarch 语法高亮：8 种 SQL 方言独立 tokenizer，关键字/数据类型/函数名分别着色
- 静态补全（零延迟）：关键字、580+ 函数签名（含参数 Snippet）、数据类型、代码片段
- 函数签名提示：输入 `(` 或 `,` 显示参数签名，自动高亮当前参数
- Schema 感知补全：输入 `.` 或空格触发，查询数据库 Schema 返回表名/列名
- 悬停提示：鼠标悬停显示函数签名、关键字说明、表结构等
- SQL 格式化：`Shift+Alt+F` / `Cmd+Shift+I` 快捷键格式化
- SQL Lint 诊断：编辑后自动检查，显示波浪线警告
- 连接切换时自动更新方言
- 从数据库浏览器点击表/视图节点，自动生成 `SELECT * FROM table LIMIT 200` 并执行
- 结果面板：分页、滚动预加载
- 网格视图和表单视图
- JSON 美化输出
- 日期格式显示（本地/UTC/相对时间）
- 长文本截断（可配置阈值）
- NULL 值占位符显示
- 批量执行模式（顺序/事务）
- 错误处理策略（停止/继续）
- 批量执行进度保存

#### 3. 数据导入与导出

- 导出为 CSV（可配置分隔符、编码、是否包含表头）
- 导出为 JSON
- 导出为 SQL INSERT 语句
- 导出表 DDL
- 从文件导入数据
- 默认导出格式配置

#### 4. 表设计器

- 可视化表设计/编辑
- 列定义：类型、约束、注释
- 数据编辑器：只读/可编辑模式
- 自动提交模式
- 乐观锁并发编辑
- BLOB 预览（大小限制 + MIME 类型白名单）
- 数据验证（实时验证，外键验证可选）
- 事务状态显示
- 长事务警告

#### 5. 执行计划

- `EXPLAIN FORMAT=JSON` 可视化
- 可视化执行计划面板

#### 6. 数据库浏览器（侧边栏）

- 树形视图：数据库、表、视图、列、函数、存储过程、触发器
- 查看表数据、查看 DDL
- 复制列名
- 添加/移除收藏
- 设置默认数据库
- Schema 缓存（可配置 TTL：数据库/表/列/函数）
- DDL 变更后自动刷新 Schema
- 连接时预取 Schema

#### 7. SQL 格式化

基于 node-sql-parser v5.x 的 AST 驱动格式化引擎，提供 40+ 可配置选项：

**大小写控制**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `keywordCase` | 关键字大小写（preserve/upper/lower） | `preserve` |
| `dataTypeCase` | 数据类型大小写（preserve/upper/lower） | `preserve` |
| `functionCase` | 函数名大小写（preserve/upper/lower） | `preserve` |
| `identifierCase` | 标识符大小写（preserve/upper/lower） | `preserve` |
| `nullCase` | NULL 大小写（preserve/upper/lower） | `preserve` |
| `booleanCase` | 布尔值大小写（preserve/upper/lower） | `preserve` |

**缩进控制**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `indentStyle` | 缩进风格（standard/tabularLeft/tabularRight） | `standard` |
| `tabWidth` | 缩进宽度 | `2` |
| `useTabs` | 使用 Tab 缩进 | `false` |

**换行控制**（25+ 选项）

SELECT、FROM、WHERE、GROUP BY、HAVING、ORDER BY、LIMIT、JOIN、ON、USING、WITH、CTE、CASE/WHEN/THEN/ELSE、IN、集合运算、Lateral View、DISTRIBUTE BY、CLUSTER BY、SORT BY、INSERT 列/值等子句的换行策略均可独立配置。

**对齐控制**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `alignColumnDefinitions` | 对齐列定义 | `false` |
| `alignWhereClauses` | 对齐 WHERE 条件 | `false` |
| `alignCaseStatements` | 对齐 CASE 语句 | `false` |
| `alignOnClauses` | 对齐 ON 条件 | `false` |
| `alignInsertColumns` | 对齐 INSERT 列 | `false` |
| `alignInsertValuesGroups` | 对齐 INSERT 值组 | `false` |
| `tabulateAlias` | 表格化别名 | `false` |

**间距与其他**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `denseOperators` | 去除运算符周围空格 | `false` |
| `spaceBeforeComma` | 逗号前加空格 | `false` |
| `spaceInsideParentheses` | 括号内加空格 | `false` |
| `expressionWidth` | 表达式换行字符阈值 | `50` |
| `linesBetweenQueries` | 查询间空行数 | `1` |
| `newlineBeforeSemicolon` | 分号前换行 | `false` |
| `commaPosition` | 逗号位置（after/before） | `after` |
| `singleLineMaxLength` | 单行最大长度 | - |
| `trimTrailingSpaces` | 去除行尾空格 | `true` |
| `semicolonAtEnd` | 末尾加分号 | `true` |
| `commentPosition` | 注释位置 | - |
| `subqueryParenStyle` | 子查询括号风格 | - |
| `maxItemsInlineList` | 行内列表最大项数 | - |
| `indentCteBody` | 缩进 CTE 主体 | - |
| `cteCommaPosition` | CTE 逗号位置 | - |
| `newlineBetweenCtes` | CTE 之间换行 | - |
| `indentJoinConditions` | 缩进 JOIN 条件 | - |
| `indentWhen` | 缩进 WHEN | - |
| `indentThen` | 缩进 THEN | - |
| `blankLinesBeforeSetOperation` | 集合运算前空行 | - |
| `blankLinesAfterSetOperation` | 集合运算后空行 | - |

其他：格式化选择命令、格式化器缓存（按方言+配置哈希，最多 50 实例）

**格式化示例**

格式化前：

```sql
select id,name,email from users where age>18 and status='active' order by created_at desc limit 10;
```

格式化后（standard 风格）：

```sql
SELECT
    id,
    name,
    email
FROM users
WHERE
    age > 18
    AND status = 'active'
ORDER BY created_at DESC
LIMIT 10;
```

#### 8. 智能补全（IntelliSense）

7 种补全类型，每种可独立启用/禁用：

| 补全类型 | 说明 | 示例 |
|---------|------|------|
| **Schema 补全** | 来自已连接数据库的表名/列名（带防抖） | 输入表名前缀 → 提示表名及列 |
| **关键字补全** | 方言特定的关键字和数据类型 | `SEL` → `SELECT` |
| **函数补全** | 580+ 函数签名，含参数、返回类型、中文描述、分类标签 | `SUB` → `SUBSTR(string, start, length)` |
| **代码片段补全** | 方言特定的代码片段 | `sel` → 插入 SELECT 模板 |
| **CTE 名称补全** | WITH 子句中定义的 CTE 名称 | `WITH cte AS (...) SELECT` → 提示 `cte` |
| **标识符补全** | 基于上下文的表名/列名建议 | FROM 子句中提示表名 |
| **注释模板补全** | header、todo、fixme、hack、desc、section、col、tbl | `header` → 插入文件头注释 |

#### 9. 语法检查与诊断

- 防抖诊断（300ms），支持 CancellationToken
- 双层检查：AST 诊断 + Lint 诊断
- 严重级别过滤（Error/Warning/Info）

**语法错误检查**

- HAVING 缺少 GROUP BY
- LIMIT 缺少数值
- JOIN 缺少 ON
- DISTINCT 位置错误
- WHERE 中使用聚合函数
- UPDATE 中使用 *
- 不完整的 CASE 语句
- 括号不匹配
- 未闭合的字符串
- 重复列别名

**代码质量建议**

- 重复表别名
- 保留字作为标识符
- SELECT 缺少 FROM
- INSERT 缺少列名
- 冗余 DISTINCT
- 子查询缺少别名
- 可疑的 NULL 比较

**方言提示**

- MySQL 日期函数在 Hive 中的差异

#### 10. SQL Lint（30 条规则）

每条规则支持 `enabled` / `severity` 配置：

| 规则 ID | 说明 | 默认启用 | 默认级别 |
|--------|------|---------|---------|
| `avoid_select_star` | 避免 SELECT * | ✅ | Warning |
| `explicit_join_type` | 显式指定 JOIN 类型 | ✅ | Info |
| `limit_with_order_by` | LIMIT 应搭配 ORDER BY | ✅ | Warning |
| `avoid_column_count_mismatch` | INSERT 列数与值数不匹配 | ✅ | Error |
| `missing_primary_key` | CREATE TABLE 缺少主键 | ✅ | Warning |
| `use_current_timestamp` | 使用 CURRENT_TIMESTAMP | ✅ | Info |
| `avoid_select_in_insert` | INSERT 中避免 SELECT | ✅ | Warning |
| `duplicate_column_aliases` | 重复列别名 | ✅ | Warning |
| `use_coalesce_over_isnull` | 使用 COALESCE 替代 ISNULL | ❌ | Info |
| `avoid_correlated_subqueries` | 避免相关子查询 | ❌ | Warning |
| `long_query_line` | 长查询行 | ❌ | Info |
| `explicit_column_aliasing` | 显式列别名（使用 AS） | ❌ | Info |
| `uppercase_keywords` | 关键字大写 | ❌ | Info |
| `missing_query_comment` | 复杂查询缺少注释 | ✅ | Warning |
| `missing_column_comment` | DDL 列缺少 COMMENT | ✅ | Warning |
| `commented_out_code` | 注释掉的代码 | ✅ | Info |
| `expired_todo` | 过期的 TODO/FIXME | ✅ | Info |
| `having_without_group_by` | HAVING 缺少 GROUP BY | ✅ | Error |
| `limit_invalid_value` | LIMIT 值无效 | ✅ | Error |
| `reserved_word_identifier` | 保留字作为标识符 | ✅ | Warning |
| `join_missing_on` | JOIN 缺少 ON | ✅ | Error |
| `select_without_from` | SELECT 缺少 FROM | ✅ | Warning |
| `misplaced_distinct` | DISTINCT 位置错误 | ✅ | Error |
| `aggregate_in_where` | WHERE 中使用聚合函数 | ✅ | Error |
| `subquery_without_alias` | 子查询缺少别名 | ✅ | Warning |
| `suspicious_null_comparison` | 可疑的 NULL 比较 | ✅ | Warning |
| `incomplete_case` | 不完整的 CASE | ✅ | Error |
| `redundant_distinct` | 冗余 DISTINCT | ✅ | Warning |
| `date_function_usage` | 日期函数用法提示 | ✅ | Info |
| `wildcard_in_update` | UPDATE 中使用通配符 | ✅ | Error |

部分规则支持子选项：

- `missing_query_comment`：`thresholdLineCount`、`thresholdJoinCount`、`thresholdSubqueryCount`
- `missing_column_comment`：`aggregate`、`externalTableExempt`
- `commented_out_code`：`thresholdLines`
- `expired_todo`：`gracePeriodDays`

#### 11. 快速修复

- `= NULL` → `IS NULL`
- `!= NULL` / `<> NULL` → `IS NOT NULL`
- 为保留字别名添加反引号包裹
- 为子查询添加别名
- 为 INSERT 添加列名占位符
- 为 HAVING 添加 GROUP BY

#### 12. 代码导航

| 功能 | 快捷键 | 说明 |
|------|--------|------|
| 跳转到定义 | `F12` | CTE、表别名、列别名 |
| 查找所有引用 | `Shift+F12` | 符号引用查找 |
| 重命名符号 | `F2` | 含保留字/冲突校验 |
| 面包屑导航 | - | 子句级导航（SELECT/FROM/WHERE/GROUP BY/HAVING/ORDER BY） |

共享 AstNavigator 导航引擎。

#### 13. DDL 转换

- 基于 AST 的 MySQL ↔ Hive CREATE TABLE 转换
- 数据类型映射
- 表选项过滤
- 列属性剥离
- 约束过滤

#### 14. 注释增强

**智能注释切换**

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+/` / `Cmd+/` | 智能切换：单行用行注释，多行用块注释 |
| `Ctrl+Shift+/` / `Cmd+Shift+/` | 高级注释：格式化禁用标记、DDL COMMENT、块注释 |

**注释模板补全**

| 前缀 | 说明 |
|------|------|
| `header` | 文件头注释（自动作者、自动表依赖） |
| `col` | 列 COMMENT |
| `tbl` | 表 COMMENT |
| `todo` | TODO 注释 |
| `fixme` | FIXME 注释 |
| `hack` | HACK 注释 |
| `desc` | 查询说明注释 |
| `section` | 分区标题注释 |

**注释 Lint 规则**：`missing_query_comment`、`missing_column_comment`、`commented_out_code`、`expired_todo`

#### 15. 悬停信息

4 层解析器链：

1. 参数悬停
2. 函数签名悬停
3. Schema 悬停（来自已连接数据库）
4. 关键字悬停

#### 16. 代码折叠与大纲

- 折叠 CTE、子查询、函数块
- 文档大纲，快速导航

#### 17. 可视化配置编辑器

- 图形化配置界面
- 可折叠分组、Toggle 开关
- 实时格式化预览
- 拖拽调整预览区大小
- 快速预设（默认、Hive、MySQL、紧凑）
- 保存配置按钮

#### 18. 状态栏

- 显示当前 SQL 方言
- 快速访问配置编辑器
- 仅在 SQL 文件中显示

#### 19. 参数化查询

- 变量高亮
- 批量参数替换（`Ctrl+Alt+P` / `Cmd+Alt+P`）
- JDBC `:?` 参数支持
- 正则注入防护

#### 20. 查询历史

- 已执行查询的历史记录
- 可配置最大条目数（默认 500）
- 显示/清除历史命令

#### 21. 安全守卫

- 危险 SQL 拦截
- 3 个级别：strict（所有规则）、moderate（仅确认级）、off
- 防止误操作 DROP、TRUNCATE、无 WHERE 的 DELETE 等

#### 22. 国际化

- 中文（zh）和英文（en）
- 自动跟随 VSCode 语言设置
- `displayLanguage` 配置：auto/zh/en

#### 23. 代码片段

**通用 SQL**

| 前缀 | 说明 |
|------|------|
| `sel` | 基础 SELECT |
| `seld` | SELECT DISTINCT |
| `join` | JOIN 查询 |
| `leftjoin` | LEFT JOIN 查询 |
| `groupby` | GROUP BY 聚合 |
| `case` | CASE WHEN |
| `insert` | INSERT INTO |
| `insertsel` | INSERT ... SELECT |
| `update` | UPDATE |
| `delete` | DELETE |
| `ct` | CREATE TABLE |
| `ctas` | CREATE TABLE AS SELECT |
| `with` | WITH CTE |
| `union` | UNION ALL |

**Hive**

| 前缀 | 说明 |
|------|------|
| `hivepart` | Hive 分区插入 |
| `hiveselpart` | Hive 分区查询 |
| `hiveext` | Hive 外部表 |

**FlinkSQL**

| 前缀 | 说明 |
|------|------|
| `flinkkafka` | Kafka 建表 |
| `flinkjdbc` | JDBC 建表 |
| `flinktumble` | 滚动窗口 |
| `flinkhop` | 滑动窗口 |
| `flinkcumulate` | 累积窗口 |
| `flinkwatermark` | Watermark 定义 |
| `flinktemporal` | 时态关联 |
| `flinkdedup` | 去重查询 |

**注释**

| 前缀 | 说明 |
|------|------|
| `header` | 文件头注释 |
| `todo` | TODO 注释 |
| `fixme` | FIXME 注释 |
| `hack` | HACK 注释 |
| `desc` | 查询说明注释 |
| `section` | 分区标题注释 |
| `col` | 列 COMMENT |
| `tbl` | 表 COMMENT |

---

### 快捷键

| 命令 | Windows/Linux | Mac |
|------|--------------|-----|
| 替换参数 | `Ctrl+Alt+P` | `Cmd+Alt+P` |
| 切换注释 | `Ctrl+/` | `Cmd+/` |
| 高级注释 | `Ctrl+Shift+/` | `Cmd+Shift+/` |
| 执行 SQL | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| 执行选中 SQL | `Ctrl+Shift+R` | `Cmd+Shift+R` |
| 格式化文档 | `Shift+Alt+F` | `Shift+Option+F` |

---

### 扩展设置

在 VSCode 设置中搜索 "SQL All in One" 进行配置，80+ 项设置按以下类别组织：

#### 1. 语言与方言

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `dialect` | SQL 方言（auto-detect/hive/mysql/spark/flinksql/sql/postgresql/bigquery/sqlite） | `hive` |
| `displayLanguage` | 界面语言（auto/zh/en） | `auto` |

#### 2. 格式化（40+ 选项）

见 [SQL 格式化](#7-sql-格式化) 章节中的大小写、缩进、换行、对齐、间距等配置表。

#### 3. Lint 规则（30 条）

见 [SQL Lint](#10-sql-lint30-条规则) 章节。每条规则支持 `enabled` + `severity` 配置，部分规则支持子选项。

#### 4. 功能开关

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `enableLinter` | 启用 Lint | `true` |
| `enableCodeFolding` | 启用代码折叠 | `true` |
| `enableOutlineView` | 启用大纲视图 | `true` |
| `enableStatusBar` | 启用状态栏 | `true` |
| `enableParameterHighlight` | 启用参数高亮 | `true` |
| `enableSnippets` | 启用代码片段 | `true` |
| `enableQuickFix` | 启用快速修复 | `true` |
| `enableHover` | 启用悬停信息 | `true` |
| `enableNavigation` | 启用代码导航 | `true` |
| `enableCompletion` | 启用智能补全 | `true` |

#### 5. 补全

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `completion.keywords` | 关键字补全 | `true` |
| `completion.functions` | 函数补全 | `true` |
| `completion.snippets` | 代码片段补全 | `false` |
| `completion.cteNames` | CTE 名称补全 | `true` |
| `completion.identifiers` | 标识符补全 | `true` |
| `completion.commentSnippets` | 注释模板补全 | `true` |
| `completion.schema` | Schema 感知补全 | `true` |

#### 6. Schema 缓存

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `schemaCache.databaseTtl` | 数据库缓存 TTL（秒） | `600` |
| `schemaCache.tableTtl` | 表缓存 TTL（秒） | `300` |
| `schemaCache.columnTtl` | 列缓存 TTL（秒） | `120` |
| `schemaCache.functionTtl` | 函数缓存 TTL（秒） | `600` |
| `schemaCache.refreshOnDDL` | DDL 变更后刷新 | `true` |
| `schemaCache.prefetchOnConnect` | 连接时预取 | `true` |

#### 7. 查询执行

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `query.maxRows` | 最大行数 | `1000` |
| `query.timeout` | 查询超时（毫秒） | `30000` |
| `query.pageSize` | 分页大小 | `100` |
| `query.nullPlaceholder` | NULL 占位符 | `(NULL)` |

#### 8. 安全守卫

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `safetyGuard.level` | 安全级别（strict/moderate/off） | `moderate` |

#### 9. 执行引擎

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `execution.batchMode` | 批量模式（sequential/transaction） | `sequential` |
| `execution.onError` | 错误处理（stop/continue） | `stop` |
| `execution.saveProgress` | 保存进度 | `true` |
| `execution.cancelRetries` | 取消重试次数 | `3` |
| `execution.cancelRetryDelay` | 取消重试延迟（ms） | `500` |

#### 10. 导出

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `export.defaultFormat` | 默认导出格式 | `csv` |
| `export.csvDelimiter` | CSV 分隔符 | `,` |
| `export.csvEncoding` | CSV 编码 | `utf-8` |
| `export.includeHeaders` | 包含表头 | `true` |

#### 11. 数据编辑器

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `dataEditor.editMode` | 编辑模式（readonly/editable） | `readonly` |
| `dataEditor.autoCommit` | 自动提交 | `true` |
| `dataEditor.defaultView` | 默认视图（grid/form） | `grid` |
| `dataEditor.optimisticLocking` | 乐观锁 | `false` |
| `dataEditor.maxBlobPreviewSize` | BLOB 预览最大大小（字节） | `5242880` |
| `dataEditor.blobTextPreviewSize` | BLOB 文本预览大小（字节） | `1048576` |
| `dataEditor.longTransactionWarning` | 长事务警告阈值（秒） | `300` |
| `dataEditor.showTransactionStatus` | 显示事务状态 | `true` |
| `dataEditor.enableValidation` | 启用验证 | `true` |
| `dataEditor.validateOnEdit` | 编辑时验证 | `true` |
| `dataEditor.validateForeignKeys` | 外键验证 | `false` |

#### 12. 结果面板

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `results.enablePreload` | 启用滚动预加载 | `true` |
| `results.jsonPrettyPrint` | JSON 美化输出 | `true` |
| `results.dateFormat` | 日期格式（local/utc/relative） | `local` |
| `results.longTextThreshold` | 长文本截断阈值 | `200` |

#### 13. 历史记录

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `history.maxEntries` | 最大历史条目数 | `500` |

#### 14. 注释

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `enableSmartCommentToggle` | 智能注释切换 | `true` |
| `headerAuthor` | 文件头作者 | `""` |
| `headerModifier` | 文件头修改人 | `""` |

---

### 反馈与贡献

如有问题或建议，欢迎在 [GitHub Issues](https://github.com/BryceQin/SQL-All-in-One/issues) 反馈。

### 更新日志

请查看 [CHANGELOG.md](CHANGELOG.md) 了解详细的版本更新历史。

### 许可证

MIT License

---

## English

**SQL All in One** is a comprehensive SQL development toolkit VSCode extension that integrates database connection management, query execution, data import/export, table designer, execution plans, database explorer, SQL formatting, smart completion, syntax checking, lint rules, quick fixes, code navigation, DDL conversion, comment enhancement, hover information, code folding, visual config editor, and more.

| | |
|---|---|
| **Publisher** | bryce-qin |
| **Version** | 2.15.18 |
| **License** | MIT |
| **Repository** | [GitHub](https://github.com/BryceQin/SQL-All-in-One) |
| **VSCode Engine** | ^1.85.0 |
| **Categories** | Formatters, Snippets, Other, Databases |

### Supported SQL Dialects (8)

| Language ID | Aliases | Extensions |
|------------|---------|------------|
| `sql` | SQL | `.sql` |
| `hive` | Hive, hive-sql | `.hql` |
| `mysql` | MySQL | `.mysql` |
| `spark` | SparkSQL, spark | `.sparksql` |
| `flinksql` | FlinkSQL, flink-sql | `.flinksql` |
| `postgresql` | PostgreSQL, postgres | `.psql`, `.pgsql` |
| `bigquery` | BigQuery | `.bqsql` |
| `sqlite` | SQLite | `.sqlite`, `.sqlt` |

---

### Quick Start

1. After installing, open any `.sql`, `.hql`, `.mysql` or other SQL files
2. Use `Shift+Alt+F` (Windows/Linux) or `Shift+Option+F` (Mac) to format
3. Or right-click and select "Format Document"
4. Or use Command Palette: "Format Selection (SQL All in One)"
5. Click the database icon in the sidebar to add a connection, then execute queries and browse schema

---

### Core Features

#### 1. Database Connection & Management

- MySQL database connection with connection pool, SSL support, SSH tunnel
- Graphical connection dialog (new in v2.1, replaced step-by-step input boxes)
- Connection lifecycle management (add/edit/remove/connect/disconnect)
- Connection pool with health check, idle check, auto-reconnect
- Auto-retry with exponential backoff (max 3 retries)
- Active connection management (single active connection mode)
- SecretStorage for password security
- Connection import/export (with password protection)

#### 2. Query Execution & Results

- Execute SQL (`Ctrl+Shift+E` / `Cmd+Shift+E`) and Execute Selected SQL (`Ctrl+Shift+R` / `Cmd+Shift+R`)
- Query timeout control (configurable)
- Query cancellation support (CancellationToken + KILL QUERY)
- Max rows limit
- **Query Data Panel (new in v2.12)**: integrated Monaco SQL editor, write and execute SQL directly in the result panel
- Draggable split panel: SQL editor and query results in vertical split layout, adjustable ratio
- Monaco editor: SQL syntax highlighting, IntelliSense, code folding, auto-follows VS Code theme
- **Monaco Language Features (new in v2.14)**: dialect-aware syntax highlighting, smart completion, hover info, SQL formatting, lint diagnostics
- Dialect-aware Monarch syntax highlighting: 8 SQL dialect tokenizers, keywords/data types/functions colored separately
- Static completion (zero latency): keywords, 580+ function signatures (with parameter snippets), data types, code snippets
- Function signature help: shows parameter signatures on `(` or `,`, auto-highlights current parameter
- Schema-aware completion: triggered by `.` or space, queries database schema for table/column names
- Hover information: hover over functions, keywords, schema objects to show signatures, descriptions, table structure
- SQL formatting: `Shift+Alt+F` / `Cmd+Shift+I` shortcut to format SQL
- SQL lint diagnostics: auto-check on edit, shows squiggly warnings
- Auto dialect switch on connection change
- Click table/view node in Database Explorer auto-generates `SELECT * FROM table LIMIT 200` and executes it
- Result panel with pagination, scroll preloading
- Grid view and form view
- JSON pretty print in results
- Date format display (local/utc/relative)
- Long text truncation with threshold
- NULL value placeholder display
- Batch execution mode (sequential/transaction)
- Error handling strategy (stop/continue)
- Batch execution progress saving

#### 3. Data Import & Export

- Export to CSV (configurable delimiter, encoding, include headers)
- Export to JSON
- Export to SQL INSERT statements
- Export table DDL
- Import data from files
- Default export format configuration

#### 4. Table Designer

- Visual table design/edit
- Column definition with types, constraints, comments
- Data editor with readonly/editable modes
- Auto commit mode
- Optimistic locking for concurrent editing
- BLOB preview (with size limit and MIME type whitelist)
- Data validation (real-time, foreign key validation optional)
- Transaction status display
- Long transaction warning

#### 5. Execution Plan

- `EXPLAIN FORMAT=JSON` visualization
- Visual execution plan panel

#### 6. Database Explorer (Sidebar)

- Tree view of databases, tables, views, columns, functions, procedures, triggers
- View table data, view DDL
- Copy column name
- Add/remove favorites
- Set default database
- Schema cache with configurable TTL (database/table/column/function)
- Schema auto-refresh on DDL changes
- Schema prefetch on connect

#### 7. SQL Formatting

AST-driven formatting engine based on node-sql-parser v5.x with 40+ configurable options:

**Case Control**

| Option | Description | Default |
|--------|-------------|---------|
| `keywordCase` | Keyword case (preserve/upper/lower) | `preserve` |
| `dataTypeCase` | Data type case (preserve/upper/lower) | `preserve` |
| `functionCase` | Function name case (preserve/upper/lower) | `preserve` |
| `identifierCase` | Identifier case (preserve/upper/lower) | `preserve` |
| `nullCase` | NULL case (preserve/upper/lower) | `preserve` |
| `booleanCase` | Boolean case (preserve/upper/lower) | `preserve` |

**Indent Control**

| Option | Description | Default |
|--------|-------------|---------|
| `indentStyle` | Indent style (standard/tabularLeft/tabularRight) | `standard` |
| `tabWidth` | Indent width | `2` |
| `useTabs` | Use tab indentation | `false` |

**Newline Control** (25+ options)

Newline strategies for SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, JOIN, ON, USING, WITH, CTE, CASE/WHEN/THEN/ELSE, IN, set operations, Lateral View, DISTRIBUTE BY, CLUSTER BY, SORT BY, INSERT columns/values can all be configured independently.

**Alignment Control**

| Option | Description | Default |
|--------|-------------|---------|
| `alignColumnDefinitions` | Align column definitions | `false` |
| `alignWhereClauses` | Align WHERE conditions | `false` |
| `alignCaseStatements` | Align CASE statements | `false` |
| `alignOnClauses` | Align ON conditions | `false` |
| `alignInsertColumns` | Align INSERT columns | `false` |
| `alignInsertValuesGroups` | Align INSERT value groups | `false` |
| `tabulateAlias` | Tabulate aliases | `false` |

**Spacing & Other**

| Option | Description | Default |
|--------|-------------|---------|
| `denseOperators` | Remove spaces around operators | `false` |
| `spaceBeforeComma` | Space before comma | `false` |
| `spaceInsideParentheses` | Space inside parentheses | `false` |
| `expressionWidth` | Expression wrap character threshold | `50` |
| `linesBetweenQueries` | Blank lines between queries | `1` |
| `newlineBeforeSemicolon` | Newline before semicolon | `false` |
| `commaPosition` | Comma position (after/before) | `after` |
| `singleLineMaxLength` | Single line max length | - |
| `trimTrailingSpaces` | Trim trailing spaces | `true` |
| `semicolonAtEnd` | Semicolon at end | `true` |
| `commentPosition` | Comment position | - |
| `subqueryParenStyle` | Subquery paren style | - |
| `maxItemsInlineList` | Max items in inline list | - |
| `indentCteBody` | Indent CTE body | - |
| `cteCommaPosition` | CTE comma position | - |
| `newlineBetweenCtes` | Newline between CTEs | - |
| `indentJoinConditions` | Indent JOIN conditions | - |
| `indentWhen` | Indent WHEN | - |
| `indentThen` | Indent THEN | - |
| `blankLinesBeforeSetOperation` | Blank lines before set operation | - |
| `blankLinesAfterSetOperation` | Blank lines after set operation | - |

Also: Format Selection command, formatter cache (by dialect+config hash, max 50 instances)

**Formatting Example**

Before:

```sql
select id,name,email from users where age>18 and status='active' order by created_at desc limit 10;
```

After (standard style):

```sql
SELECT
    id,
    name,
    email
FROM users
WHERE
    age > 18
    AND status = 'active'
ORDER BY created_at DESC
LIMIT 10;
```

#### 8. Smart Completion (IntelliSense)

7 completion types, each independently toggleable:

| Type | Description | Example |
|------|-------------|---------|
| **Schema Completion** | Table/column names from connected database (with debounce) | Type table prefix → suggest table and columns |
| **Keyword Completion** | Dialect-specific keywords and data types | `SEL` → `SELECT` |
| **Function Completion** | 580+ function signatures with params, return type, Chinese description, category tags | `SUB` → `SUBSTR(string, start, length)` |
| **Snippet Completion** | Dialect-specific code snippets | `sel` → insert SELECT template |
| **CTE Name Completion** | CTE names defined in WITH clause | `WITH cte AS (...) SELECT` → suggests `cte` |
| **Identifier Completion** | Context-aware table/column suggestions | FROM clause suggests table names |
| **Comment Template Completion** | header, todo, fixme, hack, desc, section, col, tbl | `header` → insert file header comment |

#### 9. Syntax Checking & Diagnostics

- Debounced diagnostics (300ms) with CancellationToken support
- Two-layer checking: AST diagnostics + Lint diagnostics
- Severity level filtering (Error/Warning/Info)

**Syntax Error Checks**

- HAVING without GROUP BY
- LIMIT without value
- JOIN without ON
- Misplaced DISTINCT
- Aggregate in WHERE
- Wildcard in UPDATE
- Incomplete CASE
- Mismatched parentheses
- Unclosed strings
- Duplicate column aliases

**Code Quality Suggestions**

- Duplicate table aliases
- Reserved words as identifiers
- SELECT without FROM
- INSERT without column names
- Redundant DISTINCT
- Subquery without alias
- Suspicious NULL comparison

**Dialect Hints**

- MySQL date function differences in Hive

#### 10. SQL Lint (30 Rules)

Each rule supports `enabled` / `severity` configuration:

| Rule ID | Description | Default Enabled | Default Level |
|---------|-------------|----------------|---------------|
| `avoid_select_star` | Avoid SELECT * | ✅ | Warning |
| `explicit_join_type` | Explicit JOIN type | ✅ | Info |
| `limit_with_order_by` | LIMIT should pair with ORDER BY | ✅ | Warning |
| `avoid_column_count_mismatch` | INSERT column/value count mismatch | ✅ | Error |
| `missing_primary_key` | CREATE TABLE missing primary key | ✅ | Warning |
| `use_current_timestamp` | Use CURRENT_TIMESTAMP | ✅ | Info |
| `avoid_select_in_insert` | Avoid SELECT in INSERT | ✅ | Warning |
| `duplicate_column_aliases` | Duplicate column aliases | ✅ | Warning |
| `use_coalesce_over_isnull` | Use COALESCE over ISNULL | ❌ | Info |
| `avoid_correlated_subqueries` | Avoid correlated subqueries | ❌ | Warning |
| `long_query_line` | Long query line | ❌ | Info |
| `explicit_column_aliasing` | Explicit column aliasing (use AS) | ❌ | Info |
| `uppercase_keywords` | Uppercase keywords | ❌ | Info |
| `missing_query_comment` | Complex queries missing comments | ✅ | Warning |
| `missing_column_comment` | DDL columns missing COMMENT | ✅ | Warning |
| `commented_out_code` | Commented-out code | ✅ | Info |
| `expired_todo` | Expired TODO/FIXME | ✅ | Info |
| `having_without_group_by` | HAVING without GROUP BY | ✅ | Error |
| `limit_invalid_value` | Invalid LIMIT value | ✅ | Error |
| `reserved_word_identifier` | Reserved word as identifier | ✅ | Warning |
| `join_missing_on` | JOIN missing ON | ✅ | Error |
| `select_without_from` | SELECT without FROM | ✅ | Warning |
| `misplaced_distinct` | Misplaced DISTINCT | ✅ | Error |
| `aggregate_in_where` | Aggregate in WHERE | ✅ | Error |
| `subquery_without_alias` | Subquery without alias | ✅ | Warning |
| `suspicious_null_comparison` | Suspicious NULL comparison | ✅ | Warning |
| `incomplete_case` | Incomplete CASE | ✅ | Error |
| `redundant_distinct` | Redundant DISTINCT | ✅ | Warning |
| `date_function_usage` | Date function usage hints | ✅ | Info |
| `wildcard_in_update` | Wildcard in UPDATE | ✅ | Error |

Some rules support sub-options:

- `missing_query_comment`: `thresholdLineCount`, `thresholdJoinCount`, `thresholdSubqueryCount`
- `missing_column_comment`: `aggregate`, `externalTableExempt`
- `commented_out_code`: `thresholdLines`
- `expired_todo`: `gracePeriodDays`

#### 11. Quick Fix

- `= NULL` → `IS NULL`
- `!= NULL` / `<> NULL` → `IS NOT NULL`
- Wrap reserved word aliases with backticks
- Add alias to subqueries
- Add column name placeholders for INSERT
- Add GROUP BY for HAVING

#### 12. Code Navigation

| Feature | Shortcut | Description |
|---------|----------|-------------|
| Go to Definition | `F12` | CTE, table alias, column alias |
| Find All References | `Shift+F12` | Find symbol references |
| Rename Symbol | `F2` | With reserved word/conflict checks |
| Breadcrumb Navigation | - | Clause-level (SELECT/FROM/WHERE/GROUP BY/HAVING/ORDER BY) |

Shared AstNavigator navigation engine.

#### 13. DDL Conversion

- AST-based MySQL ↔ Hive CREATE TABLE conversion
- Data type mapping
- Table option filtering
- Column attribute stripping
- Constraint filtering

#### 14. Comment Enhancement

**Smart Comment Toggle**

| Shortcut | Function |
|----------|----------|
| `Ctrl+/` / `Cmd+/` | Smart toggle: single line → line comment, multi-line → block comment |
| `Ctrl+Shift+/` / `Cmd+Shift+/` | Advanced: format-disable markers, DDL COMMENT, block comment |

**Comment Template Completion**

| Prefix | Description |
|--------|-------------|
| `header` | File header comment (auto author, auto table dependencies) |
| `col` | Column COMMENT |
| `tbl` | Table COMMENT |
| `todo` | TODO comment |
| `fixme` | FIXME comment |
| `hack` | HACK comment |
| `desc` | Query description comment |
| `section` | Section divider comment |

**Comment Lint Rules**: `missing_query_comment`, `missing_column_comment`, `commented_out_code`, `expired_todo`

#### 15. Hover Information

4-layer resolver chain:

1. Parameter hover
2. Function signature hover
3. Schema hover (from connected database)
4. Keyword hover

#### 16. Code Folding & Outline

- Fold CTE, subquery, function blocks
- Document outline for quick navigation

#### 17. Visual Config Editor

- Graphical configuration interface
- Collapsible groups, toggle switches
- Live format preview
- Drag-to-resize preview area
- Quick presets (Default, Hive, MySQL, Compact)
- Save config button

#### 18. Status Bar

- Shows current SQL dialect
- Quick access to config editor
- Only shown in SQL files

#### 19. Parameterized Queries

- Variable highlighting
- Batch parameter replacement (`Ctrl+Alt+P` / `Cmd+Alt+P`)
- JDBC `:?` parameter support
- Regex injection protection

#### 20. Query History

- History of executed queries
- Configurable max entries (default 500)
- Show/clear history commands

#### 21. Safety Guard

- Dangerous SQL interception
- 3 levels: strict (all rules), moderate (confirmation-level only), off
- Prevents accidental DROP, TRUNCATE, DELETE without WHERE, etc.

#### 22. i18n

- Chinese (zh) and English (en)
- Auto-follows VSCode language setting
- `displayLanguage` config: auto/zh/en

#### 23. Code Snippets

**Common SQL**

| Prefix | Description |
|--------|-------------|
| `sel` | Basic SELECT |
| `seld` | SELECT DISTINCT |
| `join` | JOIN query |
| `leftjoin` | LEFT JOIN query |
| `groupby` | GROUP BY with aggregation |
| `case` | CASE WHEN |
| `insert` | INSERT INTO |
| `insertsel` | INSERT ... SELECT |
| `update` | UPDATE |
| `delete` | DELETE |
| `ct` | CREATE TABLE |
| `ctas` | CREATE TABLE AS SELECT |
| `with` | WITH CTE |
| `union` | UNION ALL |

**Hive**

| Prefix | Description |
|--------|-------------|
| `hivepart` | Hive partition insert |
| `hiveselpart` | Hive partition query |
| `hiveext` | Hive external table |

**FlinkSQL**

| Prefix | Description |
|--------|-------------|
| `flinkkafka` | Kafka table DDL |
| `flinkjdbc` | JDBC table DDL |
| `flinktumble` | Tumbling window |
| `flinkhop` | Hopping window |
| `flinkcumulate` | Cumulative window |
| `flinkwatermark` | Watermark definition |
| `flinktemporal` | Temporal join |
| `flinkdedup` | Dedup query |

**Comments**

| Prefix | Description |
|--------|-------------|
| `header` | File header comment |
| `todo` | TODO comment |
| `fixme` | FIXME comment |
| `hack` | HACK comment |
| `desc` | Query description comment |
| `section` | Section divider comment |
| `col` | Column COMMENT |
| `tbl` | Table COMMENT |

---

### Keyboard Shortcuts

| Command | Windows/Linux | Mac |
|---------|--------------|-----|
| Replace Parameter | `Ctrl+Alt+P` | `Cmd+Alt+P` |
| Toggle Comment | `Ctrl+/` | `Cmd+/` |
| Advanced Comment | `Ctrl+Shift+/` | `Cmd+Shift+/` |
| Execute SQL | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| Execute Selected SQL | `Ctrl+Shift+R` | `Cmd+Shift+R` |
| Format Document | `Shift+Alt+F` | `Shift+Option+F` |

---

### Extension Settings

Search "SQL All in One" in VS Code settings to configure 80+ settings organized into the following categories:

#### 1. Language & Dialect

| Setting | Description | Default |
|---------|-------------|---------|
| `dialect` | SQL dialect (auto-detect/hive/mysql/spark/flinksql/sql/postgresql/bigquery/sqlite) | `hive` |
| `displayLanguage` | UI language (auto/zh/en) | `auto` |

#### 2. Formatting (40+ options)

See the case, indent, newline, alignment, and spacing tables in the [SQL Formatting](#7-sql-formatting) section.

#### 3. Lint Rules (30 rules)

See the [SQL Lint](#10-sql-lint-30-rules) section. Each rule supports `enabled` + `severity` configuration, with some rules supporting sub-options.

#### 4. Feature Toggles

| Setting | Description | Default |
|---------|-------------|---------|
| `enableLinter` | Enable linting | `true` |
| `enableCodeFolding` | Enable code folding | `true` |
| `enableOutlineView` | Enable outline view | `true` |
| `enableStatusBar` | Enable status bar | `true` |
| `enableParameterHighlight` | Enable parameter highlighting | `true` |
| `enableSnippets` | Enable code snippets | `true` |
| `enableQuickFix` | Enable quick fix | `true` |
| `enableHover` | Enable hover information | `true` |
| `enableNavigation` | Enable code navigation | `true` |
| `enableCompletion` | Enable smart completion | `true` |

#### 5. Completion

| Setting | Description | Default |
|---------|-------------|---------|
| `completion.keywords` | Keyword completion | `true` |
| `completion.functions` | Function completion | `true` |
| `completion.snippets` | Snippet completion | `false` |
| `completion.cteNames` | CTE name completion | `true` |
| `completion.identifiers` | Identifier completion | `true` |
| `completion.commentSnippets` | Comment template completion | `true` |
| `completion.schema` | Schema-aware completion | `true` |

#### 6. Schema Cache

| Setting | Description | Default |
|---------|-------------|---------|
| `schemaCache.databaseTtl` | Database cache TTL (seconds) | `600` |
| `schemaCache.tableTtl` | Table cache TTL (seconds) | `300` |
| `schemaCache.columnTtl` | Column cache TTL (seconds) | `120` |
| `schemaCache.functionTtl` | Function cache TTL (seconds) | `600` |
| `schemaCache.refreshOnDDL` | Refresh on DDL changes | `true` |
| `schemaCache.prefetchOnConnect` | Prefetch on connect | `true` |

#### 7. Query Execution

| Setting | Description | Default |
|---------|-------------|---------|
| `query.maxRows` | Max rows | `1000` |
| `query.timeout` | Query timeout (ms) | `30000` |
| `query.pageSize` | Page size | `100` |
| `query.nullPlaceholder` | NULL placeholder | `(NULL)` |

#### 8. Safety Guard

| Setting | Description | Default |
|---------|-------------|---------|
| `safetyGuard.level` | Safety level (strict/moderate/off) | `moderate` |

#### 9. Execution Engine

| Setting | Description | Default |
|---------|-------------|---------|
| `execution.batchMode` | Batch mode (sequential/transaction) | `sequential` |
| `execution.onError` | Error handling (stop/continue) | `stop` |
| `execution.saveProgress` | Save progress | `true` |
| `execution.cancelRetries` | Cancel retries | `3` |
| `execution.cancelRetryDelay` | Cancel retry delay (ms) | `500` |

#### 10. Export

| Setting | Description | Default |
|---------|-------------|---------|
| `export.defaultFormat` | Default export format | `csv` |
| `export.csvDelimiter` | CSV delimiter | `,` |
| `export.csvEncoding` | CSV encoding | `utf-8` |
| `export.includeHeaders` | Include headers | `true` |

#### 11. Data Editor

| Setting | Description | Default |
|---------|-------------|---------|
| `dataEditor.editMode` | Edit mode (readonly/editable) | `readonly` |
| `dataEditor.autoCommit` | Auto commit | `true` |
| `dataEditor.defaultView` | Default view (grid/form) | `grid` |
| `dataEditor.optimisticLocking` | Optimistic locking | `false` |
| `dataEditor.maxBlobPreviewSize` | Max BLOB preview size (bytes) | `5242880` |
| `dataEditor.blobTextPreviewSize` | BLOB text preview size (bytes) | `1048576` |
| `dataEditor.longTransactionWarning` | Long transaction warning threshold (seconds) | `300` |
| `dataEditor.showTransactionStatus` | Show transaction status | `true` |
| `dataEditor.enableValidation` | Enable validation | `true` |
| `dataEditor.validateOnEdit` | Validate on edit | `true` |
| `dataEditor.validateForeignKeys` | Foreign key validation | `false` |

#### 12. Results Panel

| Setting | Description | Default |
|---------|-------------|---------|
| `results.enablePreload` | Enable scroll preloading | `true` |
| `results.jsonPrettyPrint` | JSON pretty print | `true` |
| `results.dateFormat` | Date format (local/utc/relative) | `local` |
| `results.longTextThreshold` | Long text truncation threshold | `200` |

#### 13. History

| Setting | Description | Default |
|---------|-------------|---------|
| `history.maxEntries` | Max history entries | `500` |

#### 14. Comment

| Setting | Description | Default |
|---------|-------------|---------|
| `enableSmartCommentToggle` | Smart comment toggle | `true` |
| `headerAuthor` | File header author | `""` |
| `headerModifier` | File header modifier | `""` |

---

### Feedback & Contributions

If you have questions or suggestions, please open an issue on [GitHub Issues](https://github.com/BryceQin/SQL-All-in-One/issues).

### Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

### License

MIT License
