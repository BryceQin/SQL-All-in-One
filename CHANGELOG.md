# 更新日志

## 1.7.0

### 🧭 跳转与导航增强

- **Go to Definition**：支持 CTE 名称、表别名、列别名的跳转到定义，光标置于标识符上按 F12 即可跳转
- **Find All References**：支持查找 CTE、表别名、列别名的所有引用位置，Shift+F12 查看引用面板
- **Rename Symbol**：支持 CTE、表别名、列别名的重命名，F2 触发重命名，自动更新定义和所有引用
  - 保留字冲突校验：新名称不能是 SQL 保留字
  - 名称冲突校验：新名称不能与已有符号重名
  - 格式非法校验：名称只能包含字母、数字和下划线
- **Breadcrumb 导航增强**：大纲视图新增子句级层级符号
  - SELECT 列（含列别名子节点）
  - FROM/JOIN 子句（显示表名和别名）
  - WHERE / GROUP BY / HAVING / ORDER BY 子句
  - 30 字符自动截断，避免过长标签
- **AstNavigator 共享导航引擎**：构建符号索引（CTE 定义、表别名定义、列别名定义），复用 DocumentAstCache 避免重复解析
- **引用上下文标签**：引用结果附带细粒度上下文（FROM 子句 / JOIN 子句 / WHERE 条件 / ON 条件 / SELECT 列 / ORDER BY / HAVING）
- **enableNavigation 配置项**：统一管控跳转、引用、重命名和面包屑导航功能，默认启用

## 1.5.0

### 🏗️ 架构深度优化

- **依赖注入容器**：新增 DIContainer，统一管理 ConfigManager、ParserEngine、DocumentAstCache、ErrorHandler、PerformanceMonitor，支持 register()/get()/registerFactory() 接口
- **类型守卫系统**：新增 astTypes.extended.ts 和 typeGuards.ts，为所有 AST 节点类型（Select/Insert/Update/Delete/Create/ColumnRef/FunctionCall）提供 is* 和 as* 类型守卫
- **性能监控框架**：新增 PerformanceMonitor，提供 measure()/measureAsync() 接口，支持 getStats() 查看统计
- **LRU 缓存实现**：新增 utils/lruCache.ts，支持 maxSize/maxAge 配置，自动 evict 过期数据
- **懒加载工具库**：新增 utils/lazy.ts，提供 Lazy 和 LazyAsync 工具类，优化资源加载
- **类型安全加强**：启用 eslint @typescript-eslint/no-explicit-any 为 warn，逐步替换 any 类型为安全类型

### ⚡ 性能优化增强

- **DocumentAstCache 升级**：替换 Map 为 LRUCache（max 50 entries, 30s TTL），内存占用更可控
- **启动流程分阶段**：extension.ts 实现分阶段激活，核心功能（命令 + 格式化）立即初始化，其他 Provider 延迟 100ms 初始化
- **懒加载 Provider**：所有 Provider （SqlDiagnosticsProvider、StatusBarProvider、SqlParameterHightlighter、SqlCompletionProvider、SqlCodeActionProvider、SqlFoldingRangeProvider、SqlOutlineProvider、SqlHoverProvider）均采用 lazy 初始化，首次使用时才创建实例

### 🛡️ 错误处理升级

- **ErrorHandler 重写**：新增 ErrorLevel（DEBUG/INFO/WARNING/ERROR/FATAL）和 FormatterError 接口，统一错误处理
- **try/tryAsync**：新增 ErrorHandler.try() 和 tryAsync() 方法，支持 fallback 和 rethrow 配置
- **错误历史记录**：新增 getHistory() 和 clearHistory() 方法，便于问题排查
- **错误监听器**：新增 addListener() 机制，可监听错误事件

### ⚙️ 配置管理升级

- **ConfigManager 扩展**：新增 registerValidator() 方法，支持配置项验证
- **验证机制**：Config.get() 调用前会先验证配置值，非法值使用默认值

## 1.4.0

### ⚡ 性能优化

- **AST 单次解析**：诊断流程从 3 次独立 AST 解析优化为 1 次解析 + 结果共享，诊断性能提升约 60-70%
- **诊断防抖**：`onDidChangeTextDocument` 事件增加 300ms 防抖，避免快速输入时产生大量无效解析
- **补全项缓存**：关键字和函数补全项按方言缓存，避免每次触发补全时重复生成
- **Snippet 异步加载**：`fs.readFileSync` 改为 `fs.promises.readFile`，避免激活时阻塞扩展宿主线程
- **Provider 单例化**：`SqlCodeActionProvider`、`SqlFoldingRangeProvider`、`SqlOutlineProvider`、`SqlHoverProvider` 从每语言一个实例改为单例共享（32 → 4 个实例）
- **正则预编译**：`checkCommentedOutCode` 中的 SQL 关键字正则从循环内编译改为模块级预编译

### 🏗️ 架构优化

