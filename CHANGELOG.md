# Changelog

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
