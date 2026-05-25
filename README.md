# Hive Formatter

[English](#english) | [中文](#中文)

---

## English

A powerful SQL formatting VSCode extension supporting Hive, MySQL, SparkSQL, FlinkSQL, PostgreSQL, BigQuery, SQLite and more. Designed with extensive customization options and AST-driven architecture.

> **v1.8.0 Comprehensive Optimization** -- Full i18n overhaul (Settings UI follows VS Code language), bilingual README & CHANGELOG, config editor multilingual, unified dialect registry, memory leak fixes, architecture improvements.

> **v1.7.0 Navigation Enhancement** -- Go to Definition (CTE/table alias/column alias), Find All References, Rename Symbol (with reserved word/conflict checks), Breadcrumb clause-level navigation, AstNavigator shared navigation engine.

### Features

Unlike most SQL plugins on the market that offer only a single formatting style, this tool is built around the core philosophy of personalized configuration, with a rich set of customizable options:

- **Multiple SQL Dialects** -- Hive, MySQL, SparkSQL, FlinkSQL, PostgreSQL, BigQuery, SQLite, Generic SQL
- **AST-Driven Architecture** -- Based on node-sql-parser v5.x, all core features (formatting, diagnostics, linting, completion, conversion) are built on AST
- **Rich Formatting Options** -- 40+ configurable options including keyword case, indentation style, newline strategies
- **Smart IntelliSense** -- Keywords, function signatures, code snippets, CTE and identifier suggestions, AST context-aware
- **Comment Enhancement** -- Smart comment toggling, comment template completion, comment lint rules
- **Flexible Indentation** -- Standard indentation and tabular-style alignment
- **Visual Config Editor** -- Modern graphical config interface with collapsible groups, toggle switches, live format preview
- **Enhanced Syntax Checking** -- 15+ syntax and code quality checks with intelligent hints
- **Safe Parameter Handling** -- JDBC `:?` parameter support, regex injection protection, batch parameter replacement
- **Highly Customizable** -- 40+ options satisfying various team conventions
- **Command Support** -- "Format Selection" command for partial formatting
- **Syntax Error Detection** -- AST-based real-time SQL syntax error detection with friendly prompts
- **Quick Fix** -- One-click fixes for syntax issues
- **Status Bar Display** -- Shows current SQL dialect with quick access
- **Code Snippets** -- Common SQL snippets for efficiency
- **Code Folding** -- Fold CTE, subquery, function blocks
- **Outline View** -- Document outline for quick navigation
- **Code Navigation** -- Go to Definition (F12), Find All References (Shift+F12), Rename Symbol (F2) for CTE/table alias/column alias
- **Breadcrumb Navigation** -- Clause-level breadcrumbs: SELECT/FROM/WHERE/GROUP BY/HAVING/ORDER BY
- **Parameterized Queries** -- Variable highlighting and batch replacement (including JDBC `:?`)
- **SQL Lint** -- 17+ built-in lint rules with custom configuration
- **DDL Conversion** -- AST-based MySQL to/from Hive CREATE TABLE conversion

### Quick Start

1. After installing, open any `.sql` or `.hql` file
2. Use `Shift+Alt+F` (Windows/Linux) or `Shift+Option+F` (Mac) to format
3. Or right-click and select "Format Document"
4. Or use Command Palette: "Format Selection (Hive Formatter)"

### Visual Config Editor

Use the graphical config interface to easily adjust formatting options:

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Search for "Hive Formatter Config"
3. Enter SQL in the preview area and click "Format Preview"
4. Adjust options in the config area below (multi-column flow layout, adaptive, no white gaps)
5. Drag the divider between preview and config areas to resize
6. Quick presets available: Default, Hive, MySQL, Compact
7. Click "Save Config" to apply changes

### Enhanced Syntax Checking

The plugin provides 15+ enhanced syntax and code quality checks:

#### Syntax Error Checks
- HAVING clause missing GROUP BY (correctly checks GROUP BY before HAVING)
- LIMIT missing numeric argument (supports placeholders and ALL/OFFSET syntax)
- JOIN missing ON or USING clause (supports CROSS/NATURAL JOIN)
- Incorrect DISTINCT placement
- Aggregate functions in WHERE clause (excludes legitimate usage in subqueries)
- Using * in UPDATE statements
- Incomplete CASE statements (correctly handles nested CASE, precise word boundary matching)
- Mismatched parentheses (excludes parentheses in strings and comments, supports SQL `''` escaping)
- Unclosed strings (supports SQL `''` escape quotes)
- Duplicate column aliases (only checks aliases after AS, correctly handles subqueries)

#### Code Quality Suggestions
- Duplicate table aliases
- Reserved words used as aliases (only checks aliases after AS, greatly reduces false positives)
- SELECT statement missing FROM clause (except for specific functions)
- INSERT statement missing column names
- Redundant DISTINCT usage
- Subquery missing alias (correctly handles nested subqueries)
- Suspicious NULL comparison (= NULL vs IS NULL)

#### Dialect Hints
- MySQL date function differences in Hive

#### Configuration Options
Configure in settings:
- `enableEnhancedChecks`: Enable enhanced checks
- `showErrorLevel`: Show error-level diagnostics
- `showWarningLevel`: Show warning-level diagnostics
- `showInfoLevel`: Show info-level hints

### Quick Fix

The plugin supports one-click quick fixes for detected issues:

- Fix `= NULL` to `IS NULL`
- Fix `!= NULL` / `<> NULL` to `IS NOT NULL`
- Wrap reserved word aliases with backticks
- Add alias to subqueries
- Add column name placeholders for INSERT statements
- Add GROUP BY for HAVING clauses

### Status Bar

The plugin displays the current SQL dialect in the VS Code status bar. Click to quickly open the config editor.

- Only shown in SQL and Hive files
- Real-time config change updates
- Quick access to config entry point

### Code Snippets

The plugin provides rich SQL code snippets. Enter the following prefixes to quickly insert:

| Prefix | Description |
|--------|-------------|
| `sel` | Basic SELECT statement |
| `seld` | SELECT DISTINCT |
| `join` | JOIN query |
| `leftjoin` | LEFT JOIN query |
| `groupby` | GROUP BY with aggregation |
| `case` | CASE WHEN statement |
| `insert` | INSERT INTO statement |
| `insertsel` | INSERT ... SELECT statement |
| `update` | UPDATE statement |
| `delete` | DELETE statement |
| `ct` | CREATE TABLE statement |
| `ctas` | CREATE TABLE AS SELECT |
| `with` | WITH common table expression |
| `union` | UNION ALL |
| `hivepart` | Hive partition insert |
| `hiveselpart` | Hive partition query |
| `hiveext` | Hive external table |
| `flinkkafka` | FlinkSQL Kafka table DDL |
| `flinkjdbc` | FlinkSQL JDBC table DDL |
| `flinktumble` | FlinkSQL tumbling window |
| `flinkhop` | FlinkSQL hopping window |
| `flinkcumulate` | FlinkSQL cumulative window |
| `flinkwatermark` | FlinkSQL watermark definition |
| `flinktemporal` | FlinkSQL temporal join |
| `flinkdedup` | FlinkSQL dedup query |
| `header` | File header comment (auto-fills author, auto-detects table dependencies) |
| `todo` | TODO comment (with assignee) |
| `fixme` | FIXME comment |
| `hack` | HACK workaround comment |
| `desc` | Query description comment block |
| `section` | Section divider comment |
| `col` | Column COMMENT |
| `tbl` | Table COMMENT |

### Smart Completion (IntelliSense)

The plugin provides powerful intelligent completion. Just start typing to get automatic suggestions for keywords, functions, snippets, etc., greatly reducing the cognitive load of writing SQL.

#### Completion Types

| Type | Description | Example |
|------|-------------|---------|
| **Keyword Completion** | Type SEL -> suggests SELECT, covering keywords and data types across multiple dialects | `SEL` -> `SELECT` |
| **Function Completion** | Type SUB -> suggests SUBSTR(string, start, length), showing signature, parameter descriptions, return type, and Chinese category | `SUB` -> `SUBSTR(string, start, length)` |
| **Snippet Completion** | Shows the 17 existing SQL snippets in the completion list | `sel` -> inserts complete SELECT template |
| **CTE Name Completion** | After defining a WITH clause, automatically suggests CTE names in subsequent queries | `WITH cte_name AS (...) SELECT` -> suggests `cte_name` |
| **Identifier Completion** | Based on the current SQL clause context, intelligently suggests table names and column names | FROM clause suggests tables, SELECT suggests columns |

#### Function Signature Library

The plugin includes 580+ function signatures covering multiple dialects. Each function includes:
- Parameter list (with placeholder hints)
- Return value type
- Chinese description
- Function category tag (String/Math/Date/Aggregate/Conditional/Window/Set/JSON/Type Conversion/Encryption/Table-Generating/Other)

#### Configuration Options

Search "Hive Formatter" in VS Code settings to control completion behavior:

| Setting | Description | Default |
|---------|-------------|---------|
| `enableCompletion` | Enable intelligent completion | `true` |
| `completion.keywords` | Include keywords in completion list | `true` |
| `completion.functions` | Include functions in completion list | `true` |
| `completion.snippets` | Include code snippets in completion list | `false` |
| `completion.cteNames` | Suggest CTE names | `true` |
| `completion.identifiers` | Suggest table and column names | `true` |
| `completion.commentSnippets` | Include comment template snippets in completion list | `true` |

### Comment Enhancement

The plugin provides three major comment enhancement features: smart comment toggling, comment template completion, and comment lint rules.

#### Smart Comment Toggling

| Shortcut | Function |
|----------|----------|
| `Ctrl+/` / `Cmd+/` | Smart comment toggle: single line uses line comment, multi-line uses block comment |
| `Ctrl+Shift+/` / `Cmd+Shift+/` | Advanced comment: selected SQL statement wraps with format-disable markers, DDL column lines add COMMENT, other cases toggle block comment |

#### Comment Template Completion

Enter prefixes to quickly insert comment templates:

| Prefix | Description |
|--------|-------------|
| `header` | File header comment (auto-fills author and modifier, auto-detects upstream/downstream table dependencies) |
| `col` | Column COMMENT (intelligently handles comma position) |
| `tbl` | Table COMMENT |
| `todo` | TODO comment (with assignee) |
| `fixme` | FIXME comment |
| `hack` | HACK workaround comment |
| `desc` | Query description comment block |
| `section` | Section divider comment |

#### Comment Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `enableSmartCommentToggle` | Enable SQL-aware smart comment toggling | `true` |
| `headerAuthor` | Author name in file header comments | `""` |
| `headerModifier` | Modifier name in file header comments (falls back to headerAuthor if empty) | `""` |

### Extension Settings

Search "Hive Formatter" in VS Code settings to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| `dialect` | Select SQL dialect (auto-detect/hive/mysql/spark/flinksql/sql/postgresql/bigquery/sqlite) | `hive` |
| `ignoreTabSettings` | Ignore editor tabSize and insertSpaces settings | `false` |
| `tabSizeOverride` | Override tabSize setting (requires ignoreTabSettings enabled) | `2` |
| `insertSpacesOverride` | Override insertSpaces setting (requires ignoreTabSettings enabled) | `true` |
| `keywordCase` | Keyword case (preserve/upper/lower) | `preserve` |
| `dataTypeCase` | Data type case (preserve/upper/lower) | `preserve` |
| `functionCase` | Function name case (preserve/upper/lower) | `preserve` |
| `identifierCase` | Identifier case (preserve/upper/lower) | `preserve` |
| `indentStyle` | Indentation style (standard/tabularLeft/tabularRight) | `standard` |
| `logicalOperatorNewline` | AND/OR newline position (before/after) | `before` |
| `expressionWidth` | Character threshold for splitting expressions into multiple lines | `50` |
| `linesBetweenQueries` | Number of blank lines between query statements | `1` |
| `denseOperators` | Remove spaces around operators | `false` |
| `newlineBeforeSemicolon` | Place semicolon on a new line | `false` |
| `paramTypes` | Specify supported parameter placeholder types | - |
| `enableNavigation` | Enable/disable code navigation features (Go to Definition, Find References, Rename Symbol, Breadcrumbs) | `true` |

#### Indentation Style Guide

- **standard**: Standard SQL format with cascading indentation
- **tabularLeft**: Keep space columns between keywords and arguments, left-align keywords
- **tabularRight**: Keep space columns between keywords and arguments, right-align keywords

### SQL Lint

The plugin provides powerful SQL linting with 17+ built-in rules and custom configuration:

#### Lint Rules

| Rule ID | Description | Default | Level |
|---------|-------------|---------|-------|
| `avoid_select_star` | Avoid SELECT *, specify column names explicitly | Enabled | Warning |
| `explicit_join_type` | Suggest explicit JOIN type (INNER/LEFT/RIGHT) | Enabled | Info |
| `limit_with_order_by` | Suggest ORDER BY when using LIMIT | Enabled | Warning |
| `avoid_column_count_mismatch` | Check INSERT column count matches value count | Enabled | Error |
| `missing_primary_key` | Suggest defining primary key in CREATE TABLE | Enabled | Warning |
| `use_current_timestamp` | Suggest CURRENT_TIMESTAMP for better compatibility | Enabled | Info |
| `avoid_select_in_insert` | Suggest explicit column names in INSERT | Enabled | Warning |
| `duplicate_column_aliases` | Check for duplicate column aliases | Enabled | Warning |
| `use_coalesce_over_isnull` | Suggest COALESCE instead of ISNULL/IFNULL | Disabled | Info |
| `avoid_correlated_subqueries` | Correlated subqueries may impact performance | Disabled | Warning |
| `long_query_line` | Suggest multi-line formatting for long queries | Disabled | Info |
| `explicit_column_aliasing` | Suggest using AS keyword for column aliases | Disabled | Info |
| `uppercase_keywords` | Suggest uppercase for SQL keywords | Disabled | Info |
| `missing_query_comment` | Complex queries missing description comments | Enabled | Warning |
| `missing_column_comment` | DDL columns missing COMMENT | Enabled | Warning |
| `commented_out_code` | Commented-out code | Enabled | Info |
| `expired_todo` | Expired TODO/FIXME | Enabled | Info |

#### Configuring Lint Rules

Search "Hive Formatter" in VS Code settings to:
1. Enable/disable linting via `Hive-Formatter.enableLinter`
2. Configure each rule's enabled status and severity via `Hive-Formatter.lint.<ruleId>`
3. Severity levels: `error`, `warning`, `information`, `hint`

### Supported File Types

- `.sql` - SQL files
- `.hql` - HiveQL files
- `.sparksql` - SparkSQL files
- `.flinksql` - FlinkSQL files

### Usage Example

#### Before Formatting
```sql
select id,name,email from users where age>18 and status='active' order by created_at desc limit 10;
```

#### After Formatting (standard style)
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

### Syntax Error Detection

The plugin performs real-time AST-based SQL syntax error detection, highlighting errors with red squiggly lines in the editor and providing detailed error messages in the Problems panel.

#### Supported Error Types

- Missing column name after comma (e.g. `select id, from ...`)
- Missing column name after SELECT
- Missing table name after FROM
- Mismatched parentheses (excludes parentheses in strings and comments)
- Unclosed strings (supports escaped quotes `''`)
- Missing column name after ORDER BY
- Missing condition after WHERE
- Missing column name after GROUP BY
- Trailing comma

Error messages include line numbers for quick location and fix.

### Feedback & Contributions

If you have questions or good formatting configuration suggestions, please provide feedback on [GitHub Issues](https://github.com/BryceQin/Hive-Formatter/issues).

### Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

### Requirements

- VS Code ^1.85.0

### License

MIT

---

## 中文

一个强大的 SQL 格式化 VSCode 插件，支持 Hive、MySQL、SparkSQL、FlinkSQL、PostgreSQL、BigQuery、SQLite 等多种 SQL 方言，提供丰富的自定义配置选项。

> **v1.8.0 全面优化** -- 国际化全面改造（设置界面跟随 VS Code 语言切换）、README/CHANGELOG 双语化、配置编辑器多语言、统一方言注册中心、修复内存泄漏、架构优化。

> **v1.7.0 跳转与导航增强** -- Go to Definition（CTE/表别名/列别名）、Find All References、Rename Symbol（含保留字/冲突校验）、Breadcrumb 子句级导航、AstNavigator 共享导航引擎。

## 特性

区别于市场上多数仅提供单一格式化效果的 SQL 插件，本工具以个性化配置为核心设计理念，内置丰富的可配置项：

- **多种 SQL 方言支持** - Hive、MySQL、SparkSQL、FlinkSQL、PostgreSQL、BigQuery、SQLite、通用 SQL
- **AST 驱动架构** - 基于 node-sql-parser v5.x，所有核心功能（格式化、诊断、Lint、补全、转换）均基于 AST 实现
- **丰富的格式化选项** - 关键字大小写、缩进风格、换行策略等 40+ 可配置项
- **智能补全（IntelliSense）** - 关键字、函数签名、代码片段、CTE、标识符智能提示，基于 AST 上下文感知
- **注释增强** - 智能注释切换、注释模板补全、注释 Lint 规则
- **灵活的缩进配置** - 支持标准缩进和表格风格对齐
- **可视化配置编辑器** - 现代化图形化配置界面，可折叠分组、Toggle 开关、实时预览格式化效果
- **增强的语法检查** - 15+ 项语法和代码质量检查，智能提示，减少误报
- **安全的参数处理** - 支持 JDBC `:?` 参数、正则注入防护、参数批量替换
- **高度自定义** - 超过 40 项可配置项满足各种团队规范
- **命令支持** - 提供"格式化选择"命令，支持部分格式化
- **语法错误检测** - 基于 AST 解析实时检测 SQL 语法错误并提供友好的中文提示
- **快速修复** - 配合语法检查提供一键修复功能
- **状态栏显示** - 显示当前 SQL 方言和快捷操作入口
- **代码片段** - 提供常用 SQL 代码片段，提升编写效率
- **代码折叠** - 支持 CTE、子查询、函数块等代码块的折叠
- **大纲视图** - 提供 SQL 文档的大纲视图，快速导航
- **代码导航** - Go to Definition（F12）、Find All References（Shift+F12）、Rename Symbol（F2），支持 CTE/表别名/列别名
- **Breadcrumb 导航** - 子句级面包屑导航，SELECT/FROM/WHERE/GROUP BY/HAVING/ORDER BY 一目了然
- **参数化查询** - 支持变量高亮和批量替换功能（含 JDBC `:?` 参数支持）
- **SQL Lint** - 内置 17+ 条 Lint 规则，支持自定义配置
- **DDL 转换** - 基于 AST 的 MySQL <-> Hive CREATE TABLE 语句转换

## 快速开始

1. 安装插件后，打开任意 `.sql` 或 `.hql` 文件
2. 使用快捷键 `Shift+Alt+F`（Windows/Linux）或 `Shift+Option+F`（Mac）格式化文档
3. 或右键选择"格式化文档"
4. 或使用命令面板搜索"Format Selection (Hive Formatter)"格式化选中内容

## 可视化配置编辑器

使用图形化配置界面轻松调整格式化选项：

1. 按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）打开命令面板
2. 搜索并选择 "Hive Formatter Config"
3. 在顶部预览区输入 SQL 并点击"格式化预览"查看效果
4. 在底部配置区调整选项，多列流式布局自适应，无空白间隙
5. 拖拽预览区和配置区之间的分割线可调整预览区高度
6. 支持快速预设（默认、Hive、MySQL、紧凑）
7. 点击"保存配置"应用更改

## 增强的语法检查

插件提供 15+ 项增强的语法和代码质量检查功能：

### 语法错误检查
- HAVING 子句缺少 GROUP BY（正确检查 GROUP BY 在 HAVING 之前）
- LIMIT 缺少数字参数（支持占位符和 ALL/OFFSET 语法）
- JOIN 缺少 ON 或 USING 子句（支持 CROSS/NATURAL JOIN）
- 错误的 DISTINCT 位置
- WHERE 子句中使用聚合函数（排除子查询中的合法用法）
- UPDATE 语句中使用 *
- 不完整的 CASE 语句（正确处理嵌套 CASE，精确词边界匹配）
- 括号不匹配（排除字符串和注释中的括号，支持 SQL '' 转义）
- 未闭合的字符串（支持 SQL '' 转义引号）
- 重复列别名（仅检查 AS 后的别名，正确处理子查询）

### 代码质量建议
- 重复的表别名
- 使用保留字作为别名（仅检查 AS 后的别名，大幅减少误报）
- SELECT 语句缺少 FROM 子句（特定函数除外）
- INSERT 语句缺少列名
- 冗余的 DISTINCT 用法
- 子查询缺少别名（正确处理嵌套子查询）
- 可疑的 NULL 比较（= NULL vs IS NULL）

### 方言提示
- MySQL 日期函数在 Hive 中的差异提示

### 配置选项
在设置中可以配置：
- `enableEnhancedChecks`: 是否启用增强检查
- `showErrorLevel`: 是否显示错误级别的诊断
- `showWarningLevel`: 是否显示警告级别的诊断
- `showInfoLevel`: 是否显示信息级别的提示

## 快速修复功能

插件支持对检测到的问题提供一键快速修复：

- 将 `= NULL` 自动修复为 `IS NULL`
- 将 `!= NULL` / `<> NULL` 自动修复为 `IS NOT NULL`
- 为保留字别名添加反引号包裹
- 为子查询添加别名
- 为 INSERT 语句添加列名占位符（修复插入位置错误）
- 为 HAVING 子句添加 GROUP BY

## 状态栏功能

插件会在 VSCode 状态栏显示当前使用的 SQL 方言，点击可快速打开配置编辑器。

- 只在 SQL 和 Hive 文件中显示
- 实时更新配置变更
- 快速访问配置入口

## 代码片段

插件提供丰富的 SQL 代码片段，输入以下前缀即可快速插入：

| 前缀 | 说明 |
|------|------|
| `sel` | 基础 SELECT 语句 |
| `seld` | SELECT DISTINCT |
| `join` | JOIN 查询 |
| `leftjoin` | LEFT JOIN 查询 |
| `groupby` | GROUP BY 带聚合 |
| `case` | CASE WHEN 语句 |
| `insert` | INSERT INTO 语句 |
| `insertsel` | INSERT ... SELECT 语句 |
| `update` | UPDATE 语句 |
| `delete` | DELETE 语句 |
| `ct` | CREATE TABLE 语句 |
| `ctas` | CREATE TABLE AS SELECT |
| `with` | WITH 通用表表达式 |
| `union` | UNION ALL |
| `hivepart` | Hive 分区插入 |
| `hiveselpart` | Hive 分区查询 |
| `hiveext` | Hive 外部表 |
| `flinkkafka` | FlinkSQL Kafka 建表 |
| `flinkjdbc` | FlinkSQL JDBC 建表 |
| `flinktumble` | FlinkSQL 滚动窗口 |
| `flinkhop` | FlinkSQL 滑动窗口 |
| `flinkcumulate` | FlinkSQL 累积窗口 |
| `flinkwatermark` | FlinkSQL Watermark 定义 |
| `flinktemporal` | FlinkSQL 时态关联 |
| `flinkdedup` | FlinkSQL 去重查询 |
| `header` | 文件头注释（配置作者后自动填充，自动检测表依赖） |
| `todo` | TODO 注释（带责任人） |
| `fixme` | FIXME 注释 |
| `hack` | HACK 临时方案注释 |
| `desc` | 查询说明注释块 |
| `section` | 分区标题注释 |
| `header` | 文件头注释（自动检测表依赖） |
| `col` | 列 COMMENT |
| `tbl` | 表 COMMENT |

## 智能补全

插件提供强大的智能补全功能，输入字符即可自动提示关键字、函数、代码片段等，大幅降低 SQL 编写的心智负担。

### 补全类型

| 补全类型 | 说明 | 示例 |
|---------|------|------|
| **关键字补全** | 输入 SEL → 提示 SELECT，覆盖多种方言的全部关键字和数据类型 | `SEL` → `SELECT` |
| **函数补全** | 输入 SUB → 提示 SUBSTR(string, start, length)，展示签名、参数说明、返回值类型和中文分类 | `SUB` → `SUBSTR(string, start, length)` |
| **代码片段补全** | 在补全列表中展示已有的 17 个 SQL 代码片段 | `sel` → 插入完整 SELECT 模板 |
| **CTE 名称补全** | 定义 WITH 子句后，后续查询自动提示 CTE 名称 | `WITH cte_name AS (...) SELECT` → 提示 `cte_name` |
| **标识符补全** | 根据当前 SQL 子句上下文，智能提示表名和列名 | FROM 子句中提示表名，SELECT 中提示列名 |

### 函数签名库

插件内置 580+ 函数签名，覆盖多种方言，每个函数包含：
- 参数列表（带占位符提示）
- 返回值类型
- 中文描述
- 函数分类标签（字符串/数学/日期/聚合/条件/窗口/集合/JSON/类型转换/加密/表生成/其他）

### 配置选项

在 VSCode 设置中搜索 "Hive Formatter" 可以控制补全行为：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `enableCompletion` | 是否启用智能补全功能 | `true` |
| `completion.keywords` | 补全列表中是否包含关键字 | `true` |
| `completion.functions` | 补全列表中是否包含函数 | `true` |
| `completion.snippets` | 补全列表中是否包含代码片段 | `false` |
| `completion.cteNames` | 是否提示 CTE 名称 | `true` |
| `completion.identifiers` | 是否提示表名和列名 | `true` |
| `completion.commentSnippets` | 补全列表中是否包含注释模板片段 | `true` |

## 注释增强

插件提供智能注释切换、注释模板补全和注释 Lint 规则三大注释增强功能。

### 智能注释切换

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+/` / `Cmd+/` | 智能切换注释：单行用行注释，多行用块注释 |
| `Ctrl+Shift+/` / `Cmd+Shift+/` | 高级注释：选中 SQL 语句包裹格式化禁用标记，DDL 列行添加 COMMENT，其他切换块注释 |

### 注释模板补全

输入前缀即可快速插入注释模板：

| 前缀 | 说明 |
|------|------|
| `header` | 文件头注释（配置作者后自动填充作者和修改人，自动检测上下游表依赖） |
| `col` | 列 COMMENT（智能处理逗号位置） |
| `tbl` | 表 COMMENT |
| `todo` | TODO 注释（带责任人） |
| `fixme` | FIXME 注释 |
| `hack` | HACK 临时方案注释 |
| `desc` | 查询说明注释块 |
| `section` | 分区标题注释 |

### 注释配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `enableSmartCommentToggle` | 是否启用 SQL 感知的智能注释切换 | `true` |
| `headerAuthor` | 文件头注释中的作者名 | `""` |
| `headerModifier` | 文件头注释中的修改人（为空时回退取 headerAuthor） | `""` |

## 扩展设置

在 VSCode 设置中搜索 "Hive Formatter" 进行配置：

| 设置项 | 描述 | 默认值 |
|--------|------|--------|
| `dialect` | 选择使用的SQL方言（auto-detect/hive/mysql/spark/flinksql/sql/postgresql/bigquery/sqlite） | `hive` |
| `ignoreTabSettings` | 是否忽略编辑器的 tabSize 和 insertSpaces 设置 | `false` |
| `tabSizeOverride` | 覆盖 tabSize 设置（需要先启用 ignoreTabSettings） | `2` |
| `insertSpacesOverride` | 覆盖 insertSpaces 设置（需要先启用 ignoreTabSettings） | `true` |
| `keywordCase` | 关键字大小写（preserve/upper/lower） | `preserve` |
| `dataTypeCase` | 数据类型大小写（preserve/upper/lower） | `preserve` |
| `functionCase` | 函数名大小写（preserve/upper/lower） | `preserve` |
| `identifierCase` | 标识符大小写（preserve/upper/lower） | `preserve` |
| `indentStyle` | 缩进风格（standard/tabularLeft/tabularRight） | `standard` |
| `logicalOperatorNewline` | AND/OR 换行位置（before/after） | `before` |
| `expressionWidth` | 表达式拆分为多行的字符阈值 | `50` |
| `linesBetweenQueries` | 查询语句之间的空行数 | `1` |
| `denseOperators` | 是否去除运算符周围的空格 | `false` |
| `newlineBeforeSemicolon` | 分号是否另起一行 | `false` |
| `paramTypes` | 指定支持的参数占位符类型 | - |
| `enableNavigation` | 启用/禁用代码导航功能（跳转到定义、查找引用、重命名符号、面包屑导航） | `true` |

### 缩进风格说明

- **standard**: 标准 SQL 格式，带有级联缩进
- **tabularLeft**: 在关键字和参数之间保留空格列，使关键字左对齐
- **tabularRight**: 在关键字和参数之间保留空格列，将关键字向右对齐

## SQL Lint 功能

插件提供强大的 SQL Lint 功能，内置 17+ 条规则，支持自定义配置：

### Lint 规则列表

| 规则 ID | 说明 | 默认状态 | 默认级别 |
|--------|------|--------|--------|
| `avoid_select_star` | 避免使用 SELECT *，建议明确指定列名 | 启用 | Warning |
| `explicit_join_type` | 建议显式指定 JOIN 类型（INNER/LEFT/RIGHT） | 启用 | Info |
| `limit_with_order_by` | 使用 LIMIT 时建议同时使用 ORDER BY | 启用 | Warning |
| `avoid_column_count_mismatch` | 检查 INSERT 语句列数和值数匹配 | 启用 | Error |
| `missing_primary_key` | CREATE TABLE 建议定义主键 | 启用 | Warning |
| `use_current_timestamp` | 建议使用 CURRENT_TIMESTAMP 获得更好兼容性 | 启用 | Info |
| `avoid_select_in_insert` | INSERT 语句中建议明确指定列名 | 启用 | Warning |
| `duplicate_column_aliases` | 检查重复的列别名 | 启用 | Warning |
| `use_coalesce_over_isnull` | 建议使用 COALESCE 而不是 ISNULL/IFNULL | 禁用 | Info |
| `avoid_correlated_subqueries` | 相关子查询可能影响性能 | 禁用 | Warning |
| `long_query_line` | 建议将长查询多行格式化 | 禁用 | Info |
| `explicit_column_aliasing` | 建议使用 AS 关键字明确指定列别名 | 禁用 | Info |
| `uppercase_keywords` | 建议 SQL 关键字使用大写 | 禁用 | Info |
| `missing_query_comment` | 复杂查询缺少说明注释 | 启用 | Warning |
| `missing_column_comment` | DDL 列缺少 COMMENT | 启用 | Warning |
| `commented_out_code` | 注释掉的代码 | 启用 | Info |
| `expired_todo` | 过期的 TODO/FIXME | 启用 | Info |

### 配置 Lint 规则

在 VSCode 设置中搜索 "Hive Formatter"，可以：
1. 通过 `Hive-Formatter.enableLinter` 启用/禁用 Lint 功能
2. 通过 `Hive-Formatter.lint.<ruleId>` 配置每条规则的启用状态和严重级别
3. 严重级别支持：`error`、`warning`、`information`、`hint`

## 支持的文件类型

- `.sql` - SQL 文件
- `.hql` - HiveQL 文件
- `.sparksql` - SparkSQL 文件
- `.flinksql` - FlinkSQL 文件

## 使用示例

### 格式化前
```sql
select id,name,email from users where age>18 and status='active' order by created_at desc limit 10;
```

### 格式化后（standard 风格）
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

## 语法错误检测

插件会基于 AST 解析实时检测 SQL 语法错误，并在编辑器中用红色波浪线高亮显示，同时在问题面板中提供详细的中文错误信息。

### 支持检测的错误类型

- 逗号后面缺少列名（如 `select id, from ...`）
- SELECT 后面缺少列名
- FROM 后面缺少表名
- 不匹配的括号（排除字符串和注释中的括号）
- 未正确闭合的字符串（支持转义引号 `''`）
- ORDER BY 后面缺少列名
- WHERE 后面缺少条件
- GROUP BY 后面缺少列名
- 多余的逗号

错误信息会明确指出问题所在的行号，方便快速定位和修复。

## 反馈与贡献

如果你有问题或者好的格式化配置建议，欢迎在 [GitHub Issues](https://github.com/BryceQin/Hive-Formatter/issues) 反馈。

## 更新日志

请查看 [CHANGELOG.md](CHANGELOG.md) 文件了解详细的版本更新历史。

## 许可证

MIT License