- **activate() 模块化**：提取 `safeRegister()` 统一错误处理，6 个独立注册函数替代 200 行单体函数，`activate()` 缩减至 ~40 行
- **共享类型定义**：`AstLocation`、`AstNode` 从 4 个文件中移除，统一到 `parser/astTypes.ts`
- **共享工具方法**：`getNodeLocation`、`getFunctionName`、`createDiagnostic` 等 6 个方法从 3 个文件中移除，统一到 `parser/astUtils.ts`
- **Lint 规则统一管理**：新建 `linter/lintRules.ts`，规则定义和配置加载集中管理，`SqlLinter` 从 95 行精简到 28 行
- **统一配置管理器**：新建 `core/configManager.ts`，集中缓存配置项，监听变更自动失效，支持 i18n 运行时语言切换
- **统一错误处理**：新建 `core/errorHandler.ts`，三级分类（CRITICAL/FEATURE/SUB_ITEM），格式化和补全等模块接入

### 🔧 功能改进

- **Outline 基于 AST**：`SqlOutlineProvider` 优先使用 AST 解析提取符号，AST 失败时回退到正则方法，准确度大幅提升
- **Folding 基于 AST**：`SqlFoldingRangeProvider` 优先使用 AST 解析生成折叠范围，AST 失败时回退到正则方法
- **StatusBar 语言检测修复**：状态栏现在在所有 SQL 方言文件中正确显示（之前仅 sql/hive）
- **参数替换语言检测修复**：`SqlParameterReplaceCommand` 现在在所有 SQL 方言中可用（之前仅 sql/hive）
- **i18n 运行时切换**：用户修改 `displayLanguage` 配置后自动刷新消息包，无需重启 VSCode

## 1.3.0

### 🆕 新增功能

- **FlinkSQL 方言支持**：新增 Apache FlinkSQL 方言，支持格式化、智能补全、语法检查、Hover 提示和代码片段
  - 基于 node-sql-parser v5.x 的 FlinkSQL 解析引擎
  - 237 个关键字、29 个数据类型、161 个函数名、108 个函数签名
  - 12 个 FlinkSQL 专属 Hover 提示（WATERMARK、TUMBLE、HOP、CUMULATE 等）
  - 8 个 FlinkSQL 代码片段（Kafka/JDBC 建表、窗口查询、去重等）
  - 语言 ID：`flinksql` / `flink-sql`，文件扩展名：`.flinksql`

### 🔧 改进

- **补全异常隔离**：`SqlCompletionProvider.provideCompletionItems()` 中每个子模块（关键字/函数/片段/CTE/标识符/注释）独立 try-catch，一个模块异常不影响其他补全项
- **代码片段去重**：清理 `sql.json` 中与 `common.json` 重复 prefix 的条目，移除不属于 SQL 方言的 Hive 条目
- **代码片段默认关闭**：`completion.snippets` 默认值改为 `false`，避免 VSCode 原生 `contributes.snippets` 与 Provider 双重提供导致重复项

### 🐛 Bug 修复

- **修复空文件补全重复**：键入 `sel` 时出现 3 个相同补全项的问题（根因：`common.json` + `sql.json` + Provider 三重提供）
- **修复有代码时补全失效**：文件中有代码时补全列表为空的问题（根因：子模块异常导致整个补全列表丢失）
- **修复头注释被删除**：分号后同行头注释格式化后被删除的问题，现在会正确移至最前面

## 1.2.0

### 🔧 架构重构

- **BaseSqlAdapter 抽象基类**：提取 HiveSqlAdapter 和 SparkSqlAdapter 的共享逻辑（replaceSortDistributeCluster/restoreSortDistributeCluster/escapeRegExp 等），消除 384 行重复代码
- **createConfig 简化**：使用 configMappings 数组替代重复的 get<> 调用，减少 62 行代码
- **isSqlDocument 去重**：从 extension.ts 和 SqlDiagnosticsProvider.ts 中提取共享的 isSqlDocument 和 getSqlLanguageIds 到 sqlDialects.ts

### 🐛 Bug 修复

- **修复独立注释缩进**：SELECT 语句中的独立注释（`-- a`）格式化后缩进与相邻列对齐
- **修复尾部注释处理**：`,user--a` 格式化后 `-- a` 作为独立行插入到 `user` 之前
- **修复注释规范化**：`--` 后自动添加空格（`--a` → `-- a`）
- **修复头注释被删除**：分号后同行头注释格式化后被删除，现在正确移至最前面

## 1.1.0

### 🔧 架构重构

- **ConfigEditorPanel 模板外部化**：将 1800+ 行内嵌 HTML/CSS/JavaScript 从 TypeScript 文件中提取到独立文件（`media/config-editor.html`、`media/config-editor.css`、`media/config-editor.js`），核心文件从 2394 行缩减至 200 行（↓91.6%）
- **配置项集中管理**：新增 `src/config/configDefinitions.ts`，统一管理 85 个配置项和 18 条 Lint 规则的元数据、默认值和类型信息，消除 `_updateConfig`/`_resetConfig`/`_sendCurrentConfig` 中 300+ 行硬编码映射

### 🐛 Bug 修复

