# Changelog

## [2.33.0] - 2026-07-13

### Webview 前端国际化基础设施统一

将 6 个 Webview 面板各自重复实现的国际化基础设施（`lang` 变量、`t()` 函数、语言初始化逻辑）统一提取到 `shared.js`，消除约 400 行重复代码。

#### 重构内容

- **新增 shared.js i18n 基础设施**：提供 `window.setLanguage()`、`window.getLanguage()`、`window.translate()`、`window.initLanguageFromConfig()` 四个通用函数
- **6 个面板统一委托**：query-result.js、table-designer.js、data-transfer.js、explain-panel.js、config-editor.js 的 `t()` 函数简化为一行 `window.translate()` 调用
- **消除语言归一化重复**：各面板不再需要 `config.lang.startsWith("zh") ? "zh" : "en"` 重复逻辑，统一由 `window.setLanguage()` 处理
- **新增面板样板代码减少约 80%**：新面板只需定义翻译字典并调用 `window.translate()`

#### 验证

- 1960 个测试全部通过
- oxlint 无错误
- TypeScript 编译通过

## [2.32.1] - 2026-07-10

### VSIX 包体积优化

VSIX 包从 **24.4MB → 8.8MB**（减少 64%），Marketplace 安装包相应大幅缩小。

#### 根本原因

- [.vscodeignore](.vscodeignore) 中的通配否定规则 `!node_modules/**/*.node` 会重新包含所有 `.node` 二进制文件，覆盖了对 `@oxlint`、`@oxfmt`、`oracledb/build` 的排除规则
- `npm list --production --parseable` 会列出 node_modules 中所有包（包括 extraneous 的 devDependency 传递依赖），导致 vsce 将 devDep 二进制打包进 VSIX

#### 优化内容

- **精确保留运行时 .node 文件**：将通配的 `!node_modules/**/*.node` 替换为 4 个精确的运行时必需文件（`better_sqlite3.node`、`odbc.node`、`sshcrypto.node`、`cpufeatures.node`）
    - 排除 `@oxlint` 二进制（13.4MB，devDependency 传递依赖）
    - 排除 `@oxfmt` 二进制（6.8MB，devDependency 传递依赖）
    - 排除 `oracledb/build` 下 5 个平台二进制（3.1MB，thin mode 默认不使用）
- **排除 node-sql-parser 的 `lib/` 和 `ast/` 目录**（296KB）：`index.js` 是自包含的 webpack bundle，仅 require `big-integer`，不依赖 lib/ 和 ast/
- **排除 tedious 的 `benchmarks/` 目录**（554KB）
- **补充 `node_modules/**/doc/**` 排除规则**：排除 js-md4 的 doc 目录（1MB 字体文件）
- **Monaco editor 切换为 min 版本**：`media/monaco/` 从 8.0MB 减少到 4.2MB

#### 验证

- 1960 个测试全部通过
- oxlint 无错误
- 8 个运行时依赖（mysql2、pg、better-sqlite3、mssql、oracledb、odbc、ssh2、node-sql-parser）完整包含
- 4 个运行时 .node 二进制文件保留

## [2.32.0] - 2026-07-10

### 工具链大迁移

#### ESLint → oxlint

