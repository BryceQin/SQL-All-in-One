# Changelog

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