- 修复 Lint 规则 DOM ID 与后端 key 不匹配，导致配置编辑器中 Lint 规则状态无法正确加载
- 修复 postgresql/bigquery/sqlite 预设缺少部分配置项，切换预设时产生混合配置
- 修复 4 条 Lint 规则默认值与 package.json 不一致（missing_query_comment、missing_column_comment、commented_out_code、expired_todo）
- 修复模板文件加载缺少错误处理，文件缺失时导致整个 Webview 创建失败
- 修复格式化预览错误消息硬编码中文，改用 i18n 国际化

## 1.0.0

### 🏗️ 架构性重大升级

基于 node-sql-parser v5.x 全面重构为 AST 驱动架构，替代原有的 Nearley 解析器，所有核心功能（格式化、诊断、Lint、补全、转换）均基于 AST 实现。

### 🆕 新增功能

- **SqlParserEngine**：封装 node-sql-parser，提供 astify/sqlify/parse/tryAstify 统一接口，支持 includeLocations 选项
- **diaMapper**：方言名称映射（Spark 使用 Hive 语法解析），支持 7 种方言
- **AstVisitor**：通用 AST 遍历工具（walkAst/findNodes/findNodesOfType），支持无 type 属性的普通对象遍历
- **AstFormatter**：基于 AST 的 SQL 格式化器，替代旧的 Nearley 格式化管道
  - SelectFormatter：SELECT 语句格式化（含 UNION/CTE）
  - ExpressionFormatter2：表达式格式化（二元运算、函数调用、窗口函数、CASE 等）
  - InsertFormatter：INSERT 语句格式化
  - DDLFormatter：CREATE/ALTER/DROP 语句格式化
  - CaseFormatter：CASE WHEN 格式化
  - CTEFormatter：WITH/CTE 格式化
  - CommonFormatter：共享格式化工具函数
- **AstDiagnosticsProvider**：基于 AST 的 8 条语法诊断规则
- **AstEnhancedChecker**：基于 AST 的 15 条增强检查规则，消除字符串/注释中的误报
- **AstLinter**：基于 AST 的 15 条 Lint 规则，支持嵌套结构分析
- **AstConverter**：基于 AST 的 HIVE↔MySQL CREATE TABLE 转换
- **AstCompletionProvider**：基于 AST 的上下文感知补全（findCursorContext/extractCteNames/extractTableNames/extractColumnRefs）
- **i18n 测试支持**：新增 initI18nForTest() 方法，解决测试环境中 i18n 未初始化的问题
- **comprehensive.test.ts**：新增 49 个全面测试用例，覆盖格式化、解析、配置验证、AST 遍历、类型映射、DDL 转换等

### 🐛 Bug 修复

- 修复 AstVisitor.walkAst 不遍历没有 type 属性的普通对象（如 Column 包装结构），导致 findNodesOfType 无法找到嵌套节点
- 修复 AstLinter.getFunctionName() 无法提取 node-sql-parser v5.x 的 FunctionName 嵌套结构（`{ name: [{ type: "default", value: "IFNULL" }] }`）
- 修复 AstLinter.checkColumnCountMismatch() 不处理 Insert_Replace.values 为 `{ type: "values", values: [...] }` 对象的情况
- 修复 AstLinter.checkSelectInInsert() 不处理 INSERT...SELECT 通过 values 属性传递 select 节点的情况
- 修复 AstLinter.checkExplicitJoinType() 裸 JOIN 被解析为 "INNER JOIN" 导致无法检测
- 修复 AstLinter.checkAvoidSelectStar() 不处理 Column 对象没有 type 属性的情况
- 修复 AstLinter.checkDuplicateColumnAliases() 不处理 Column.as 为 `{ value: string }` 对象的情况
- 修复 AstLinter.checkMissingPrimaryKey() 不处理 primary_key 属性值为字符串 "primary key" 和 create_definitions 元素没有 type 属性的情况
- 修复 AstCompletionProvider.findCursorContext() 列号偏移问题（0-based → 1-based 转换缺少 column +1）
- 修复 AstCompletionProvider.getArrayClauseLoc() 不处理 groupby 为 `{ columns: [...], modifiers: [...] }` 对象的情况
- 修复 AstCompletionProvider.extractCteNames() 不处理 Select.with 为 With[] 数组和 With.name 为 `{ value: string }` 对象的情况
- 修复 AstCompletionProvider.determineFromContext() 不处理 from 条目没有 type 属性和 ON 子句位置超出 from 条目 loc 范围的情况
- 修复 typeMappings.ts 缺少 ENUM → STRING 和 SET → STRING 映射
- 修复 completion.test.ts getCategoryLabel 测试因 i18n 未初始化返回键名而非翻译

### ⚠️ 破坏性变更

- 移除 Oracle (PL/SQL) 方言支持（node-sql-parser 无对应解析器）
- 移除 Presto/Trino 方言支持（node-sql-parser 无对应解析器）
- 移除 Snowflake 方言支持（node-sql-parser 无对应解析器）
- Spark 方言改用 Hive 语法解析（替代 FlinkSQL）
- 移除 Nearley 依赖（nearley、@types/nearley）
- 删除旧 Nearley 解析器文件（LexerAdapter.ts、ast.ts、createParser.ts、grammar.ne、grammar.ts）
- 删除旧格式化器文件（Formatter.ts、ExpressionFormatter.ts）