- **lint 工具替换**：移除 ESLint，采用 [oxlint](https://oxc.rs/docs/guide/usage/linter) 1.73.0 作为新的代码检查工具
    - 新增配置文件 [.oxlintrc.json](.oxlintrc.json)，启用 `typescript` / `oxc` / `eslint` / `import` 插件
    - 规则分级：`correctness: error`、`suspicious: warn`、`pedantic/style/perf: off`
    - 对 `src/views/**` 与 `src/test/**` 设置覆盖规则，放宽 `no-explicit-any` / `no-unsafe-*` 等
    - `npm run lint` 现调用 `oxlint src`，`npm run lint:fix` 调用 `oxlint src --fix`

#### TypeScript 5 → TypeScript 7

- **TS 版本升级**：`typescript` 从 ^5.x 升级到 ^7.0.0（实际 7.0.2）
    - [tsconfig.json](tsconfig.json) 保持 `target: ES2022`、`module: Node16`、`strict: true`
    - 全量 `tsc --noEmit` 通过，无类型错误

#### 新增 oxfmt 代码格式化

- **格式化工具**：新增 [oxfmt](https://oxc.rs/docs/guide/usage/formatter) 0.58.0，配置见 [.oxfmtrc.jsonc](.oxfmtrc.jsonc)
    - 风格：单引号、4 空格缩进、`printWidth: 140`、`trailingComma: all`
    - 忽略 `out/`、`node_modules/`、`media/`、生成文件等
    - 新增脚本：`npm run format`（`oxfmt . --write`）、`npm run format:check`（`oxfmt . --check`）

### Bug Fixes

- **测试断言兼容性修复**：[src/test/queryResult.test.ts](src/test/queryResult.test.ts) 中 7 处断言因 `media/query-result.js` 引号样式从单引号迁移到双引号而失效，已更新为双引号匹配
    - `window.addEventListener("message", ...)` 断言
    - 6 个 `command: "xxx"` 断言（executeQuery / cancelQuery / requestExport / requestSort / requestFilter / requestPage）
- **tsconfig.json 格式化**：`exclude` 数组按 oxfmt 规则折叠为单行

### Tests

- 全量回归测试：**1960 passing, 1 pending, 0 failing**
- TypeScript 7 类型检查：0 error
- oxlint 检查：0 error，0 warning
- oxfmt 格式检查：全部通过

---

## [2.31.0] - 2026-07-07

### New Features

#### 解析器能力补全（P0）

- **SHA-256 缓存键**：[src/parser/sqlHasher.ts](src/parser/sqlHasher.ts) 新增 SHA-256 SQL 哈希工具，替换原 `len + head32 + tail32` 方案，消除长 SQL 中间修改导致的缓存碰撞，避免格式化/lint 命中错误 AST
- **多语句错误恢复**：[src/parser/MultiStatementParser.ts](src/parser/MultiStatementParser.ts) 新增 `parseMultiStatement`，按分号切分逐条解析，单条失败不影响其他语句的 AST 服务（hover/completion/lint）
- **位置感知错误诊断**：[src/parser/ParseError.ts](src/parser/ParseError.ts) 扩展 `position`（行列号）与 `dialectHint`（FlinkSQL/SparkSQL 方言特定修复建议），从 node-sql-parser 错误信息中提取位置
- **Flink MATCH_RECOGNIZE 结构化 AST**：[src/parser/FlinkCepAstBuilder.ts](src/parser/FlinkCepAstBuilder.ts) 新增 `parseMatchRecognize`，将 CEP 子句解析为结构化 `MatchRecognizeNode`（PARTITION BY / ORDER BY / MEASURES / PATTERN / DEFINE / WITHIN），供后续 definition provider / linter 使用
    - 支持嵌套括号 PATTERN（如 `PATTERN ((A B)+ C)`）
    - 支持大小写敏感的模式变量名（小写、混合大小写）
- **CEP slot 标记**：[src/formatter/FlinkSqlAdapter.ts](src/formatter/FlinkSqlAdapter.ts) 的 `FlinkAdapterState` 新增 `cepSlotIds` 字段，供 definition provider 快速定位 CEP slot

#### FlinkSQL 函数签名补全

- **窗口辅助函数**：[src/dialects/flinksql/flinksql.functions.ts](src/dialects/flinksql/flinksql.functions.ts) 补全 8 个窗口辅助函数签名：`TUMBLE_START` / `TUMBLE_END` / `HOP_START` / `HOP_END` / `SESSION_START` / `SESSION_END` / `CUMULATE_START` / `CUMULATE_END`

#### SparkSQL 函数签名补全

- **高阶函数**：[src/dialects/spark/spark.functions.ts](src/dialects/spark/spark.functions.ts) 补全 5 个高阶函数签名：`TRANSFORM` / `FILTER` / `AGGREGATE` / `REDUCE` / `ZIP_WITH`
- **Spark 3.4+ 新函数**：补全 4 个新函数签名：`ANY_VALUE` / `BIT_COUNT` / `SPLIT_PART` / `MAKE_YM_INTERVAL`
- **Generator 函数补全**：补全 `EXPLODE_OUTER` / `POSEXPLODE_OUTER`

### Bug Fixes

- **Flink WITH 子句作用域限定**：[src/formatter/FlinkSqlAdapter.ts](src/formatter/FlinkSqlAdapter.ts) 的 `extractWithConnectorInCreateTable` 现在仅在 CREATE TABLE 上下文搜索 `WITH (`，避免误伤 SELECT/CTE 中的 WITH 子句
- **extractPattern 嵌套括号修复**：`PATTERN ((A B)+ C)` 等嵌套括号场景不再被截断
- **extractPattern 小写变量名修复**：小写与混合大小写模式变量名不再被丢弃

### Tests

- 新增 8 个测试文件，共 70+ 测试用例：
    - `sqlHasher.test.ts`（8 用例）— SHA-256 哈希行为
    - `parserEngineCacheKey.test.ts`（5 用例）— 缓存键碰撞回归
    - `parseError.test.ts`（6 用例）— 位置提取与方言提示
    - `multiStatementParser.test.ts`（10 用例）— 多语句错误恢复
    - `flinkWithClauseScope.test.ts`（7 用例）— WITH 子句作用域
    - `flinkCepAstBuilder.test.ts`（15 用例）— CEP 结构化解析 + slot 集成
    - `flinkFunctionSignatures.test.ts`（16 用例）— Flink 函数签名完整性
    - `sparkFunctionSignatures.test.ts`（17 用例）— Spark 函数签名完整性
- 全量测试：1960 passing, 0 failing

---

## [2.30.0] - 2026-07-06

### New Features

#### FlinkSQL 全面强化

- **FlinkSqlAdapter 新建**：新增 [src/formatter/FlinkSqlAdapter.ts](src/formatter/FlinkSqlAdapter.ts)，对 Flink 特有语法做 slot 化预处理，解决 parser 不识别导致格式化失败或丢字的问题
    - 窗口表函数 TVF：`TUMBLE(TABLE t, DESCRIPTOR(col), INTERVAL '10' MINUTE)` / `HOP` / `CUMULATE` / `SESSION`
    - 表定义子句：`WATERMARK FOR col AS expr`、`PRIMARY KEY (cols) NOT ENFORCED`、`UNIQUE (cols)`、`CONSTRAINT name PRIMARY KEY`、`METADATA FROM 'key' VIRTUAL`、计算列 `col AS expr`
    - Connector 配置：`WITH ('connector'='...', ...)`（平衡括号扫描，支持嵌套）
    - Temporal Join：`FOR SYSTEM_TIME AS OF s.proc_time AS t`
    - CEP 模式识别：`MATCH_RECOGNIZE (...)`（含 `MEASURES`/`PATTERN`/`DEFINE`/`ONE ROW PER MATCH`/`AFTER MATCH SKIP` 等子句）
    - 整段语句 slot 化：`CREATE TABLE ... LIKE`、`CREATE CATALOG/DATABASE ... WITH`、`DROP CATALOG`、`USE CATALOG/MODULES`、`ALTER TABLE ADD CONSTRAINT`、`CREATE/ALTER FUNCTION ... LANGUAGE PYTHON/JAVA/SCALA`、`EXECUTE STATEMENT SET BEGIN ... END`、`BEGIN STATEMENT SET ... END`、`ADD/REMOVE JAR`、`SHOW JARS/MODULES/CATALOGS`、`LOAD/UNLOAD MODULE`、`STOP/CANCEL JOB`、`DESCRIBE [EXTENDED]`、`EXPLAIN [CODEGEN/EXTENDED]`、`ALTER TABLE SET/UNSET TBLPROPERTIES`、`ALTER DATABASE`、`ALTER FUNCTION`
    - 流式输出策略：`EMIT AFTER WATERMARK`（INSERT/SELECT/CREATE VIEW 三种上下文）
    - SET 配置：`SET key = value`（多空格兼容）
- **FlinkSQL 函数悬停提示接入**：[src/hover/FunctionHoverResolver.ts](src/hover/FunctionHoverResolver.ts) 的函数签名 map 补全 `flinksql` 方言，悬停 Flink 函数即可查看签名
- **FlinkSQL 关键字补全**：[src/dialects/flinksql/flinksql.keywords.ts](src/dialects/flinksql/flinksql.keywords.ts) 补 17 个 `MATCH_RECOGNIZE` (CEP) 相关关键字：`MATCH_RECOGNIZE`、`MEASURES`、`PATTERN`、`SUBSET`、`WITHIN`、`ONE`、`PER`、`MATCH`、`AFTER`、`MATCHED`、`SKIP`、`PAST`、`PERMUTE`、`RUNNING`、`FINAL`、`EMIT`、`ASOF`

#### SparkSQL / Delta Lake 强化

- **SparkSqlAdapter 扩展 Delta Lake 语句**：[src/formatter/SparkSqlAdapter.ts](src/formatter/SparkSqlAdapter.ts) 新增整段 slot 化支持
    - `OPTIMIZE table [WHERE ...] ZORDER BY (cols)`
    - `VACUUM table [RETAIN N HOURS] [DRY RUN]`
    - `CONVERT TO DELTA table [PARTITIONED BY (...)]`
    - `DESCRIBE HISTORY table` / `DESCRIBE DETAIL table`
    - `CREATE TABLE ... DEEP/SHALLOW CLONE source`
    - `GENERATE symlink_format_manifest FOR TABLE table`
- **SparkSQL 关键字补全**：[src/dialects/spark/spark.keywords.ts](src/dialects/spark/spark.keywords.ts) 补 15 个 Delta Lake/Iceberg/Hudi 关键字：`DELTA`、`VACUUM`、`ZORDER`、`ZORDERBY`、`CLONE`、`DEEP`、`SHALLOW`、`HISTORY`、`DETAIL`、`MANIFEST`、`SYMLINK`、`GENERATE`、`RETAIN`、`DRY`、`RUN`
- **SparkSQL Snippets 扩充**：[snippets/spark.json](snippets/spark.json) 从 2 个扩充到 19 个
    - 表创建：`sparkcrtparquet`、`sparkcrtjdbc`、`sparkcrtdelta`
    - 数据写入：`sparkins`、`sparkinsinto`、`sparkmerge`
    - 查询：`sparklv`、`sparklvp`、`sparkwin`、`sparkpivot`
    - 缓存与统计：`sparkcache`、`sparkstats`
    - 函数：`sparkfn`
    - Delta Lake：`sparkconvdelta`、`sparkoptimize`、`sparkvacuum`、`sparkdesc`
    - 临时视图：`sparktemp`、`sparkglobaltemp`

### Code Quality

- **Lint warnings 清零**：修复 [src/database/adapters/BaseSchemaAdapter.ts](src/database/adapters/BaseSchemaAdapter.ts) 与 [src/database/adapters/DamengAdapter.ts](src/database/adapters/DamengAdapter.ts) 中遗留的 20 个 ESLint warnings
    - 8 个 tsdoc 反引号 code span 解析警告（移除嵌套反引号与跨行 code span）
    - 4 个 tsdoc 大括号转义警告（`DRIVER={DM8 ODBC DRIVER}` → `DRIVER=\{DM8 ODBC DRIVER\}`）
    - 8 个 `Array<T>` → `T[]` 风格警告
    - 当前 ESLint 状态：0 errors, 0 warnings

### Tests

- **新增 FlinkSqlAdapter 测试套件**：[src/test/flinkSqlAdapter.test.ts](src/test/flinkSqlAdapter.test.ts)
    - P1 核心结构：TUMBLE TVF / WATERMARK / WITH connector / PRIMARY KEY / Temporal Join / MATCH_RECOGNIZE / CREATE TABLE LIKE（10 个用例）
    - P3 长尾语法：EMIT / CREATE DATABASE WITH / ALTER TABLE ADD CONSTRAINT / STOP JOB / DESCRIBE / EXPLAIN / LOAD MODULE / ALTER TABLE SET TBLPROPERTIES / ALTER FUNCTION LANGUAGE / SET 多空格 / 多语句共存（21 个用例）
    - 格式化集成：Flink SELECT / CREATE TABLE with WATERMARK / TUMBLE 窗口查询（3 个用例）
- **新增 SparkSqlAdapter 测试套件**：[src/test/sparkSqlAdapter.test.ts](src/test/sparkSqlAdapter.test.ts)
    - Delta Lake 语句 slot 化：OPTIMIZE / VACUUM / CONVERT TO DELTA / DESCRIBE HISTORY / DESCRIBE DETAIL / DEEP CLONE / SHALLOW CLONE / GENERATE manifest（9 个用例）
    - 原有功能回归：LATERAL VIEW EXPLODE / MERGE INTO / CREATE TABLE USING delta / SORT BY / CLUSTER BY / DISTRIBUTE BY / 普通 SELECT / 多语句共存 / 多段 Delta 顺序还原（9 个用例）

---

## [2.29.5] - 2026-07-06

### Performance

- VSIX 体积优化：通过更精细的 `.vscodeignore` 规则，移除 node_modules 中的非运行时文件
    - 排除 `@azure/msal-browser` 整个包（14 MB 浏览器端代码，VSCode 扩展在 Node.js 环境不会加载）
    - 排除 `@azure/identity` 的 `dist/esm`、`dist/browser`、`dist/workerd` 三个非 Node.js 运行时变体
    - 排除 `@azure/msal-common` 和 `@azure/msal-node` 的 ESM `.js` 副本（运行时只加载 `.cjs`）
    - 排除所有 `.mjs` 文件（ESM 模块，Node.js `require()` 不使用）
    - 排除 `better-sqlite3` 的 `test_extension.node` 测试二进制
    - 排除 `@typespec`、`tar`、`tedious/node_modules/bl` 的测试目录
    - VSIX 从 21.42 MB 减少到 20.45 MB（减少 ~5%，1 MB），文件数从 5625 减到 5382
    - 所有 8 个运行时依赖（mysql2、pg、better-sqlite3、mssql、oracledb、odbc、ssh2、node-sql-parser）完整保留
    - 1828 个测试用例全部通过，功能零回归

---

## [2.29.4] - 2026-07-03

修复 v2.29.3 打包问题：之前误用 `vsce publish --no-dependencies` 导致运行时依赖（mysql2、pg、better-sqlite3、mssql、oracledb、odbc、ssh2、node-sql-parser）未打入 VSIX，用户安装后报 "Cannot find package 'mysql2'" 错误。本次恢复正确的打包方式（不带 `--no-dependencies`，由 `.vscodeignore` 精简 node_modules）。代码内容与 v2.29.3 完全一致。

---

## [2.29.3] - 2026-07-03

v2.29.2 版本号在 Marketplace 端被占用（首次 publish 时 PAT 验证失败但版本号已部分上传）。本次重新打包为 v2.29.3 发布，代码内容与 v2.29.2 完全一致，无功能变更。详见 [2.29.2] 条目。

---

## [2.29.2] - 2026-07-03

### Performance

- **ConfigManager 配置缓存策略修复**：原 LRU 默认 `maxAge=30000ms` 导致配置缓存每 30 秒自动过期，与 `onDidChangeConfiguration` 主动失效机制冲突。高频配置读取（格式化、补全）每 30 秒触发一批无谓的 cache miss 和 VSCode IPC 调用。改为 `maxAge: Infinity`，完全靠配置变更事件主动失效
- **FormatterFactory 缓存键完整化**：原 `buildCacheKey` 仅用 `type + indent + keywordCase + functionCase + indentStyle` 5 个字段，而 `FormatOptions` 有 70+ 字段。虽然 `reset()` 完整重置 cfg 是安全的，但这是脆弱的隐性约定——未来若 `reset` 漏字段就会产生格式化错误。改为 `JSON.stringify(cfgBody)`（排除 `params`/`paramTypes`）完整序列化
- **FormatterFactory.releaseInstance O(1) 优化**：原 `releaseInstance` 用 `for...of` 线性查找传入的 instance 引用（每次格式化完成都调用，O(K) 复杂度）。新增 `instanceToKey: WeakMap` 反向索引，O(1) 查找
- **SchemaProvider alias 分支并发限流**：`addColumnItems` 的 alias 分支原用 `Promise.all` 无限并发拉取所有 alias 表列，10+ 表查询会触发 10+ 并发数据库查询。改为 `parallelWithLimit(..., 3)`，与无 alias 分支一致
- **SqlParserEngine 缓存键哈希冲突修复**：原 32 位 FNV-1a 哈希在 10 万条 SQL 时生日冲突概率约 0.1%，冲突会返回错误 AST。改为 `length + 前32字符 + 后32字符` 拼接作为 key，消除冲突风险

### Code Refactoring

- **3 个函数名匹配规则基类抽象**：`UseCoalesceOverIsNullRule`/`UseCurrentTimestampRule`/`DateFunctionUsageRule` 三者 check 方法结构完全相同。抽出 `FunctionNameMatchRule` 基类，子类只需声明 `functionNameSet`、`messageKey`、`useStrictOfType`，新增函数名规则从 35 行降到 10 行
- **Oracle/Dameng formatter 去重**：两个方言的 `tabularOnelineClauses` 数组 200+ 行几乎逐行一致。抽出 `oracleDdlBase.ts` 共享 DDL 子句列表、reserved clauses、joins、operators，Dameng 只追加差异（`TOP`、`LIMIT`）
- **QueryExecutor cancel 重试逻辑抽取**：`cancel` 方法与 `raceExecution` 内的 `attemptCancel` 各自实现了相同的重试循环。抽取 `cancelWithRetry` 私有方法统一调用
- **SqliteSchemaAdapter 继承基类**：原 `implements ISchemaAdapter`（接口实现），其他方言均 `extends BaseSchemaAdapter`。改为继承基类，与其他方言行为一致，未来基类新增方法 SQLite 自动获得
- **系统数据库列表统一管理**：原 `systemDatabases.ts` 与 5 个 adapter 的 `isSystemDatabase` 各自硬编码，双重维护。统一为 adapter 调用 `getSystemDatabases(dialect)`，单一事实源
- **converter 文件名对齐类名**：`hiveConverter.ts`/`mysqlConverter.ts` 文件名未指明转换方向，重命名为 `hiveToMysqlConverter.ts`/`mysqlToHiveConverter.ts` 与类名对齐

### Bug Fixes

- **extension.ts bootstrapContainer 移入 try 块**：原在 try 之外，若容器引导失败则 catch 块的 `getErrorHandler()` 也会失败，错误无法上报。移入 try 块第一行
- **QueryResultController 错误吞没修复**：`onRequestForeignKeyOptions`、`onChangeDatabase` 原用 `console.debug` 吞错，失败不可观测。改为 `handleError(e, context, ErrorCategory.FEATURE)` 统一上报
- **StarRocks 系统库过滤错误修复**：原 StarRocks 错误复用 MySQL 系统库列表（含 `sys`、`mysql`、`performance_schema`），但 StarRocks 并无这些 schema。新增 StarRocks 专属分支（`information_schema`、`_statistics_`、`starrocks_audit_db__`）
- **Postgres/SqlServer 系统库过滤遗漏修复**：原 Postgres 只过滤 `postgres`，遗漏 `template0`、`template1`、`pg_catalog`；原 SqlServer 遗漏 `resource`。现已完整过滤
- **UppercaseKeywordsRule LATERAL 重复定义修复**：`SQL_KEYWORDS` 数组中 `LATERAL` 重复定义两次，删除重复条目

---

## [2.29.1] - 2026-07-03

### Maintenance

- **版本号重新发布**：v2.29.0 因发布到 VS Code Marketplace 时 PAT 验证失败未能成功上传，本次重新打包为 v2.29.1 以便发布。代码内容与 v2.29.0 完全一致，无功能变更

---

## [2.29.0] - 2026-07-03

### Performance

- **HiveSqlAdapter 正则编译缓存优化**：将 `extractWholeStatements` 内 30+ 条正则与 `extractCreateTableClauses` 内 9 条正则提升为模块级常量，并为 5 个 `restore*` 函数的 `new RegExp` 添加 LRU 缓存（参考 `CommentPreserver.hasWordRegexCache` 模式）。每次 Hive SQL 格式化省去 40+ 次正则编译，gi 标志正则在每次 exec 前显式重置 `lastIndex` 防止跨调用状态串扰
- **DocumentAstCache 增量映射修复**：原 `mergedAst[idx] : mergedAst[0]` 兜底逻辑在单语句解析出多个 AST 节点时导致后续语句缓存错误的 AST，影响导航/悬停/补全定位。改为按 statement 在 mergedAst 中的消费顺序建立索引映射，沿用旧缓存中该索引处的 AST 节点数量，保证 1:N 映射稳定
- **AstFormatter 解析失败兜底**：`format` 入口对 `engine.astify` 加 try/catch，捕获 ParseError 后通过 ErrorHandler 记录并返回原始 SQL，避免错误冒泡到 VSCode 导致用户体验恶化
- **ExpressionFormatter/DDLFormatter 兜底输出修复**：未知表达式/节点不再输出 `JSON.stringify(expr)` 破坏 SQL，`formatSubquery` 在 formatter 未设置时返回 `(/* subquery */)`，DDLFormatter 改为 `/* unsupported: ${type} */` 注释占位符
- **adjustAstLocations 递归深度限制**：`adjustAstLocationsInPlace` 与 `adjustAstLocationsLazy` 增加 `MAX_ADJUST_DEPTH = 1000` 限制，深度嵌套 AST 不再触发栈溢出
- **deepCloneAst 性能优化**：优先使用 Node 17+ 的 `structuredClone` 替代 `JSON.parse(JSON.stringify(ast))`，避免大 AST 产生巨大临时字符串，旧 Node 版本自动降级到 JSON 方案
- **SparkSqlAdapter 两阶段模式**：`extractLateralView` 改为先收集所有 matches 再倒序替换的两阶段模式，消除 exec+replace 混用对 `pattern.lastIndex = 0` 的脆弱依赖
- **PerformanceMonitor 慢操作告警节流**：同类操作 60 秒内只 warn 一次，避免频繁超阈值刷屏

### Code Refactoring

- **Webview 代码集中化**：将 `bindActions`/`escapeHtml`/`applyI18n` 三类重复实现集中到 `media/shared.js`，data-transfer 与 explain-panel 移除本地实现，其余面板改为薄包装委托 `window.bindDataActions`/`window.escapeHtml`/`window.applyI18n`
- **escapeHtml bug 修复**：`explain-panel.js` 原 `escapeHtml` 缺 null/undefined 检查，传 null 会抛 TypeError，统一版本包含防护
- **config-editor.js vscode 声明位置修复**：`const vscode` 声明从第 1609 行移到文件顶部，消除 TDZ（暂时性死区）风险
- **Hive/Spark LateralView 共享抽取**：将 `extractLateralView`/`restoreLateralView` 抽取到 `HiveSparkSharedAdapter`，通过 `idPrefix`/`idSuffix`/`idMarker` 参数化处理 slot id 差异，消除两个 Adapter 间的重复代码
- **AstTransformEngine 死代码清理**：移除重构遗留的 `void walkAst` 无意义语句与对应的 `walkAst` import
- **DataExporter stream 处理去重**：抽取 `finishStream(stream)` helper 统一 3 处流关闭逻辑

### Bug Fixes

- **DataExporter stream error 注册时机修复**：`stream.on('error', reject)` 原本在 `stream.end()` 之后注册，可能错过 error 事件（Node.js 流处理常见 bug）。改为先注册 error listener 再调用 end
- **SshTunnel client 泄漏修复**：`client.on('error')` 触发 reject 后未调用 `client.end()`，client 实例和内部 socket 泄漏。现在 reject 前用 try/catch 包裹 `client.end()` 确保资源清理；同时为 server 注册运行期 error 处理器避免进程崩溃
- **MysqlAdapter stream listener 泄漏修复**：`setupStreamFields` 注册的 `fields`/`end`/`error` 三个 listener 在 fieldsPromise resolve 后未移除。现在任一回调触发后通过 `removeAll()` 移除全部三个 listener
- **MysqlAdapter transaction 内查询无法取消修复**：`withAcquiredConnection` 在 transaction 路径下不记录 threadId 到 `activeQueryThreadIds`，导致 transaction 内查询无法通过 cancelQuery 取消。参考 StarrocksAdapter 实现，beginTransaction 时用 `__transaction__` key 记录 threadId，commit/rollback 时删除
- **DataEditService.rollback 状态一致性修复**：rollback 失败时直接调 `adapter.disconnect()` 绕过 ConnectionManager，导致状态显示仍为 connected 但 adapter 已 disconnected。新增 `ConnectionManager.forceDisconnect(id)` 方法，DataEditService 改为通过该方法触发断开，保证 runtimeStates 状态一致
- **QueryExecutor 超时取消增强重试**：`attemptCancel` 原本无重试，timeout 触发的取消成功率低于用户主动 cancel。现在增加指数退避重试，与 `cancel` 方法行为一致
- **ModuleRegistry 错误处理统一**：模块激活/停用失败原本仅 `console.error`，未进入 ErrorHandler 通道。现在调用 `handleError` 统一记录，便于聚合监控与用户通知
- **Webview 事务定时器清理**：`query-result.js` 的事务状态轮询 `setInterval` 缺少面板级 dispose 钩子，面板关闭时若事务进行中 interval 不会立即停止。新增 `beforeunload` 监听器清理 interval

---

## [2.28.1] - 2026-07-03

### Documentation

- **全面重写 README 文档**：基于当前 v2.28.x 功能状态重新编写中英双语 README，覆盖插件核心功能、12 种 SQL 方言、8 种数据库连接、23 个功能模块、40+ 格式化选项、30 条 Lint 规则、80+ 配置项、12 条 FAQ，提供完整安装步骤、使用场景、快捷键速查、配置参考和常见问题解答，中英双语内容完全对等
- **版本号同步**：`package.json` 与 README 同步升级至 2.28.1

---

## [2.28.0] - 2026-07-02

### New Features

- **支持格式化不完整的 SQL（partial SQL formatting）**：在编写 SQL 时，用户经常需要格式化尚未写完的 SQL 语句（如缺少 `GROUP BY`、未闭合的 `)`、不完整的 `IN(...)`、缺少 `BETWEEN` 的第二个操作数等）。此前解析器遇到不完整 SQL 会抛出 `end of input found` 错误，`formatWithFallback` 只能原样返回，格式化无效果。新增 `formatPartialSql` 机制：当正常解析失败时，自动补全最小化的语法 token（`AND 1=1`、闭合 `)`、表别名 `AS __sub__`、`IN` 列表末尾值等）使解析器能成功解析，格式化后再精确移除这些补全 token，保留用户已写的部分并正确格式化。支持场景包括：
    - `SELECT a FROM t WHERE`（WHERE 后无条件）
    - `SELECT a FROM (SELECT b FROM t`（子查询未闭合）
    - `SELECT a FROM t WHERE a IN (1,2,3`（IN 列表未闭合）
    - `SELECT a FROM t WHERE a BETWEEN 1`（BETWEEN 缺少第二个操作数）
    - 嵌套子查询带 WHERE 条件的不完整语句
    - 未闭合的字符串字面量
    - 所有 5 种方言（mysql/sql/hive/spark/postgresql）均支持

---

## [2.27.2] - 2026-07-02

### Bug Fixes

- **Hive 方言不支持 `REGEXP`/`NOT REGEXP` 运算符导致格式化失败（P1）**：`node-sql-parser` 的 Hive 语法仅识别 `RLIKE` 作为正则匹配运算符，不识别 `REGEXP`（MySQL 风格语法）。用户 SQL 中的 `AND oper_name NOT REGEXP '^[a-zA-Z0-9_-]{30,}$'` 在 Hive 方言下解析失败，报错 `Expected ... RLIKE ... but "R" found`，触发 `formatWithFallback` 原样返回，格式化无效果。修复：在 `HiveSqlAdapter` 预处理阶段将 `REGEXP`/`NOT REGEXP` 临时替换为 `RLIKE`/`NOT RLIKE`（Hive 等价别名），格式化完成后再还原为 `REGEXP`/`NOT REGEXP`，保留用户原始语法。验证：mysql/sql/hive/spark/postgresql 五种方言反复格式化 10 轮均稳定（hive 26 行），`REGEXP` 关键字在所有方言输出中正确保留

---

## [2.27.1] - 2026-07-02

### Bug Fixes

- **MySQL 流式查询在 `maxRows < batchSize` 时丢失全部行数据（P0）**：`MysqlQueryAdapter.iterateStreamRows` 的循环在 `totalRowsReceived >= maxRows` 时设置 `truncated = true` 并 `break`，但此时积累的行数（< `batchSize`=1000）未达到批次刷新阈值，所以从未 `yield`。循环后的 flush 条件是 `if (!truncated && batchRows.length > 0)`，因为 `truncated = true`，这批行被直接丢弃，导致 `collectStreamToResult` 收到 0 行 0 列。当用户 `query.maxRows` 配置为 50（< 1000）时，点击表名 "query data" 生成的 `SELECT * FROM ... LIMIT 50` 走流式路径后返回空结果。修复：移除 flush 条件中的 `!truncated` 约束，让 maxRows 截断分支也能 flush 已积累的行；并在 flush 的 batch 上正确传递 `truncated` 标志。PostgresAdapter 使用 `FETCH FORWARD batchSize` 游标，第一批就 yield，不受此 bug 影响
- **Webview 面板脚本因 `acquireVsCodeApi()` 重复调用而崩溃（P0）**：`media/shared.js` 在所有 webview 面板中首先加载并调用 `acquireVsCodeApi()` 缓存到 `window.vscode`，但 6 个面板脚本（query-result、config-editor、data-transfer、explain-panel、table-designer、connection-dialog）各自又调用 `acquireVsCodeApi()`。VS Code 规定每个 webview 只能调用一次该 API，第二次调用会抛出异常，且异常发生在全局错误处理器注册之前导致整个脚本崩溃。修复：所有面板脚本改为 `const vscode = window.vscode || acquireVsCodeApi();`，复用 `shared.js` 已缓存的句柄；同步修正 `shared.js` 中错误的注释（原注释错误声称"acquireVsCodeApi() 可安全多次调用"）。此崩溃是数据表 "query data" 查询无结果、可视化配置页面无法切换标签页两个 bug 的真正根因
- **诊断/提供者模块抽取公共 DI 工具**：新增 `src/core/diUtils.ts` 收纳 `DiagnosticsModule`/`ProviderModule` 共用的依赖解析逻辑，消除重复代码

---

## [2.26.5] - 2026-07-02

### Bug Fixes

- **扩展无法激活导致格式化无响应（P0，回归）**：v2.26.3 为通过 `vsce` 3.x 打包校验，在 `package.json` 显式添加了 `activationEvents` 数组。一旦显式声明该字段，VS Code 不再自动从 `contributes.commands`/`contributes.languages` 推导激活事件，导致普通 `.sql` 文件打开时扩展不被激活，点击格式化无任何反应（输出面板 "SQL All in One" 通道无任何输出）。修复：恢复完整的 `activationEvents` 数组（12 个 `onLanguage:` 覆盖全部 SQL 方言 + 42 个 `onCommand:` 覆盖全部命令），与 `contributes.languages`/`contributes.commands` 完全对齐，既通过 `vsce` 3.x 校验又保证激活正常

---

## [2.27.0] - 2026-07-02

### Bug Fixes

- **MySQL 流式查询在 `maxRows < batchSize` 时丢失全部行数据（P0）**：`MysqlQueryAdapter.iterateStreamRows` 的循环在 `totalRowsReceived >= maxRows` 时设置 `truncated = true` 并 `break`，但此时积累的行数（< `batchSize`=1000）未达到批次刷新阈值，所以从未 `yield`。循环后的 flush 条件是 `if (!truncated && batchRows.length > 0)`，因为 `truncated = true`，这批行被直接丢弃，导致 `collectStreamToResult` 收到 0 行 0 列。当用户 `query.maxRows` 配置为 50（< 1000）时，点击表名 "query data" 生成的 `SELECT * FROM ... LIMIT 50` 走流式路径后返回空结果。修复：移除 flush 条件中的 `!truncated` 约束，让 maxRows 截断分支也能 flush 已积累的行；并在 flush 的 batch 上正确传递 `truncated` 标志。PostgresAdapter 使用 `FETCH FORWARD batchSize` 游标，第一批就 yield，不受此 bug 影响
- **Webview 面板脚本因 `acquireVsCodeApi()` 重复调用而崩溃（P0，v2.26.6 已修复，本次记录）**：详见 v2.26.6 条目

---

## [2.26.7] - 2026-07-02

### Bug Fixes

- **Webview 面板脚本因 `acquireVsCodeApi()` 重复调用而崩溃（P0）**：`media/shared.js` 在所有 webview 面板中首先加载并调用 `acquireVsCodeApi()` 缓存到 `window.vscode`，但 6 个面板脚本（query-result、config-editor、data-transfer、explain-panel、table-designer、connection-dialog）各自又调用 `acquireVsCodeApi()`。VS Code 规定每个 webview 只能调用一次该 API，第二次调用会抛出异常，且异常发生在全局错误处理器注册之前导致整个脚本崩溃。这是 v2.26.2 修复后仍存在的两个 bug 的真正根因：
    - **数据表 "query data" 查询无结果**：脚本在 `acquireVsCodeApi()` 第二次调用处崩溃，`init()` 永不执行 → `webviewReady` 消息永不发送 → 扩展宿主侧的 `_pendingSql` 永不投递 → 查询永不执行
    - **可视化配置页面无法切换编辑器/数据库标签页**：脚本崩溃导致 `bindActions()` 永不执行 → 标签页按钮无点击事件处理器，点击只切换默认高亮但不切换内容
    - 修复：所有面板脚本改为 `const vscode = window.vscode || acquireVsCodeApi();`，复用 `shared.js` 已缓存的句柄；同步修正 `shared.js` 中错误的注释（原注释错误声称"acquireVsCodeApi() 可安全多次调用"）
- **其他 4 个面板（data-transfer、explain-panel、table-designer、connection-dialog）存在同样的潜在崩溃**：虽然此前未收到用户反馈，但代码路径完全一致，本次一并修复

---

## [2.26.4] - 2026-07-01

### Bug Fixes

- **Hive 方言格式化将 `source` 标识符误判为 `SOURCE` 命令导致输出爆炸（P0）**：`HiveSqlAdapter.extractWholeStatements` 中的 `SOURCE` 命令匹配模式 `/\bSOURCE\b/gi` 不区分大小写且未锚定语句起始位置，会匹配 SQL 中作为普通标识符的 `source`（如 `SELECT source`、`GROUP BY source`、`source IN (...)`）。每次匹配后 `findStatementEnd` 贪婪吞掉剩余语句并作为 `__stmt_N__` 插槽保存，`restoreWholeStatements` 再把所有重叠插槽还原，导致文本重复拼接。用户提供的含 `source` 列名的 SQL 在 Hive 方言下格式化后从 26 行膨胀到 587 行（多次格式化可达 1000 行）。修复：将模式改为 `/(?:^|;|\n)\s*SOURCE\s+/gi`，要求 `SOURCE` 出现在语句起始位置且后接文件路径参数，不再误匹配列名/别名
- **v2.26.3 修复的 BETWEEN/IN 缺陷在不同方言下的残留影响**：v2.26.3 已修复 `BETWEEN` 丢失 `AND`、`IN` 丢失括号导致反复格式化行数循环增长的问题，本次验证确认 mysql/sql/postgresql/hive/spark 五种方言反复格式化 10 轮均稳定（hive 23 行，其余 23-26 行）

---

## [2.26.3] - 2026-07-01

### Bug Fixes

- **SQL 格式化 BETWEEN 表达式丢失 AND 关键字（P1）**：`ExpressionFormatter.formatBinaryExpr` 未对 `BETWEEN`/`NOT BETWEEN` 做专门处理，`node-sql-parser` 将 `BETWEEN a AND b` 解析为 `binary_expr`，其 `right` 为含两个边界值的 `expr_list`，原代码走通用 `expr_list` 格式化路径用逗号拼接，输出非法 SQL（如 `oper_time BETWEEN '2026-04-01', '2026-06-30'`）。修复：新增 `formatBetweenRight` 方法，将 `expr_list` 中的两个边界值用 `AND` 连接，保证输出合法语法
- **SQL 格式化 IN 表达式丢失括号（P1）**：`IN ('a', 'b')` 被解析为 `binary_expr`，`right` 为 `expr_list` 但无 `parentheses` 标记（括号属于 `IN` 语法本身，非表达式分组），原代码直接格式化 `right` 输出 `source IN 'a', 'b'`（非法 SQL）。修复：新增 `formatInRight` 方法，将 `expr_list` 值列表用括号包裹，保持 `IN (a, b)` 合法语法
- **上述 BETWEEN/IN 缺陷导致 SQL 反复格式化时行数循环增长（P0）**：第一轮格式化产出非法 SQL 后，解析器在后续轮次解析失败并触发 `formatWithFallback` 原样返回，配合注释保留逻辑反复重新插入注释，最终行数膨胀（用户反馈可增长至 700 行）。随 BETWEEN/IN 修复一并解决，反复格式化 10 轮稳定在 26 行
- **VSIX 打包失败：缺少 `activationEvents`（P1）**：`vsce` 3.x 校验要求当扩展声明 `main` 时必须显式提供 `activationEvents`，否则打包报 `Manifest needs the 'activationEvents' property`。修复：在 `package.json` 中补充 12 个 `onLanguage:`（覆盖全部 SQL 方言）和 42 个 `onCommand:` 激活事件，保证扩展在打开 SQL 文件或调用任意命令时按需激活

---

## [2.26.2] - 2026-07-01

### Bug Fixes

- **数据库资源管理器初始不显示连接（P1）**：`ConnectionManager.initialize()` 加载磁盘连接配置后未触发 `onDidChangeConnections` 事件，导致 `DatabaseTreeProvider`（在连接加载前已创建）的事件监听器收不到通知，必须手动刷新才显示连接。修复：加载完成后为每个连接触发 `add` 事件，树视图自动刷新
- **数据表 "query data" 查询无结果（P1）**：`viewTableData` 生成的 SQL 带末尾分号 `SELECT * FROM \`db\`.\`table\` LIMIT 1000;`，MySQL 流式查询路径及部分驱动将末尾分号视为第二条空语句，导致查询出错或返回空结果。修复：去除末尾分号
- **可视化配置页面无法切换编辑器/数据库标签页（P1）**：`config-editor.js` 的 `bindActions()` 在绑定事件后移除 `data-action-arg` 属性，但 `switchTab()`、`switchConnFormTab()` 及键盘导航在绑定后仍通过 `getAttribute('data-action-arg')` 查找按钮以更新激活态，属性被移除后查找永远返回 `null`，导致切换 tab 时按钮激活态无法更新、键盘导航失效。修复：仅移除 `data-action`（防重复绑定），保留 `data-action-arg`
- **配置页面与资源管理器未按插件语言设置显示中英文（P2）**：
    - 配置编辑器 webview 初始化时未请求 i18n 数据包，扩展宿主在 `_update()` 中主动发送的 `initI18n` 消息在 webview 加载完成、注册监听器之前就已发出被丢弃，导致 webview 仅依赖覆盖约 18 个 key 的内联字典，其余 `data-i18n` 元素保留 HTML 默认的英文文本。修复：webview 初始化时主动发送 `requestI18n` 消息，确保 i18n 数据可靠送达
    - `DatabaseTreeProvider` 未监听配置变更，用户切换 `displayLanguage` 后树节点标签（缓存在节点上）不刷新。修复：订阅 `ConfigManager.onConfigChange` 事件，语言变更时刷新树视图
    - 补充缺失的 `configEditor.noModified` 翻译 key（en/zh 两个语言包）

---

## [2.26.1] - 2026-07-01

### Bug Fixes

- **修复 VSIX 缺失运行时依赖（P0）**：v2.26.0 的 `.vscodeignore` 中 `node_modules/**` 规则错误地排除了 esbuild 标记为 external 的 8 个生产依赖（`mysql2`、`pg`、`better-sqlite3`、`mssql`、`oracledb`、`odbc`、`ssh2`、`node-sql-parser`），导致终端用户安装后激活时报 `Cannot find package 'mysql2'` 等错误。修复：移除 `node_modules/**` 全局排除规则，改为仅剥离 node_modules 内的非运行时文件（docs/test/src/build/README/LICENSE 等），并保留 `.node` 原生二进制。VSIX 体积 1.75MB → 13MB（含 8 个数据库驱动及其原生二进制，属合理成本）

---

## [2.26.0] - 2026-07-01

### Refactor

- **大规模代码重构**：完成自 v2.25.0 以来的架构级重构，覆盖方言聚合层、关键字/悬停模块、AST 转换器、视图依赖注入等多个方向，合计 18+ 文件变更（225 insertions, 182 deletions）
    - **方言聚合层迁移**：将 `src/languages/` 聚合文件统一迁移至 `src/dialects/`，删除 `src/languages/` 目录；per-dialect 文件迁移至 `src/dialects/`（保留 re-export shim 兼容）；`keywords/` 与 `hover` 子目录合并到 `src/dialects/keywords/`
    - **AST 类型单一真相源**：合并 `astTypes.extended.ts` 到 `astTypes.ts`，消除 9 个同名 interface 字段定义不一致的隐蔽 bug 来源
    - **转换规则数据驱动化**：引入 `ConversionRuleRegistry`，移除硬编码的方言转换对分支；数据驱动剩余 2 个硬编码 transformer 分支
    - **TreeNode 类型标签分发**：`database` 层 `TreeNode` 用 type-tag dispatch 替代 `instanceof` 检查
    - **方言数据补全**：补全 starrocks/sqlserver/oracle/dameng 4 个方言到 `dialectData`
    - **MySQL/StarRocks Adapter 泛型化**：`MysqlConnectionAdapter`/`MysqlMetadataAdapter` 改为泛型，`StarrocksConnectionAdapter`/`StarrocksMetadataAdapter` 改为继承覆写钩子；新增 `BaseSharedContext` 抽象基类消除约 150 行重复 getter/setter
    - **languages formatter 共享抽象**：新增 `mysqlProtocolBase.ts` 抽取 MySQL 协议族共享常量，`mysql.formatter.ts` 314→60 行，`starrocks.formatter.ts` 325→89 行
    - **Webview 共享样式**：新增 `media/shared.css` 与 `shared.js`，6 个 CSS 文件合计减少 330 行重复
    - **视图依赖注入显式化**：`LanguageBridge`、`QueryResultPanel`、`ConnectionDialog`、`DataTransferDialog`、`ExplainPlanPanel`、`TableDesignerPanel` 等面板从 DI 容器隐式 `tryGet` 改为构造函数显式注入 `SchemaProvider`/`SqlHoverProvider`/`SqlCompletionProvider`，消除服务定位反模式，提升可测试性
    - **超长函数拆分**：`MysqlSchemaAdapter.parseExplainNodes` 77→11 行；`MysqlQueryAdapter.execute` 105→13 行；`executeStream` 168→93 行
    - **Oracle/Dameng 错误处理去重**：`BaseConnectionAdapter` 新增 `extractErrorCodeTag` 模板方法，删除重复的 `formatConnectionError` 覆写

### Performance

- **`node-sql-parser` 懒加载**：将 `import { Parser }` 改为类型导入，`getParser()` 中 `require()` 延迟加载，扩展激活时不再加载 ~5MB 解析器模块，激活时间减少 50-200ms
- **`ssh2` 原生模块懒加载**：`SshTunnel.open()` 改为 `await import('ssh2')` 动态加载，不使用 SSH 隧道的用户零开销
- **行/列查找 O(n) → O(log n)**：`lineColFromIndex` 用预计算行起始偏移 + 二分查找替代线性扫描，5000 行 SQL 查找加速 1178-5797x
- **嵌套注释扫描批处理**：`NestedComment` 用 `indexOf` 批处理替代逐字符正则匹配，扁平场景加速 140x，嵌套场景加速 8.4x
- **Token 双重分配消除**：`TokenizerEngine.tokenize()` 不再创建新对象复制 `match()` 结果，10000 Token 减少 10000 次对象分配
- **FormatterFactory 实例复用**：通过 `FormatterFactory` 缓存 `SelectFormatter`/`InsertFormatter`/`DDLFormatter` 实例（带 `inUse` 标记防递归冲突），消除嵌套子查询/CTE/集合操作的 O(n) 实例分配
- **`splitSqlStatements` 字符串分配优化**：用 `hasSqlContent()` 字符扫描替代 `stmt.replace(/;/g, '').trim()`，每分号减少 2 次中间字符串分配
- **`expandPhrases.parseTerm` charCode 优化**：用 `charCodeAt` 范围判断替代逐字符正则，加速 4.36x
- **`ExplicitColumnAliasingRule` 复杂度优化**：`sql.split('\n')` 从列循环内移到循环外，复杂度 O(C×n) → O(n)
- **`SchemaCache` LRU 最近性修复**：`cachedFetch` 从 `peek()` 改为 `get()`，活跃 schema 条目更新 LRU 位置，提高缓存命中率
- **连接池破坏性回收修复**：`MysqlConnectionAdapter.reapIdleConnections()` 不再调用 `pool.end()`（销毁所有连接含活跃的），改为 no-op，消除回收周期中的查询中断
- **`retainContextWhenHidden` 按面板配置**：仅 `QueryResultPanel` 保留 `true`，其他面板默认 `false`，隐藏面板不再保留 JS 状态，减少内存占用
- **`.vscodeignore` 排除项优化**：新增排除 `scripts/**`、`.github/**`、`CHANGELOG.md`、`CONTRIBUTING.md`，减少 VSIX 安装包开发 artifacts

### Tests

- **测试覆盖扩充**：新增测试用例，总数达 **1828 项全部通过**（17s），含 4 套独立性能基准测试套件
- **新增综合评估报告**：`docs/refactor-evaluation-report.md` 量化重构前后功能一致性与性能影响

### Bundle

- **打包体积缩减 79%**：`out/extension.js` 从 4.5 MB 缩减至 **972 KB**（主要来自 `node-sql-parser`/`ssh2` 懒加载与 `.vscodeignore` 优化）

---

## [2.25.0] - 2026-06-29

### Performance

- **PostgreSQL 查询性能优化（H4）**：`PostgresQueryAdapter.execute` 移除每次查询额外的 `SELECT pg_backend_pid()` 往返，改用 pg 驱动 `PoolClient.processID` 字段（来自 BackendKeyData 消息），每次查询节省一次网络往返，低延迟查询端到端延迟降低 30-50%
- **诊断扫描缓存（H6）**：`AstDiagnosticsProvider.getNonStringCommentRanges` 按 document version 缓存扫描结果，编辑时若文档版本未变则跳过 O(n) 全量字符扫描，长 SQL（>10KB）诊断延迟减少 5-20ms
- **补全 AST 定位剪枝（H2）**：`AstCompletionProvider.findSmallestEnclosingNode` 利用节点 `loc` 位置信息剪枝，`walkAst` 的 `enter` 回调返回 false 时跳过子树遍历，复杂查询补全从 O(全树节点数) 降到 O(包含光标的路径节点数)，单次补全省 1-5ms
- **DDL 转换消除重复解析（H3）**：`AstConverter.convertCreateTable` 复用 `DialectConverter.convert` 内部已产出的 AST，消除第二次 `astify` 调用，CREATE TABLE 方言转换耗时减半
- **列补全 MRU 优先（H5）**：`SchemaProvider.addColumnItems` 无 aliasMap 回退路径改为按 MRU（最近使用）排序选表，避免拉取用户从不使用的表的列，补全项数量减少 50-80%，首选项命中率提升
- **JSON 导入流式解析（M9）**：`DataImporter.importFromJson` 改为基于字符状态机的两遍流式解析，移除全量 `records` 与 `rows` 数组构建，50MB JSON 导入内存峰值从 150-300MB 降至约 5MB
- **walkAst 减少 GC 压力（L15）**：`AstVisitor.walkAst` 用 `for...in` + 复用 buffer 替代每节点 `Object.keys` 数组分配，大 AST（数千节点）遍历 GC 压力降低

### Code Quality

- **删除临时脚手架文件**：清理根目录 `tmp_order_a.ts`、`tmp_order_b.ts`、`tmp_order_main.ts`，`.gitignore` 增加 `tmp_*.ts` 模式防止复发
- **修复 SelectWithoutFromRule 遍历 bug（2.12）**：`nodeContainsNoFromFunction` 中 `value === 'type'` 应为 `key === 'type'`，解构漏了 key 导致遍历逻辑错误，已修复
- **修复 MysqlSchemaAdapter 无意义属性访问（2.11）**：`result[0].EXPLAIN ?? result[0]['EXPLAIN']` 两种写法是同一属性访问，`??` 永远走第一分支，已简化
- **修复 StarrocksSchemaAdapter 无用变量（3.10）**：删除 `const indent` 声明与 `void indent;`，保留设计说明注释
- **CSP 安全升级（2.14）**：`config-editor.html` 从 `script-src 'unsafe-inline'` 升级为 `nonce-{{CSP_NONCE}}` 模式，消除潜在 XSS 攻击面，与其他 4 个面板对齐
- **i18n 一致性修复**：`SqliteConnectionAdapter` 硬编码英文错误消息改走 i18n（新增 `database.sqliteReadonly` key）；`BaseRule` 硬编码中文 `【第 X 行】` 前缀改走 i18n（新增 `linter.linePrefix` key，en: `[Line {0}]`）
- **esbuild external 补全（3.11）**：external 数组补充 `mysql2`、`ssh2`、`node-sql-parser`，避免 native/纯 JS 依赖被双重打包，减小 bundle 体积

### Architecture

- **AST 类型单一真相源（P0-4）**：合并 `astTypes.extended.ts` 到 `astTypes.ts`，消除 9 个同名 interface（SelectNode/SelectColumn/FromItem 等）字段定义不一致的隐蔽 bug 来源，删除 `astTypes.extended.ts`
- **接口细粒度化 ISP（P1-7）**：`QueryExecutor`、`DatabaseTreeProvider`、`TableDesignerPanel` 依赖从聚合 `IDatabaseAdapter`（30+ 方法）窄化为 `IQueryAdapter & Pick<...>` 等交集类型，mock 数量减半，接口变更影响面缩小
- **配置体系单一真相源（P2-10）**：删除 `src/core/config.ts`，`createConfig` 移入 `ConfigManager.getFormatOptions`；新增 `LINT_CONFIG_KEYS` 常量替代 `checkLinterConfigChanged` 硬编码的 4 个固定 key，配置新增项只需改一处
- **MySQL/StarRocks Adapter 泛型化（1.2/1.4/2.1）**：`MysqlConnectionAdapter`、`MysqlMetadataAdapter` 改为泛型 `<TShared extends IMysqlProtocolSharedContext>`，`StarrocksConnectionAdapter`/`StarrocksMetadataAdapter` 改为继承覆写钩子方法；新增 `BaseSharedContext` 抽象基类消除 7 个 SharedContext 文件约 150 行重复 getter/setter。合计删除约 211 行重复代码
- **languages formatter 共享抽象（1.3）**：新增 `mysqlProtocolBase.ts` 抽取 MySQL 协议族共享常量（postProcess、reservedClauses、tabularOnelineClauses、tokenizer 选项等），`mysql.formatter.ts` 314→60 行，`starrocks.formatter.ts` 325→89 行，StarRocks 端仅需维护 7 行特有 clause
- **Webview 共享样式（2.8）**：新增 `media/shared.css`（145 行）与 `shared.js`（120 行），抽取 toggle 开关、滚动条、CSS 变量、`acquireVsCodeApi` 缓存、data-action 事件委托等通用部分，6 个 CSS 文件合计减少 330 行重复
- **超长函数拆分（2.5/2.6/2.7）**：`MysqlSchemaAdapter.parseExplainNodes` 77→11 行（拆为 parseQueryBlockNode/parseGenericNode 等，提取 `EXPLAIN_SKIP_KEYS` 常量）；`MysqlQueryAdapter.execute` 105→13 行（抽 withAcquiredConnection/mapResultToQueryResult/mapMysqlError）；`executeStream` 168→93 行（抽 setupStreamFields/iterateStreamRows 生成器）
- **Oracle/Dameng 错误处理去重（2.13）**：`BaseConnectionAdapter` 新增 `extractErrorCodeTag` 模板方法，Oracle/Dameng 删除重复的 `formatConnectionError` 覆写，仅覆写 `extractErrorCodeTag` 返回 `ORA-XXXXX`/`DM-XXXX`

### Refactor

- **移除无意义 Lazy 包装（3.19）**：`allDialects.ts` 中 36 处 `new Lazy(() => _mysql)` 改为直接 `export const mysql = _mysql`，因为被包装的已是轻量字面量，Lazy 无收益；同步更新 5 个调用方移除 `.get()` 调用
- **魔术数字提取（3.4）**：`DatabaseModule` 的 `setTimeout(..., 50/300)` 提取为 `REVEAL_DELAY_MS`、`IGNORE_WINDOW_MS` 常量并加注释
- **错误处理统一（3.5）**：`DatabaseModule.initialize` 的 3 个 try-catch 抽取为 `tryStep(name, fn)` 私有方法，统一 console.error + errorHandler 转发
- **dameng.formatter.ts 注释英文化（3.20）**：中文注释翻译为英文，与其他方言 formatter 注释语言一致
- **删除重复 NLS 文件（3.6）**：`package.nls.zh-hans.json` 与 `package.nls.zh-cn.json` 内容完全相同，删除 `zh-hans` 保留 `zh-cn`（VSCode 自动 fallback）

### Tests

- **测试覆盖扩充**：新增 64 个单元测试用例，全部通过，总数达 1826 项
    - `mysqlAdapter.test.ts`（12 项）：`createPoolOptions`/`createConnectionOptions` 默认配置、SSL、charset、边界情况
    - `mysqlExplainParser.test.ts`（14 项）：`parseExplainNodes` 的 query_block 嵌套、cost_info、EXPLAIN_SKIP_KEYS 过滤、edge cases
    - `linterRules.test.ts`（15 项）：AvoidSelectStarRule、UppercaseKeywordsRule、LimitWithOrderByRule 各 5 项最小用例
    - `schemaCompletion.test.ts`（+23 项）：MruTracker 表级 MRU 队列、SchemaProvider MRU 排序算法、resolveCompletionItem MRU 记录

---

## [2.24.0] - 2026-06-26

### Features

- **StarRocks 数据库支持**：通过 MySQL 协议（mysql2 驱动）连接 StarRocks，语言层在 MySQL 方言基础上扩展。支持 BITMAP/HLL/PERCENTILE/JSON/ARRAY/MAP/STRUCT 类型、DUPLICATE/AGGREGATE/UNIQUE KEY 表模型、ROLLUP/COLOCATE/DYNAMIC_PARTITION/PARTITION/BUCKETS/PROPERTIES DDL、物化视图（CREATE/REFRESH MATERIALIZED VIEW）、BITMAP_UNION/HLL_UNION/COLLECT_LIST/EXPLODE_SPLIT 等专属函数。默认端口 9030，默认用户 root
- **SQL Server 数据库支持**：通过 mssql 驱动（基于 tedious）连接 SQL Server，支持 T-SQL 语法。支持 TOP/OFFSET FETCH/OUTPUT/PIVOT/UNPIVOT/MERGE/CROSS APPLY-OUTER APPLY 关键字、NVARCHAR/DATETIME2/DATETIMEOFFSET/MONEY/UNIQUEIDENTIFIER/SQL_VARIANT/HIERARCHYID/GEOGRAPHY 类型、FOR XML/FOR JSON 序列化、TRY_CONVERT/TRY_CAST/STRING_AGG/IIF/CHOOSE 函数、WITH (NOLOCK) 表提示。支持 Windows 身份验证（domain）、跨数据库查询（三段式命名）、SSL、SSH 隧道。默认端口 1433，默认用户 sa
- **Oracle 数据库支持**：通过 oracledb 6.x 驱动连接 Oracle，默认 thin 模式（纯 JS 无需 Oracle Client），可选 thick 模式（需 Instant Client，幂等初始化）。支持 PL/SQL 语法、CONNECT BY 层级查询、MINUS 集合运算、q'[...]' 替代引号、序列、同义词、包。支持 NUMBER/VARCHAR2/CLOB/TIMESTAMP WITH TIME ZONE/INTERVAL 等 Oracle 专属类型，DECODE/NVL/LISTAGG/CONNECT_BY_ROOT/SYS_CONNECT_BY_PATH/DBMS_RANDOM 等专属函数。DDL 检索通过 DBMS_METADATA.GET_DDL，执行计划通过 EXPLAIN PLAN + DBMS_XPLAN.DISPLAY。默认端口 1521，默认用户 system
- **达梦（DM8）数据库支持**：通过 ODBC 桥接连接达梦数据库，语言层基于 Oracle 方言派生。支持 TOP/LIMIT 双分页语法、CONNECT BY/ROWNUM/DUAL Oracle 兼容语法、DM_HASH/DM_ENCRYPT/TO_DM_DATE 达梦专属函数。支持元数据浏览（含序列、同义词）。默认端口 5236，默认用户 SYSDBA
- **方言注册矩阵完善**：StarRocks/SQL Server/Oracle/达梦 4 种新方言在 package.json languages、configuration enum、dialectRegistry、allDialects、dialectKeywordMap 全链路注册，悬停提示覆盖方言专属关键字

### Bug Fixes

- **SQL Server EXPLAIN 会话泄漏修复（P0）**：`getExplainPlan` 使用 `SET SHOWPLAN_XML ON` 在池化连接上开启，若 `SET OFF` 因连接中断失败，污染的连接归还池后所有后续查询返回 XML 计划而非执行结果。修复：将 SET ON/查询/SET OFF 三步包进 mssql Transaction，失败时 rollback 强制重置连接，避免污染连接泄漏回池
- **Oracle EXPLAIN 共享 plan_table 误删修复（P0）**：`getExplainPlan` 执行 `DELETE FROM plan_table` 未按 statement_id 过滤，在共享 plan_table（PUBLIC 同义词）配置下会删除所有会话的计划行。修复：为每次 EXPLAIN 生成唯一 statement_id，所有 DELETE/SELECT/DBMS_XPLAN.DISPLAY 操作按 statement_id 过滤，仅操作当前会话生成的行
- **Dameng cancelQuery 误杀同用户会话修复（P1）**：`cancelQuery` 通过查询 v$session 取同用户最近登录的 active 会话执行 `ALTER SYSTEM KILL SESSION`，在多连接池下可能杀死同用户无关查询。修复：移除危险的 KILL SESSION 路径，cancelQuery 改为 no-op，依赖每查询超时兜底
- **Dameng 查询超时未生效修复（P1）**：注释声称 per-query timeout 传给 `connection.query()`，但实际调用未传 timeout 选项，长查询无法被超时取消。修复：将 `{ timeout: 30s }` 真正传给 odbc query 选项，常量重命名为 `DEFAULT_QUERY_TIMEOUT_MS`
- **Oracle/达梦主键索引误判修复（P2）**：`describeTableIndexes` 用 PK 列集合与索引列集合相等判定主键，会误将列相同的非主键唯一索引标记为主键。修复：改用 `all_constraints.constraint_type = 'P'` 关联 `all_indexes.index_name` 精确识别主键索引
- **StarRocks 事务内查询不可取消修复（P2）**：事务内查询未注册到 `activeQueryThreadIds`，`cancelQuery` 静默 no-op。修复：`beginTransaction` 记录事务连接 threadId，`cancelQuery` 在未命中 queryId 时回退到该 threadId，commit/rollback 清理条目
- **达梦 snippets 与 Oracle 冲突修复（P2）**：snippets/dameng.json 前 8 个片段前缀为 `or*`，与 snippets/oracle.json 命名冲突且描述写为 Oracle。修复：前缀改为 `dm*`，描述改为达梦语境

### Code Quality

- **关键字悬停提示补全 3 方言**：dialectKeywordMap 原仅注册 starrocks，遗漏 sqlserver/oracle/dameng。新增 sqlserverKeywords.ts（30 条）、oracleKeywords.ts（39 条）、damengKeywords.ts（38 条）并注册，3 方言现可显示专属关键字悬停说明
- **测试覆盖**：1737 项单元测试全部通过，类型检查与 ESLint 零错误

---

## [2.23.0] - 2026-06-24

### Features

- **MySQL ↔ Hive SQL 转换架构重构**：基于可插拔节点转换器（Node Transformer）模式重构 DDL/DML 转换引擎，AST 优先转换、正则回退兜底，支持 CREATE TABLE、SELECT、INSERT、UPDATE、DELETE、CREATE VIEW 等全语句类型
- **AST 转换引擎（AstTransformEngine）**：新增转换引擎与 6 个节点转换器——`FunctionTransformer`（函数映射：NOW→CURRENT_TIMESTAMP、IFNULL→COALESCE、IF→CASE WHEN 参数重组）、`TypeTransformer`（类型映射：DATETIME↔TIMESTAMP、VARCHAR→STRING、STRING→VARCHAR(255)，复杂类型 ARRAY/MAP/STRUCT→JSON 时发出警告）、`ColumnAttrTransformer`（列属性剥离：AUTO_INCREMENT、NOT NULL、UNSIGNED、COLLATE 等）、`TableOptionTransformer`（表选项过滤：ENGINE、STORED AS 等）、`ConstraintTransformer`（约束/索引移除：PRIMARY KEY、KEY）、`ClauseTransformer`（Hive 子句移除：DISTRIBUTE BY、SORT BY、CLUSTER BY）
- **交互式回退机制**：AST 解析失败时弹出「回退正则转换 / 查看错误详情 / 取消」三选项对话框，用户可选择兼容模式继续转换或查看详细错误
- **右键菜单与命令面板入口**：编辑器右键菜单与命令面板新增「MySQL → Hive」与「Hive → MySQL」转换命令，按 SQL 文件类型上下文显示
- **类型映射增强**：`HIVE_TO_MYSQL_TYPES` 从 7 项扩展至 17 项（新增 TINYINT、SMALLINT、INT、BIGINT、FLOAT、DOUBLE、DECIMAL、DATE、TIMESTAMP→DATETIME、CHAR→CHAR(255)），新增 `HIVE_COMPLEX_TYPES` 集合用于复杂类型警告
- **函数映射增强**：新增 `MYSQL_TO_HIVE_FUNCTION_NAMES` 与 `HIVE_TO_MYSQL_FUNCTION_NAMES` AST 函数名映射表，覆盖 NOW、CURDATE、IFNULL、GROUP_CONCAT、STR_TO_DATE、CURRENT_TIMESTAMP、COLLECT_LIST、GET_JSON_OBJECT 等函数

### Code Quality

- **AstConverter 向后兼容委托**：`AstConverter` 内部委托给 `DialectConverter`，`ConvertResult` 新增 `usedFallback` 与 `warnings` 字段，`convertCreateTable`/`tryConvertCreateTable` 接口签名保持不变
- **AST 深拷贝防缓存污染**：`SqlParserEngine.astify` 缓存 AST，转换器直接修改会导致跨调用污染；`DialectConverter` 转换前深拷贝 AST
- **国际化消息补充**：新增 8 条转换相关中英文消息（AST 失败提示、回退选项、回退成功、警告计数、复杂类型警告）

---

## [2.22.1] - 2026-06-24

### Bug Fixes

- **连接对话框仅显示 MySQL 修复**：新建数据连接时数据库类型仅显示 MySQL，PostgreSQL 与 SQLite 虽已实现适配器却不可选。根因为连接对话框前端在初始化时向后端发送 `getSupportedDialects` 消息以动态获取已注册方言，但后端 `ConnectionDialog` 未处理该消息，导致前端 `supportedDialectKeys` 永久保持默认值 `['mysql']`。同时 `PostgresAdapter` 与 `SqliteAdapter` 缺少 `getDialectMetadata` 静态方法且未在 `AdapterFactory` 注册元数据提供者，`getAllMetadata()` 无法返回二者。现补全消息处理、为两个适配器新增元数据方法并在 `extension.ts` 注册元数据提供者，连接对话框现可正确显示并选择 MySQL、PostgreSQL、SQLite

### Code Quality

- **Lint 预存警告清除**：移除自动生成文件 `snippetData.ts` 中多余的 `eslint-disable` 指令（从生成器 `generate-snippets.ts` 源头修复并重新生成）；为 `queryCancel.test.ts` 中 8 个有意的空函数（mock no-op、永不 resolve 的 Promise、rejection 吞噬）添加说明性注释，消除 `no-empty-function` 警告。`npm run lint` 现零警告零错误

---

## [2.22.0] - 2026-06-24

### Features

- **配置编辑器方言动态渲染**：新增 `DialectMetadata` 接口与 `AdapterFactory` 元数据方法，配置编辑器与连接对话框改为动态渲染方言网格/下拉列表，并支持"显示更多方言"按钮，避免硬编码方言列表
- **连接状态指示器**：连接对话框新增连接状态指示器，配置编辑器新增相对测试时间显示
- **配置变更追踪**：配置编辑器新增变更追踪功能，修改项以圆点标记并支持定位操作；配置分组折叠状态持久化到 localStorage
- **搜索结果高亮**：配置编辑器搜索结果以 `<mark>` 标签高亮显示
- **数字输入滚轮调节与 Ctrl+F 搜索快捷键**：配置编辑器数字输入框支持滚轮调节，新增 Ctrl+F 搜索快捷键
- **SQL 语法高亮**：预览结果中新增 SQL 语法高亮，支持 token 颜色配置
- **无障碍增强**：新增 `aria-live`、`aria-selected` 属性与键盘导航支持
- **tab-bar 布局重构**：集成操作按钮与 aria 属性，响应式断点适配预览与配置区域
- **PostgreSQL 与 SQLite 适配器**：新增 PostgreSQL 和 SQLite 数据库适配器，扩展支持的方言范围

### Bug Fixes

- **SQL 格式化器缓存键哈希冲突修复**：`hashOptions` 原使用 32 位 FNV-1a 哈希通过 XOR 组合各选项值，不同选项集（如 `semicolonAtEnd: true` 与 `false`）可能产生相同缓存键，导致返回错误配置的格式化器（如 `semicolonAtEnd: false` 时仍附加分号）。现改为确定性的字符串序列化缓存键（`dialect|key=type:value|...`），彻底消除哈希冲突
- **debugLog 测试桩在 VS Code 扩展宿主失效修复**：VS Code 扩展宿主中 `console.debug` 为访问器属性（getter/setter），普通赋值无法覆盖调用方读取的值。测试改用 `Object.defineProperty` 替换为数据属性，确保桩函数被实际调用
- **asyncDisposeAll 时序断言修复**：销毁顺序由层级计算保证（依赖项先于被依赖项销毁），但被依赖项的同步销毁与依赖项的异步销毁可能落在同一事件循环 tick，`Date.now()` 返回相同毫秒。将严格小于（`<`）改为小于等于（`<=`）以反映保证的顺序而非亚毫秒计时
- **DataImporter 测试适配参数化查询**：测试原期望内联 SQL 值（NULL、转义引号、数字），但实现已改用参数化查询（`?` 占位符）防 SQL 注入。更新测试验证值通过 params 正确传递

### Code Quality

- **DocumentAstCache 深拷贝类型安全**：`JSON.parse(JSON.stringify(node))` 返回 `any`，添加 `as AST` 类型断言消除 `no-unsafe-assignment` 警告

---

## [2.20.0] - 2026-06-23

### Features

- **配置编辑器方言动态渲染**：新增 `DialectMetadata` 接口与 `AdapterFactory` 元数据方法，配置编辑器与连接对话框改为动态渲染方言网格/下拉列表，并支持"显示更多方言"按钮，避免硬编码方言列表
- **连接状态指示器**：连接对话框新增连接状态指示器，配置编辑器新增相对测试时间显示
- **配置变更追踪**：配置编辑器新增变更追踪功能，修改项以圆点标记并支持定位操作；配置分组折叠状态持久化到 localStorage
- **搜索结果高亮**：配置编辑器搜索结果以 `<mark>` 标签高亮显示
- **数字输入滚轮调节与 Ctrl+F 搜索快捷键**：配置编辑器数字输入框支持滚轮调节，新增 Ctrl+F 搜索快捷键
- **SQL 语法高亮**：预览结果中新增 SQL 语法高亮，支持 token 颜色配置
- **无障碍增强**：新增 `aria-live`、`aria-selected` 属性与键盘导航支持
- **tab-bar 布局重构**：集成操作按钮与 aria 属性，响应式断点适配预览与配置区域

### Bug Fixes

- **SQL 格式化器缓存键哈希冲突修复**：`hashOptions` 原使用 32 位 FNV-1a 哈希通过 XOR 组合各选项值，不同选项集（如 `semicolonAtEnd: true` 与 `false`）可能产生相同缓存键，导致返回错误配置的格式化器（如 `semicolonAtEnd: false` 时仍附加分号）。现改为确定性的字符串序列化缓存键（`dialect|key=type:value|...`），彻底消除哈希冲突
- **debugLog 测试桩在 VS Code 扩展宿主失效修复**：VS Code 扩展宿主中 `console.debug` 为访问器属性（getter/setter），普通赋值无法覆盖调用方读取的值。测试改用 `Object.defineProperty` 替换为数据属性，确保桩函数被实际调用
- **asyncDisposeAll 时序断言修复**：销毁顺序由层级计算保证（依赖项先于被依赖项销毁），但被依赖项的同步销毁与依赖项的异步销毁可能落在同一事件循环 tick，`Date.now()` 返回相同毫秒。将严格小于（`<`）改为小于等于（`<=`）以反映保证的顺序而非亚毫秒计时
- **DataImporter 测试适配参数化查询**：测试原期望内联 SQL 值（NULL、转义引号、数字），但实现已改用参数化查询（`?` 占位符）防 SQL 注入。更新测试验证值通过 params 正确传递

### Code Quality

- **DocumentAstCache 深拷贝类型安全**：`JSON.parse(JSON.stringify(node))` 返回 `any`，添加 `as AST` 类型断言消除 `no-unsafe-assignment` 警告

---

## [2.19.0] - 2026-06-23

### Bug Fixes

- **DocumentAstCache 增量解析 AST 就地修改修复**：增量解析复用缓存 AST 时，`adjustAstLocationsInPlace` 直接修改缓存中的 AST 节点 `loc` 属性，导致 linter/hover/navigation 等多个消费者引用同一缓存时位置信息错位。现改为深拷贝（`JSON.parse(JSON.stringify)`）后再调整位置，原始缓存 AST 不被修改
- **ConnectionStore.save() 竞态条件修复**：debounce 时提前 resolve 前一个 Promise 但数据尚未写入磁盘，调用方可能误以为保存已完成。现改用 Promise 链 + `settlePendingSave` 保存 resolve/reject 句柄，确保所有调用方的 Promise 在数据实际写入磁盘后才 settle；同时修复 `saveImmediate()` 清除定时器后旧 Promise 永不 settle 导致调用方永久挂起的 Critical bug
- **MysqlQueryAdapter 连接计数泄漏修复**：`activeConnectionCount++` 原在 try 块外执行，若 `acquireConnectionWithTimeout` 成功后、进入 try 块前发生异常，计数会泄漏。现将计数和 `activeQueryThreadIds.set()` 移入 try 块内并加 `if (acquiredConn)` 守卫，与 finally 中的 `--` 正确配对

### Performance

- **SqlParserEngine 缓存键内存优化**：`makeCacheKey` 原将完整 SQL 文本作为缓存键，100KB SQL 文件每条键占 100KB+，50 条缓存最坏占 5MB+ 内存。现改用 FNV-1a 哈希（offset basis 2166136261，prime 16777619），键长度从 O(n) 降为 O(1)，大 SQL 文件场景内存占用降低约 99%
- **DocumentAstCache splitSqlStatements 复用**：`getOrParseInternal` 中增量解析条件不满足时 fall through 到全量解析，`splitSqlStatements` 被重复调用两次。现提前计算一次并复用，大文件减少一次 O(n) 重复扫描
- **SchemaProvider 列补全并发限制**：无别名映射时并行获取前 10 个表的列信息，首次访问触发 10 个并发数据库查询。现通过 `parallelWithLimit`（index 指针驱动的 worker 池）限制并发数为 3，减轻数据库瞬时压力

### Code Quality

- **RuleRegistry.reloadConfig 原地更新优化**：原实现销毁所有规则实例并重新创建（`rules.clear()` + `registerAllRules()`），配置变更时产生不必要的 GC 压力。现改为遍历现有规则调用 `updateConfig`，复用实例仅更新配置

---

## [2.20.0] - 2026-06-23

### Features

- **PostgreSQL 数据库适配器**：新增完整的 PostgreSQL 适配器实现，基于 `pg` 连接池，支持连接池管理、SSL、SSH 隧道、事务（BEGIN/COMMIT/ROLLBACK）、查询取消（`pg_cancel_backend`）、元数据查询（数据库/Schema/表/视图/函数/存储过程/触发器）、Schema 描述（列/索引/外键）、DDL 生成、EXPLAIN 执行计划、行数统计、数据类型定义
- **SQLite 数据库适配器**：新增完整的 SQLite 适配器实现，基于 `better-sqlite3`，支持文件路径连接、WAL 模式、事务、查询中断（`interrupt()`）、元数据查询（表/视图/触发器）、Schema 描述、DDL 生成、EXPLAIN QUERY PLAN、行数统计、数据类型定义
- **隐式交叉连接检测规则**：新增 `implicit_cross_join` Lint 规则，检测缺少 ON 或 USING 子句的 JOIN 语句（产生隐式交叉连接），默认启用，级别为 Warning
- **已弃用函数检测规则**：新增 `deprecated_function` Lint 规则，检测 `LENGTH()`、`GREATEST()`、`LEAST()` 等可能存在跨方言行为差异或 NULL 陷阱的函数，默认启用，级别为 Info
- **PostgreSQL 布尔比较检测规则**：新增 `postgres_boolean_comparison` Lint 规则（仅 PostgreSQL 方言），检测 `= TRUE` / `= FALSE` 比较并建议直接使用布尔列，默认启用，级别为 Hint
- **连接对话框 UI**：启用 PostgreSQL 和 SQLite 方言选择，修复 SQLite 文件浏览按钮的元素 ID 映射问题

### Tests

- 新增 `dialectLint.test.ts`：8 个测试用例，覆盖隐式交叉连接、已弃用函数、PostgreSQL 布尔比较的检测与不误报场景
- 新增 `queryCancel.test.ts`：4 个测试用例，覆盖超时取消、显式取消、不支持取消时跳过、运行中查询跟踪场景

### Dependencies

- 新增 `pg` ^8.13.0（PostgreSQL 客户端）
- 新增 `better-sqlite3` ^11.7.0（SQLite 客户端）
- 新增 `@types/pg` ^8.11.10、`@types/better-sqlite3` ^7.6.12（类型定义）
- `esbuild` 配置将 `pg`、`better-sqlite3` 标记为 external（原生模块不打包）

---

## [2.19.0] - 2026-06-22

### Performance

- **node-sql-parser 懒加载**：将 `node-sql-parser`（~5MB）的顶层 `import` 改为 `getParser()` 中的 `require()` 延迟加载，扩展激活时不再加载解析器模块，激活时间减少 50-200ms
- **ssh2 原生模块懒加载**：将 `ssh2` 的顶层 `import` 改为 `open()` 方法中的 `await import()` 动态加载，不使用 SSH 隧道的用户不再加载原生模块
- **Token 双重分配消除**：`TokenizerEngine.tokenize` 不再创建新对象复制 `match()` 结果，直接在已有 Token 上设置 `precedingWhitespace`，减少 50% 的 Token 对象分配
- **引号参数正则缓存**：`Tokenizer` 中 `QUOTED_PARAMETER` 的 `key` 函数不再每次调用都 `new RegExp(...)`，改为按 `quoteChar` 缓存正则表达式
- **splitSqlStatements 字符串分配优化**：用 `hasSqlContent()` 字符扫描替代 `stmtText.replace(/;/g, '').trim()`，每个分号减少 2 次中间字符串分配
- **AST 位置调整属性遍历优化**：`adjustAstLocationsInPlace` 用 `for...in` + `hasOwnProperty` 替代 `Object.keys()`，避免每个 AST 节点分配数组
- **ExplicitColumnAliasingRule 算法复杂度优化**：将 `sql.split('\n')` 从列循环内移到循环外，复杂度从 O(C×n) 降为 O(n)
- **FormatterFactory 格式化器实例复用**：通过 `FormatterFactory` 缓存和复用 `SelectFormatter`、`InsertFormatter`、`DDLFormatter` 实例，带 `inUse` 标记防止递归冲突，消除嵌套子查询/CTE/集合操作的 O(n) 实例分配

### Stability

- **修复破坏性连接池回收**：`MysqlConnectionAdapter.reapIdleConnections` 不再调用 `pool.end()`（销毁所有连接包括活跃的）并重建池，改为 no-op（mysql2 的 `enableKeepAlive` 已处理空闲连接驱逐），消除回收周期中的查询中断和短暂不可用窗口
- **SchemaCache LRU 最近性修复**：`cachedFetch` 从 `peek()` 改为 `get()`，使频繁访问的 schema 条目更新 LRU 位置，提高缓存命中率，避免活跃条目被过早驱逐

### Code Quality

- **移除死代码**：删除从未在生产代码中调用的 `SqlParserEngine.parse()` 方法、`ParseResult` 接口和 `TableColumnAst` 类型导入
- **移除重复实现**：删除 `DocumentAstCache` 中与 `lineColFromIndex` 重复的 `precomputeLineOffsets` 函数，改为从共享位置导入
- **移除热循环冗余检查**：移除 `TokenizerEngine.tokenize` 中的 `MAX_ITERATIONS` 计数器（零长度匹配保护已处理死循环场景）
- **Webview 面板内存优化**：仅 `QueryResultPanel` 保留 `retainContextWhenHidden: true`，其他面板（ConnectionDialog、DataTransferDialog 等）默认为 `false`，减少隐藏面板的内存占用
- **.vscodeignore 优化**：新增排除 `scripts/**`、`.github/**`、`CHANGELOG.md`、`CONTRIBUTING.md`，减小 VSIX 安装包

### Benchmark

- 新增 `perf.comprehensive.benchmark.ts`：综合性能基准测试套件，覆盖行偏移计算、行列查找、嵌套注释扫描、语句分割、属性遍历等场景

---

## [2.18.0] - 2026-06-22

### Performance

- **NestedComment 嵌套注释匹配优化**：将逐字符正则 `exec`（`ANY_CHAR`）改为 `String.indexOf` 批量跳过普通字符，直接定位下一个 `/*` 或 `*/` 标记。扁平长注释（500 字符）提速约 100x，深层嵌套注释提速约 5.7x
- **lineColFromIndex 行列计算优化**：新增 `lineColFromIndexFast` + `precomputeLineOffsets`，复用已有的 `precomputeLineStarts` + `lineFromOffset` 二分查找实现，将 O(n) 线性扫描降为 O(log n)。`AstDiagnosticsProvider.checkExtraCommasInText` 中对每个匹配逗号的行列计算，从 O(n×m) 降为 O(n + m·log n)，2000 行 SQL 上 2000 次查找从 278ms 降至 0.24ms（约 1150x），单次查找从 0.72ms 降至 0.0001ms（约 5700x）
- **Lint 规则行号计算优化**：`CommentedOutCodeRule`、`ExpiredTodoRule`、`UppercaseKeywordsRule` 将 `sql.substring(0, idx).split('\n').length` 的 O(n) 行号计算替换为预计算 `lineStarts` + `lineFromOffset` 的 O(log n) 查找，消除每次匹配的重复字符串分割
- **LongQueryLineRule 单行长度检查优化**：移除 `sql.split('\n')` 全量分割，改为单次遍历按 `\n` 切分行，避免大文件产生大数组分配；使用 `charCodeAt` 替代 `substring` + `trimStart` + `startsWith` 做前缀判断
- **TokenizerEngine 实例复用**：`Tokenizer.tokenize` 缓存 `TokenizerEngine` 实例，当规则未变化时复用同一实例，避免每次分词重复实例化对象
- **TokenizerEngine Token 对象构造优化**：将 `{ ...token, precedingWhitespace }` 展开改为显式字段赋值，避免展开运算符的额外对象分配
- **DocumentAstCache dollar-quote 解析优化**：`matchDollarQuoteDelimiter` 将字符比较和正则测试（`/[A-Za-z_]/.test`）替换为 `charCodeAt` 范围判断，减少正则调用开销
- **AstVisitor 栈深度保护优化**：`walkAst` 的深度检查从 `stack.length / 4 > 10000`（每次除法）改为 `stack.length > MAX_STACK_DEPTH`（常量比较），并提升上限到 40000 以支持更深的 AST

### Benchmark

- 新增 `perf.optimization.benchmark.ts`：对比优化前后实现，覆盖 NestedComment（扁平/嵌套）、lineColFromIndex（批量/单次查找）场景，并包含正确性验证（边界用例、未闭合注释、嵌套闭合等）

---

## [2.17.0] - 2026-06-22

### Refactor

- 统一错误处理策略：将 25 个文件中约 40 处 `console.debug`/`console.warn`/`console.error` 调用替换为统一的 `handleError` 函数，错误自动记录到 "SQL All in One Errors" 输出通道，用户无需开发者工具即可查看错误历史
- 新增 `debugLog` 函数：为纯调试/信息性日志（如缺失翻译键、AST 深度超限）提供统一入口，通过 `isDebugEnabled` 控制，不记录到错误历史、不触发通知，避免污染错误追踪
- `ErrorHandler` 扩展调试日志支持：新增 `debugEnabled` 字段、`isDebugEnabled()`/`setDebugEnabled()` 方法和 `debugLog()` 导出函数，`debugLog` 在 DI 容器未注册时安全降级
- 错误分类规范化：使用 `ErrorCategory`（CRITICAL/FEATURE/SUB_ITEM/PARSE/FORMAT/CONFIG）统一分类，上下文字符串遵循 `ClassName.methodName` 命名约定

### 涉及模块

- **LanguageBridge**：补全、Hover、格式化、诊断、snippet 加载错误统一处理
- **Webview 面板**：TableDesignerPanel、QueryResultPanel、BaseWebviewPanel、DataTransferDialog 错误统一处理
- **Provider/Navigation**：SqlHoverProvider、SqlOutlineProvider、SqlFoldingRangeProvider、SqlRenameProvider、SqlReferenceProvider、SqlDefinitionProvider 错误统一处理
- **数据库/解析器/查询**：DocumentAstCache、SchemaCache、QueryExecutor、SafeQueryGuard、SqlStatementDetector、DatabaseTreeProvider 错误统一处理
- **其他模块**：themeColors、i18n、validateConfig、ExpressionFormatter、AstFormatter、AstVisitor 错误统一处理

---

## [2.16.0] - 2026-06-18

### Performance

- `walkAst` 遍历优化：将每节点 `Object.entries()` 临时数组分配改为可复用的 `keysBuffer` + `for...in`，跳过 `type`/`loc` 属性，减少大文件（1000+ 节点）Lint 时的 GC 压力
- `SchemaCache.cachedFetch` 移除 O(n) 全量过期清理（`evictExpiredEntries`），改为单条目惰性过期检查（`peek` + `isExpired`），表数量多时查询延迟降低；同时移除冗余的 30 秒定时器
- `PerformanceMonitor.measure/measureAsync` 在 `off` 模式下直接 `return fn()`，避免 `try/finally` 和 `performance.now()` 调用开销
- `SqlCompletionProvider` 静态补全项（关键字、函数、片段）改为模块级懒加载缓存 + 克隆复用，仅动态项（CTE、identifier、comment、schema）实时构建，减少每次按键的内存分配
- `SafeQueryGuard.analyzeWithRegex` 中 8 个正则提取为模块级静态常量，避免每次调用重新编译，安全检查耗时减半

### Concurrency & Correctness

- `MysqlQueryAdapter.execute` 连接计数器一致性修复：`activeConnectionCount++` 移到 `acquireConnectionWithTimeout` 成功后执行，`finally` 中检查 `acquiredConn` 存在性再递减，避免获取连接失败时计数器变为负数
- `ConnectionManager.removeConnection` 添加 `runtimeStates.delete(id)`，清理连接移除后的无用运行时状态，消除长期使用的内存泄漏
- `QueryExecutor.raceExecution` 中 `attemptCancel` 添加 `void` 标记 + 双重 `settled` 检查，避免 Promise resolve 后仍执行取消导致的资源浪费和日志混乱

### Code Quality

- `SchemaProvider` 消除 `touchMru` 副作用：MRU 更新从补全项生成阶段推迟到 `resolveCompletionItem`（用户实际选择补全项时），通过 `CompletionItem.data` 字段携带元数据，读操作不再产生副作用
- `sqlFormatter.hashOptions` 哈希碰撞修复：对 `undefined`/`null` 使用固定哨兵值（`__undef__`/`__null__`），其他值加类型前缀，避免不同类型值产生相同哈希导致格式化器实例复用错误
- 全项目 58 处静默 `catch {}` 审计改进：添加 `console.debug` 错误记录保留上下文，保留合理控制流（如 `fs.access` 文件存在检查）并添加注释说明

### Resource Management

- `sqlFormatter.formatterCache` 从普通 `Map` + 手动 FIFO 淘汰替换为项目已有的 `LRUCache`，确保热点格式化器实例不被淘汰，提升缓存命中率
- `BaseWebviewPanel` 静态实例泄漏防护：`getExistingInstance` 添加防御性清理（检查 `_isDisposed`），新增 `disposeAll()` 兜底方法，`deactivate()` 中调用确保扩展卸载时清理残留面板
- `DocumentAstCache.maxSize` 从 50 提升到 100，减少多文件工作区频繁切换文件时的缓存抖动

### Architecture

- `DIContainer` 依赖声明完善：为 `extension.ts` 中所有有依赖的 `registerSingleton` 调用补充 `dependencies` 参数，确保 Kahn 拓扑排序销毁顺序正确（被依赖的服务后销毁）
- `IDatabaseAdapter` 接口隔离：拆分为 `IConnectionAdapter`、`IQueryAdapter`、`IMetadataAdapter`、`ISchemaAdapter` 四个子接口，`IDatabaseAdapter` 继承所有子接口保持对外兼容
- `SchemaProvider` 职责拆分：提取 `MruTracker` 类管理 MRU 状态，提取 `HoverInfoProvider` 类处理 Hover 信息生成，`SchemaProvider` 仅保留补全项生成逻辑
- `FormatterModule` 实例复用：`SqlFormattingProvider` 改为无状态共享单例，通过 `document.languageId` 在格式化时解析方言，避免为每种 SQL 语言创建独立实例

### Refactor

- `Tokenizer` 消除重复逻辑：提取 `resolveParamTypes` 为公共方法，`buildParamRules` 和 `buildParamRulesImpl` 共用，消除三处重复的 `paramTypes` 解析代码
- `splitSqlStatements` 增强 PostgreSQL 兼容性：增加对 dollar-quoted 字符串（`$$...$$` 和 `$tag$...$tag$`）的识别，避免字符串内分号被误判为语句分隔符

---

## [2.15.33] - 2026-06-18

### Performance

- `LRUCache.has()` 消除重复 Map 查找：先 `get()` 获取 entry 再判断存在性，与 `peek()` 模式一致
- `MysqlAdapter.describeTable()` 四个独立查询（columns/indexes/foreignKeys/triggers）从串行改为 `Promise.all()` 并行执行
- `SqlCompletionProvider.provideCompletionItems()` 空文档检查从 `doc.getText().trim()` 改为 `doc.lineCount === 0`，避免大文件不必要的全文字符串分配

### Architecture

- `ConnectionManager` 8 个独立 Map（adapters/connectionStates/retryAttempts/retryTimers/sshTunnels/healthCheckTimers/consecutiveHealthFailures/isHealthChecking）合并为 `Map<string, ConnectionRuntimeState>` 统一对象，减少状态管理复杂度和遗漏清理风险
- `DatabaseModule` 注册到 DI 容器（`Tokens.DatabaseModule`），统一生命周期管理方式
- `AstDiagnosticsProvider` 和 `SqlLinter` 注册到 DI 容器，`SqlDiagnosticsProvider` 从容器获取依赖，与其他 Provider 管理模式保持一致，提升可测试性

### Code Quality

- `DIContainer.get()` 单例解析后不再删除工厂引用，支持单例被 dispose 后重新创建
- `MysqlAdapter.getPoolStatus()` 抽取 `readPoolInternals()` 方法，隔离 mysql2 内部私有属性访问
- `SchemaCache` 添加 `MAX_ENTRIES_PER_CACHE = 200` 容量限制，超限时先清理过期条目再 LRU 淘汰
- `ConnectionManager.connect()` 异常路径添加 `connectConfig.password = undefined`，与成功路径保持一致的安全实践

---

## [2.15.32] - 2026-06-18

### Performance

- LRUCache.get() 优化：追踪 lastKey 避免热路径缓存命中时的 delete+set 开销；has() 先用 cache.has() 快速判断；deleteByPrefix() 改为遍历时直接删除消除中间数组分配；purgeAndGetEntries() 原地删除过期条目减少内存分配
- Formatter 缓存 LRU 从 O(n) 数组 indexOf+splice 改为 O(1) Map delete+set，移除 formatterCacheOrder 数组
- SchemaProvider MRU 从 O(n) Set+Array（indexOf/splice）改为 O(1) Map（delete/set），减少内存占用
- PerformanceMonitor 统计读写改用 peek() 替代 get() 避免 LRU 重排开销；recordMeasurement 添加禁用守卫
- 标识符补全缓存 CompletionItem 数组，命中时直接返回避免重复创建；getColumnCompletionForAlias 优先使用缓存列名；新增 clearIdentifierCache() 清理接口
- AstLinter.walkForSubStatements 复用单个 RuleContext 对象，仅更新 node 属性，减少大文件 GC 压力
- DocumentAstCache.SymbolIndex 新增 aliasMap 字段，一次构建多次复用；SchemaCompletionProvider 和 SchemaHoverResolver 改用 getOrBuildAliasMap() 替代 parseAliasMapFromAst() 消除冗余 AST 遍历

---

## [2.15.31] - 2026-06-18

### Performance

- themeColors 主题颜色获取添加缓存，避免每次调用都遍历扩展和读取文件；改用异步 fs/promises.readFile 替代同步 fs.readFileSync，避免阻塞扩展主线程；添加主题变更监听自动失效缓存
- AstLinter 全局规则（applicableTypes 为空的规则）改为只在顶层执行一次，避免在 walkForSubStatements 中对每个子节点重复执行全文正则扫描
- HiveSqlAdapter.extractWholeStatements 中 O(n²) 字符串拼接改为数组收集 + join 一次性构建
- sqlTextScanner.removeCommentsAndStrings 中 O(n²) 逐字符拼接改为数组收集 + join
- 7 处正则表达式在函数内重复创建改为模块级常量或缓存（sqlFormatUtils、hiveConverter、mysqlConverter、functionMappings、sqlParser、CommentPreserver、FormatterFactory）
- SchemaProvider MRU 缓存从 LRUCache<number>（存储无用时间戳）改为 Set<string> + 顺序数组
- DataExporter.exportToInsert 和 exportToJson 改为流式写入，避免大数据集全量内存构建

### Bug Fix

- SQL 导入（DataImporter）分号分割不处理字符串/注释内分号的问题，改用 SqlTextScanner.findStatementEnd 安全分割，修复潜在的 SQL 注入风险
- RuleRegistry 缓存策略使用布尔值 cacheValid 在注册新规则后查询新类型时可能返回过期缓存，改为版本号机制
- ConfigManager.get/getSection/getSectionKeys 使用 `cached !== undefined` 判断缓存命中，当配置值为 undefined 时永远不命中，改用 `cache.has()` 检查
- sqlTextScanner 双引号转义处理不一致：单引号支持 '' 转义但双引号不支持 "" 转义，现已统一处理

### Refactor

- 提取 QueryResultPanel 回调工厂函数 setupQueryResultPanelCallbacks，消除 QueryCommands.ts 和 SchemaCommands.ts 间约 300 行重复代码
- 提取 viewDDL 命令工厂函数 createViewDDLCommand，消除 5 个 viewXxxDDL 命令的重复模式
- 提取引号状态追踪共享函数 updateQuoteState，统一 sqlTextScanner 三个方法中的重复逻辑
- 统一 ID 生成：新建 idGenerator.ts 共享模块，MysqlAdapter/QueryExecutor/QueryHistory 统一使用 generateShortId
- DI 容器添加 TokenMap 类型映射和 get 方法重载，增强编译时类型安全
- FormatterFactory 缓存键加入 keywordCase/functionCase/indentStyle，避免不同配置共享 formatter 实例
- InlineLayout.trailingSpace 重命名为 pendingTrailingSpace，更清晰表达语义

---

## [2.15.30] - 2026-06-17

### Bug Fix

- 修复所有 ESLint 错误和警告：空 catch 块添加注释和参数、移除冗余类型注解、修复 unsafe any 访问、修复空箭头函数
- Fix all ESLint errors and warnings: add comments and parameters to empty catch blocks, remove redundant type annotations, fix unsafe any access, fix empty arrow function

---

## [2.15.29] - 2026-06-17

### Enhancement

- 修复函数/存储过程/触发器节点单击无反应的问题：由于可折叠节点在 VSCode TreeView 中单击行为为展开/折叠，现新增双击查看定义功能（与表节点双击查看数据行为一致）
- 右键菜单"查看函数定义"/"查看存储过程定义"/"查看触发器定义"仍可正常使用

---

## [2.15.28] - 2026-06-17

### Enhancement

- 数据库浏览器新增函数/存储过程/触发器查看定义功能：点击函数、存储过程或触发器节点，在新编辑器中打开其 DDL 定义代码
- 函数节点可展开查看参数列表（含方向 IN/OUT/INOUT 和数据类型）及返回类型
- 存储过程节点可展开查看参数列表（含方向和数据类型）
- 触发器节点可展开查看时机（BEFORE/AFTER）、事件（INSERT/UPDATE/DELETE）和执行语句
- 函数/存储过程/触发器右键菜单新增"查看函数定义"/"查看存储过程定义"/"查看触发器定义"选项
- 新增 `IDatabaseAdapter.getFunctionDDL`、`getProcedureDDL`、`getTriggerDDL`、`getRoutineParameters` 接口方法
- MySQL 适配器实现 `SHOW CREATE FUNCTION`、`SHOW CREATE PROCEDURE`、`SHOW CREATE TRIGGER` 和 `INFORMATION_SCHEMA.PARAMETERS` 查询

### Bug Fix

- 修复数据库浏览器中点击函数/存储过程/触发器节点无任何反应的问题：之前这些节点未绑定点击命令、无右键菜单、不可展开

---

## [2.15.27] - 2026-06-16

### Bug Fix

- 修复查询结果面板当数据值很长时列名与数据仍然错位的问题：移除 CSS 中 `width: max-content` 和 `min-width: 80px`，改为由 JS 精确计算两个表的相同像素宽度并通过 `<colgroup>` 统一分配；多余空间均匀分配到各列，确保表头和表体总宽度完全一致
- 修复长值覆盖相邻空值列的问题：所有数据列统一添加 `overflow: hidden`，NULL 单元格不再因缺少 `min-width` 而被压缩；表头 `<th>` 也添加 `overflow: hidden` + `text-overflow: ellipsis`，与表体 `<td>` 保持一致
- 修复窗口大小变化后列宽不再适配的问题：添加 `window.resize` 监听，自动重新计算并应用列宽
- Fix query result panel column misalignment when data values are very long: removed CSS `width: max-content` and `min-width: 80px`, replaced with JS-calculated exact pixel widths for both tables via `<colgroup>`; extra space evenly distributed to all columns ensuring header and body total widths are identical
- Fix long values overflowing into adjacent empty columns: all data columns now have `overflow: hidden`, NULL cells no longer compressed due to missing `min-width`; header `<th>` also gets `overflow: hidden` + `text-overflow: ellipsis` to match body `<td>`
- Fix column widths not adapting after window resize: added `window.resize` listener to recalculate and apply column widths

---

## [2.15.26] - 2026-06-16

### Bug Fix

- 修复查询结果面板列宽不随数据内容自适应的问题：表头和表体使用两个独立的 `<table>` 元素且均设置 `table-layout: fixed`，当数据值比列名长时两个表各自计算列宽导致列名与数据错位；新增基于 Canvas API 的文本宽度测量和列宽自动计算（采样前 50 行），通过 `<colgroup>` 将计算出的宽度同步应用到表头和表体，确保列宽一致
- 修复查询结果面板水平滚动时表头不跟随移动的问题：在 `onGridScroll` 中同步表头容器的 `scrollLeft` 与表体容器
- Fix query result panel column widths not adapting to data content: header and body use two separate `<table>` elements both with `table-layout: fixed`, when data values are longer than column names the two tables calculate column widths independently causing misalignment; added Canvas API-based text width measurement and auto column width calculation (sampling first 50 rows), applying calculated widths to both header and body via `<colgroup>` to ensure consistent column widths
- Fix query result panel header not following horizontal scroll: sync header container `scrollLeft` with body container in `onGridScroll`

---

## [2.15.25] - 2026-06-16

### Enhancement

- 查询数据面板新增数据库选择下拉框：在 SQL 编辑器工具栏中添加数据库选择器，支持在查询面板中快速切换当前数据库
- 新建查询命令改为打开查询数据面板（Webview），替代之前的文件编辑器方式
- 添加 `package.nls.zh-hans.json`，兼容 VSCode 新版本（v1.89+）的 `zh-hans` 语言标签，确保中文翻译正确生效
- 查询面板标题跟随语言设置显示中文/英文

### Bug Fix

- 修复数据库连接命令标题（如"Disconnect from Database"、"Query Data"等）在中文环境下仍显示英文的问题：添加 `package.nls.zh-hans.json` 兼容 VSCode 新版语言标签
- 修复查询数据面板滚动超过 100 行后出现空白的问题：虚拟滚动常量 `ROW_HEIGHT`（28→24）和 `HEADER_HEIGHT`（48→28）与 CSS 变量不一致，导致滚动偏移计算错误
- 修复查询数据默认限制 100 行的问题：改用配置管理器的 `query.maxRows` 设置（默认 1000）

---

## [2.15.24] - 2026-06-16

### Bug Fix

- 修复查询数据面板当前行号后仍有红色高亮块的问题：`editor.lineHighlightBackground` 设为与编辑器背景色相同，CSS 中 `.current-line` 和 `.current-line-margin` 背景色设为 `transparent`，彻底消除 gutter 区域的当前行高亮红色背景
- 恢复当前行号数字的视觉区分：`editorLineNumber.activeForeground` 恢复为 VS Code 主题的活跃行号颜色（比普通行号更亮），而非与普通行号相同
- Fix red highlight block still appearing behind current line number in query data panel: set `editor.lineHighlightBackground` to editor background color, set `.current-line` and `.current-line-margin` background to `transparent` in CSS, completely removing the red background in the gutter area
- Restore visual distinction for active line number: `editorLineNumber.activeForeground` now uses VS Code theme's active line number color (brighter than normal line numbers) instead of being the same as normal line numbers

---

## [2.15.23] - 2026-06-16

### Enhancement

- 查询数据面板 Monaco 编辑器的语法高亮颜色现在与 VS Code 编辑器使用的主题颜色保持一致：之前尝试读取不存在的 CSS 变量获取 token 颜色，导致始终回退到硬编码的默认值；现在从 VS Code 主题文件中读取 tokenColors 并传递给 webview，支持自定义主题和 `editor.tokenColorCustomizations` 用户覆盖
- 取消当前行号的高亮/红色标识：`editorLineNumber.activeForeground` 现在与 `editorLineNumber.foreground` 使用相同颜色，当前行号不再有视觉区分
- Query data panel Monaco editor syntax highlighting colors now match the VS Code editor theme: previously attempted to read non-existent CSS variables for token colors, always falling back to hardcoded defaults; now reads tokenColors from the VS Code theme file and passes them to the webview, supporting custom themes and `editor.tokenColorCustomizations` user overrides
- Remove active line number highlight/red indicator: `editorLineNumber.activeForeground` now uses the same color as `editorLineNumber.foreground`, no visual distinction for the current line number

---

## [2.15.22] - 2026-06-15

### Bug Fix

- 修复查询数据面板 CSP (Content Security Policy) 阻止内联样式导致语法高亮不生效和布局异常的问题：`style-src` 同时包含 `'nonce-xxx'` 和 `'unsafe-inline'` 时，根据 CSP 规范 `'unsafe-inline'` 会被忽略，Monaco 编辑器动态注入的内联样式全部被阻止；从 `style-src` 中移除 nonce，仅保留 `'unsafe-inline'`；从 `BaseWebviewPanel` 中移除给 `<style>` 标签添加 nonce 的逻辑；`script-src` 保留 nonce 确保脚本安全
- 修复查询结果面板 `.tab-content` 的 `height: 100%` 与 `flex: 1` 冲突导致结果区域无法正确填充可用空间的问题：为 `.result-section .tab-content` 添加 `height: auto` 覆盖基础规则
- Fix CSP blocking inline styles causing syntax highlighting failure and layout issues in query data panel: when `style-src` contains both `'nonce-xxx'` and `'unsafe-inline'`, `'unsafe-inline'` is ignored per CSP spec, blocking all Monaco editor dynamically injected inline styles; removed nonce from `style-src`, keeping only `'unsafe-inline'`; removed `<style>` nonce injection from `BaseWebviewPanel`; kept nonce in `script-src` for script security
- Fix `.tab-content` `height: 100%` conflicting with `flex: 1` causing result area not filling available space: added `height: auto` to `.result-section .tab-content` to override base rule

---

## [2.15.21] - 2026-06-15

### Bug Fix

- 修复查询数据面板 SQL 语法高亮不生效的根本原因：CSP（Content Security Policy）的 `style-src` 策略阻止了 Monaco 编辑器动态注入内联样式，导致 token 虽被正确识别但颜色无法渲染；在 CSP 中添加 `'unsafe-inline'` 允许 Monaco 注入高亮样式，同时添加 `font-src` 和 `connect-src` 解决字体和 source map 加载被阻止的问题
- 修复 `model.forceTokenization()` 调用导致 `registerLanguageFeatures` 崩溃的问题：当前 Monaco 版本无此 API，移除调用后 `setModelLanguage` 会自动触发重新 tokenize
- 修复查询结果网格只占下半部分一半、大量空白的问题：`.sql-editor-section` 使用 `height: 30%` 与 flex 布局冲突，改为 `flex: 0 0 30%`；`.tab-content` 缺少 `height: 100%` 导致绝对定位子元素无法正确填充
- Fix root cause of SQL syntax highlighting not working in query data panel: CSP `style-src` policy blocked Monaco editor from injecting inline styles, causing tokens to be recognized but colors not rendered; added `'unsafe-inline'` to CSP `style-src` to allow Monaco highlighting styles, and added `font-src` and `connect-src` to fix blocked font and source map loading
- Fix `model.forceTokenization()` crash in `registerLanguageFeatures`: current Monaco version lacks this API, removed the call as `setModelLanguage` automatically triggers re-tokenization
- Fix query result grid only occupying half of the lower section with large blank space: `.sql-editor-section` using `height: 30%` conflicted with flex layout, changed to `flex: 0 0 30%`; `.tab-content` missing `height: 100%` prevented absolutely positioned children from filling correctly

---

## [2.15.20] - 2026-06-15

### Bug Fix

- 修复查询数据面板 SQL 语法高亮不生效的问题：Monaco 编辑器创建时对 Hive/Spark/FlinkSQL 等无内置支持的方言未回退到基础 SQL 高亮；MySQL/PostgreSQL 等有内置支持的方言未正确映射语言 ID；自定义 Monarch tokenizer 注册后未调用 `forceTokenization()` 强制刷新高亮
- 修复查询结果网格只占下半部分一半、大量空白的问题：`.sql-editor-section` 使用 `height: 30%` 与 flex 布局冲突导致 `.result-section` 无法正确计算剩余空间，改为 `flex: 0 0 30%`；`.tab-content` 缺少 `height: 100%` 导致绝对定位的子元素无法正确填充
- Fix SQL syntax highlighting not working in query data panel: Monaco editor didn't fall back to basic SQL highlighting for dialects without built-in support (Hive/Spark/FlinkSQL); MySQL/PostgreSQL built-in language IDs were not correctly mapped; `forceTokenization()` was not called after registering custom Monarch tokenizer
- Fix query result grid only occupying half of the lower section with large blank space: `.sql-editor-section` using `height: 30%` conflicted with flex layout preventing `.result-section` from calculating remaining space correctly, changed to `flex: 0 0 30%`; `.tab-content` missing `height: 100%` prevented absolutely positioned children from filling correctly

---

## [2.15.19] - 2026-06-15

### Bug Fix

- 修复查询结果面板中 SQL 语法高亮不生效的问题：`languageData` 消息在 Webview 准备好之前发送导致丢失，改为在 `webviewReady` 事件后重新发送语言数据，确保 Monaco 编辑器正确注册 Monarch tokenizer
- 修复查询结果只占下半部分一半、大量空白的问题：`renderVisibleRows()` 在 grid 容器从 `display:none` 切换为可见后同步调用，浏览器尚未完成布局计算导致 `clientHeight` 为 0，虚拟滚动仅渲染极少量行；改为 `requestAnimationFrame` 延迟渲染，并为 flex 子元素添加 `min-height: 0` 确保正确收缩
- Fix SQL syntax highlighting not working in query result panel: `languageData` message was sent before Webview was ready and got lost; now re-send language data after `webviewReady` event to ensure Monaco editor registers Monarch tokenizer correctly
- Fix query results only occupying half of the lower section with large blank space: `renderVisibleRows()` was called synchronously after grid container switched from `display:none` to visible, browser hadn't completed layout calculation causing `clientHeight` to be 0, virtual scroll only rendered minimal rows; changed to `requestAnimationFrame` deferred rendering and added `min-height: 0` to flex children for proper shrinking

---

## [2.15.18] - 2026-06-15

### Bug Fix

- 修复查询执行命令（`Cmd+Shift+E` / `Cmd+Shift+R`）无响应的问题：命令注册时 `queryExecutor`、`safeQueryGuard`、`statementDetector`、`queryHistory`、`outputChannel` 在 `DatabaseModule.initialize()` 异步完成前被闭包捕获为 `undefined`，改为每次命令执行时通过 `dbModule.getXXX()` 延迟获取
- 修复 `SchemaCommands` 中 `explainQuery`、`viewTableData` 等命令同样因初始化时序问题无法正常工作的问题
- Fix query execution commands (`Cmd+Shift+E` / `Cmd+Shift+R`) not responding: `queryExecutor`, `safeQueryGuard`, `statementDetector`, `queryHistory`, `outputChannel` were captured as `undefined` in closures before `DatabaseModule.initialize()` completed asynchronously; changed to lazy getter via `dbModule.getXXX()` on each command invocation
- Fix `explainQuery`, `viewTableData` and other commands in `SchemaCommands` also not working due to the same initialization timing issue

---

## [2.15.17] - 2026-06-15

### Refactor

- 提取 `BaseWebviewPanel` 抽象基类，统一 5 个 Webview Panel 的单例管理、HTML 加载、Nonce/CSP 安全处理和 Disposables 生命周期
- 重构 ExplainPlanPanel、DataTransferDialog、TableDesignerPanel、ConnectionDialog、QueryResultPanel 继承 BaseWebviewPanel，消除约 400 行重复代码
- 修复 QueryResultPanel `_postMessage` 方法递归调用自身的 bug
- 增强 `onDidReceiveMessage` 错误处理，自动捕获未处理异常
- Extract `BaseWebviewPanel` abstract base class, unifying singleton management, HTML loading, Nonce/CSP security handling, and Disposables lifecycle across 5 Webview Panels
- Refactor ExplainPlanPanel, DataTransferDialog, TableDesignerPanel, ConnectionDialog, QueryResultPanel to extend BaseWebviewPanel, eliminating ~400 lines of duplicate code
- Fix recursive `_postMessage` call bug in QueryResultPanel
- Add automatic error handling wrapper for `onDidReceiveMessage` handlers

---

## [2.15.14] - 2026-06-12

### Bug Fix

- 修复查看表数据时 "Webview is disposed" 错误：QueryResultPanel 添加 `_isDisposed` 标志位和 `_postMessage` 安全方法，所有 postMessage 调用前检查 disposed 状态并用 try-catch 包裹
- 修复 SchemaCommands/QueryCommands 中局部变量持有已销毁面板实例的问题：改用 `QueryResultPanel.currentPanel` 获取当前面板实例
- 修复异步回调中的竞态条件：`await` 等待期间面板可能被关闭，在异步操作后增加 disposed 检查
- Fix "Webview is disposed" error when viewing table data: added `_isDisposed` flag and `_postMessage` safe method to QueryResultPanel, check disposed state before all postMessage calls with try-catch wrapper
- Fix SchemaCommands/QueryCommands holding disposed panel instances in local variables: use `QueryResultPanel.currentPanel` to get current panel instance
- Fix race condition in async callbacks: panel may be closed during `await`, added disposed checks after async operations

---

## [2.15.13] - 2026-06-12

### Bug Fix

- 修复 ssh2 native 模块在 vsix 包中的打包问题，确保扩展能正常激活
- Fix ssh2 native module packaging in vsix, ensure extension activates correctly

---

## [2.15.11] - 2026-06-12

### Bug Fix

- 补全 `ssh2` 的所有传递依赖（asn1、safer-buffer、bcrypt-pbkdf、tweetnacl、cpu-features、buildcheck、nan、streamsearch），修复扩展激活时因缺少依赖模块而卡在 activating 的问题
- Include all `ssh2` transitive dependencies in vsix package, fix extension stuck in activating due to missing dependency modules

---

## [2.15.10] - 2026-06-12

### Bug Fix

- 修复扩展激活失败 `Cannot find module 'ssh2'`：`ssh2` 是 native 模块不能被 esbuild 打包，但 `.vscodeignore` 排除了 `node_modules`，导致运行时找不到。修改 `.vscodeignore` 允许 `ssh2` 等 external 依赖被包含在 vsix 包中；`mysql2` 改为由 esbuild 打包
- Fix `Cannot find module 'ssh2'` activation failure: `ssh2` is a native module that can't be bundled by esbuild, but `.vscodeignore` excluded `node_modules`. Updated `.vscodeignore` to allow `ssh2` and other external dependencies in the vsix package; `mysql2` now bundled by esbuild

---

## [2.15.9] - 2026-06-12

### Bug Fix

- 修复扩展激活卡在 "activating" 状态：将命令注册与数据库初始化解耦，先注册命令再异步初始化数据库，`activate()` 不再等待 `initialize()` 完成
- 命令处理器改为通过 `DatabaseModule` 延迟获取依赖（treeProvider、queryExecutor 等），避免初始化未完成时引用为 undefined
- Fix extension stuck in "activating" state: decouple command registration from database initialization, register commands first then initialize database asynchronously, `activate()` no longer awaits `initialize()`
- Command handlers now lazily access dependencies via `DatabaseModule` getters, avoiding undefined references when initialization hasn't completed

---

## [2.15.7] - 2026-06-12

### Bug Fix

- 重构 `DatabaseModule.initialize()`：将初始化步骤拆分为独立 try/catch 块，确保即使部分初始化失败，命令仍能注册；命令注册移至最后，保证所有步骤执行完毕后才注册
- Refactor `DatabaseModule.initialize()`: split initialization into independent try/catch blocks so commands are always registered even if some steps fail; command registration moved to the end to ensure all steps have been attempted

---

## [2.15.6] - 2026-06-12

### Bug Fix

- 修复 `ConnectionStore.loadFromFile()` 在 `~/.hive-formatter/` 目录不存在时写入默认配置失败（ENOENT），导致扩展初始化失败、所有数据库命令不可用的问题
- 自动迁移旧版 `~/.sql-all-in-one/connections.json` 数据到 `~/.hive-formatter/connections.json`
- Fix `ConnectionStore.loadFromFile()` failing with ENOENT when `~/.hive-formatter/` directory doesn't exist, causing extension initialization failure and all database commands unavailable
- Auto-migrate legacy `~/.sql-all-in-one/connections.json` data to `~/.hive-formatter/connections.json`

---

## [2.15.5] - 2026-06-12

### Bug Fix

- 修复扩展激活时未等待 `DatabaseModule.initialize()` 完成，导致数据库相关命令（如 `addConnection`）在扩展激活后仍不可用的问题
- Fix extension not awaiting `DatabaseModule.initialize()` during activation, causing database commands (e.g., `addConnection`) to be unavailable after extension activation

---

## [2.15.4] - 2026-06-11

### Bug Fix

- 修复扩展激活事件缺少 `onView` 和 `onCommand` 声明，导致点击侧边栏数据库浏览器时扩展未激活，命令 `hive-formatter.addConnection` 等找不到的问题
- Fix missing `onView` and `onCommand` activation events causing extension not to activate when clicking sidebar database explorer, resulting in "command not found" errors

---

## [2.15.3] - 2026-06-11

### Bug Fix

- 修复扩展 ID 从 `sql-all-in-one` 改为 `hive-formatter` 后，TreeView 数据提供程序未注册导致"没有可提供视图数据的已注册数据提供程序"错误的问题
- Fix TreeView data provider not registered error after renaming extension ID from `sql-all-in-one` to `hive-formatter`

---

## [2.15.2] - 2026-06-11

### UI/UX

- 彻底修复 Monaco 编辑器行号区域（gutter）背景色与编辑器不一致的问题：增加 CSS `!important` 强制覆盖 gutter 背景色；修复 `getColor` 函数 8 位 hex 颜色格式截断问题；更正缩进参考线主题键名为 `background1`/`activeBackground1`；新增 `editorGutter.modifiedBackground`/`addedBackground`/`deletedBackground` 配置
- Thoroughly fix Monaco editor gutter background color mismatch: added CSS `!important` override for gutter backgrounds; fixed `getColor` 8-digit hex color truncation; corrected indent guide theme keys to `background1`/`activeBackground1`; added `editorGutter.modifiedBackground`/`addedBackground`/`deletedBackground` configs

---

## [2.15.1] - 2026-06-11

### UI/UX

- 修复 Monaco 编辑器行号区域（gutter）背景色与编辑器不一致的问题：添加 `editorGutter.background`、`editorOverviewRuler.background`、`editor.selectionHighlightBackground` 配置，使语法高亮主题与 VSCode 当前主题完全同步
- Fix Monaco editor gutter background color mismatch: added `editorGutter.background`, `editorOverviewRuler.background`, `editor.selectionHighlightBackground` configs to fully sync syntax highlighting theme with current VSCode theme

- 查询结果面板工具栏按钮改为 SVG 图标+文字形式（文字语言跟随插件语言设置），替代原来的纯英文文字按钮
- Query result panel toolbar buttons changed to SVG icon + text format (text language follows plugin language setting), replacing original English-only text buttons

---

## [2.15.0] - 2026-06-11

### UI/UX

- 查询结果面板工具栏分区优化：将工具栏拆分为上下两部分，查询操作（执行、停止、筛选）放在 SQL 编辑器区域，结果操作（刷新、导出、编辑模式、增删行、提交回滚、事务、视图切换）放在结果区域
- Query result panel toolbar split: query actions (Execute, Stop, Filter) moved to SQL editor area; result actions (Refresh, Export, Edit Mode, Add/Delete Row, Commit/Rollback, Transaction, View Switch) moved to result area

- 工具栏按钮改为图标+文字形式，提升可读性（如 ↻ Refresh、✓ Commit、⟳ Transaction 等）
- Toolbar buttons changed to icon+text format for better readability (e.g., ↻ Refresh, ✓ Commit, ⟳ Transaction, etc.)

- 修复编辑模式无法退出的问题：编辑模式激活时按钮添加高亮视觉反馈，再次点击即可退出
- Fixed edit mode cannot exit: added highlight visual feedback when edit mode is active, click again to exit

- Monaco 编辑器语法高亮与 VSCode 主题同步：通过读取 VSCode CSS 变量动态构建 Monaco 自定义主题，关键字、字符串、注释、数字、类型、函数等 token 颜色与当前 VSCode 主题一致
- Monaco editor syntax highlighting synced with VSCode theme: dynamically builds Monaco custom theme by reading VSCode CSS variables, keyword/string/comment/number/type/function token colors match the current VSCode theme

---

## [2.14.4] - 2026-06-11

### Internationalization

- 修复查询结果面板（Query Result Panel）工具栏按钮未应用国际化的问题（Run/Stop/Export/Filter/Edit/Grid/Form 等）
- 修复查询结果面板对话框（提交确认、BLOB 预览）未国际化的问题
- 后端 QueryResultPanel 传入语言配置到 Webview，确保前端正确切换语言
- Fix query result panel toolbar buttons not applying i18n (Run/Stop/Export/Filter/Edit/Grid/Form etc.)
- Fix query result panel dialogs (commit confirm, BLOB preview) not internationalized
- Pass language config from backend to Webview for correct language switching

---

## [2.14.3] - 2026-06-11

### Internationalization

- 左侧栏数据库资源管理器全部节点标签、描述、tooltip 国际化（收藏夹、连接状态、数据库、表/视图/函数/存储过程/触发器、列、索引等）
- 数据库连接对话框（ConnectionDialog）全部文本国际化（表单标签、按钮、placeholder、验证消息、测试结果等）
- 设置编辑器中的连接管理表单国际化（SSH/SSL 标签、认证方式选项、验证错误消息等）
- 所有命令标题、视图名称、欢迎文本通过 package.nls.json 支持中英双语
- VS Code 原生交互（showQuickPick/showWarningMessage 等）全部国际化
- Internationalize all sidebar explorer node labels, descriptions, and tooltips
- Internationalize connection dialog (form labels, buttons, placeholders, validation messages, test results)
- Internationalize connection management form in settings editor (SSH/SSL labels, auth options, validation errors)
- Support Chinese/English bilingual via package.nls.json for all command titles, view names, and welcome text
- Internationalize all VS Code native interactions (showQuickPick, showWarningMessage, etc.)

---

## [2.14.2] - 2026-06-11

### Bug Fixes

- 修复 Monaco 无法加载的根因：`state.monacoBasePath` 从未被初始化，`init()` 函数未从 `window.__CONFIG__` 读取配置
- Fix root cause of Monaco not loading: `state.monacoBasePath` was never initialized, `init()` function did not read config from `window.__CONFIG__`
- 修复 `monaco` 全局变量不可用的问题：改用显式存储的 `monacoRef` 引用
- Fix `monaco` global variable not available: use explicitly stored `monacoRef` reference instead
- 所有 `monaco.languages.*` 和 `monaco.editor.*` 调用统一使用 `monacoRef`
- All `monaco.languages.*` and `monaco.editor.*` calls now use `monacoRef` consistently

---

## [2.14.1] - 2026-06-11

### Bug Fixes

- 修复 Monaco 语言特性无法工作的问题：Monarch 规则中的 RegExp 对象无法通过 postMessage 结构化克隆传递，改为在 Webview 端构建
- Fix Monaco language features not working: RegExp objects in Monarch rules cannot survive postMessage structured clone, moved construction to Webview side
- 修复 dialect 配置未被 handleConfig 处理的问题
- Fix dialect config not being handled by handleConfig
- 修复 Monaco 编辑器初始语言 ID 与自定义方言不匹配的问题
- Fix Monaco editor initial language ID mismatch with custom dialect
- 添加重复注册防护，避免同一方言被多次注册
- Add duplicate registration guard to prevent same dialect being registered multiple times

---

## [2.14.0] - 2026-06-11

### Features

- 查询数据面板 Monaco 编辑器语言特性增强 — 方言化语法高亮、智能补全、悬停提示、SQL 格式化、Lint 诊断
- Query Data Panel Monaco editor language features — dialect-aware syntax highlighting, smart completion, hover info, SQL formatting, lint diagnostics

- 方言化 Monarch 语法高亮：为每种 SQL 方言（MySQL、Hive、Spark、FlinkSQL、PostgreSQL、BigQuery、SQLite）注册独立的 Monarch tokenizer，关键字、数据类型、函数名分别着色
- Dialect-aware Monarch syntax highlighting: register independent Monarch tokenizer per SQL dialect with distinct colors for keywords, data types, and function names

- 静态补全（零延迟）：关键字补全、580+ 函数签名补全（含参数 Snippet）、数据类型补全、代码片段补全，全部在 Webview 内直接注册
- Static completion (zero latency): keyword, 580+ function signature (with parameter snippets), data type, and code snippet completions registered directly in the Webview

- 函数签名提示：输入 `(` 或 `,` 时显示函数参数签名，自动高亮当前参数
- Function signature help: shows function parameter signatures when typing `(` or `,`, auto-highlights current parameter

- Schema 感知补全（桥接）：输入 `.` 或空格触发，通过 postMessage 桥接到 Extension Host 查询数据库 Schema，返回表名/列名补全
- Schema-aware completion (bridged): triggered by `.` or space, bridges to Extension Host via postMessage to query database schema for table/column completions

- 悬停提示（桥接）：鼠标悬停在函数名/关键字/Schema 对象上，显示签名、用法说明、表结构等信息
- Hover information (bridged): hover over function names, keywords, or schema objects to show signatures, usage info, table structure, etc.

- SQL 格式化：`Shift+Alt+F` / `Cmd+Shift+I` 快捷键格式化当前 SQL，使用用户配置的格式化选项
- SQL formatting: `Shift+Alt+F` / `Cmd+Shift+I` shortcut to format current SQL using user-configured formatting options

- SQL Lint 诊断：编辑内容变更后 500ms 防抖自动检查，通过桥接调用 AstLinter，在编辑器中显示波浪线警告
- SQL lint diagnostics: auto-check with 500ms debounce on content change, bridges to AstLinter, shows squiggly warnings in editor

- 连接切换时自动更新方言：切换数据库连接时自动检测方言类型，重新注册语言特性
- Auto dialect switch on connection change: auto-detects dialect when switching database connections and re-registers language features

- 混合架构：静态特性（关键字/函数/片段补全、Monarch 高亮）在 Webview 内直接注册，动态特性（Schema 补全、悬停、格式化、Lint）通过 postMessage 桥接到 Extension Host 处理
- Hybrid architecture: static features (keyword/function/snippet completion, Monarch highlighting) registered directly in Webview; dynamic features (schema completion, hover, formatting, lint) bridged to Extension Host via postMessage

---

## [2.13.0] - 2026-06-11

### Features

- 查询数据面板 Monaco 编辑器语言特性增强 — 方言化语法高亮、智能补全、悬停提示、SQL 格式化、Lint 诊断
- Query Data Panel Monaco editor language features — dialect-aware syntax highlighting, smart completion, hover info, SQL formatting, lint diagnostics

- 方言化 Monarch 语法高亮：为每种 SQL 方言（MySQL、Hive、Spark、FlinkSQL、PostgreSQL、BigQuery、SQLite）注册独立的 Monarch tokenizer，关键字、数据类型、函数名分别着色
- Dialect-aware Monarch syntax highlighting: register independent Monarch tokenizer per SQL dialect with distinct colors for keywords, data types, and function names

- 静态补全（零延迟）：关键字补全、580+ 函数签名补全（含参数 Snippet）、数据类型补全、代码片段补全，全部在 Webview 内直接注册
- Static completion (zero latency): keyword, 580+ function signature (with parameter snippets), data type, and code snippet completions registered directly in the Webview

- 函数签名提示：输入 `(` 或 `,` 时显示函数参数签名，自动高亮当前参数
- Function signature help: shows function parameter signatures when typing `(` or `,`, auto-highlights current parameter

- Schema 感知补全（桥接）：输入 `.` 或空格触发，通过 postMessage 桥接到 Extension Host 查询数据库 Schema，返回表名/列名补全
- Schema-aware completion (bridged): triggered by `.` or space, bridges to Extension Host via postMessage to query database schema for table/column completions

- 悬停提示（桥接）：鼠标悬停在函数名/关键字/Schema 对象上，显示签名、用法说明、表结构等信息
- Hover information (bridged): hover over function names, keywords, or schema objects to show signatures, usage info, table structure, etc.

- SQL 格式化：`Shift+Alt+F` / `Cmd+Shift+I` 快捷键格式化当前 SQL，使用用户配置的格式化选项
- SQL formatting: `Shift+Alt+F` / `Cmd+Shift+I` shortcut to format current SQL using user-configured formatting options

- SQL Lint 诊断：编辑内容变更后 500ms 防抖自动检查，通过桥接调用 AstLinter，在编辑器中显示波浪线警告
- SQL lint diagnostics: auto-check with 500ms debounce on content change, bridges to AstLinter, shows squiggly warnings in editor

- 连接切换时自动更新方言：切换数据库连接时自动检测方言类型，重新注册语言特性
- Auto dialect switch on connection change: auto-detects dialect when switching database connections and re-registers language features

- 混合架构：静态特性（关键字/函数/片段补全、Monarch 高亮）在 Webview 内直接注册，动态特性（Schema 补全、悬停、格式化、Lint）通过 postMessage 桥接到 Extension Host 处理
- Hybrid architecture: static features (keyword/function/snippet completion, Monarch highlighting) registered directly in Webview; dynamic features (schema completion, hover, formatting, lint) bridged to Extension Host via postMessage

### Bug Fixes

- MysqlAdapter 连接池和查询超时修复
- MysqlAdapter connection pool and query timeout fixes

- 数据导入导出流程优化
- Data import/export flow improvements

- 格式化引擎多项修复（注释保留、Hive/Spark 预处理、DDL/INSERT/SELECT 格式化）
- Formatter fixes (comment preservation, Hive/Spark preprocessing, DDL/INSERT/SELECT formatting)

- Schema 缓存和 SchemaHover 解析修复
- Schema cache and SchemaHover resolver fixes

- SQL 语句检测和批量执行优化
- SQL statement detection and batch execution improvements

---

## [2.12.0] - 2026-06-10

### Features

- 查询数据面板 — 查询结果面板集成 Monaco SQL 编辑器，支持在结果面板中直接编写和执行 SQL
- Query Data Panel — integrated Monaco SQL editor in the query result panel, supporting writing and executing SQL directly

- Monaco Editor 集成：SQL 语法高亮、智能提示、代码折叠，支持 `Cmd/Ctrl+Shift+E` 快捷执行
- Monaco Editor integration: SQL syntax highlighting, IntelliSense, code folding, with `Cmd/Ctrl+Shift+E` shortcut to execute

- 可拖拽分割面板：SQL 编辑器与查询结果上下分栏，支持拖拽调整比例（10%~80%）
- Draggable split panel: SQL editor and query results in a vertical split layout, with adjustable ratio (10%~80%)

- VS Code 主题同步：Monaco 编辑器自动跟随 VS Code 明/暗主题切换
- VS Code theme sync: Monaco editor automatically follows VS Code light/dark theme changes

- 从数据库浏览器点击表/视图节点时，自动生成 `SELECT * FROM table LIMIT 200` 并执行
- Clicking table/view node in Database Explorer auto-generates `SELECT * FROM table LIMIT 200` and executes it

- 执行 SQL 命令也会将当前 SQL 同步到面板编辑器
- Execute SQL command also syncs current SQL to the panel editor

- 编辑器降级方案：Monaco 加载失败时自动回退到 textarea
- Editor fallback: automatically falls back to textarea when Monaco fails to load

- "View Data" 命令重命名为 "Query Data"，更准确反映功能
- "View Data" command renamed to "Query Data", more accurately reflecting the functionality

- 表节点默认点击操作改为 "Query Data"
- Table node default click action changed to "Query Data"

---

## [2.11.0] - 2026-06-10

### UI/UX

- 查询结果面板和表设计器面板全面升级为现代玻璃拟态（Glassmorphism）设计风格
- Query Result and Table Designer panels upgraded to modern Glassmorphism design style

- 统一两套面板的 CSS 变量体系，建立一致的设计系统
- Unified CSS variable system across both panels with a consistent design system

- 毛玻璃容器效果：backdrop-filter 模糊 + 半透明背景 + 微妙边框和阴影，创造深度层次感
- Glassmorphism container: backdrop-filter blur + semi-transparent background + subtle borders and shadows for depth

- 列类型彩色标签：INT 蓝色、VARCHAR 绿色、DATE 黄色、BLOB 橙色，表头信息更丰富
- Colored type labels in grid headers: INT blue, VARCHAR green, DATE yellow, BLOB orange

- 按钮系统优化：主操作按钮渐变背景 + 投影发光，次要按钮半透明 + 微妙边框，hover/active 微交互动画
- Button system: primary buttons with gradient + glow shadow, secondary buttons with semi-transparent + subtle border, hover/active micro-interactions

- 输入框 focus 发光环效果（box-shadow: 0 0 0 2px accent-dim）
- Input focus glow ring effect

- 滚动条细化至 6px，半透明样式
- Refined 6px semi-transparent scrollbar

- 对话框毛玻璃效果
- Dialog glassmorphism effect

- 底部标签切换改为分段控件样式
- Bottom tab switching redesigned as segmented control

- 修复查询结果 Webview 面板显示问题：移除 outputChannel.show()，Webview 面板成为查询结果的主要展示方式
- Fixed Query Result Webview panel display: removed outputChannel.show(), Webview panel is now the primary display for query results

- OutputChannel 降级为辅助日志，仅记录执行状态信息，不再输出表格数据
- OutputChannel downgraded to auxiliary log, only records execution status, no longer outputs table data

- 测试文件路径修复（media/ 目录）
- Fixed test file paths (media/ directory)

---

## [2.9.0] - 2026-06-09

### Performance

- 移除 `onStartupFinished` 激活事件，改为仅在打开 SQL 文件时激活插件，避免不使用 SQL 时的无谓加载

- Removed `onStartupFinished` activation event, extension now activates only when SQL files are opened, avoiding unnecessary loading when SQL is not used

- Provider 延迟实例化 — 所有语言 Provider（Diagnostics、CodeAction、FoldingRange、Outline、Hover、Definition、Reference、Rename、Completion）改为 lazy getter 模式，仅在 VSCode 首次调用时才实例化，消除激活时的级联 DI 实例化开销

- Lazy Provider instantiation — all language providers now use lazy getter pattern, instantiated only on first VSCode invocation, eliminating cascading DI instantiation overhead during activation

- 数据库模块非阻塞初始化 — `DatabaseModule.initialize()` 不再阻塞 `activate()`，改为后台异步执行，激活时间不再受 SecretStorage I/O 和查询历史加载影响

- Non-blocking database initialization — `DatabaseModule.initialize()` no longer blocks `activate()`, runs in background, activation time no longer affected by SecretStorage I/O and query history loading

- SqlParserEngine 延迟创建 Parser — `new Parser()` 从构造函数移至首次调用时创建，避免激活时加载 `node-sql-parser` 解析器

- SqlParserEngine lazy Parser creation — `new Parser()` moved from constructor to first invocation, avoiding loading `node-sql-parser` parser during activation

- SqlCompletionProvider 延迟加载 Snippet — Snippet JSON 文件从构造函数同步读取改为首次触发补全时异步加载

- SqlCompletionProvider lazy Snippet loading — Snippet JSON files changed from synchronous reading in constructor to async loading on first completion trigger

- 已打开文档诊断延迟执行 — 激活时对已打开 SQL 文件的诊断改为 `queueMicrotask` 延迟执行，不阻塞激活流程

- Deferred diagnostics for open documents — diagnostics for already-open SQL files deferred via `queueMicrotask`, no longer blocking activation

- 激活时间从 ~140ms 优化至 ~20-40ms

- Activation time optimized from ~140ms to ~20-40ms

---

## [2.5.0] - 2026-06-09

### Performance

- LRU Cache 移除伪优化 lastKey 字段，简化为标准 Map LRU 实现，修复 deleteByPrefix 潜在 bug

- LRU Cache removed broken lastKey optimization, simplified to standard Map LRU, fixed deleteByPrefix potential bug

- 同步模块注册改为 Promise.all 并行执行，加速插件激活

- Sync module registration changed to Promise.all parallel execution, faster extension activation

- SqlDiagnosticsProvider.provideDiagnostics 改为异步，lint 前让步事件循环，避免大文件阻塞 UI

- SqlDiagnosticsProvider.provideDiagnostics made async, yields to event loop before lint, preventing UI freeze on large files

- SqlCompletionProvider 移除有问题的自定义 schema 补全 debounce，改用 VS Code 框架内置取消机制

- SqlCompletionProvider removed broken custom schema completion debounce, now uses VS Code framework's built-in cancellation

### Security

- SafeQueryGuard 新增 GRANT、REVOKE、ALTER 危险操作检测

- SafeQueryGuard added GRANT, REVOKE, ALTER dangerous operation detection

- ConnectionStore.exportConnections 导出密码时弹出模态确认框，防止误操作

- ConnectionStore.exportConnections shows modal confirmation when exporting with passwords, preventing accidental exposure

### Bug Fixes

- MysqlAdapter.cancelQuery 使用正确的连接线程 ID，避免误杀其他查询

- MysqlAdapter.cancelQuery now uses correct connection thread ID, preventing accidental kill of other queries

- QueryExecutor.execute 移除 USE database 语句，修复连接池环境下数据库切换无效的问题

- QueryExecutor.execute removed USE database statement, fixing ineffective database switching in connection pool environment

- ConnectionManager 移除与 MysqlAdapter 重复的空闲检测逻辑，避免连接异常断开

- ConnectionManager removed duplicate idle check logic that conflicted with MysqlAdapter, preventing unexpected disconnections

- PerformanceMonitor.getStats() 修复 LRU 缓存条目过期后除零错误

- PerformanceMonitor.getStats() fixed division by zero when LRU cache entries are expired

- DI 容器 factory 路径添加循环依赖检测，防止栈溢出无友好提示

- DI container added circular dependency detection for factory path, preventing silent stack overflow

- ErrorHandler 通知添加 5 秒限流去重，防止错误风暴

- ErrorHandler notifications added 5-second throttle/dedup, preventing notification storms

- viewsWelcome 条件从 `true` 改为 `connectionCount == 0`，有连接时不再显示欢迎信息

- viewsWelcome condition changed from `true` to `connectionCount == 0`, no longer shows welcome when connections exist

### Architecture

- MysqlAdapter 提取 createPoolOptions 方法，消除 3 处连接池配置重复

- MysqlAdapter extracted createPoolOptions method, eliminating 3 duplicate pool config constructions

### Features

- SQLite 专属代码片段（13 个）：ATTACH/DETACH DATABASE、PRAGMA 系列、CREATE VIRTUAL TABLE/FTS5、INSERT OR REPLACE/IGNORE 等

- SQLite-specific snippets (13): ATTACH/DETACH DATABASE, PRAGMA series, CREATE VIRTUAL TABLE/FTS5, INSERT OR REPLACE/IGNORE, etc.

- 连接导入/导出命令注册到命令面板和数据库浏览器菜单

- Connection import/export commands registered in Command Palette and Database Explorer menu

### Changed

- 执行 SQL 快捷键从 `Ctrl+R` / `Cmd+R` 改为 `Ctrl+Shift+E` / `Cmd+Shift+E`，避免与 VS Code 内置快捷键冲突

- Execute SQL shortcut changed from `Ctrl+R` / `Cmd+R` to `Ctrl+Shift+E` / `Cmd+Shift+E`, avoiding conflict with VS Code built-in shortcuts

---

## [2.2] - 2026-06-05

### Features

- 全新插件图标 — 蓝→青渐变背景 + 数据库圆柱 + "SQL" 粗体字，体现全面的 SQL 开发工具包定位

- New plugin icon — blue-to-cyan gradient background with database cylinder and bold "SQL" text, reflecting the comprehensive SQL development toolkit positioning

### Architecture

- 格式化器默认选项整合 — 移除 sqlFormatter.ts 中的重复默认值，统一使用 configDefinitions.ts 中的 getFormatterDefaultOptions（单一数据源）

- Formatter default options consolidation — removed duplicate defaults from sqlFormatter.ts, now using getFormatterDefaultOptions from configDefinitions.ts (single source of truth)

- 配置编辑器 UI 改进（CSS、HTML、JS 重构）

- Config editor UI improvements (CSS, HTML, JS refactoring)

- HiveSqlAdapter 格式化改进

- HiveSqlAdapter formatting improvements

- 配置定义重构

- Config definitions refactoring

### Bug Fixes

- i18n 消息更新

- i18n message updates

---

## [2.1] - 2026-06-05

### Features

- 全新图形化连接对话框 — 用基于 Webview 的对话框替代逐步 InputBox，支持一次性填写所有连接参数（ConnectionDialog.ts, dialog.html, dialog.css, dialog.js）

- New graphical Connection Dialog — replaced step-by-step InputBox with webview-based dialog for filling all connection parameters at once (ConnectionDialog.ts, dialog.html, dialog.css, dialog.js)

---

## [2.0] - 2026-06-01

### Features

- 数据库连接与管理模块（DatabaseModule, ConnectionManager, ConnectionStore）

- Database Connection & Management module (DatabaseModule, ConnectionManager, ConnectionStore)

- MySQL 适配器，支持连接池与 SSL（MysqlAdapter）

- MySQL adapter with connection pool and SSL support (MysqlAdapter)

- SSH 隧道支持（SshTunnel，基于 ssh2）

- SSH tunnel support (SshTunnel via ssh2)

- 查询执行引擎（QueryExecutor），支持超时、取消、最大行数限制

- Query execution engine (QueryExecutor) with timeout, cancellation, and max rows

- 安全查询守卫 — 危险 SQL 拦截（SafeQueryGuard），支持 strict/moderate/off 三级模式

- Safe query guard — dangerous SQL interception (SafeQueryGuard) with strict/moderate/off levels

- 查询历史记录（QueryHistory）

- Query history (QueryHistory)

- SQL 语句检测器（SqlStatementDetector）

- SQL statement detection (SqlStatementDetector)

- 数据库浏览器侧边栏（DatabaseTreeProvider + 树节点）

- Database Explorer sidebar (DatabaseTreeProvider with tree nodes)

- Schema 提供者与缓存（SchemaProvider, SchemaCache），支持可配置 TTL

- Schema provider and cache (SchemaProvider, SchemaCache) with configurable TTL

- 数据导出（CSV、JSON、INSERT、DDL）via DataExporter

- Data export (CSV, JSON, INSERT, DDL) via DataExporter

- 数据导入 via DataImporter

- Data import via DataImporter

- 执行计划可视化（ExplainPlan, ExplainPlanPanel）

- Execution plan visualization (ExplainPlan, ExplainPlanPanel)

- 表设计器（TableDesignerPanel）

- Table designer (TableDesignerPanel)

- 查询结果面板（QueryResultPanel），支持分页、网格/表单视图

- Query result panel (QueryResultPanel) with pagination and grid/form views

- 数据传输对话框（DataTransferDialog）

- Data transfer dialog (DataTransferDialog)

- Schema 感知智能补全（SchemaCompletionProvider）

- Schema-aware completion (SchemaCompletionProvider)

- Schema 悬停信息（SchemaHoverResolver）

- Schema hover information (SchemaHoverResolver)

- 4 条新 Lint 规则：consistent_aliasing、explicit_column_aliasing、long_query_line、uppercase_keywords

- 4 new lint rules: consistent_aliasing, explicit_column_aliasing, long_query_line, uppercase_keywords

- 数据编辑服务，含校验功能

- Data editor service with validation

- BLOB 预览，含 MIME 类型白名单

- BLOB preview with MIME type whitelist

- 批量执行模式（顺序/事务）

- Batch execution mode (sequential/transaction)

- 执行进度保存

- Execution progress saving

- 取消重试机制

- Cancel retry mechanism

- 结果面板增强：滚动预加载、JSON 美化、日期格式化、长文本截断、NULL 占位符

- Result panel features: scroll preloading, JSON pretty print, date format, long text truncation, NULL placeholder

- 80+ 配置项，覆盖格式化、Lint、数据库、导出、数据编辑、结果、历史等类别

- 80+ configuration options across formatting, lint, database, export, data editor, results, and history categories

### Security

- SAVEPOINT SQL 注入防护 — 对名称进行白名单验证，仅允许字母数字下划线

- SAVEPOINT SQL injection prevention — whitelist validation for names, allowing only alphanumeric and underscore

- SSH 密钥路径白名单 — 验证私钥路径必须位于用户主目录、`.ssh` 目录或 `/etc/ssh` 下，防止路径遍历攻击

- SSH key path whitelist — validate private key paths must be under user home, `.ssh` directory, or `/etc/ssh`, preventing path traversal attacks

- BLOB 预览 XSS 修复 — MIME 类型白名单验证，使用 DOM API 替代 innerHTML 拼接

- BLOB preview XSS fix — MIME type whitelist validation, using DOM API instead of innerHTML concatenation

- CSP 策略 — 所有 5 个 Webview HTML 文件添加 Content-Security-Policy meta 标签

- CSP policy — added Content-Security-Policy meta tags to all 5 Webview HTML files

- 导出连接密码泄露修复 — `includePasswords = false` 时同时清除 SSH 密码和 passphrase，导出文件设置 0600 权限

- Export connection password leak fix — clear SSH password and passphrase when `includePasswords = false`, set exported file permissions to 0600

- SQL 高亮正则替换风险修复 — 改为基于 token 的方式，消除正则替换破坏 HTML 实体的风险

- SQL highlight regex replacement risk fix — switched to token-based approach, eliminating risk of regex breaking HTML entities

- 导入数据运行时校验 — ConnectionStore.importConnections 添加 validateImportData 方法

- Import data runtime validation — added validateImportData method to ConnectionStore.importConnections

- Webview inline onclick 迁移 — 所有 HTML 文件中 inline 事件替换为 addEventListener 绑定

- Webview inline onclick migration — replaced inline event handlers with addEventListener in all HTML files

- i18n 全局变量注入替换 — 配置编辑器中 `window.__I18N__` 替换为 WebView 消息机制

- i18n global variable injection replaced — `window.__I18N__` in config editor replaced with WebView message mechanism

### Architecture

- AST 缓存 TOCTOU 竞态修复 — getOrBuildSymbolIndex 原子性写入 symbolIndex，处理 LRU 淘汰与版本不匹配

- AST cache TOCTOU race fix — atomic symbolIndex write in getOrBuildSymbolIndex, handle LRU eviction and version mismatch

- DI 容器单例竞态修复 — 添加 creating 中间状态标记，防止工厂函数被并发调用

- DI container singleton race fix — added creating intermediate state to prevent concurrent factory invocations

- ConnectionManager 资源泄漏修复 — dispose() 正确清理 retryTimers、healthCheckTimers、idleCheckTimers 和事件发射器

- ConnectionManager resource leak fix — dispose() properly cleans retryTimers, healthCheckTimers, idleCheckTimers, and event emitters

- disconnectAll 并行断开 — 使用 Promise.allSettled() 并行断开连接，避免单个连接挂起阻塞后续

- disconnectAll parallel disconnect — use Promise.allSettled() for parallel disconnection, preventing single hung connection from blocking others

- SSH 隧道双重超时冲突修复 — 统一超时机制，确保应用级超时清理 SSH 客户端

- SSH tunnel double timeout conflict fix — unified timeout mechanism, ensuring application-level timeout cleans up SSH client

- SSH 隧道 close() 关闭活跃 socket — 追踪并销毁所有活跃 socket 转发连接

- SSH tunnel close() closes active sockets — track and destroy all active socket forwarding connections

### Bug Fixes

- config-editor.js 语法错误 — 预设配置对象中缺少逗号，导致配置编辑器完全不可用

- config-editor.js syntax error — missing commas in preset config objects, causing config editor to be completely unusable

- testConnection SSH 密码逻辑错误 — 数据库密码被错误赋给 SSH 配置的 password 字段

- testConnection SSH password logic error — database password was incorrectly assigned to SSH config's password field

- transferDialog.js Node.js API 误用 — Webview 中 require('fs') 改为消息机制请求文件内容

- transferDialog.js Node.js API misuse — replaced require('fs') in Webview with message mechanism for file content

- formatUnknown 回退输出优化 — 移除 JSON.stringify 输出，只保留类型注释

- formatUnknown fallback output optimization — removed JSON.stringify output, keeping only type annotation

### Configuration

- Lint 规则配置格式统一 — 将分散的阈值/子选项配置整合到规则对象中，删除 7 个独立配置键

- Lint rule config format unified — consolidated scattered threshold/sub-options into rule objects, removed 7 independent config keys

---

## [1.11] - 2026-05-25

### Architecture

- DI 容器增强、核心服务集成

- DI container enhancement, core service integration

- RuleRegistry 重构简化 — 规则注册代码从 44 行缩减至 8 行

- RuleRegistry refactoring — rule registration code reduced from 44 lines to 8 lines

- DocumentAstCache LRU 验证

- DocumentAstCache LRU validation

---

## [1.10] - 2026-05-18

### Architecture

- AstLinter 规则体系模块化 — 策略模式 + 规则注册机制

- AstLinter rule system modularization — Strategy Pattern + RuleRegistry

- 14 个独立规则类实现统一 LintRule 接口

- 14 independent rule classes implementing unified LintRule interface

- AstLinter 从 877 行缩减至 64 行

- AstLinter reduced from 877 lines to 64 lines

- 支持独立测试和开闭原则扩展

- Supports independent testing and Open-Closed Principle extension

---

## [1.8] - 2026-05-04

### Features

- 国际化全面改造 — 设置界面跟随 VS Code 语言切换

- Full i18n overhaul — settings UI follows VSCode language

- README/CHANGELOG 双语化

- Bilingual README & CHANGELOG

- 配置编辑器多语言支持

- Config editor multilingual support

- 统一方言注册中心

- Unified dialect registry

### Bug Fixes

- 修复内存泄漏

- Memory leak fixes

- 架构优化

- Architecture improvements

---

## [1.7] - 2026-04-20

### Features

- Go to Definition — CTE、表别名、列别名跳转定义

- Go to Definition — CTE, table alias, and column alias navigation

- Find All References — 查找所有引用

- Find All References

- Rename Symbol — 重命名符号，含保留字与命名冲突校验

- Rename Symbol — with reserved word and naming conflict checks

- Breadcrumb 子句级导航

- Breadcrumb clause-level navigation

- AstNavigator 共享导航引擎

- AstNavigator shared navigation engine
