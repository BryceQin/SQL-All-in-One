# SQL All in One

<p align="center">
  <img src="sql-all-in-one-icon.png" width="120" height="120" alt="SQL All in One Logo">
</p>

<p align="center">
  <strong>强大的 SQL 格式化、智能补全、语法检查、DDL 转换 VSCode 插件</strong><br>
  支持 Hive、MySQL、SparkSQL、FlinkSQL、PostgreSQL、BigQuery、SQLite、StarRocks、SQL Server、Oracle、达梦 等多种 SQL 方言
</p>

<p align="center">
  <a href="https://github.com/BryceQin/SQL-All-in-One">仓库</a> ·
  <a href="https://github.com/BryceQin/SQL-All-in-One/issues">问题反馈</a> ·
  <a href="CHANGELOG.md">更新日志</a>
</p>

---

[中文](#中文) | [English](#english)

---

## 中文

### 概览

**SQL All in One** 是一款面向 SQL 开发者的全方位 VSCode 扩展，将数据库连接管理、SQL 执行、数据编辑、表设计、执行计划、格式化、智能补全、语法检查、代码导航、DDL 转换等功能集成于一体，覆盖 SQL 开发的完整工作流。

|                 |                                                      |
| --------------- | ---------------------------------------------------- |
| **发布者**      | bryce-qin                                            |
| **版本**        | 2.33.0                                               |
| **许可证**      | MIT                                                  |
| **VSCode 引擎** | ^1.85.0                                              |
| **仓库**        | [GitHub](https://github.com/BryceQin/SQL-All-in-One) |

### 主要特性

- **12 种 SQL 方言**：Hive、MySQL、SparkSQL、FlinkSQL、PostgreSQL、BigQuery、SQLite、StarRocks、SQL Server、Oracle、达梦、标准 SQL
- **8 种数据库直连**：MySQL、PostgreSQL、SQLite、StarRocks、SQL Server、Oracle、达梦（含 SSH 隧道与 SSL）
- **AST 驱动格式化**：40+ 可配置选项，支持不完整 SQL 智能格式化
- **30 条 Lint 规则**：实时诊断，含快速修复
- **7 类智能补全**：关键字、580+ 函数、Schema 表/列、CTE、代码片段等
- **可视化工具链**：表设计器、执行计划、数据编辑器、查询结果面板
- **完整代码工具**：跳转定义、查找引用、重命名、折叠、大纲、悬停提示
- **中英双语**：自动跟随 VSCode 语言设置

### 支持的 SQL 方言（12 种）

| Language ID  | 别名                 | 扩展名              |
| ------------ | -------------------- | ------------------- |
| `sql`        | SQL                  | `.sql`              |
| `hive`       | Hive, hive-sql       | `.hql`              |
| `mysql`      | MySQL                | `.mysql`            |
| `spark`      | SparkSQL, spark      | `.sparksql`         |
| `flinksql`   | FlinkSQL, flink-sql  | `.flinksql`         |
| `postgresql` | PostgreSQL, postgres | `.psql`, `.pgsql`   |
| `bigquery`   | BigQuery             | `.bqsql`            |
| `sqlite`     | SQLite               | `.sqlite`, `.sqlt`  |
| `starrocks`  | StarRocks            | `.starrocks`        |
| `sqlserver`  | SQL Server, mssql    | `.sqlserver`        |
| `plsql`      | Oracle, PL/SQL       | `.plsql`, `.oracle` |
| `dameng`     | 达梦, DM             | `.dameng`, `.dm`    |

### 使用场景

- **数据工程师**：编写 Hive/Spark/FlinkSQL ETL 脚本，需要规范化格式、检查语法、转换 MySQL DDL 到 Hive
- **后端开发者**：在 VSCode 中直接连接 MySQL/PostgreSQL 执行查询、编辑数据、设计表结构
- **DBA**：浏览数据库 Schema、查看函数/存储过程/触发器定义、导出表 DDL
- **数据分析师**：执行查询、分页查看结果、导出 CSV/JSON 供下游使用
- **SQL 学习者**：通过悬停提示、Lint 建议、补全签名了解 SQL 函数用法与最佳实践

### 安装

#### 方式一：VSCode 扩展市场（推荐）

1. 打开 VSCode
2. 按 `Ctrl+Shift+X`（Windows）或 `Cmd+Shift+X`（Mac）打开扩展面板
3. 搜索 `SQL All in One`
4. 点击「安装」

#### 方式二：VSIX 离线安装

1. 从 [GitHub Releases](https://github.com/BryceQin/SQL-All-in-One/releases) 下载 `hive-formatter-{version}.vsix`
2. 在 VSCode 扩展面板点击 `...` → `从 VSIX 安装`
3. 或命令行执行：`code --install-extension hive-formatter-{version}.vsix`

#### 系统要求

- VSCode 1.85.0 或更高版本
- 连接达梦数据库时需安装 DM8 ODBC 驱动及 C++ 编译环境（详见下方达梦章节）

### 快速开始

#### 1. 格式化 SQL

打开任意 `.sql` / `.hql` / `.mysql` 文件，使用以下任一方式：

- 按 `Shift+Alt+F`（Windows）或 `Shift+Option+F`（Mac）格式化整个文档
- 选中部分 SQL，按 `Ctrl+Shift+P` → 搜索 `Format Selection (SQL All in One)`
- 右键编辑器 → 选择「格式化文档」

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

#### 2. 连接数据库

1. 点击活动栏的数据库图标，打开「Database Explorer」侧边栏
2. 点击 `+` 按钮添加连接
3. 在弹出的对话框中选择数据库类型，填写主机、端口、用户名、密码等信息
4. 点击「测试连接」验证，再点击「连接」保存

#### 3. 执行查询

1. 在数据库浏览器中右键数据库或表，选择「New Query」
2. 在 SQL 编辑器中输入查询语句
3. 按 `Ctrl+Shift+E`（Mac: `Cmd+Shift+E`）执行全部 SQL
4. 或选中部分 SQL，按 `Ctrl+Shift+R`（Mac: `Cmd+Shift+R`）执行选中部分
5. 在弹出的查询结果面板中查看数据，支持分页、网格/表单视图切换、导出

#### 4. 配置插件

- **设置界面**：VSCode 设置 → 搜索 `SQL All in One` → 调整 80+ 配置项
- **可视化配置编辑器**：`Ctrl+Shift+P` → 搜索 `SQL All in One Config`，打开图形化配置面板，支持实时预览与快速预设

### 核心功能详解

#### 1. 数据库连接与管理

支持 8 种数据库连接，统一的管理界面：

| 数据库     | 驱动           | 特性                                   |
| ---------- | -------------- | -------------------------------------- |
| MySQL      | mysql2         | 连接池、SSL、SSH 隧道、流式查询        |
| PostgreSQL | pg             | 连接池、SSL、SSH 隧道、查询取消        |
| SQLite     | better-sqlite3 | 文件路径、WAL 模式、查询中断           |
| StarRocks  | mysql2         | MySQL 协议、OLAP DDL、物化视图         |
| SQL Server | mssql          | T-SQL、Windows 身份验证、FOR XML/JSON  |
| Oracle     | oracledb 6.x   | thin/thick 模式、PL/SQL、DBMS_METADATA |
| 达梦 DM8   | odbc           | ODBC 桥接、Oracle 兼容语法             |
| SSH 隧道   | ssh2           | 适用于所有支持 SSL 的数据库            |

**通用特性**：

- 图形化连接对话框（替代逐步输入框）
- 连接生命周期管理（添加/编辑/删除/连接/断开）
- 连接池健康检查、空闲检查、自动重连
- 自动重试，指数退避（最多 3 次）
- 活动连接管理（单活动连接模式）
- SecretStorage 密码安全存储
- 连接导入/导出（支持密码保护）

#### 2. SQL 查询执行与结果面板

**执行控制**：

| 命令                 | 快捷键                         | 说明                   |
| -------------------- | ------------------------------ | ---------------------- |
| Execute SQL          | `Ctrl+Shift+E` / `Cmd+Shift+E` | 执行编辑器中的全部 SQL |
| Execute Selected SQL | `Ctrl+Shift+R` / `Cmd+Shift+R` | 仅执行选中部分         |
| Cancel Running Query | -                              | 取消正在执行的查询     |

**查询结果面板**（集成 Monaco 编辑器）：

- 上下分栏布局：上方 SQL 编辑器，下方查询结果，比例可拖拽调整
- Monaco 编辑器：SQL 语法高亮、智能提示、代码折叠，自动跟随 VSCode 主题
- 方言化 Monarch 语法高亮：12 种方言独立 tokenizer
- 静态补全：关键字、580+ 函数签名（含参数 Snippet）、数据类型
- Schema 感知补全：输入 `.` 或空格触发，查询数据库 Schema 返回表名/列名
- 函数签名提示：输入 `(` 或 `,` 显示参数签名，自动高亮当前参数
- 悬停提示：函数签名、关键字说明、表结构
- Lint 诊断：编辑后自动检查，显示波浪线警告
- 从数据库浏览器点击表/视图节点，自动生成 `SELECT * FROM table LIMIT 200` 并执行

**结果展示**：

- 分页与滚动预加载
- 网格视图和表单视图切换
- JSON 美化输出
- 日期格式显示（本地 / UTC / 相对时间）
- 长文本截断（可配置阈值）
- NULL 值占位符显示
- 批量执行模式（顺序 / 事务）
- 错误处理策略（停止 / 继续）
- 进度保存

#### 3. 数据导入与导出

| 操作         | 格式       | 说明                     |
| ------------ | ---------- | ------------------------ |
| 导出查询结果 | CSV        | 可配置分隔符、编码、表头 |
| 导出查询结果 | JSON       | 支持美化输出             |
| 导出查询结果 | SQL INSERT | 生成 INSERT 语句         |
| 导出表 DDL   | DDL        | 完整建表语句             |
| 从文件导入   | CSV / JSON | 批量导入数据             |

#### 4. 表设计器

- 可视化表设计/编辑
- 列定义：类型、约束、注释
- 数据编辑器：只读 / 可编辑模式
- 自动提交模式
- 乐观锁并发编辑
- BLOB 预览（大小限制 + MIME 类型白名单）
- 数据验证（实时验证，外键验证可选）
- 事务状态显示
- 长事务警告

#### 5. 执行计划

- 支持 `EXPLAIN FORMAT=JSON` 可视化
- 树形结构展示执行计划
- 节点详情：操作类型、估算成本、行数、扫描类型
- 各方言适配：
    - MySQL：`EXPLAIN FORMAT=JSON`
    - PostgreSQL：`EXPLAIN (FORMAT JSON)`
    - SQL Server：`SET SHOWPLAN_XML ON`
    - Oracle：`EXPLAIN PLAN FOR` + `DBMS_XPLAN.DISPLAY`

#### 6. 数据库浏览器（侧边栏）

树形视图组织数据库对象：

```
🔗 连接名称
├── 📁 database_1
│   ├── 📊 表
│   │   └── users
│   │       ├── id (INT, PK)
│   │       ├── name (VARCHAR)
│   │       └── email (VARCHAR)
│   ├── 👁️ 视图
│   ├── ⚡ 函数
│   ├── 📜 存储过程
│   └── 🔔 触发器
└── 📁 database_2
```

**操作**：

- 查看表数据（自动生成 `SELECT * FROM ... LIMIT 200`）
- 查看 DDL（表、视图、函数、存储过程、触发器定义代码）
- 编辑表设计
- 复制列名
- 添加/移除收藏
- 设置默认数据库
- Schema 缓存（可配置 TTL：数据库 / 表 / 列 / 函数）
- DDL 变更后自动刷新 Schema
- 连接时预取 Schema

#### 7. SQL 格式化

基于 node-sql-parser v5.x 的 AST 驱动格式化引擎，提供 40+ 可配置选项。**支持格式化不完整的 SQL**（v2.28 新增）：当 SQL 缺少 `GROUP BY`、未闭合 `)`、不完整的 `IN(...)`、缺少 `BETWEEN` 的第二个操作数等场景时，自动补全最小化语法 token 解析，格式化后再移除补全内容。

**大小写控制**

| 选项             | 说明                           | 默认值     |
| ---------------- | ------------------------------ | ---------- |
| `keywordCase`    | 关键字（preserve/upper/lower） | `preserve` |
| `dataTypeCase`   | 数据类型                       | `preserve` |
| `functionCase`   | 函数名                         | `preserve` |
| `identifierCase` | 标识符                         | `preserve` |
| `nullCase`       | NULL 关键字                    | `preserve` |
| `booleanCase`    | TRUE/FALSE                     | `preserve` |

**缩进控制**

| 选项                   | 说明                                      | 默认值     |
| ---------------------- | ----------------------------------------- | ---------- |
| `indentStyle`          | 风格（standard/tabularLeft/tabularRight） | `standard` |
| `tabSizeOverride`      | 缩进宽度                                  | `2`        |
| `insertSpacesOverride` | 使用空格缩进                              | `true`     |
| `ignoreTabSettings`    | 忽略 VSCode 全局缩进设置                  | `false`    |

**换行控制**（25+ 选项）

SELECT、FROM、WHERE、GROUP BY、HAVING、ORDER BY、LIMIT、JOIN、ON、USING、WITH、CTE、CASE/WHEN/THEN/ELSE、IN、集合运算、LATERAL VIEW、DISTRIBUTE BY、CLUSTER BY、SORT BY、INSERT 列/值等子句的换行策略均可独立配置。

**对齐控制**

| 选项                      | 说明             | 默认值  |
| ------------------------- | ---------------- | ------- |
| `alignColumnDefinitions`  | 对齐列定义       | `false` |
| `alignWhereClauses`       | 对齐 WHERE 条件  | `false` |
| `alignCaseStatements`     | 对齐 CASE 语句   | `false` |
| `alignOnClauses`          | 对齐 ON 条件     | `false` |
| `alignInsertColumns`      | 对齐 INSERT 列   | `false` |
| `alignInsertValuesGroups` | 对齐 INSERT 值组 | `false` |
| `tabulateAlias`           | 表格化别名       | `false` |

**间距与其他**

| 选项                           | 说明                                | 默认值     |
| ------------------------------ | ----------------------------------- | ---------- |
| `denseOperators`               | 去除运算符周围空格                  | `false`    |
| `spaceBeforeComma`             | 逗号前加空格                        | `false`    |
| `spaceInsideParentheses`       | 括号内加空格                        | `false`    |
| `expressionWidth`              | 表达式换行字符阈值                  | `50`       |
| `linesBetweenQueries`          | 查询间空行数                        | `1`        |
| `newlineBeforeSemicolon`       | 分号前换行                          | `false`    |
| `commaPosition`                | 逗号位置（after/before）            | `after`    |
| `singleLineMaxLength`          | 单行最大长度                        | `80`       |
| `trimTrailingSpaces`           | 去除行尾空格                        | `true`     |
| `semicolonAtEnd`               | 末尾加分号                          | `true`     |
| `commentPosition`              | 注释位置（preserve/newline/inline） | `preserve` |
| `subqueryParenStyle`           | 子查询括号风格（inline/newline）    | `inline`   |
| `maxItemsInlineList`           | 行内列表最大项数                    | `5`        |
| `indentCteBody`                | 缩进 CTE 主体                       | `true`     |
| `cteCommaPosition`             | CTE 逗号位置                        | `before`   |
| `newlineBetweenCtes`           | CTE 之间换行                        | `true`     |
| `indentJoinConditions`         | 缩进 JOIN 条件                      | `true`     |
| `indentWhen` / `indentThen`    | 缩进 WHEN / THEN                    | `true`     |
| `blankLinesBeforeSetOperation` | 集合运算前空行                      | `1`        |
| `blankLinesAfterSetOperation`  | 集合运算后空行                      | `0`        |

格式化器内置缓存（按方言 + 配置哈希，最多 50 实例），并支持格式化选中部分。

#### 8. 智能补全（IntelliSense）

7 种补全类型，每种可独立启用/禁用：

| 类型             | 说明                                  | 示例                                    |
| ---------------- | ------------------------------------- | --------------------------------------- |
| **Schema 补全**  | 来自已连接数据库的表名/列名           | 输入表名前缀 → 提示表名及列             |
| **关键字补全**   | 方言特定的关键字和数据类型            | `SEL` → `SELECT`                        |
| **函数补全**     | 580+ 函数签名，含参数、返回类型、描述 | `SUB` → `SUBSTR(string, start, length)` |
| **代码片段补全** | 方言特定的代码片段                    | `sel` → 插入 SELECT 模板                |
| **CTE 名称补全** | WITH 子句中定义的 CTE 名称            | `WITH cte AS (...) SELECT` → 提示 `cte` |
| **标识符补全**   | 基于上下文的表名/列名建议             | FROM 子句中提示表名                     |
| **注释模板补全** | header、todo、fixme 等                | `header` → 插入文件头注释               |

#### 9. 语法检查与诊断

- 防抖诊断（300ms），支持 CancellationToken
- 双层检查：AST 诊断 + Lint 诊断
- 严重级别过滤（Error / Warning / Info）

**语法错误检查**：HAVING 缺少 GROUP BY、LIMIT 缺少数值、JOIN 缺少 ON、DISTINCT 位置错误、WHERE 中使用聚合函数、UPDATE 中使用 `*`、不完整的 CASE 语句、括号不匹配、未闭合字符串、重复列别名

**代码质量建议**：重复表别名、保留字作为标识符、SELECT 缺少 FROM、INSERT 缺少列名、冗余 DISTINCT、子查询缺少别名、可疑的 NULL 比较

**方言提示**：MySQL 日期函数在 Hive 中的差异

#### 10. SQL Lint 规则（30 条）

每条规则支持 `enabled` + `severity` 配置：

| 规则 ID                       | 说明                      | 默认启用 | 默认级别 |
| ----------------------------- | ------------------------- | -------- | -------- |
| `avoid_select_star`           | 避免 SELECT *             | ✅       | Warning  |
| `explicit_join_type`          | 显式指定 JOIN 类型        | ✅       | Info     |
| `limit_with_order_by`         | LIMIT 应搭配 ORDER BY     | ✅       | Warning  |
| `avoid_column_count_mismatch` | INSERT 列数与值数不匹配   | ✅       | Error    |
| `missing_primary_key`         | CREATE TABLE 缺少主键     | ✅       | Warning  |
| `use_current_timestamp`       | 使用 CURRENT_TIMESTAMP    | ✅       | Info     |
| `avoid_select_in_insert`      | INSERT 中避免 SELECT      | ✅       | Warning  |
| `duplicate_column_aliases`    | 重复列别名                | ✅       | Warning  |
| `missing_query_comment`       | 复杂查询缺少注释          | ✅       | Warning  |
| `missing_column_comment`      | DDL 列缺少 COMMENT        | ✅       | Warning  |
| `commented_out_code`          | 注释掉的代码              | ✅       | Info     |
| `expired_todo`                | 过期的 TODO/FIXME         | ✅       | Info     |
| `having_without_group_by`     | HAVING 缺少 GROUP BY      | ✅       | Error    |
| `limit_invalid_value`         | LIMIT 值无效              | ✅       | Error    |
| `reserved_word_identifier`    | 保留字作为标识符          | ✅       | Warning  |
| `join_missing_on`             | JOIN 缺少 ON              | ✅       | Error    |
| `select_without_from`         | SELECT 缺少 FROM          | ✅       | Warning  |
| `misplaced_distinct`          | DISTINCT 位置错误         | ✅       | Error    |
| `aggregate_in_where`          | WHERE 中使用聚合函数      | ✅       | Error    |
| `subquery_without_alias`      | 子查询缺少别名            | ✅       | Warning  |
| `suspicious_null_comparison`  | 可疑的 NULL 比较          | ✅       | Warning  |
| `incomplete_case`             | 不完整的 CASE             | ✅       | Error    |
| `redundant_distinct`          | 冗余 DISTINCT             | ✅       | Warning  |
| `date_function_usage`         | 日期函数用法提示          | ✅       | Info     |
| `wildcard_in_update`          | UPDATE 中使用通配符       | ✅       | Error    |
| `implicit_cross_join`         | 隐式交叉连接              | ✅       | Warning  |
| `deprecated_function`         | 已弃用函数                | ✅       | Info     |
| `postgres_boolean_comparison` | PostgreSQL 布尔比较       | ✅       | Hint     |
| `use_coalesce_over_isnull`    | 使用 COALESCE 替代 ISNULL | ❌       | Info     |
| `avoid_correlated_subqueries` | 避免相关子查询            | ❌       | Warning  |
| `long_query_line`             | 长查询行                  | ❌       | Info     |
| `explicit_column_aliasing`    | 显式列别名                | ❌       | Info     |
| `uppercase_keywords`          | 关键字大写                | ❌       | Info     |
| `consistent_aliasing`         | 一致的别名                | ❌       | Info     |

部分规则支持子选项：

- `missing_query_comment`：`thresholdLineCount`、`thresholdJoinCount`、`thresholdSubqueryCount`
- `missing_column_comment`：`aggregate`、`externalTableExempt`
- `commented_out_code`：`thresholdLines`
- `expired_todo`：`gracePeriodDays`

#### 11. 快速修复

| 问题                  | 修复建议               |
| --------------------- | ---------------------- |
| `= NULL`              | 替换为 `IS NULL`       |
| `!= NULL` / `<> NULL` | 替换为 `IS NOT NULL`   |
| 保留字作为别名        | 添加反引号包裹         |
| 子查询缺少别名        | 自动添加 `AS subquery` |
| INSERT 缺少列名       | 添加列名占位符         |
| HAVING 缺少 GROUP BY  | 自动添加 GROUP BY      |

#### 12. 代码导航

| 功能         | 快捷键      | 说明                                                     |
| ------------ | ----------- | -------------------------------------------------------- |
| 跳转到定义   | `F12`       | CTE、表别名、列别名                                      |
| 查找所有引用 | `Shift+F12` | 符号引用查找                                             |
| 重命名符号   | `F2`        | 含保留字/冲突校验                                        |
| 面包屑导航   | -           | 子句级导航（SELECT/FROM/WHERE/GROUP BY/HAVING/ORDER BY） |

共享 AstNavigator 导航引擎。

#### 13. DDL 转换

基于 AST 的 MySQL ↔ Hive SQL 转换：

- 支持 CREATE TABLE、SELECT、INSERT、UPDATE、DELETE、CREATE VIEW 全语句类型
- 可插拔节点转换器架构：
    - 函数映射（NOW→CURRENT_TIMESTAMP、IFNULL→COALESCE、IF→CASE WHEN）
    - 类型映射（DATETIME↔TIMESTAMP、VARCHAR↔STRING）
    - 列属性剥离、表选项过滤、约束移除、Hive 子句移除
- AST 解析失败时交互式回退正则转换
- 复杂类型（ARRAY/MAP/STRUCT）转换时发出警告
- 入口：右键菜单 `MySQL to HiveSQL` / `HiveSQL to MySQL`，或命令面板

#### 14. 注释增强

**智能注释切换**

| 快捷键                         | 功能                                          |
| ------------------------------ | --------------------------------------------- |
| `Ctrl+/` / `Cmd+/`             | 智能切换：单行用行注释，多行用块注释          |
| `Ctrl+Shift+/` / `Cmd+Shift+/` | 高级注释：格式化禁用标记、DDL COMMENT、块注释 |

**注释模板补全**

| 前缀      | 说明                               |
| --------- | ---------------------------------- |
| `header`  | 文件头注释（自动作者、自动表依赖） |
| `col`     | 列 COMMENT                         |
| `tbl`     | 表 COMMENT                         |
| `todo`    | TODO 注释                          |
| `fixme`   | FIXME 注释                         |
| `hack`    | HACK 注释                          |
| `desc`    | 查询说明注释                       |
| `section` | 分区标题注释                       |

**注释 Lint 规则**：`missing_query_comment`、`missing_column_comment`、`commented_out_code`、`expired_todo`

#### 15. 悬停信息

4 层解析器链：

1. **参数悬停**：显示参数定义
2. **函数签名悬停**：函数参数、返回类型、用法说明
3. **Schema 悬停**：来自已连接数据库的表结构、列信息
4. **关键字悬停**：关键字用法说明

#### 16. 代码折叠与大纲

- 折叠 CTE、子查询、函数块、CASE 语句
- 文档大纲：快速定位 SELECT/FROM/WHERE 等子句

#### 17. 可视化配置编辑器

`Ctrl+Shift+P` → `SQL All in One Config` 打开：

- 图形化配置界面
- 可折叠分组、Toggle 开关
- 实时格式化预览
- 拖拽调整预览区大小
- 快速预设：默认、Hive、MySQL、紧凑
- 保存配置按钮

#### 18. 状态栏

- 显示当前 SQL 方言
- 点击快速访问配置编辑器
- 仅在 SQL 文件中显示

#### 19. 参数化查询

- 变量高亮显示
- 批量参数替换（`Ctrl+Alt+P` / `Cmd+Alt+P`）
- 支持 JDBC `:?` 参数语法
- 正则注入防护

#### 20. 查询历史

- 已执行查询的历史记录
- 可配置最大条目数（默认 500）
- 显示/清除历史命令

#### 21. 安全守卫

- 危险 SQL 拦截
- 3 个级别：`strict`（所有规则）、`moderate`（仅确认级）、`off`
- 防止误操作 DROP、TRUNCATE、无 WHERE 的 DELETE 等

#### 22. 国际化

- 中文（zh）和英文（en）
- 自动跟随 VSCode 语言设置
- `displayLanguage` 配置：`auto` / `zh` / `en`

#### 23. 代码片段

**通用 SQL**：`sel`（SELECT）、`seld`（SELECT DISTINCT）、`join`、`leftjoin`、`groupby`、`case`、`insert`、`insertsel`、`update`、`delete`、`ct`（CREATE TABLE）、`ctas`、`with`、`union`

**Hive**：`hivepart`、`hiveselpart`、`hiveext`

**SparkSQL**：`sparktemp`、`sparkglobaltemp`、`sparkcrtparquet`、`sparkcrtjdbc`、`sparkcrtdelta`、`sparkins`、`sparkinsinto`、`sparklv`、`sparklvp`、`sparkmerge`、`sparkwin`、`sparkcache`、`sparkpivot`、`sparkfn`、`sparkstats`、`sparkconvdelta`、`sparkoptimize`、`sparkvacuum`、`sparkdesc`

**FlinkSQL**：`flinkkafka`、`flinkjdbc`、`flinktumble`、`flinkhop`、`flinkcumulate`、`flinkwatermark`、`flinktemporal`、`flinkdedup`

**注释**：`header`、`todo`、`fixme`、`hack`、`desc`、`section`、`col`、`tbl`

### 数据库详细说明

#### StarRocks

**简介**：新一代高性能 MPP 数据库，通过 MySQL 协议（mysql2 驱动）连接，语言层在 MySQL 方言基础上扩展。

**前置要求**：StarRocks FE 节点开启 MySQL 协议端口（默认 9030），默认用户 root

**连接配置**：

| 配置项   | 说明              | 默认值      |
| -------- | ----------------- | ----------- |
| 主机     | StarRocks FE 地址 | `localhost` |
| 端口     | MySQL 协议端口    | `9030`      |
| 用户名   | 默认管理员账户    | `root`      |
| SSL      | 支持 SSL 加密连接 | 关闭        |
| SSH 隧道 | 支持 SSH 隧道连接 | 关闭        |

**语法支持**：

- 专属类型：BITMAP、HLL、PERCENTILE、JSON、ARRAY、MAP、STRUCT
- OLAP 表模型：DUPLICATE KEY、AGGREGATE KEY、UNIQUE KEY
- ROLLUP、COLOCATE、DYNAMIC_PARTITION、PARTITION、BUCKETS、PROPERTIES
- 物化视图：CREATE/REFRESH MATERIALIZED VIEW
- 专属函数：BITMAP_UNION、HLL_UNION、COLLECT_LIST、EXPLODE_SPLIT 等
- 元数据浏览：表、视图（StarRocks 不支持函数/存储过程/触发器）

**已知限制**：旧版 StarRocks（2.x 之前）不支持事务

#### SQL Server

**简介**：微软企业级关系数据库，通过 `mssql` 驱动连接，支持 T-SQL 语法。

**前置要求**：SQL Server 2016 及以上版本推荐，默认端口 1433，默认用户 sa

**连接配置**：

| 配置项         | 说明                       | 默认值      |
| -------------- | -------------------------- | ----------- |
| 主机           | SQL Server 地址            | `localhost` |
| 端口           | 监听端口                   | `1433`      |
| 用户名         | 默认账户                   | `sa`        |
| 加密           | 是否加密连接               | 开启        |
| 信任服务器证书 | 自签名证书时需开启         | 关闭        |
| 域             | Windows 身份验证域（可选） | -           |
| SSL            | 支持 SSL 加密连接          | 关闭        |
| SSH 隧道       | 支持 SSH 隧道连接          | 关闭        |

**语法支持**：

- T-SQL 专属关键字：TOP、OFFSET FETCH、OUTPUT、PIVOT/UNPIVOT、MERGE、CROSS APPLY/OUTER APPLY
- T-SQL 专属类型：NVARCHAR、DATETIME2、DATETIMEOFFSET、MONEY、UNIQUEIDENTIFIER、SQL_VARIANT、HIERARCHYID、GEOGRAPHY/GEOMETRY
- 表提示：WITH (NOLOCK) 等
- FOR XML / FOR JSON 序列化
- TRY_CONVERT/TRY_CAST/STRING_AGG/IIF/CHOOSE 等函数
- 元数据浏览：表、视图、函数、存储过程、触发器、索引
- 执行计划：通过 `SET SHOWPLAN_XML ON` 获取 XML 计划

#### Oracle

**简介**：企业级关系数据库，通过 `oracledb` 6.x 驱动连接，默认使用 thin 模式（纯 JS，无需 Oracle Client）。

**前置要求**：Oracle 11g 及以上版本推荐，默认端口 1521，默认用户 system

**连接配置**：

| 配置项     | 说明                                    | 默认值      |
| ---------- | --------------------------------------- | ----------- |
| 主机       | Oracle 服务器地址                       | `localhost` |
| 端口       | 监听端口                                | `1521`      |
| 用户名     | 默认账户                                | `system`    |
| 服务名/SID | 服务名或 SID（可选 connectString 覆盖） | -           |
| 使用 SID   | 以 SID 方式连接（默认服务名）           | 关闭        |
| 厚模式     | 启用 thick 模式（需 Instant Client）    | 关闭        |
| SSL        | 支持 SSL 加密连接                       | 关闭        |
| SSH 隧道   | 支持 SSH 隧道连接                       | 关闭        |

**语法支持**：

- Oracle 专属关键字：DUAL、ROWNUM、ROWID、SYSDATE、CONNECT BY、MINUS、SEQUENCE、SYNONYM、PRIOR
- Oracle 专属类型：NUMBER、VARCHAR2、NVARCHAR2、CLOB/NCLOB、BFILE、TIMESTAMP WITH TIME ZONE、INTERVAL YEAR TO MONTH、INTERVAL DAY TO SECOND、XMLTYPE
- PL/SQL：PACKAGE、PRAGMA AUTONOMOUS_TRANSACTION、PLS_INTEGER、BINARY_INTEGER
- q'[...]' 替代引号机制
- 专属函数：DECODE、NVL/NVL2、LISTAGG、CONNECT_BY_ROOT、SYS_CONNECT_BY_PATH、DBMS_RANDOM 等
- 元数据浏览：表、视图、函数、存储过程、触发器、索引
- 执行计划：通过 `EXPLAIN PLAN FOR` + `DBMS_XPLAN.DISPLAY` 获取
- DDL 检索：通过 `DBMS_METADATA.GET_DDL` 获取原生 DDL

**已知限制**：node-sql-parser 5.x 无原生 Oracle 方言模块，复杂 PL/SQL 块解析可能失败（格式化仍可用）

#### 达梦数据库（DM8）

**简介**：国产信创数据库，通过 ODBC 桥接支持连接达梦数据库，语言层基于 Oracle 方言派生。

**前置要求**：

- 需要在本机安装达梦 ODBC 驱动（DM8 ODBC Driver）
- 本插件依赖 `odbc` npm 包（native 模块），需要 C++ 编译环境：
    - Windows：需安装 Visual Studio Build Tools（C++ 工作负载）
    - macOS：需安装 Xcode Command Line Tools（`xcode-select --install`）
    - Linux：需安装 `python3 make g++`（Debian/Ubuntu：`build-essential`，CentOS/RHEL：`gcc-c++`）
- 默认端口 5236，默认用户 SYSDBA

**连接配置**：

| 配置项      | 说明                                           | 默认值            |
| ----------- | ---------------------------------------------- | ----------------- |
| ODBC 驱动名 | ODBC 驱动注册名                                | `DM8 ODBC DRIVER` |
| 兼容模式    | 影响 SQL 语法解析：Oracle / MySQL / PostgreSQL | `Oracle`          |
| Schema      | 可选，指定连接后的默认 Schema                  | -                 |
| 主机        | 达梦数据库服务器地址                           | `localhost`       |
| 端口        | 达梦数据库监听端口                             | `5236`            |
| 用户名      | 默认管理员账户                                 | `SYSDBA`          |

**语法支持**：

- `SELECT TOP n ...` 语法
- `LIMIT n` 语法（MySQL 兼容模式）
- 保留 Oracle 兼容语法：CONNECT BY、ROWNUM、DUAL、`||` 字符串拼接、`:=` 赋值
- 达梦特有函数：DM_HASH、DM_ENCRYPT、TO_DM_DATE
- 元数据浏览：表、视图、函数、存储过程、触发器、序列、同义词

**已知限制**：ODBC 不支持原生查询取消，依赖每查询超时（30s）兜底

### 快捷键速查

| 命令         | Windows/Linux  | Mac              |
| ------------ | -------------- | ---------------- |
| 替换参数     | `Ctrl+Alt+P`   | `Cmd+Alt+P`      |
| 切换注释     | `Ctrl+/`       | `Cmd+/`          |
| 高级注释     | `Ctrl+Shift+/` | `Cmd+Shift+/`    |
| 执行 SQL     | `Ctrl+Shift+E` | `Cmd+Shift+E`    |
| 执行选中 SQL | `Ctrl+Shift+R` | `Cmd+Shift+R`    |
| 格式化文档   | `Shift+Alt+F`  | `Shift+Option+F` |
| 跳转到定义   | `F12`          | `F12`            |
| 查找所有引用 | `Shift+F12`    | `Shift+F12`      |
| 重命名符号   | `F2`           | `F2`             |

### 配置参考

在 VSCode 设置中搜索 "SQL All in One" 进行配置，80+ 项设置按以下类别组织：

#### 1. 语言与方言

| 设置项            | 说明     | 默认值 |
| ----------------- | -------- | ------ |
| `dialect`         | SQL 方言 | `hive` |
| `displayLanguage` | 界面语言 | `auto` |

#### 2. 格式化（40+ 选项）

详见 [SQL 格式化](#7-sql-格式化)章节。

#### 3. Lint 规则（30 条）

详见 [SQL Lint 规则](#10-sql-lint-规则30-条)章节。

#### 4. 功能开关

| 设置项                     | 说明         | 默认值 |
| -------------------------- | ------------ | ------ |
| `enableLinter`             | 启用 Lint    | `true` |
| `enableCodeFolding`        | 启用代码折叠 | `true` |
| `enableOutlineView`        | 启用大纲视图 | `true` |
| `enableStatusBar`          | 启用状态栏   | `true` |
| `enableParameterHighlight` | 启用参数高亮 | `true` |
| `enableSnippets`           | 启用代码片段 | `true` |
| `enableQuickFix`           | 启用快速修复 | `true` |
| `enableHover`              | 启用悬停信息 | `true` |
| `enableNavigation`         | 启用代码导航 | `true` |
| `enableCompletion`         | 启用智能补全 | `true` |
| `enableSmartCommentToggle` | 智能注释切换 | `true` |

#### 5. 补全

| 设置项                       | 说明            | 默认值  |
| ---------------------------- | --------------- | ------- |
| `completion.keywords`        | 关键字补全      | `true`  |
| `completion.functions`       | 函数补全        | `true`  |
| `completion.snippets`        | 代码片段补全    | `false` |
| `completion.cteNames`        | CTE 名称补全    | `true`  |
| `completion.identifiers`     | 标识符补全      | `true`  |
| `completion.commentSnippets` | 注释模板补全    | `true`  |
| `completion.schema`          | Schema 感知补全 | `true`  |

#### 6. Schema 缓存

| 设置项                          | 说明                 | 默认值 |
| ------------------------------- | -------------------- | ------ |
| `schemaCache.databaseTtl`       | 数据库缓存 TTL（秒） | `600`  |
| `schemaCache.tableTtl`          | 表缓存 TTL（秒）     | `300`  |
| `schemaCache.columnTtl`         | 列缓存 TTL（秒）     | `120`  |
| `schemaCache.functionTtl`       | 函数缓存 TTL（秒）   | `600`  |
| `schemaCache.refreshOnDDL`      | DDL 变更后刷新       | `true` |
| `schemaCache.prefetchOnConnect` | 连接时预取           | `true` |

#### 7. 查询执行

| 设置项                  | 说明             | 默认值   |
| ----------------------- | ---------------- | -------- |
| `query.maxRows`         | 最大行数         | `1000`   |
| `query.timeout`         | 查询超时（毫秒） | `30000`  |
| `query.pageSize`        | 分页大小         | `100`    |
| `query.nullPlaceholder` | NULL 占位符      | `(NULL)` |

#### 8. 安全守卫

| 设置项              | 说明                            | 默认值     |
| ------------------- | ------------------------------- | ---------- |
| `safetyGuard.level` | 安全级别（strict/moderate/off） | `moderate` |

#### 9. 执行引擎

| 设置项                       | 说明                               | 默认值       |
| ---------------------------- | ---------------------------------- | ------------ |
| `execution.batchMode`        | 批量模式（sequential/transaction） | `sequential` |
| `execution.onError`          | 错误处理（stop/continue）          | `stop`       |
| `execution.saveProgress`     | 保存进度                           | `true`       |
| `execution.cancelRetries`    | 取消重试次数                       | `3`          |
| `execution.cancelRetryDelay` | 取消重试延迟（ms）                 | `500`        |

#### 10. 导出

| 设置项                  | 说明         | 默认值  |
| ----------------------- | ------------ | ------- |
| `export.defaultFormat`  | 默认导出格式 | `csv`   |
| `export.csvDelimiter`   | CSV 分隔符   | `,`     |
| `export.csvEncoding`    | CSV 编码     | `utf-8` |
| `export.includeHeaders` | 包含表头     | `true`  |

#### 11. 数据编辑器

| 设置项                              | 说明                          | 默认值     |
| ----------------------------------- | ----------------------------- | ---------- |
| `dataEditor.editMode`               | 编辑模式（readonly/editable） | `readonly` |
| `dataEditor.autoCommit`             | 自动提交                      | `true`     |
| `dataEditor.defaultView`            | 默认视图（grid/form）         | `grid`     |
| `dataEditor.optimisticLocking`      | 乐观锁                        | `false`    |
| `dataEditor.maxBlobPreviewSize`     | BLOB 预览最大大小（字节）     | `5242880`  |
| `dataEditor.blobTextPreviewSize`    | BLOB 文本预览大小（字节）     | `1048576`  |
| `dataEditor.longTransactionWarning` | 长事务警告阈值（秒）          | `300`      |
| `dataEditor.showTransactionStatus`  | 显示事务状态                  | `true`     |
| `dataEditor.enableValidation`       | 启用验证                      | `true`     |
| `dataEditor.validateOnEdit`         | 编辑时验证                    | `true`     |
| `dataEditor.validateForeignKeys`    | 外键验证                      | `false`    |

#### 12. 结果面板

| 设置项                      | 说明                           | 默认值  |
| --------------------------- | ------------------------------ | ------- |
| `results.enablePreload`     | 启用滚动预加载                 | `true`  |
| `results.jsonPrettyPrint`   | JSON 美化输出                  | `true`  |
| `results.dateFormat`        | 日期格式（local/utc/relative） | `local` |
| `results.longTextThreshold` | 长文本截断阈值                 | `200`   |

#### 13. 历史记录

| 设置项               | 说明           | 默认值 |
| -------------------- | -------------- | ------ |
| `history.maxEntries` | 最大历史条目数 | `500`  |

#### 14. 注释

| 设置项                     | 说明         | 默认值 |
| -------------------------- | ------------ | ------ |
| `enableSmartCommentToggle` | 智能注释切换 | `true` |
| `headerAuthor`             | 文件头作者   | `""`   |
| `headerModifier`           | 文件头修改人 | `""`   |

#### 15. 性能监控

| 设置项                     | 说明                       | 默认值  |
| -------------------------- | -------------------------- | ------- |
| `performance.monitorLevel` | 监控级别（off/light/full） | `light` |

### 常见问题（FAQ）

**Q1：安装后打开 SQL 文件没有反应，格式化无效果？**

A：检查 VSCode 版本是否 ≥ 1.85.0；查看输出面板「SQL All in One」通道是否有错误日志；确认插件已被激活（打开 `.sql` 文件后状态栏应显示方言名称）。如未激活，尝试执行任意 SQL All in One 命令触发激活。

**Q2：连接达梦数据库时报错 `Cannot find package 'odbc'`？**

A：`odbc` 是 native 模块，需要 C++ 编译环境。Windows 安装 Visual Studio Build Tools（C++ 工作负载），macOS 执行 `xcode-select --install`，Linux 安装 `build-essential` 或 `gcc-c++`。详见上方达梦章节。

**Q3：Hive 方言下使用 `REGEXP` 运算符格式化失败？**

A：v2.27.2 已修复此问题。插件会在解析阶段将 `REGEXP`/`NOT REGEXP` 临时替换为 `RLIKE`/`NOT RLIKE`（Hive 等价别名），格式化完成后再还原。

**Q4：格式化未写完的 SQL（如缺少 `GROUP BY`、未闭合括号）时报错？**

A：v2.28.0 新增「不完整 SQL 智能格式化」机制，会自动补全最小化语法 token 后格式化，再移除补全内容。若仍失败，请通过 [GitHub Issues](https://github.com/BryceQin/SQL-All-in-One/issues) 提供具体 SQL 样例。

**Q5：执行查询时返回空结果，但 SQL 在其他客户端能正常执行？**

A：检查 SQL 末尾是否有多余分号（部分驱动将末尾分号视为第二条空语句）；检查 `query.maxRows` 配置是否过小；查看输出面板是否有错误日志。v2.27.0 已修复 MySQL 流式查询在 `maxRows < batchSize` 时丢失全部行数据的问题。

**Q6：可视化配置页面无法切换标签页？**

A：v2.26.6/v2.27.1 已修复此问题，根因是 webview 脚本中重复调用 `acquireVsCodeApi()` 导致崩溃。请升级到最新版本。

**Q7：如何切换 SQL 方言？**

A：三种方式：

1. 状态栏点击当前方言名称，快速切换
2. 设置 → `SQL-All-in-One.dialect` 选择
3. 连接数据库后会自动切换为对应方言

**Q8：如何禁用某些 Lint 规则？**

A：在 VSCode 设置中搜索规则 ID（如 `avoid_select_star`），将 `enabled` 设为 `false`，或调整 `severity` 级别。

**Q9：如何为团队统一格式化配置？**

A：在 `.vscode/settings.json` 中配置 `SQL-All-in-One.*` 相关设置，提交到版本控制即可团队共享。

**Q10：连接数据库支持 SSH 隧道吗？**

A：支持。在添加连接时勾选「SSH 隧道」，填写 SSH 主机、端口、用户名、私钥路径或密码。`ssh2` 模块为按需加载，不使用 SSH 时无开销。

**Q11：密码存储在哪里？**

A：使用 VSCode 的 SecretStorage API 安全存储，加密保存于操作系统密钥链（macOS Keychain / Windows Credential Manager / Linux libsecret）。

**Q12：如何导出/导入连接配置？**

A：在数据库浏览器视图标题栏点击「...」菜单，选择 `Export Connections` / `Import Connections`。导出时可选是否包含密码（包含密码时需确认）。

### 反馈与贡献

- 问题反馈：[GitHub Issues](https://github.com/BryceQin/SQL-All-in-One/issues)
- 源代码：[GitHub Repository](https://github.com/BryceQin/SQL-All-in-One)
- 更新日志：[CHANGELOG.md](CHANGELOG.md)

### 许可证

MIT License

---

## English

### Overview

**SQL All in One** is an all-in-one VSCode extension for SQL developers, integrating database connection management, SQL execution, data editing, table design, execution plans, formatting, smart completion, syntax checking, code navigation, DDL conversion, and more — covering the complete SQL development workflow.

|                   |                                                      |
| ----------------- | ---------------------------------------------------- |
| **Publisher**     | bryce-qin                                            |
| **Version**       | 2.33.0                                               |
| **License**       | MIT                                                  |
| **VSCode Engine** | ^1.85.0                                              |
| **Repository**    | [GitHub](https://github.com/BryceQin/SQL-All-in-One) |

### Key Features

- **12 SQL dialects**: Hive, MySQL, SparkSQL, FlinkSQL, PostgreSQL, BigQuery, SQLite, StarRocks, SQL Server, Oracle, Dameng, Standard SQL
- **8 database connections**: MySQL, PostgreSQL, SQLite, StarRocks, SQL Server, Oracle, Dameng (with SSH tunnel and SSL)
- **AST-driven formatting**: 40+ configurable options, supports incomplete SQL formatting
- **30 Lint rules**: Real-time diagnostics with quick fixes
- **7 completion types**: Keywords, 580+ functions, schema tables/columns, CTEs, snippets, etc.
- **Visual toolchain**: Table designer, execution plan, data editor, query result panel
- **Complete code tooling**: Go-to-definition, find references, rename, folding, outline, hover
- **Bilingual**: Auto-follows VSCode language setting (Chinese / English)

### Supported SQL Dialects (12)

| Language ID  | Aliases              | Extensions          |
| ------------ | -------------------- | ------------------- |
| `sql`        | SQL                  | `.sql`              |
| `hive`       | Hive, hive-sql       | `.hql`              |
| `mysql`      | MySQL                | `.mysql`            |
| `spark`      | SparkSQL, spark      | `.sparksql`         |
| `flinksql`   | FlinkSQL, flink-sql  | `.flinksql`         |
| `postgresql` | PostgreSQL, postgres | `.psql`, `.pgsql`   |
| `bigquery`   | BigQuery             | `.bqsql`            |
| `sqlite`     | SQLite               | `.sqlite`, `.sqlt`  |
| `starrocks`  | StarRocks            | `.starrocks`        |
| `sqlserver`  | SQL Server, mssql    | `.sqlserver`        |
| `plsql`      | Oracle, PL/SQL       | `.plsql`, `.oracle` |
| `dameng`     | Dameng, DM           | `.dameng`, `.dm`    |

### Use Cases

- **Data Engineers**: Write Hive/Spark/FlinkSQL ETL scripts with normalized formatting, syntax checking, and MySQL-to-Hive DDL conversion
- **Backend Developers**: Connect to MySQL/PostgreSQL directly in VSCode to execute queries, edit data, and design tables
- **DBAs**: Browse database schemas, view function/procedure/trigger definitions, export table DDLs
- **Data Analysts**: Execute queries, paginate results, export CSV/JSON for downstream use
- **SQL Learners**: Learn SQL function usage and best practices via hover tips, Lint suggestions, and completion signatures

### Installation

#### Option 1: VSCode Marketplace (Recommended)

1. Open VSCode
2. Press `Ctrl+Shift+X` (Windows) or `Cmd+Shift+X` (Mac) to open the Extensions panel
3. Search for `SQL All in One`
4. Click "Install"

#### Option 2: VSIX Offline Installation

1. Download `hive-formatter-{version}.vsix` from [GitHub Releases](https://github.com/BryceQin/SQL-All-in-One/releases)
2. In the VSCode Extensions panel, click `...` → `Install from VSIX...`
3. Or run from command line: `code --install-extension hive-formatter-{version}.vsix`

#### System Requirements

- VSCode 1.85.0 or higher
- Connecting to Dameng requires the DM8 ODBC driver and a C++ build environment (see the Dameng section below)

### Quick Start

#### 1. Format SQL

Open any `.sql` / `.hql` / `.mysql` file and use any of the following:

- Press `Shift+Alt+F` (Windows) or `Shift+Option+F` (Mac) to format the entire document
- Select partial SQL, press `Ctrl+Shift+P` → search for `Format Selection (SQL All in One)`
- Right-click the editor → select "Format Document"

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

#### 2. Connect to a Database

1. Click the database icon in the activity bar to open the "Database Explorer" sidebar
2. Click the `+` button to add a connection
3. In the dialog, select the database type and fill in host, port, username, password, etc.
4. Click "Test Connection" to verify, then click "Connect" to save

#### 3. Execute Queries

1. Right-click a database or table in the Database Explorer and select "New Query"
2. Enter your query in the SQL editor
3. Press `Ctrl+Shift+E` (Mac: `Cmd+Shift+E`) to execute all SQL
4. Or select partial SQL and press `Ctrl+Shift+R` (Mac: `Cmd+Shift+R`) to execute only the selection
5. View results in the query result panel — supports pagination, grid/form view switching, and export

#### 4. Configure the Plugin

- **Settings UI**: VSCode Settings → search `SQL All in One` → adjust 80+ options
- **Visual Config Editor**: `Ctrl+Shift+P` → search `SQL All in One Config` to open the graphical config panel with live preview and quick presets

### Core Features

#### 1. Database Connection & Management

Supports 8 database connections with a unified management interface:

| Database   | Driver         | Features                                             |
| ---------- | -------------- | ---------------------------------------------------- |
| MySQL      | mysql2         | Connection pool, SSL, SSH tunnel, streaming queries  |
| PostgreSQL | pg             | Connection pool, SSL, SSH tunnel, query cancellation |
| SQLite     | better-sqlite3 | File path, WAL mode, query interrupt                 |
| StarRocks  | mysql2         | MySQL protocol, OLAP DDL, materialized views         |
| SQL Server | mssql          | T-SQL, Windows authentication, FOR XML/JSON          |
| Oracle     | oracledb 6.x   | thin/thick mode, PL/SQL, DBMS_METADATA               |
| Dameng DM8 | odbc           | ODBC bridge, Oracle-compatible syntax                |
| SSH Tunnel | ssh2           | Available for all SSL-supported databases            |

**Common Features**:

- Graphical connection dialog (replaces step-by-step input boxes)
- Connection lifecycle management (add/edit/remove/connect/disconnect)
- Connection pool health check, idle check, auto-reconnect
- Auto-retry with exponential backoff (max 3 retries)
- Active connection management (single active connection mode)
- SecretStorage for password security
- Connection import/export (with password protection)

#### 2. SQL Query Execution & Result Panel

**Execution Controls**:

| Command              | Shortcut                       | Description                   |
| -------------------- | ------------------------------ | ----------------------------- |
| Execute SQL          | `Ctrl+Shift+E` / `Cmd+Shift+E` | Execute all SQL in the editor |
| Execute Selected SQL | `Ctrl+Shift+R` / `Cmd+Shift+R` | Execute only the selection    |
| Cancel Running Query | -                              | Cancel the running query      |

**Query Result Panel** (integrated Monaco editor):

- Top-bottom split layout: SQL editor on top, query results on bottom, draggable ratio
- Monaco editor: SQL syntax highlighting, IntelliSense, code folding, auto-follows VSCode theme
- Dialect-aware Monarch syntax highlighting: 12 dialect-specific tokenizers
- Static completion: keywords, 580+ function signatures (with parameter snippets), data types
- Schema-aware completion: triggered by `.` or space, queries database schema for table/column names
- Function signature help: shows parameter signatures on `(` or `,`, auto-highlights current parameter
- Hover info: function signatures, keyword descriptions, table structure
- Lint diagnostics: auto-check on edit, shows squiggly warnings
- Clicking a table/view node in Database Explorer auto-generates `SELECT * FROM table LIMIT 200` and executes it

**Result Display**:

- Pagination and scroll preloading
- Grid view and form view switching
- JSON pretty print
- Date format display (local / UTC / relative)
- Long text truncation (configurable threshold)
- NULL value placeholder display
- Batch execution mode (sequential / transaction)
- Error handling strategy (stop / continue)
- Progress saving

#### 3. Data Import & Export

| Operation           | Format     | Description                               |
| ------------------- | ---------- | ----------------------------------------- |
| Export query result | CSV        | Configurable delimiter, encoding, headers |
| Export query result | JSON       | Supports pretty print                     |
| Export query result | SQL INSERT | Generates INSERT statements               |
| Export table DDL    | DDL        | Complete CREATE TABLE statements          |
| Import from file    | CSV / JSON | Bulk data import                          |

#### 4. Table Designer

- Visual table design/edit
- Column definitions: types, constraints, comments
- Data editor: readonly / editable modes
- Auto commit mode
- Optimistic locking for concurrent editing
- BLOB preview (size limit + MIME type whitelist)
- Data validation (real-time, foreign key validation optional)
- Transaction status display
- Long transaction warning

#### 5. Execution Plan

- Supports `EXPLAIN FORMAT=JSON` visualization
- Tree structure for execution plan display
- Node details: operation type, estimated cost, rows, scan type
- Dialect-specific adapters:
    - MySQL: `EXPLAIN FORMAT=JSON`
    - PostgreSQL: `EXPLAIN (FORMAT JSON)`
    - SQL Server: `SET SHOWPLAN_XML ON`
    - Oracle: `EXPLAIN PLAN FOR` + `DBMS_XPLAN.DISPLAY`

#### 6. Database Explorer (Sidebar)

Tree view of database objects:

```
🔗 Connection Name
├── 📁 database_1
│   ├── 📊 Tables
│   │   └── users
│   │       ├── id (INT, PK)
│   │       ├── name (VARCHAR)
│   │       └── email (VARCHAR)
│   ├── 👁️ Views
│   ├── ⚡ Functions
│   ├── 📜 Procedures
│   └── 🔔 Triggers
└── 📁 database_2
```

**Actions**:

- View table data (auto-generates `SELECT * FROM ... LIMIT 200`)
- View DDL (table, view, function, procedure, trigger definitions)
- Edit table design
- Copy column name
- Add/remove favorites
- Set default database
- Schema cache (configurable TTL: database / table / column / function)
- Auto-refresh schema on DDL changes
- Prefetch schema on connect

#### 7. SQL Formatting

AST-driven formatting engine based on node-sql-parser v5.x with 40+ configurable options. **Supports formatting incomplete SQL** (new in v2.28): when SQL is missing `GROUP BY`, unclosed `)`, incomplete `IN(...)`, missing second operand of `BETWEEN`, etc., automatically completes minimal syntax tokens for parsing, then removes them after formatting.

**Case Control**

| Option           | Description                     | Default    |
| ---------------- | ------------------------------- | ---------- |
| `keywordCase`    | Keywords (preserve/upper/lower) | `preserve` |
| `dataTypeCase`   | Data types                      | `preserve` |
| `functionCase`   | Function names                  | `preserve` |
| `identifierCase` | Identifiers                     | `preserve` |
| `nullCase`       | NULL keyword                    | `preserve` |
| `booleanCase`    | TRUE/FALSE                      | `preserve` |

**Indent Control**

| Option                 | Description                               | Default    |
| ---------------------- | ----------------------------------------- | ---------- |
| `indentStyle`          | Style (standard/tabularLeft/tabularRight) | `standard` |
| `tabSizeOverride`      | Indent width                              | `2`        |
| `insertSpacesOverride` | Use spaces for indentation                | `true`     |
| `ignoreTabSettings`    | Ignore VSCode global indent settings      | `false`    |

**Newline Control** (25+ options)

Newline strategies for SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, JOIN, ON, USING, WITH, CTE, CASE/WHEN/THEN/ELSE, IN, set operations, LATERAL VIEW, DISTRIBUTE BY, CLUSTER BY, SORT BY, INSERT columns/values can all be configured independently.

**Alignment Control**

| Option                    | Description               | Default |
| ------------------------- | ------------------------- | ------- |
| `alignColumnDefinitions`  | Align column definitions  | `false` |
| `alignWhereClauses`       | Align WHERE conditions    | `false` |
| `alignCaseStatements`     | Align CASE statements     | `false` |
| `alignOnClauses`          | Align ON conditions       | `false` |
| `alignInsertColumns`      | Align INSERT columns      | `false` |
| `alignInsertValuesGroups` | Align INSERT value groups | `false` |
| `tabulateAlias`           | Tabulate aliases          | `false` |

**Spacing & Other**

| Option                         | Description                                | Default    |
| ------------------------------ | ------------------------------------------ | ---------- |
| `denseOperators`               | Remove spaces around operators             | `false`    |
| `spaceBeforeComma`             | Space before comma                         | `false`    |
| `spaceInsideParentheses`       | Space inside parentheses                   | `false`    |
| `expressionWidth`              | Expression wrap character threshold        | `50`       |
| `linesBetweenQueries`          | Blank lines between queries                | `1`        |
| `newlineBeforeSemicolon`       | Newline before semicolon                   | `false`    |
| `commaPosition`                | Comma position (after/before)              | `after`    |
| `singleLineMaxLength`          | Single line max length                     | `80`       |
| `trimTrailingSpaces`           | Trim trailing spaces                       | `true`     |
| `semicolonAtEnd`               | Semicolon at end                           | `true`     |
| `commentPosition`              | Comment position (preserve/newline/inline) | `preserve` |
| `subqueryParenStyle`           | Subquery paren style (inline/newline)      | `inline`   |
| `maxItemsInlineList`           | Max items in inline list                   | `5`        |
| `indentCteBody`                | Indent CTE body                            | `true`     |
| `cteCommaPosition`             | CTE comma position                         | `before`   |
| `newlineBetweenCtes`           | Newline between CTEs                       | `true`     |
| `indentJoinConditions`         | Indent JOIN conditions                     | `true`     |
| `indentWhen` / `indentThen`    | Indent WHEN / THEN                         | `true`     |
| `blankLinesBeforeSetOperation` | Blank lines before set operation           | `1`        |
| `blankLinesAfterSetOperation`  | Blank lines after set operation            | `0`        |

The formatter has a built-in cache (by dialect + config hash, max 50 instances) and supports formatting the selection.

#### 8. Smart Completion (IntelliSense)

7 completion types, each independently toggleable:

| Type                            | Description                                                    | Example                                       |
| ------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| **Schema Completion**           | Table/column names from connected database                     | Type table prefix → suggest table and columns |
| **Keyword Completion**          | Dialect-specific keywords and data types                       | `SEL` → `SELECT`                              |
| **Function Completion**         | 580+ function signatures with params, return type, description | `SUB` → `SUBSTR(string, start, length)`       |
| **Snippet Completion**          | Dialect-specific code snippets                                 | `sel` → insert SELECT template                |
| **CTE Name Completion**         | CTE names defined in WITH clause                               | `WITH cte AS (...) SELECT` → suggests `cte`   |
| **Identifier Completion**       | Context-aware table/column suggestions                         | FROM clause suggests table names              |
| **Comment Template Completion** | header, todo, fixme, etc.                                      | `header` → insert file header comment         |

#### 9. Syntax Checking & Diagnostics

- Debounced diagnostics (300ms) with CancellationToken support
- Two-layer checking: AST diagnostics + Lint diagnostics
- Severity level filtering (Error / Warning / Info)

**Syntax Error Checks**: HAVING without GROUP BY, LIMIT without value, JOIN without ON, misplaced DISTINCT, aggregate in WHERE, wildcard in UPDATE, incomplete CASE, mismatched parentheses, unclosed strings, duplicate column aliases

**Code Quality Suggestions**: duplicate table aliases, reserved words as identifiers, SELECT without FROM, INSERT without column names, redundant DISTINCT, subquery without alias, suspicious NULL comparison

**Dialect Hints**: MySQL date function differences in Hive

#### 10. SQL Lint Rules (30)

Each rule supports `enabled` + `severity` configuration:

| Rule ID                       | Description                        | Default Enabled | Default Level |
| ----------------------------- | ---------------------------------- | --------------- | ------------- |
| `avoid_select_star`           | Avoid SELECT *                     | ✅              | Warning       |
| `explicit_join_type`          | Explicit JOIN type                 | ✅              | Info          |
| `limit_with_order_by`         | LIMIT should pair with ORDER BY    | ✅              | Warning       |
| `avoid_column_count_mismatch` | INSERT column/value count mismatch | ✅              | Error         |
| `missing_primary_key`         | CREATE TABLE missing primary key   | ✅              | Warning       |
| `use_current_timestamp`       | Use CURRENT_TIMESTAMP              | ✅              | Info          |
| `avoid_select_in_insert`      | Avoid SELECT in INSERT             | ✅              | Warning       |
| `duplicate_column_aliases`    | Duplicate column aliases           | ✅              | Warning       |
| `missing_query_comment`       | Complex queries missing comments   | ✅              | Warning       |
| `missing_column_comment`      | DDL columns missing COMMENT        | ✅              | Warning       |
| `commented_out_code`          | Commented-out code                 | ✅              | Info          |
| `expired_todo`                | Expired TODO/FIXME                 | ✅              | Info          |
| `having_without_group_by`     | HAVING without GROUP BY            | ✅              | Error         |
| `limit_invalid_value`         | Invalid LIMIT value                | ✅              | Error         |
| `reserved_word_identifier`    | Reserved word as identifier        | ✅              | Warning       |
| `join_missing_on`             | JOIN missing ON                    | ✅              | Error         |
| `select_without_from`         | SELECT without FROM                | ✅              | Warning       |
| `misplaced_distinct`          | Misplaced DISTINCT                 | ✅              | Error         |
| `aggregate_in_where`          | Aggregate in WHERE                 | ✅              | Error         |
| `subquery_without_alias`      | Subquery without alias             | ✅              | Warning       |
| `suspicious_null_comparison`  | Suspicious NULL comparison         | ✅              | Warning       |
| `incomplete_case`             | Incomplete CASE                    | ✅              | Error         |
| `redundant_distinct`          | Redundant DISTINCT                 | ✅              | Warning       |
| `date_function_usage`         | Date function usage hints          | ✅              | Info          |
| `wildcard_in_update`          | Wildcard in UPDATE                 | ✅              | Error         |
| `implicit_cross_join`         | Implicit cross join                | ✅              | Warning       |
| `deprecated_function`         | Deprecated function                | ✅              | Info          |
| `postgres_boolean_comparison` | PostgreSQL boolean comparison      | ✅              | Hint          |
| `use_coalesce_over_isnull`    | Use COALESCE over ISNULL           | ❌              | Info          |
| `avoid_correlated_subqueries` | Avoid correlated subqueries        | ❌              | Warning       |
| `long_query_line`             | Long query line                    | ❌              | Info          |
| `explicit_column_aliasing`    | Explicit column aliasing           | ❌              | Info          |
| `uppercase_keywords`          | Uppercase keywords                 | ❌              | Info          |
| `consistent_aliasing`         | Consistent aliasing                | ❌              | Info          |

Some rules support sub-options:

- `missing_query_comment`: `thresholdLineCount`, `thresholdJoinCount`, `thresholdSubqueryCount`
- `missing_column_comment`: `aggregate`, `externalTableExempt`
- `commented_out_code`: `thresholdLines`
- `expired_todo`: `gracePeriodDays`

#### 11. Quick Fix

| Problem                     | Fix Suggestion               |
| --------------------------- | ---------------------------- |
| `= NULL`                    | Replace with `IS NULL`       |
| `!= NULL` / `<> NULL`       | Replace with `IS NOT NULL`   |
| Reserved word as alias      | Wrap with backticks          |
| Subquery without alias      | Auto-add `AS subquery`       |
| INSERT without column names | Add column name placeholders |
| HAVING without GROUP BY     | Auto-add GROUP BY            |

#### 12. Code Navigation

| Feature               | Shortcut    | Description                                               |
| --------------------- | ----------- | --------------------------------------------------------- |
| Go to Definition      | `F12`       | CTE, table alias, column alias                            |
| Find All References   | `Shift+F12` | Find symbol references                                    |
| Rename Symbol         | `F2`        | With reserved word/conflict checks                        |
| Breadcrumb Navigation | -           | Clause-level (SELECT/FROM/WHERE/GROUP BY/HAVING/ORDER BY) |

Shared AstNavigator navigation engine.

#### 13. DDL Conversion

AST-based MySQL ↔ Hive SQL conversion:

- Supports CREATE TABLE, SELECT, INSERT, UPDATE, DELETE, CREATE VIEW and other statement types
- Pluggable node transformer architecture:
    - Function mapping (NOW→CURRENT_TIMESTAMP, IFNULL→COALESCE, IF→CASE WHEN)
    - Type mapping (DATETIME↔TIMESTAMP, VARCHAR↔STRING)
    - Column attribute stripping, table option filtering, constraint removal, Hive clause removal
- Interactive regex fallback when AST parsing fails
- Warnings for complex types (ARRAY/MAP/STRUCT) during conversion
- Entry: right-click menu `MySQL to HiveSQL` / `HiveSQL to MySQL`, or command palette

#### 14. Comment Enhancement

**Smart Comment Toggle**

| Shortcut                       | Function                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| `Ctrl+/` / `Cmd+/`             | Smart toggle: single line → line comment, multi-line → block comment |
| `Ctrl+Shift+/` / `Cmd+Shift+/` | Advanced: format-disable markers, DDL COMMENT, block comment         |

**Comment Template Completion**

| Prefix    | Description                                                |
| --------- | ---------------------------------------------------------- |
| `header`  | File header comment (auto author, auto table dependencies) |
| `col`     | Column COMMENT                                             |
| `tbl`     | Table COMMENT                                              |
| `todo`    | TODO comment                                               |
| `fixme`   | FIXME comment                                              |
| `hack`    | HACK comment                                               |
| `desc`    | Query description comment                                  |
| `section` | Section divider comment                                    |

**Comment Lint Rules**: `missing_query_comment`, `missing_column_comment`, `commented_out_code`, `expired_todo`

#### 15. Hover Information

4-layer resolver chain:

1. **Parameter hover**: Show parameter definitions
2. **Function signature hover**: Function parameters, return type, usage notes
3. **Schema hover**: Table structure and column info from connected database
4. **Keyword hover**: Keyword usage descriptions

#### 16. Code Folding & Outline

- Fold CTE, subquery, function blocks, CASE statements
- Document outline: quick navigation to SELECT/FROM/WHERE and other clauses

#### 17. Visual Config Editor

Open via `Ctrl+Shift+P` → `SQL All in One Config`:

- Graphical configuration interface
- Collapsible groups, toggle switches
- Live format preview
- Drag-to-resize preview area
- Quick presets: Default, Hive, MySQL, Compact
- Save config button

#### 18. Status Bar

- Shows current SQL dialect
- Click for quick access to the config editor
- Only shown in SQL files

#### 19. Parameterized Queries

- Variable highlighting
- Batch parameter replacement (`Ctrl+Alt+P` / `Cmd+Alt+P`)
- Supports JDBC `:?` parameter syntax
- Regex injection protection

#### 20. Query History

- History of executed queries
- Configurable max entries (default 500)
- Show/clear history commands

#### 21. Safety Guard

- Dangerous SQL interception
- 3 levels: `strict` (all rules), `moderate` (confirmation-level only), `off`
- Prevents accidental DROP, TRUNCATE, DELETE without WHERE, etc.

#### 22. i18n

- Chinese (zh) and English (en)
- Auto-follows VSCode language setting
- `displayLanguage` config: `auto` / `zh` / `en`

#### 23. Code Snippets

**Common SQL**: `sel` (SELECT), `seld` (SELECT DISTINCT), `join`, `leftjoin`, `groupby`, `case`, `insert`, `insertsel`, `update`, `delete`, `ct` (CREATE TABLE), `ctas`, `with`, `union`

**Hive**: `hivepart`, `hiveselpart`, `hiveext`

**SparkSQL**: `sparktemp`, `sparkglobaltemp`, `sparkcrtparquet`, `sparkcrtjdbc`, `sparkcrtdelta`, `sparkins`, `sparkinsinto`, `sparklv`, `sparklvp`, `sparkmerge`, `sparkwin`, `sparkcache`, `sparkpivot`, `sparkfn`, `sparkstats`, `sparkconvdelta`, `sparkoptimize`, `sparkvacuum`, `sparkdesc`

**FlinkSQL**: `flinkkafka`, `flinkjdbc`, `flinktumble`, `flinkhop`, `flinkcumulate`, `flinkwatermark`, `flinktemporal`, `flinkdedup`

**Comments**: `header`, `todo`, `fixme`, `hack`, `desc`, `section`, `col`, `tbl`

### Database Details

#### StarRocks

**Overview**: A new-generation high-performance MPP database, connected via MySQL protocol (mysql2 driver), with the language layer extending the MySQL dialect.

**Prerequisites**: StarRocks FE node must enable the MySQL protocol port (default 9030), default user `root`

**Connection Configuration**:

| Setting    | Description              | Default     |
| ---------- | ------------------------ | ----------- |
| Host       | StarRocks FE address     | `localhost` |
| Port       | MySQL protocol port      | `9030`      |
| Username   | Default admin account    | `root`      |
| SSL        | SSL encrypted connection | Off         |
| SSH Tunnel | SSH tunnel connection    | Off         |

**Syntax Support**:

- Specific types: BITMAP, HLL, PERCENTILE, JSON, ARRAY, MAP, STRUCT
- OLAP table models: DUPLICATE KEY, AGGREGATE KEY, UNIQUE KEY
- ROLLUP, COLOCATE, DYNAMIC_PARTITION, PARTITION, BUCKETS, PROPERTIES
- Materialized views: CREATE/REFRESH MATERIALIZED VIEW
- Specific functions: BITMAP_UNION, HLL_UNION, COLLECT_LIST, EXPLODE_SPLIT, etc.
- Metadata browsing: tables, views (StarRocks does not support functions/procedures/triggers)

**Known Limitations**: Older StarRocks (before 2.x) does not support transactions

#### SQL Server

**Overview**: Microsoft's enterprise relational database, connected via the `mssql` driver, supports T-SQL syntax.

**Prerequisites**: SQL Server 2016 or later recommended, default port 1433, default user `sa`

**Connection Configuration**:

| Setting                  | Description                              | Default     |
| ------------------------ | ---------------------------------------- | ----------- |
| Host                     | SQL Server address                       | `localhost` |
| Port                     | Listening port                           | `1433`      |
| Username                 | Default account                          | `sa`        |
| Encryption               | Encrypt connection                       | On          |
| Trust server certificate | Required for self-signed certificates    | Off         |
| Domain                   | Windows authentication domain (optional) | -           |
| SSL                      | SSL encrypted connection                 | Off         |
| SSH Tunnel               | SSH tunnel connection                    | Off         |

**Syntax Support**:

- T-SQL specific keywords: TOP, OFFSET FETCH, OUTPUT, PIVOT/UNPIVOT, MERGE, CROSS APPLY/OUTER APPLY
- T-SQL specific types: NVARCHAR, DATETIME2, DATETIMEOFFSET, MONEY, UNIQUEIDENTIFIER, SQL_VARIANT, HIERARCHYID, GEOGRAPHY/GEOMETRY
- Table hints: WITH (NOLOCK), etc.
- FOR XML / FOR JSON serialization
- TRY_CONVERT/TRY_CAST/STRING_AGG/IIF/CHOOSE and other functions
- Metadata browsing: tables, views, functions, procedures, triggers, indexes
- Execution plan: via `SET SHOWPLAN_XML ON` for XML plan

#### Oracle

**Overview**: Enterprise relational database, connected via the `oracledb` 6.x driver, defaults to thin mode (pure JS, no Oracle Client required).

**Prerequisites**: Oracle 11g or later recommended, default port 1521, default user `system`

**Connection Configuration**:

| Setting          | Description                                           | Default     |
| ---------------- | ----------------------------------------------------- | ----------- |
| Host             | Oracle server address                                 | `localhost` |
| Port             | Listening port                                        | `1521`      |
| Username         | Default account                                       | `system`    |
| Service Name/SID | Service name or SID (optional connectString override) | -           |
| Use SID          | Connect via SID (default service name)                | Off         |
| Thick Mode       | Enable thick mode (requires Instant Client)           | Off         |
| SSL              | SSL encrypted connection                              | Off         |
| SSH Tunnel       | SSH tunnel connection                                 | Off         |

**Syntax Support**:

- Oracle-specific keywords: DUAL, ROWNUM, ROWID, SYSDATE, CONNECT BY, MINUS, SEQUENCE, SYNONYM, PRIOR
- Oracle-specific types: NUMBER, VARCHAR2, NVARCHAR2, CLOB/NCLOB, BFILE, TIMESTAMP WITH TIME ZONE, INTERVAL YEAR TO MONTH, INTERVAL DAY TO SECOND, XMLTYPE
- PL/SQL: PACKAGE, PRAGMA AUTONOMOUS_TRANSACTION, PLS_INTEGER, BINARY_INTEGER
- q'[...]' alternative quoting mechanism
- Specific functions: DECODE, NVL/NVL2, LISTAGG, CONNECT_BY_ROOT, SYS_CONNECT_BY_PATH, DBMS_RANDOM, etc.
- Metadata browsing: tables, views, functions, procedures, triggers, indexes
- Execution plan: via `EXPLAIN PLAN FOR` + `DBMS_XPLAN.DISPLAY`
- DDL retrieval: via `DBMS_METADATA.GET_DDL` for native DDL

**Known Limitations**: node-sql-parser 5.x has no native Oracle dialect module; complex PL/SQL blocks may fail to parse (formatting still works)

#### Dameng Database (DM8)

**Overview**: A domestic Chinese database, connected via an ODBC bridge, with the language layer derived from the Oracle dialect.

**Prerequisites**:

- Install the Dameng ODBC driver (DM8 ODBC Driver) on your machine
- This extension depends on the `odbc` npm package (native module), which requires a C++ build environment:
    - Windows: install Visual Studio Build Tools (C++ workload)
    - macOS: install Xcode Command Line Tools (`xcode-select --install`)
    - Linux: install `python3 make g++` (Debian/Ubuntu: `build-essential`, CentOS/RHEL: `gcc-c++`)
- Default port 5236, default user `SYSDBA`

**Connection Configuration**:

| Setting            | Description                                      | Default           |
| ------------------ | ------------------------------------------------ | ----------------- |
| ODBC driver name   | Registered ODBC driver name                      | `DM8 ODBC DRIVER` |
| Compatibility mode | Affects SQL parsing: Oracle / MySQL / PostgreSQL | `Oracle`          |
| Schema             | Optional, default schema after connecting        | -                 |
| Host               | Dameng database server address                   | `localhost`       |
| Port               | Dameng database listening port                   | `5236`            |
| Username           | Default administrator account                    | `SYSDBA`          |

**Syntax Support**:

- `SELECT TOP n ...` syntax
- `LIMIT n` syntax (MySQL compatibility mode)
- Oracle-compatible syntax retained: CONNECT BY, ROWNUM, DUAL, `||` string concatenation, `:=` assignment
- Dameng-specific functions: DM_HASH, DM_ENCRYPT, TO_DM_DATE
- Metadata browsing: tables, views, functions, procedures, triggers, sequences, synonyms

**Known Limitations**: ODBC does not support native query cancellation; relies on per-query timeout (30s) as fallback

### Keyboard Shortcuts

| Command              | Windows/Linux  | Mac              |
| -------------------- | -------------- | ---------------- |
| Replace Parameter    | `Ctrl+Alt+P`   | `Cmd+Alt+P`      |
| Toggle Comment       | `Ctrl+/`       | `Cmd+/`          |
| Advanced Comment     | `Ctrl+Shift+/` | `Cmd+Shift+/`    |
| Execute SQL          | `Ctrl+Shift+E` | `Cmd+Shift+E`    |
| Execute Selected SQL | `Ctrl+Shift+R` | `Cmd+Shift+R`    |
| Format Document      | `Shift+Alt+F`  | `Shift+Option+F` |
| Go to Definition     | `F12`          | `F12`            |
| Find All References  | `Shift+F12`    | `Shift+F12`      |
| Rename Symbol        | `F2`           | `F2`             |

### Configuration Reference

Search "SQL All in One" in VSCode settings to configure 80+ options organized into the following categories:

#### 1. Language & Dialect

| Setting           | Description | Default |
| ----------------- | ----------- | ------- |
| `dialect`         | SQL dialect | `hive`  |
| `displayLanguage` | UI language | `auto`  |

#### 2. Formatting (40+ options)

See the [SQL Formatting](#7-sql-formatting) section.

#### 3. Lint Rules (30)

See the [SQL Lint Rules](#10-sql-lint-rules-30) section.

#### 4. Feature Toggles

| Setting                    | Description                   | Default |
| -------------------------- | ----------------------------- | ------- |
| `enableLinter`             | Enable linting                | `true`  |
| `enableCodeFolding`        | Enable code folding           | `true`  |
| `enableOutlineView`        | Enable outline view           | `true`  |
| `enableStatusBar`          | Enable status bar             | `true`  |
| `enableParameterHighlight` | Enable parameter highlighting | `true`  |
| `enableSnippets`           | Enable code snippets          | `true`  |
| `enableQuickFix`           | Enable quick fix              | `true`  |
| `enableHover`              | Enable hover information      | `true`  |
| `enableNavigation`         | Enable code navigation        | `true`  |
| `enableCompletion`         | Enable smart completion       | `true`  |
| `enableSmartCommentToggle` | Smart comment toggle          | `true`  |

#### 5. Completion

| Setting                      | Description                 | Default |
| ---------------------------- | --------------------------- | ------- |
| `completion.keywords`        | Keyword completion          | `true`  |
| `completion.functions`       | Function completion         | `true`  |
| `completion.snippets`        | Snippet completion          | `false` |
| `completion.cteNames`        | CTE name completion         | `true`  |
| `completion.identifiers`     | Identifier completion       | `true`  |
| `completion.commentSnippets` | Comment template completion | `true`  |
| `completion.schema`          | Schema-aware completion     | `true`  |

#### 6. Schema Cache

| Setting                         | Description                  | Default |
| ------------------------------- | ---------------------------- | ------- |
| `schemaCache.databaseTtl`       | Database cache TTL (seconds) | `600`   |
| `schemaCache.tableTtl`          | Table cache TTL (seconds)    | `300`   |
| `schemaCache.columnTtl`         | Column cache TTL (seconds)   | `120`   |
| `schemaCache.functionTtl`       | Function cache TTL (seconds) | `600`   |
| `schemaCache.refreshOnDDL`      | Refresh on DDL changes       | `true`  |
| `schemaCache.prefetchOnConnect` | Prefetch on connect          | `true`  |

#### 7. Query Execution

| Setting                 | Description        | Default  |
| ----------------------- | ------------------ | -------- |
| `query.maxRows`         | Max rows           | `1000`   |
| `query.timeout`         | Query timeout (ms) | `30000`  |
| `query.pageSize`        | Page size          | `100`    |
| `query.nullPlaceholder` | NULL placeholder   | `(NULL)` |

#### 8. Safety Guard

| Setting             | Description                        | Default    |
| ------------------- | ---------------------------------- | ---------- |
| `safetyGuard.level` | Safety level (strict/moderate/off) | `moderate` |

#### 9. Execution Engine

| Setting                      | Description                         | Default      |
| ---------------------------- | ----------------------------------- | ------------ |
| `execution.batchMode`        | Batch mode (sequential/transaction) | `sequential` |
| `execution.onError`          | Error handling (stop/continue)      | `stop`       |
| `execution.saveProgress`     | Save progress                       | `true`       |
| `execution.cancelRetries`    | Cancel retries                      | `3`          |
| `execution.cancelRetryDelay` | Cancel retry delay (ms)             | `500`        |

#### 10. Export

| Setting                 | Description           | Default |
| ----------------------- | --------------------- | ------- |
| `export.defaultFormat`  | Default export format | `csv`   |
| `export.csvDelimiter`   | CSV delimiter         | `,`     |
| `export.csvEncoding`    | CSV encoding          | `utf-8` |
| `export.includeHeaders` | Include headers       | `true`  |

#### 11. Data Editor

| Setting                             | Description                                  | Default    |
| ----------------------------------- | -------------------------------------------- | ---------- |
| `dataEditor.editMode`               | Edit mode (readonly/editable)                | `readonly` |
| `dataEditor.autoCommit`             | Auto commit                                  | `true`     |
| `dataEditor.defaultView`            | Default view (grid/form)                     | `grid`     |
| `dataEditor.optimisticLocking`      | Optimistic locking                           | `false`    |
| `dataEditor.maxBlobPreviewSize`     | Max BLOB preview size (bytes)                | `5242880`  |
| `dataEditor.blobTextPreviewSize`    | BLOB text preview size (bytes)               | `1048576`  |
| `dataEditor.longTransactionWarning` | Long transaction warning threshold (seconds) | `300`      |
| `dataEditor.showTransactionStatus`  | Show transaction status                      | `true`     |
| `dataEditor.enableValidation`       | Enable validation                            | `true`     |
| `dataEditor.validateOnEdit`         | Validate on edit                             | `true`     |
| `dataEditor.validateForeignKeys`    | Foreign key validation                       | `false`    |

#### 12. Results Panel

| Setting                     | Description                      | Default |
| --------------------------- | -------------------------------- | ------- |
| `results.enablePreload`     | Enable scroll preloading         | `true`  |
| `results.jsonPrettyPrint`   | JSON pretty print                | `true`  |
| `results.dateFormat`        | Date format (local/utc/relative) | `local` |
| `results.longTextThreshold` | Long text truncation threshold   | `200`   |

#### 13. History

| Setting              | Description         | Default |
| -------------------- | ------------------- | ------- |
| `history.maxEntries` | Max history entries | `500`   |

#### 14. Comment

| Setting                    | Description          | Default |
| -------------------------- | -------------------- | ------- |
| `enableSmartCommentToggle` | Smart comment toggle | `true`  |
| `headerAuthor`             | File header author   | `""`    |
| `headerModifier`           | File header modifier | `""`    |

#### 15. Performance Monitoring

| Setting                    | Description                       | Default |
| -------------------------- | --------------------------------- | ------- |
| `performance.monitorLevel` | Monitoring level (off/light/full) | `light` |

### FAQ

**Q1: After installation, opening a SQL file has no response and formatting doesn't work?**

A: Check if VSCode version is ≥ 1.85.0; check the "SQL All in One" channel in the output panel for error logs; confirm the extension is activated (the status bar should show the dialect name after opening a `.sql` file). If not activated, try executing any SQL All in One command to trigger activation.

**Q2: Error `Cannot find package 'odbc'` when connecting to Dameng?**

A: `odbc` is a native module that requires a C++ build environment. Install Visual Studio Build Tools (C++ workload) on Windows, run `xcode-select --install` on macOS, or install `build-essential` / `gcc-c++` on Linux. See the Dameng section above for details.

**Q3: Formatting fails when using the `REGEXP` operator in Hive dialect?**

A: Fixed in v2.27.2. The plugin temporarily replaces `REGEXP`/`NOT REGEXP` with `RLIKE`/`NOT RLIKE` (Hive equivalent aliases) during parsing, then restores the original syntax after formatting.

**Q4: Error when formatting incomplete SQL (e.g., missing `GROUP BY`, unclosed parentheses)?**

A: v2.28.0 introduces an "incomplete SQL smart formatting" mechanism that automatically completes minimal syntax tokens for parsing, then removes them after formatting. If it still fails, please provide a specific SQL sample via [GitHub Issues](https://github.com/BryceQin/SQL-All-in-One/issues).

**Q5: Query returns empty results, but the SQL works in other clients?**

A: Check if the SQL has a trailing semicolon (some drivers treat it as a second empty statement); check if `query.maxRows` is too small; check the output panel for error logs. v2.27.0 fixed an issue where MySQL streaming queries lost all rows when `maxRows < batchSize`.

**Q6: Visual config panel cannot switch tabs?**

A: Fixed in v2.26.6/v2.27.1. The root cause was a crash from repeated `acquireVsCodeApi()` calls in webview scripts. Please upgrade to the latest version.

**Q7: How to switch SQL dialect?**

A: Three ways:

1. Click the current dialect name in the status bar for quick switching
2. Settings → `SQL-All-in-One.dialect` to select
3. Automatically switches to the corresponding dialect when connecting to a database

**Q8: How to disable certain Lint rules?**

A: Search for the rule ID (e.g., `avoid_select_star`) in VSCode settings, set `enabled` to `false`, or adjust the `severity` level.

**Q9: How to share formatting configuration across a team?**

A: Configure `SQL-All-in-One.*` settings in `.vscode/settings.json` and commit it to version control for team sharing.

**Q10: Does database connection support SSH tunnel?**

A: Yes. When adding a connection, check "SSH Tunnel" and fill in the SSH host, port, username, private key path, or password. The `ssh2` module is loaded on demand with no overhead when SSH is not used.

**Q11: Where are passwords stored?**

A: Using VSCode's SecretStorage API, passwords are encrypted and stored in the OS keychain (macOS Keychain / Windows Credential Manager / Linux libsecret).

**Q12: How to export/import connection configurations?**

A: Click the "..." menu in the Database Explorer view title bar and select `Export Connections` / `Import Connections`. You can choose whether to include passwords when exporting (confirmation required when including passwords).

### Feedback & Contributions

- Issues: [GitHub Issues](https://github.com/BryceQin/SQL-All-in-One/issues)
- Source: [GitHub Repository](https://github.com/BryceQin/SQL-All-in-One)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

### License

MIT License