### 📊 测试覆盖

- 262 个测试通过（从 213 个增加到 262 个，通过率从 89.1% 提升到 99.2%）
- 新增 49 个全面测试用例覆盖核心模块
- 修复 24 个因 node-sql-parser v5.x AST 结构变更导致的测试失败

## 0.23.0
- 引入 node-sql-parser 替代 Nearley 解析器，全面重构为 AST 驱动架构
- 新增 SqlParserEngine：封装 node-sql-parser，提供 astify/sqlify/parse/tryAstify 统一接口
- 新增 dialectMapper：方言名称映射（Spark 使用 Hive 语法解析）
- 新增 AstVisitor：通用 AST 遍历工具（walkAst/findNodes/findNodesOfType）
- 新增 AstFormatter：基于 AST 的 SQL 格式化器，替代旧的 Nearley 格式化管道
  - SelectFormatter：SELECT 语句格式化（含 UNION/CTE）
  - ExpressionFormatter2：表达式格式化（二元运算、函数调用、窗口函数、CASE 等）
  - InsertFormatter：INSERT 语句格式化
  - DDLFormatter：CREATE/ALTER/DROP 语句格式化
  - CaseFormatter：CASE WHEN 格式化
  - CTEFormatter：WITH/CTE 格式化
  - CommonFormatter：共享格式化工具函数
- 新增 AstDiagnosticsProvider：基于 AST 的 8 条语法诊断规则
- 新增 AstEnhancedChecker：基于 AST 的 15 条增强检查规则，消除字符串/注释中的误报
- 新增 AstLinter：基于 AST 的 15 条 Lint 规则，支持嵌套结构分析
- 新增 AstConverter：基于 AST 的 HIVE↔MySQL CREATE TABLE 转换
- 新增 AstCompletionProvider：基于 AST 的上下文感知补全（findCursorContext/extractCteNames/extractTableNames/extractColumnRefs）
- 移除 Oracle (PL/SQL) 方言支持（node-sql-parser 无对应解析器）
- 移除 Presto/Trino 方言支持（node-sql-parser 无对应解析器）
- 移除 Snowflake 方言支持（node-sql-parser 无对应解析器）
- Spark 方言改用 Hive 语法解析（替代 FlinkSQL）
- 移除 Nearley 依赖（nearley、@types/nearley）
- 删除旧 Nearley 解析器文件（LexerAdapter.ts、ast.ts、createParser.ts、grammar.ne、grammar.ts）
- 删除旧格式化器文件（Formatter.ts、ExpressionFormatter.ts）
- 当前支持 7 种方言：MySQL、Hive、Spark(→Hive)、PostgreSQL、BigQuery、SQLite、SQL

## 0.22.0
- 修复插件激活失败：initI18n() 无 try-catch 保护，异常导致整个扩展静默失败
- 修复插件激活失败：activate() 整体无异常保护，命令和 Provider 均不注册
- 修复自动补全重复项：package.json contributes.snippets 与 SqlCompletionProvider 双重提供代码片段
- 增强 SqlCompletionProvider：按方言加载 common.json + 方言专属 snippet 文件，按 prefix 去重
- 移除 README 中的鸣谢内容

## 0.21.0
- 修复 i18n t() 函数 replace 只替换第一个匹配项（改为 replaceAll）
- 修复 i18n 语言检测只匹配 zh-cn 不覆盖 zh-CN/zh-Hans 等
- 修复 i18n 动态 require 改为静态 import（兼容打包工具）
- 修复 messages.en.json 中 lexer.parseError 参数索引完全错位
- 修复 messages.en/zh.json 中 4 个消息模板占位符 {0} 重复使用
- 修复 hive.keywords.ts UTC_TMESTAMP 拼写错误（之前修复未生效）
- 修复 hive.keywords.ts STRING/TINYINT 仍在 keywords 中重复
- 修复 hive.keywords.ts TIMESTAMPTZ 非 Hive 关键字未删除
- 修复 commentCompletion.ts FROM/JOIN/INSERT/CREATE 正则缺少 \b 词边界
- 修复 formatSelectionCommand.ts tabSize/insertSpaces 类型不安全强制转换
- 修复 converterCommands.ts 转换器调用缺少 try-catch 错误处理
- 优化 SqlFormattingProvider.ts 使用 document.getText() 替代逐行拼接

## 0.20.0
- 修复 UTC_TMESTAMP 拼写错误（应为 UTC_TIMESTAMP），删除非标准的 UTCTIMESTAMP
- 修复 Hive 格式化器缺少 LATERAL VIEW 子句（导致 LATERAL VIEW 格式化不正确）
- 修复 STRING/TINYINT 被错误分类为关键字而非数据类型（影响 dataTypeCase 配置）
- 删除非 Hive 关键字 TIMESTAMPTZ（PostgreSQL 类型）
- 修复 commentCompletion 中 removeCommentsAndStrings 处理顺序错误（字符串含 -- 被截断）
- 修复 commentCompletion 中字符串正则不处理 SQL 转义引号 ''
- 修复 commentCompletion 中 FROM/JOIN 正则缺少 \b 词边界
- 修复 identifierCompletion 中 alias 未转义直接注入正则（特殊字符导致崩溃）
- 修复 validateConfig 中 validateParamTypes 未校验正则表达式合法性
- 修复 config.ts 中 tabSizeOverride 可能为 undefined 导致格式化器崩溃
- 修复 configEditorCommand 中 _previewFormat 忽略 webview 未保存配置（预览不反映修改）
- 修复 commentCommands 中 isInsideCreateTable 括号计数错误

## 0.19.2
- 修复 checkIncompleteCase 中 substring+\b 词边界 Bug（encase/suitcase 等被误匹配为 CASE）
- 修复 checkDateFunctionUsage 中 now()/sysdate() 正则将括号当作捕获组
- 修复 createHavingFix 只找文档中第一个 HAVING 而非诊断对应位置
- 修复 mysqlConverter yearPlaceholders 占位符子串冲突（__YEAR_1__ 匹配 __YEAR_10__）
- 修复 mysqlConverter convert() 异常时 yearPlaceholders/yearIndex 状态未重置
- 修复 checkDuplicateColumnAliases 别名正则过于宽泛（改为只匹配 AS 后的别名）
- 修复 countCommaSeparated 不处理 SQL 转义引号 ''
- 修复 SqlParameterReplaceCommand 替换位置偏移（不同长度替换导致后续位置错误）
- 修复 StatusBarProvider dispose 未清理静态 tempTimeout/tempItem
- 修复 paramTypes 配置缺少 default 值导致 config.get() 返回 undefined
- 修复 configEditor.test.ts 恒真断言和 validDialects 列表不完整

## 0.19.1
- 修复 FROM 关键字匹配在子串中 `\b` 词边界失效（`transform`/`fromb` 等被误匹配为 FROM）
- 修复聚合函数在 WHERE 中检查不区分子查询内位置（子查询内合法聚合被误报）
- 修复 NATURAL LEFT/INNER/FULL JOIN 被误报为缺少 ON 子句
- 修复字符串闭合检查中反斜杠转义对 Hive SQL 不正确（`'C:\Users\'` 被误报为未闭合）
- 修复 sqlParser 字符串转义使用反斜杠而非 SQL 标准 `''`（与 splitColumnDefinitions 不一致）
- 修复 JDBC `:?param` 参数正则不支持双字符前缀（getWordRangeAtPosition 和验证正则）

## 0.19.0
- 修复 HAVING 缺少 GROUP BY 检查逻辑颠倒（正则前瞻方向错误，导致所有 HAVING 都被误报）
- 修复 LIMIT 缺少 ORDER BY 检查逻辑颠倒（正则前瞻方向错误，导致合法语句被误报）
- 修复 Quick Fix 在错误位置插入 INSERT 列名（`document.positionAt()` 误用列号作为文档偏移量）
- 修复 JDBC `:?` 参数前缀无法识别（`startsWith(':')` 短路了 `startsWith(':?')`）
- 修复 NULL 比较快速修复顺序错误（`= NULL` 先于 `!= NULL` 匹配导致错误替换）
- 修复 CURRENT_TIMESTAMP / CURRENT_DATE 正则要求括号但 SQL 中不带括号也合法
- 修复块注释内的行注释（`--`/`#`）跳过块注释结束标记 `*/`
- 修复列定义拆分不处理字符串中的逗号（如 `COMMENT 'a,b'`）
- 修复括号匹配检查不排除字符串和注释中的括号
- 修复字符串闭合检查不处理 SQL 转义引号（`''`）和反斜杠转义
- 修复 SELECT 缺少列名检查匹配到子查询中的 FROM
- 修复 FROM 缺少表名检查不识别 WHERE/JOIN 等子句边界
- 修复保留字标识符检查产生大量误报（改为只检查 AS 后的别名）
- 修复 JOIN 缺少 ON 检查不考虑 CROSS JOIN / NATURAL JOIN / USING 语法
- 修复 CASE 完整性检查正则跨语句匹配导致漏报（改为 CASE/END 深度计数）
- 修复子查询缺少别名检查不处理嵌套括号
- 修复聚合函数在 WHERE 中检查不区分子查询中的合法用法
- 修复 LIMIT 缺少数字检查对 `LIMIT ALL/?/:param/OFFSET` 误报
- 修复 CREATE TABLE 缺少主键检查跨语句边界匹配
- 修复重复列别名检查在子查询中的 FROM 处提前截断
- 修复长查询行和连续行注释定位使用 `indexOf` 导致重复行位置错误
- 修复 JOIN 类型检查正则性能问题
- 修复 3 处事件监听器内存泄漏（SqlDiagnosticsProvider / SqlCompletionProvider / SqlParameterHightlighter）
- 修复 `deactivate()` 双重释放资源（与 `context.subscriptions` 重复释放）
- 修复 `completionProvider` 未加入 `context.subscriptions` 导致配置变更监听器泄漏
- 修复 tsconfig.json 排除测试文件导致测试无法编译运行
- 修复测试文件动态导入路径缺少 `.js` 扩展名
- 修复 configEditor.test.ts 永远为真的断言和不完整的方言列表
- 替换 extension.test.ts 无意义的样板测试为实际验证测试
- 更新 ESLint 配置：允许下划线前缀未使用参数、排除自动生成的 grammar.ts
- 修复 LexerAdapter.save() 返回类型和 createParser.ts 未使用变量
- README 更新：新增方言列表、减少误报说明、JDBC 参数支持、方言配置选项更新

## 0.18.4
- 修复扩展无法激活：engines.vscode 版本要求过高（^1.108.1），降为 ^1.85.0
- activate 函数添加 try-catch 容错保护，单个 Provider 创建失败不影响其他功能
- header 补全恢复双轨策略：基础版由 VS Code 内置 snippet 提供，增强版（header+）由动态补全提供
- 修复可视化配置保存后作者设置丢失
- 修复可视化配置保存提示不准确

## 0.18.3
- 修复键入 header 无法触发注释补全：静态 snippet label 改用英文前缀，确保模糊匹配生效
- 移除 sql.json 中的 Comment Header 静态 snippet，由动态补全统一提供 header 项
- header 补全始终可用：有作者配置时自动填充作者/修改人/表依赖，无作者时提供基础模板
- 修复可视化配置保存后作者设置丢失：_updateConfig 添加 try-catch 保护，避免单项失败阻塞后续保存
- 修复 headerAuthor/headerModifier 空值处理：空值传 undefined 而非空字符串，避免 VS Code 误删配置
- 修复可视化配置保存提示不准确：改为等待实际保存完成后才显示成功/失败提示

## 0.18.2
- 修复 header/col/tbl 补全项缺少 range 属性导致无法匹配用户输入
- 添加 try-catch 保护，避免 extractTableDependencies 异常导致补全项全部消失

## 0.18.1
- 修复 header/col/tbl 补全不生效：改用 SnippetString 构造函数避免占位符被转义
- 修复补全项 label 包含中文导致模糊匹配失败，中文描述移至 detail/documentation
- 可视化配置编辑器新增「注释设置」组（作者、修改人、注释模板补全开关）

## 0.18.0
- 新增智能注释切换：Ctrl+/ 单行/多行自动切换，Ctrl+Shift+/ 高级模式（DDL 列注释、格式化禁用标记）
- 新增注释模板补全：静态 Snippet（todo/fixme/hack/desc/section）+ 动态补全（header/col/tbl）
- header 补全自动检测表依赖（FROM/JOIN 为输入表，INSERT INTO/CTAS 为输出表）
- 新增 4 条注释 Lint 规则：复杂查询缺注释、DDL 列缺 COMMENT、注释掉的代码、过期 TODO/FIXME
- 每条 Lint 规则均提供 Quick Fix 一键修复
- Code Action 改用 diagnostic.code 匹配，更健壮
- 新增状态栏临时消息反馈（添加/移除注释等操作后显示）
- 右键菜单集成注释切换命令
- 版本号升级到 0.18.0

## 0.17.0
- 优化配置区布局，由 CSS Grid 改为 Multi-column 多列流式布局，消除配置组之间的大片空白
- 配置组高度自适应，矮组不再被撑高，整体布局更紧凑
- 添加 break-inside: avoid 防止配置组跨列断裂
- 版本号升级到 0.17.0

## 0.16.0
- 优化可视化配置编辑器布局，由左右结构改为上下结构
- 预览区移至顶部，内部改为左右分栏（输入 SQL | 格式化结果），空间利用更高效
- 配置区移至底部，9 个配置组改为多列网格布局，宽屏自动排 2-3 列
- 新增可拖拽分割线，自由调整预览区高度（160px ~ 600px）
- 整体视觉优化：更紧凑的间距、更柔和的边框、更精致的圆角
- 容器最大宽度从 1260px 扩展到 1400px，更好利用宽屏空间
- 版本号升级到 0.16.0

## 0.15.0
- 新增智能补全功能（IntelliSense / Auto-completion），大幅降低 SQL 编写心智负担
- 支持关键字补全，输入 SEL 自动提示 SELECT，覆盖 Hive/MySQL/Spark/通用 SQL 四种方言
- 支持函数补全（带签名、参数占位符、返回值类型和中文说明），合计 470+ 内置函数签名
- 支持代码片段触发补全，在补全列表中展示已有的 17 个 SQL 代码片段
- 支持 CTE 名称补全，定义 WITH 子句后自动提示 CTE 名称
- 支持表名/列名上下文补全，根据当前 SQL 子句位置智能提示
- 新增可配置的补全开关（enableCompletion、completion.keywords、completion.functions、completion.snippets、completion.cteNames、completion.identifiers）
- 更新 package.json，添加补全相关配置项
- 版本号升级到 0.15.0

## 0.14.0
- 全面美化可视化配置编辑器 UI，采用现代化卡片设计
- 新增可折叠配置分组，用箭头动画展开/收拢，减少视觉噪音
- 默认 checkbox 替换为 iOS 风格 Toggle Switch 开关，带流畅过渡动画
- 优化 Lint 规则布局，规则名称 + 严重级别下拉 + 开关一览无余
- 新增徽章计数器显示各组配置项数量
- 新增保存成功 Toast 通知（2 秒自动消失）
- 新增预览格式化结果绿色边框闪烁反馈
- 新增输入框焦点蓝色辉光效果
- 预设按钮改为圆角药丸芯片样式（pill chips）
- 优化双栏布局，配置区更宽，预览区右侧 sticky 固定
- 自定义暗色滚动条样式
- 版本号升级到 0.14.0

## 0.13.0
- 修复 sqlDialects.ts 中语言 ID 不匹配问题（hql → hive），修复 .hql 文件格式化和诊断功能失效
- 修复 package.json 中 enableEnhancedChecks 配置项重复定义
- 修复 SqlParameterHightlighter 中 isSqlDocument 判断不一致问题，统一使用 sqlDialects
- 修复 configEditor.test.ts 测试代码中的断言引用错误和常量缺失问题
- 优化测试用例，全部核心功能测试通过
- 版本号升级到 0.13.0

## 0.12.0
- 新增丰富的格式化配置项，提升用户定制化体验
- 新增 commaPosition 配置，支持逗号在行首或行尾
- 新增 alignColumnDefinitions 配置，支持对齐列定义
- 新增 tabulateAlias 配置，支持对齐表别名
- 新增 newlineAfterSelect 配置，控制 SELECT 关键字后是否换行
- 新增 newlineAfterFrom 配置，控制 FROM 关键字后是否换行
- 新增 newlineBeforeWhere 配置，控制 WHERE 关键字前是否换行
- 新增 newlineAfterWhere 配置，控制 WHERE 关键字后是否换行
- 新增 newlineBeforeOrderBy 配置，控制 ORDER BY 关键字前是否换行
- 新增 newlineBeforeGroupBy 配置，控制 GROUP BY 关键字前是否换行
- 新增 newlineBeforeHaving 配置，控制 HAVING 关键字前是否换行
- 新增 newlineBeforeLimit 配置，控制 LIMIT 关键字前是否换行
- 新增 maxLineLength 配置，设置最大行长度
- 新增 reservedKeywordCase 配置，控制保留关键字大小写（SELECT, FROM, WHERE 等）
- 新增 builtinFunctionCase 配置，控制内置函数大小写（COUNT, SUM, MAX 等）
- 新增 newlineBeforeJoin 配置，控制 JOIN 关键字前是否换行
- 新增 newlineAfterComma 配置，控制逗号后是否强制换行
- 新增 alignWhereClauses 配置，控制 WHERE 子句是否对齐
- 新增 alignCaseStatements 配置，控制 CASE 语句是否对齐
- 新增 breakAfterSelectItem 配置，控制每个 SELECT 项后是否换行
- 新增 breakAfterFromItem 配置，控制每个 FROM 项后是否换行
- 新增 spaceBeforeComma 配置，控制逗号前是否加空格
- 新增 spaceInsideParentheses 配置，控制括号内是否加空格
- 新增 trimTrailingSpaces 配置，控制是否修剪尾部空格
- 新增 semicolonAtEnd 配置，控制是否在语句结尾添加分号
- 新增 singleLineMaxLength 配置，设置单行查询最大长度
- 更新 package.json，添加所有新配置项
- 更新 configEditorCommand.ts，在可视化配置编辑器中添加新选项（按功能分组展示）
- 更新 FormatOptions.ts，添加新配置类型
- 更新 sqlFormatter.ts，更新默认配置
- 更新 core/config.ts，支持从 VS Code 配置中读取新选项
- 更新 validateConfig.ts，移除 commaPosition 和 tabulateAlias 的废弃标记
- 更新所有预设配置（default, hive, mysql, compact），支持新配置项
- 版本号升级到 0.12.0

## 0.11.3
- 修复 JOIN ON 子句中的 ON 被误报为保留字标识符的问题
- 改进保留字识别逻辑，增加扩展范围检查
- 提高诊断规则的准确性
- 版本号升级到 0.11.3

## 0.11.2
- 修复 SELECT WITH FROM 误报问题
- 改进 SELECT without FROM 检测逻辑
- 实现查询范围检测，正确识别 FROM 子句
- 提高诊断规则的准确性，减少误报
- 版本号升级到 0.11.2

## 0.11.1
- 优化主键检测规则，识别常见的id字段
- 当表包含常见的主键字段名时（id, uuid, guid, _id等）不显示警告
- 提高 lint 规则的智能性，减少误报
- 版本号升级到 0.11.1

## 0.11.0
- 修复配置编辑器中的 lint 错误
- 移除未使用的导入和变量
- 优化类型注解，避免使用 any 类型
- 修复保留字检测问题，正确识别 CREATE TABLE 等语句
- 改进代码质量，修复所有 lint 错误
- 优化项目结构
- 版本号升级到 0.11.0

## 0.10.0
- 新增 SQL Lint 功能，内置 13+ 条规则
- 新增代码折叠功能，支持 CTE、子查询、函数块等
- 新增大纲视图功能，提供 SQL 文档快速导航
- 新增参数化查询支持，支持变量高亮和批量替换
- 新增替换参数命令和快捷键
- 新增可配置的 Lint 规则系统
- 支持自定义 Lint 规则的启用状态和严重级别
- 更新 package.json，添加 Lint 配置选项
- 更新 README，添加 Lint 功能详细说明
- 版本号升级到 0.10.0

## 0.9.0
- 新增状态栏显示功能，显示当前 SQL 方言
- 新增代码片段支持，提供 15+ 常用 SQL 模板
- 新增快速修复功能，支持一键修复常见问题
- 支持 null 比较修复（= NULL → IS NULL）
- 支持保留字标识符修复（添加反引号）
- 支持子查询别名添加
- 支持 INSERT 列名添加
- 支持 HAVING 缺少 GROUP BY 的修复
- 更新 package.json，添加 snippets 配置
- 更新 README，添加新功能详细说明
- 版本号升级到 0.9.0

## 0.8.0
- 新增增强的语法检查功能
- 新增 15+ 项语法和代码质量检查
- 支持配置是否启用增强检查
- 支持按严重程度过滤诊断信息（错误/警告/信息）
- 配置变更时自动重新检查
- 更新文档，添加新功能说明
- 更新版本号

## 0.7.0
- 新增可视化配置编辑器功能
- 命令名从"Open Config Editor"改为"Hive Formatter Config"
- 提供图形化配置界面，支持实时预览格式化效果
- 内置快速预设（默认、Hive、MySQL、紧凑）
- 支持 VSCode 主题适配（深色/浅色/高对比度）
- 更新 README 文档，添加可视化配置编辑器使用说明
- 更新版本号

## 0.6.0
- 新增可视化配置编辑器命令
- 实现 ConfigEditorPanel 类管理 Webview 生命周期
- 支持配置保存和读取
- 集成实时格式化预览功能
- 更新版本号

## 0.5.0
- 大规模重构 src 目录结构，按功能模块组织文件
- 创建 commands 目录，存放所有 VSCode 命令（格式化选择、MySQL转Hive、Hive转MySQL）
- 创建 providers 目录，存放所有提供者类（SqlFormattingProvider、SqlDiagnosticsProvider）
- 创建 core 目录，存放核心工具和配置（config、sqlDialects）
- 创建 utils 目录，存放通用工具函数（formatEditorText）
- 优化 extension.ts，简化命令注册逻辑
- 更新所有导入路径，保持代码正常工作
- 提高项目的可维护性和可读性
- 更新版本号

## 0.4.0
- 重构项目代码结构，提高可读性和可维护性
- 将转换逻辑模块化，分离类型映射、函数映射、SQL解析等功能
- 创建独立的转换器类（MysqlToHiveConverter、HiveToMysqlConverter）
- 创建 converter 目录，组织相关文件
- 简化主转换类（SqlConverter）
- 优化代码组织，每个功能有明确的职责
- 更新版本号

## 0.3.0
- 新增 MySQL 与 HiveSQL 互相转换功能
- 支持将 MySQL 语法转换为 HiveSQL
- 支持将 HiveSQL 转换为 MySQL
- 数据类型自动转换（VARCHAR → STRING, DATETIME → TIMESTAMP 等）
- 函数自动转换（IFNULL → COALESCE, NOW() → CURRENT_TIMESTAMP 等）
- 表创建语句自动转换（移除 AUTO_INCREMENT, PRIMARY KEY 等 MySQL 特有语法）
- 更新插件描述
- 新增两个转换命令到命令面板
- 更新版本号

## 0.2.3
- 将发布日志从 README 移到 CHANGELOG 文件中
- 更新版本号

## 0.2.2
- 修复 TokenizerEngine 中的英文错误提示
- 将所有解析错误信息改为中文
- 更新版本号

## 0.2.1
- 修复语法错误检测误报问题
- 优化检测逻辑，避免正常 SQL 语句被误判
- 所有错误提示改为中文
- 更新 README 文档

## 0.2.0
- 新增语法错误检测功能
- 支持检测常见 SQL 语法错误
- 错误信息包含行号，方便定位
- 优化错误提示的可读性

## 0.1.0
- 增强错误检测能力
- 添加更多常见语法检查
- 改进错误消息格式

## 0.0.9
- 实现基础语法错误提示功能
- 集成 Nearley 解析器进行语法检查

## 0.0.8
- 完善代码注释，提高可读性
- 优化代码结构和组织
- 完善 README 文档
- 修复配置命名不一致问题

## 0.0.7
- 完善代码注释和文档
- 优化代码结构和可读性

## 0.0.6
- 修复配置命名不一致问题

## 0.0.5
- 补充 README
- 优化配置项说明

## 0.0.4
- 修复测试问题
- 鸣谢 @TalDu

## 0.0.3
- 修复测试问题

## 0.0.2
- 修复测试问题

## 0.0.1
- 发布测试版
