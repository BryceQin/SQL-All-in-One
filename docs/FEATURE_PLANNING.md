# SQL All in One 插件功能规划方案

> 版本：v1.0 | 日期：2026-06-23 | 编制依据：源码审计 + PRD 文档 + CHANGELOG + 优化报告
> 适用版本：v2.19.0 及后续迭代

---

## 目录

- [第一部分：已有功能分析](#第一部分已有功能分析)
  - [1. 功能模块全景图](#1-功能模块全景图)
  - [2. 各功能模块详细评估](#2-各功能模块详细评估)
  - [3. 横向评估：使用频率、性能、兼容性](#3-横向评估使用频率性能兼容性)
  - [4. 现有功能优势与不足总结](#4-现有功能优势与不足总结)
- [第二部分：功能点补齐规划](#第二部分功能点补齐规划)
  - [5. 需求来源与识别方法](#5-需求来源与识别方法)
  - [6. 待补充功能点清单与优先级](#6-待补充功能点清单与优先级)
  - [7. 高优先级功能详细方案](#7-高优先级功能详细方案)
  - [8. 开发时间轴与资源分配](#8-开发时间轴与资源分配)
  - [9. 验收标准与测试方法](#9-验收标准与测试方法)
  - [10. 风险评估与缓解措施](#10-风险评估与缓解措施)

---

# 第一部分：已有功能分析

## 1. 功能模块全景图

SQL All in One 是一款定位为"Navicat 级 SQL 开发工具包"的 VSCode 扩展（v2.19.0），当前已实现 **23 个功能模块**，覆盖 SQL 开发全生命周期。整体架构采用 **DI 容器 + 模块注册 + 适配器模式**，代码组织清晰、可扩展性强。

```
┌─────────────────────────────────────────────────────────────────┐
│                     SQL All in One 插件架构                      │
├─────────────────────────────────────────────────────────────────┤
│  入口层    extension.ts → ModuleRegistry → 4 大模块激活          │
│            (FormatterModule / DiagnosticsModule /                │
│             ProviderModule / DatabaseModule)                     │
├─────────────────────────────────────────────────────────────────┤
│  核心层    DIContainer → 30+ 单例服务（拓扑排序销毁）            │
│            ConfigManager / ErrorHandler / PerformanceMonitor     │
├─────────────────────────────────────────────────────────────────┤
│  语言层    8 方言（sql/hive/mysql/spark/flinksql/pg/bq/sqlite）  │
│            Lexer → Parser(node-sql-parser) → AST → Formatter     │
├─────────────────────────────────────────────────────────────────┤
│  编辑器层  Completion(7类) / Hover(4层) / Lint(30规则)           │
│            Navigation / Folding / Outline / QuickFix / Diagnostics│
├─────────────────────────────────────────────────────────────────┤
│  数据库层  AdapterFactory → MysqlAdapter（唯一实现）             │
│            ConnectionManager / SchemaCache / QueryExecutor       │
│            SafeQueryGuard / QueryHistory / DataEditService       │
├─────────────────────────────────────────────────────────────────┤
│  视图层    5 Webview Panel（BaseWebviewPanel 抽象基类）          │
│            QueryResult / TableDesigner / ExplainPlan             │
│            ConnectionDialog / DataTransfer                       │
│            DatabaseExplorer(TreeView) / StatusBar                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 功能模块清单

| 序号 | 功能模块 | 实现位置 | 成熟度 | 用户感知 |
|------|---------|---------|--------|---------|
| F01 | SQL 格式化（40+ 选项） | `src/formatter/` | ★★★★★ | ★★★★★ |
| F02 | 智能补全（7 类） | `src/completion/` | ★★★★☆ | ★★★★★ |
| F03 | 语法检查与诊断 | `src/providers/SqlDiagnosticsProvider.ts` | ★★★★☆ | ★★★★☆ |
| F04 | SQL Lint（30 规则） | `src/linter/` | ★★★★★ | ★★★★☆ |
| F05 | 快速修复 | `src/providers/SqlCodeActionProvider.ts` | ★★★☆☆ | ★★★☆☆ |
| F06 | 代码导航 | `src/navigation/` | ★★★★☆ | ★★★★☆ |
| F07 | 悬停信息 | `src/hover/` | ★★★★☆ | ★★★★☆ |
| F08 | 代码折叠与大纲 | `src/providers/` | ★★★★☆ | ★★★☆☆ |
| F09 | DDL 转换 | `src/converter/` | ★★★☆☆ | ★★★☆☆ |
| F10 | 注释增强 | `src/commands/commentCommands.ts` | ★★★★☆ | ★★★★☆ |
| F11 | 参数化查询 | `src/providers/SqlParameterHighlighter.ts` | ★★★☆☆ | ★★★☆☆ |
| F12 | 数据库连接管理 | `src/database/connection/` | ★★★★☆ | ★★★★★ |
| F13 | 查询执行引擎 | `src/database/query/QueryExecutor.ts` | ★★★★☆ | ★★★★★ |
| F14 | 查询结果面板 | `src/views/queryResult/` | ★★★★☆ | ★★★★★ |
| F15 | 数据库浏览器 | `src/views/databaseExplorer/` | ★★★★☆ | ★★★★★ |
| F16 | 数据导入导出 | `src/database/transfer/` | ★★★☆☆ | ★★★★☆ |
| F17 | 表设计器 | `src/views/tableDesigner/` | ★★★☆☆ | ★★★★☆ |
| F18 | 数据编辑器 | `src/database/query/DataEditService.ts` | ★★★☆☆ | ★★★☆☆ |
| F19 | 执行计划可视化 | `src/views/explainPlan/` | ★★★☆☆ | ★★★★☆ |
| F20 | 安全守卫 | `src/database/query/SafeQueryGuard.ts` | ★★★★☆ | ★★★★☆ |
| F21 | 查询历史 | `src/database/history/QueryHistory.ts` | ★★★☆☆ | ★★★☆☆ |
| F22 | 可视化配置编辑器 | `media/config-editor.*` | ★★★★☆ | ★★★★☆ |
| F23 | 国际化（中英双语） | `src/i18n/` | ★★★★☆ | ★★★★☆ |

---

## 2. 各功能模块详细评估

### 2.1 F01 - SQL 格式化

**实现方式与技术架构**

格式化引擎是插件的核心竞争力，基于 `node-sql-parser` v5.x 的 AST 驱动架构：

```
输入 SQL → Tokenizer(词法分析) → Parser(AST) → AstFormatter(遍历) → 输出
                                         ↓
                              FormatterFactory(实例复用)
                                         ↓
                    SelectFormatter / InsertFormatter / DDLFormatter
                    CaseFormatter / CTEFormatter / ExpressionFormatter
```

- **词法分析**：[TokenizerEngine.ts](file:///Users/hao/Downloads/sql-all-in-one/src/lexer/TokenizerEngine.ts) 采用正则规则匹配，支持 8 种方言的 token 规则，已优化为直接在已有 Token 上设置属性（消除双重分配）
- **AST 格式化**：[AstFormatter.ts](file:///Users/hao/Downloads/sql-all-in-one/src/formatter/AstFormatter.ts) 通过 `FormatterFactory` 缓存复用格式化器实例，带 `inUse` 标记防止递归冲突
- **配置体系**：40+ 选项覆盖大小写（6 项）、缩进（3 项）、换行（25+ 项）、对齐（7 项）、间距（10+ 项）
- **缓存策略**：`formatterCache` 使用 LRU（最多 50 实例），按方言+配置哈希

**用户交互流程**

1. 用户打开 SQL 文件 → 自动识别方言
2. `Shift+Alt+F` 格式化全文 / 右键"Format Selection"格式化选中
3. 可视化配置编辑器实时预览（`hive-formatter.open-config-editor`）
4. 4 种快速预设（默认/Hive/MySQL/紧凑）

**优势**
- AST 驱动保证语义正确性，不会破坏 SQL 结构
- 40+ 配置选项为业界最全，满足团队规范定制需求
- FormatterFactory 实例复用消除 O(n) 递归分配
- 注释保留（CommentPreserver）处理完善

**不足**
- `formatUnknown` 回退到 `JSON.stringify`，对无法识别的 AST 节点输出不友好（PRD-016 #31）
- `formatUse` 未引用标识符，数据库名含特殊字符时可能语法错误（PRD-016 #30）
- 格式化错误消息中文硬编码，未走 i18n 流程（PRD-016 #19）

**使用频率**：极高（核心功能，每次 SQL 编辑都会触发）
**性能表现**：优秀（激活时懒加载 parser，缓存命中延迟 0.023ms）
**兼容性**：8 方言全覆盖，PostgreSQL dollar-quote 已兼容

---

### 2.2 F02 - 智能补全

**实现方式与技术架构**

7 类补全通过 [SqlCompletionProvider.ts](file:///Users/hao/Downloads/sql-all-in-one/src/completion/SqlCompletionProvider.ts) 统一调度，采用分层策略：

| 补全类型 | 延迟 | 数据来源 | 实现文件 |
|---------|------|---------|---------|
| 关键字补全 | 零延迟 | 模块级缓存 | `keywordCompletion.ts` |
| 函数补全 | 零延迟 | 580+ 签名，模块级缓存 | `functionCompletion.ts` |
| 代码片段 | 首次异步加载 | `snippets/*.json`（8 方言） | `snippetCompletion.ts` |
| CTE 名称 | 实时 | AST 解析 WITH 子句 | `cteCompletion.ts` |
| 标识符 | 实时 | AST 上下文分析 | `identifierCompletion.ts` |
| 注释模板 | 实时 | 预定义模板 | `commentCompletion.ts` |
| Schema 补全 | 防抖+桥接 | 数据库查询 | `SchemaCompletionProvider.ts` |

**用户交互流程**

1. 用户输入 → VSCode 触发 `provideCompletionItems`
2. 静态项（关键字/函数/片段）从缓存克隆返回
3. 动态项（CTE/标识符/Schema）实时构建
4. Schema 补全通过 `.` 或空格触发，桥接到 Extension Host 查询

**优势**
- 静态补全零延迟（模块级懒加载缓存 + 克隆复用）
- Schema 补全使用 VSCode 框架内置取消机制，替代有问题的自定义 debounce
- MRU（最近使用）追踪从补全生成阶段推迟到 `resolveCompletionItem`，消除读副作用

**不足**
- Schema 补全依赖数据库连接，离线场景不可用
- 标识符补全的 aliasMap 缓存已在 DocumentAstCache 中优化，但复杂嵌套查询仍有性能压力
- 缺少基于 AI/统计的智能排序

**使用频率**：极高（每次输入触发）
**性能表现**：优秀（静态项零延迟，动态项防抖）
**兼容性**：8 方言关键字/函数/片段全覆盖

---

### 2.3 F03 + F04 - 语法检查与 Lint

**实现方式与技术架构**

双层检查架构，防抖 300ms，支持 CancellationToken：

```
文档变更 → SqlDiagnosticsProvider(防抖 300ms)
               ↓
    ┌──────────┴──────────┐
    ↓                     ↓
AstDiagnosticsProvider   SqlLinter
(语法错误检查)           (30 条 Lint 规则)
    ↓                     ↓
  AST 诊断              RuleRegistry
                         (策略模式 + 注册机制)
```

- **AST 诊断**：[AstDiagnosticsProvider.ts](file:///Users/hao/Downloads/sql-all-in-one/src/providers/AstDiagnosticsProvider.ts) 检查 HAVING 缺 GROUP BY、LIMIT 缺值、JOIN 缺 ON 等 10 类语法错误
- **Lint 规则**：[RuleRegistry.ts](file:///Users/hao/Downloads/sql-all-in-one/src/linter/RuleRegistry.ts) 采用策略模式，30 条规则独立实现 `LintRule` 接口，每条支持 `enabled` + `severity` 配置
- **全局规则优化**：`applicableTypes` 为空的规则只在顶层执行一次，避免每个子节点重复全文正则扫描

**优势**
- 30 条 Lint 规则覆盖语法错误（Error）、代码质量（Warning）、最佳实践（Info）三个层面
- 规则模块化，开闭原则扩展（AstLinter 从 877 行缩减至 64 行）
- 部分规则支持子选项（阈值、聚合、豁免等）
- 严重级别可配置过滤

**不足**
- 约 10 条规则无单元测试（PRD-016 测试覆盖薄弱环节）
- 规则全部使用通用 SQL 假设，不区分方言差异（PRD-002 M3 未完成）
- 缺少方言专属规则（如 MySQL 的 `SQL_NO_CACHE`、Hive 的分区列检查等）

**使用频率**：高（每次编辑自动触发）
**性能表现**：良好（全局规则优化后大文件 GC 压力降低）
**兼容性**：通用 SQL 假设，方言感知不足

---

### 2.4 F12 + F13 + F14 - 数据库连接、查询执行与结果面板

**实现方式与技术架构**

这是插件从"格式化工具"升级为"数据库开发工具"的核心模块群：

```
ConnectionFactory → ConnectionManager(8 Map 合并为 RuntimeState)
                        ↓
               AdapterFactory → MysqlAdapter（唯一实现）
                        ↓
            ┌─────────────┼─────────────┐
            ↓             ↓             ↓
    MysqlConnection    MysqlQuery    MysqlMetadata
      Adapter           Adapter        Adapter
            ↓             ↓             ↓
        连接池           查询执行       元数据查询
      (mysql2)        (超时/取消)     (并行 Promise.all)
                        ↓
               QueryExecutor
                        ↓
            QueryResultPanel(Monaco + 虚拟滚动)
```

- **连接管理**：[ConnectionManager.ts](file:///Users/hao/Downloads/sql-all-in-one/src/database/connection/ConnectionManager.ts) 8 个独立 Map 合并为 `Map<string, ConnectionRuntimeState>`，统一状态管理
- **适配器分层**：[IDatabaseAdapter.ts](file:///Users/hao/Downloads/sql-all-in-one/src/database/adapters/IDatabaseAdapter.ts) 拆分为 `IConnectionAdapter`/`IQueryAdapter`/`IMetadataAdapter`/`ISchemaAdapter` 四子接口
- **查询执行**：[QueryExecutor.ts](file:///Users/hao/Downloads/sql-all-in-one/src/database/query/QueryExecutor.ts) 支持超时、取消（CancellationToken + KILL QUERY）、最大行数、批量模式
- **结果面板**：[QueryResultPanel.ts](file:///Users/hao/Downloads/sql-all-in-one/src/views/queryResult/QueryResultPanel.ts) 集成 Monaco 编辑器，虚拟滚动，Canvas 列宽计算

**用户交互流程**

1. 侧边栏点击"+"添加连接 → ConnectionDialog（Webview 表单）
2. 填写主机/端口/用户/密码/SSL/SSH → 测试连接 → 保存
3. 右键连接 → Connect → Schema 预取
4. `Cmd+Shift+E` 执行 SQL / `Cmd+Shift+R` 执行选中
5. 结果面板：网格/表单视图、分页、导出、编辑模式

**优势**
- 适配器接口分层设计，扩展新数据库方言清晰
- 连接池健康检查、空闲检查、自动重连、指数退避重试
- SecretStorage 密码安全存储
- SSH 隧道支持（密码/公钥认证）
- Monaco 编辑器集成 SQL 语法高亮、补全、Lint（混合架构）
- 安全守卫 3 级拦截危险 SQL

**不足**
- **仅支持 MySQL**，PostgreSQL/SQLite 等适配器未实现（PRD-008 规划但未完成）
- 查询超时不取消实际查询，底层仍在执行（PRD-016 #15）
- USE 语句失败被静默忽略（PRD-016 #14）
- 连接池回收曾出现破坏性 bug（v2.19 已修复为 no-op）
- Monaco 编辑器 CSP/主题同步经历多次修复（v2.15.20-v2.15.23）

**使用频率**：高（数据库开发核心流程）
**性能表现**：良好（连接池、Schema 缓存 TTL、并行元数据查询）
**兼容性**：仅 MySQL，其他方言适配器缺失

---

### 2.5 F15 - 数据库浏览器

**实现方式与技术架构**

[DatabaseTreeProvider.ts](file:///Users/hao/Downloads/sql-all-in-one/src/views/databaseExplorer/DatabaseTreeProvider.ts) 基于 VSCode TreeView，树节点类型：

```
连接组(Favorites/Group)
  └── 连接(ConnectionConnected/Disconnected)
       └── 数据库(Database)
            ├── 表(Table) → 列(Column) / 索引(Index)
            ├── 视图(View)
            ├── 函数(Function) → 参数(Parameter)
            ├── 存储过程(Procedure) → 参数(Parameter)
            └── 触发器(Trigger) → 时机/事件/语句
```

- **双击检测**：500ms 阈值，区分展开/折叠与查看定义
- **Schema 缓存**：[SchemaCache.ts](file:///Users/hao/Downloads/sql-all-in-one/src/database/schema/SchemaCache.ts) LRU + TTL（数据库 600s/表 300s/列 120s/函数 600s），单条目惰性过期
- **DDL 变更刷新**：`schemaCache.refreshOnDDL` 配置项

**优势**
- 树形结构完整覆盖数据库对象（表/视图/函数/存储过程/触发器）
- 函数/存储过程可展开查看参数列表和返回类型
- 触发器可展开查看时机、事件和执行语句
- 收藏夹、默认数据库、复制列名等便捷功能

**不足**
- 双击查看定义的交互不够直观（v2.15.29 修复）
- 大型数据库（1000+ 表）树加载性能未验证
- 缺少搜索/过滤功能

**使用频率**：高（数据库浏览主要入口）
**性能表现**：良好（Schema 缓存 + 惰性过期）
**兼容性**：仅 MySQL 元数据查询

---

### 2.6 F16 - 数据导入导出

**实现方式与技术架构**

- **导出**：[DataExporter.ts](file:///Users/hao/Downloads/sql-all-in-one/src/database/transfer/DataExporter.ts) 支持 CSV/JSON/INSERT/DDL，流式写入避免大数据集全量内存
- **导入**：[DataImporter.ts](file:///Users/hao/Downloads/sql-all-in-one/src/database/transfer/DataImporter.ts) 支持 CSV/JSON/SQL，使用 `SqlTextScanner.findStatementEnd` 安全分割（修复了字符串/注释内分号问题）

**优势**
- 流式写入，大数据集友好
- SQL 导入分号分割已修复注入风险
- 导出格式可配置（分隔符、编码、表头）

**不足**
- 导入向导 UX 较简单，缺少字段映射预览的实时性
- CSV 编码自动检测未实现（PRD-015 规划使用 jschardet/chardet）
- 导出连接密码时明文存储（v2.0 已修复清除 SSH 密码，但加密存储未实现）

**使用频率**：中（数据迁移场景）
**性能表现**：良好（流式写入）
**兼容性**：仅 MySQL

---

### 2.7 F17 + F18 - 表设计器与数据编辑器

**实现方式与技术架构**

- **表设计器**：[TableDesignerPanel.ts](file:///Users/hao/Downloads/sql-all-in-one/src/views/tableDesigner/TableDesignerPanel.ts) Webview 可视化设计列定义（类型/约束/注释）
- **数据编辑器**：[DataEditService.ts](file:///Users/hao/Downloads/sql-all-in-one/src/database/query/DataEditService.ts) 只读/可编辑模式，自动提交，乐观锁，BLOB 预览，数据验证

**优势**
- 乐观锁并发编辑控制
- BLOB 预览 MIME 类型白名单（XSS 修复）
- 实时数据验证，外键验证可选
- 事务状态显示，长事务警告

**不足**
- 表设计器仅支持 MySQL 数据类型
- 数据编辑器默认只读模式，用户需手动切换
- 缺少外键关系的可视化

**使用频率**：中（表结构设计场景）
**性能表现**：良好
**兼容性**：仅 MySQL

---

### 2.8 F19 - 执行计划可视化

**实现方式与技术架构**

[ExplainPlan.ts](file:///Users/hao/Downloads/sql-all-in-one/src/database/query/ExplainPlan.ts) + [ExplainPlanPanel.ts](file:///Users/hao/Downloads/sql-all-in-one/src/views/explainPlan/ExplainPlanPanel.ts)：

- 解析 MySQL `EXPLAIN FORMAT=JSON`
- 三种视图：可视化（树形）、表格、JSON
- 节点颜色反映操作类型（全表扫描红色/索引查找绿色等）
- 优化建议自动生成
- MySQL 8.0.18+ 支持 `EXPLAIN ANALYZE`

**优势**
- 三视图切换满足不同分析需求
- 优化建议基于 EXPLAIN 结果自动生成
- 节点颜色直观反映性能问题

**不足**
- 仅支持 MySQL EXPLAIN 格式
- 可视化视图缺少交互（如点击节点展开详情）
- 缺少执行计划对比功能

**使用频率**：中（性能优化场景）
**性能表现**：优秀（解析 ≤100ms）
**兼容性**：仅 MySQL

---

### 2.9 F09 - DDL 转换

**实现方式与技术架构**

[AstConverter.ts](file:///Users/hao/Downloads/sql-all-in-one/src/converter/AstConverter.ts) 基于 AST 的 MySQL ↔ Hive CREATE TABLE 双向转换：

- 数据类型映射（[typeMappings.ts](file:///Users/hao/Downloads/sql-all-in-one/src/converter/typeMappings.ts)）
- 函数映射（[functionMappings.ts](file:///Users/hao/Downloads/sql-all-in-one/src/converter/functionMappings.ts)）
- 表选项过滤、列属性剥离、约束过滤

**优势**
- AST 驱动保证转换语义正确
- 数据类型和函数映射完善

**不足**
- 仅支持 MySQL ↔ Hive 双向，未扩展到其他方言（PRD-002 明确不做）
- 转换规则不可配置

**使用频率**：低（特定迁移场景）
**性能表现**：优秀
**兼容性**：MySQL ↔ Hive

---

### 2.10 F22 - 可视化配置编辑器

**实现方式与技术架构**

[config-editor.*](file:///Users/hao/Downloads/sql-all-in-one/media/config-editor.js) Webview 实现：

- 可折叠分组、Toggle 开关
- 实时格式化预览
- 拖拽调整预览区大小
- 4 种快速预设

**优势**
- 图形化界面降低 40+ 配置项的学习成本
- 实时预览所见即所得

**不足**
- 曾出现语法错误导致完全不可用（PRD-016 #1，已修复）
- i18n 曾使用全局变量注入（已改为消息机制）
- 配置项分组逻辑可进一步优化

**使用频率**：中（初始配置场景）
**性能表现**：良好
**兼容性**：全方言

---

## 3. 横向评估：使用频率、性能、兼容性

### 3.1 使用频率矩阵

| 频率等级 | 功能模块 | 说明 |
|---------|---------|------|
| **极高** | F01 格式化、F02 补全 | 每次 SQL 编辑触发 |
| **高** | F03 诊断、F04 Lint、F12 连接、F13 查询、F14 结果面板、F15 浏览器 | 日常开发核心流程 |
| **中** | F05 快速修复、F07 悬停、F10 注释、F16 导入导出、F17 表设计器、F19 执行计划、F22 配置编辑器 | 按需使用 |
| **低** | F06 导航、F08 折叠大纲、F09 DDL 转换、F11 参数化、F18 数据编辑器、F20 安全守卫、F21 历史 | 特定场景 |

### 3.2 性能表现矩阵

| 性能等级 | 功能模块 | 关键指标 |
|---------|---------|---------|
| **优秀** | F01 格式化、F02 补全、F19 执行计划、F09 DDL 转换 | 缓存命中 0.023ms，解析 ≤100ms |
| **良好** | F03 诊断、F04 Lint、F12 连接、F15 浏览器、F16 导入导出、F22 配置编辑器 | 防抖 300ms，Schema 缓存 TTL |
| **一般** | F13 查询、F14 结果面板、F17 表设计器、F18 数据编辑器 | 大数据集虚拟滚动，Monaco 加载 |
| **需优化** | F06 导航（大文件 AST 遍历）、F08 折叠（大文件） | 1000+ 节点 GC 压力 |

### 3.3 兼容性矩阵

| 方言 | 格式化 | 补全 | Lint | 数据库连接 | 执行计划 | 表设计器 |
|------|--------|------|------|-----------|---------|---------|
| MySQL | ✅ | ✅ | ✅ 通用 | ✅ | ✅ | ✅ |
| PostgreSQL | ✅ | ✅ | ✅ 通用 | ❌ | ❌ | ❌ |
| Hive | ✅ | ✅ | ✅ 通用 | ❌ | ❌ | ❌ |
| SparkSQL | ✅ | ✅ | ✅ 通用 | ❌ | ❌ | ❌ |
| FlinkSQL | ✅ | ✅ | ✅ 通用 | ❌ | ❌ | ❌ |
| BigQuery | ✅ | ✅ | ✅ 通用 | ❌ | ❌ | ❌ |
| SQLite | ✅ | ✅ | ✅ 通用 | ❌ | ❌ | ❌ |
| SQL(标准) | ✅ | ✅ | ✅ 通用 | ❌ | ❌ | ❌ |

**关键发现**：数据库相关功能（连接/查询/执行计划/表设计器）**仅支持 MySQL**，这是当前最大的功能缺口。

---

## 4. 现有功能优势与不足总结

### 4.1 核心优势

1. **架构成熟度高**
   - DI 容器 + 模块注册 + 适配器模式，30+ 单例服务拓扑排序销毁
   - 接口隔离设计（IDatabaseAdapter 拆分为 4 子接口）
   - BaseWebviewPanel 抽象基类统一 5 个面板生命周期

2. **格式化能力业界领先**
   - 40+ 配置选项为同类工具最全
   - AST 驱动保证语义正确
   - 8 方言全覆盖

3. **性能优化深入**
   - 激活时间从 ~140ms 优化至 ~20-40ms
   - node-sql-parser / ssh2 懒加载
   - LRU 缓存、实例复用、正则缓存等多层优化
   - 行列查找 1178x 加速

4. **安全实践完善**
   - SecretStorage 密码存储
   - CSP 策略（5 个 Webview）
   - 安全守卫 3 级拦截
   - SQL 注入防护（SAVEPOINT 白名单、导入分号安全分割）
   - BLOB 预览 XSS 修复

5. **国际化完整**
   - 中英双语，80+ 配置项全部国际化
   - 自动跟随 VSCode 语言设置

### 4.2 主要不足

1. **数据库方言覆盖严重不足**
   - 仅 MySQL 适配器实现，PostgreSQL/SQLite 等全部缺失
   - 执行计划、表设计器、数据编辑器均绑定 MySQL
   - 这是阻碍插件成为"全方言数据库工具"的最大瓶颈

2. **Lint 规则方言感知缺失**
   - 30 条规则全部使用通用 SQL 假设
   - 缺少方言专属规则（PRD-002 M3 未完成）

3. **测试覆盖不均衡**
   - SSH 隧道仅 97 行测试，无实际连接测试
   - 补全提供者无实际补全流程测试
   - 约 10 条 Lint 规则无测试
   - 数据库适配器仅测试断开状态

4. **部分功能体验待提升**
   - 查询超时不取消实际查询
   - USE 语句失败静默忽略
   - 数据编辑器默认只读
   - 执行计划缺少交互和对比

5. **可观测性不足**
   - 曾有 58 处静默 catch（v2.17 已审计改进）
   - 性能监控 Map 无界增长（PRD-016 #13）
   - 错误历史 shift() O(n)（PRD-016 #26）

---

# 第二部分：功能点补齐规划

## 5. 需求来源与识别方法

本规划的功能点来源于以下四个渠道的交叉验证：

| 来源 | 方法 | 产出 |
|------|------|------|
| **PRD 未完成项** | 对比 16 份 PRD 文档与当前实现 | 方言适配器、Lint 方言化等 |
| **上线前问题清单** | PRD-016 的 33 个问题（P0-P3） | 安全、稳定性、性能修复 |
| **竞品分析** | 对标 Navicat / DBeaver / DataGrip | 多方言连接、ER 图、数据同步等 |
| **用户反馈推断** | CHANGELOG 修复频率 + GitHub Issues 模式 | UX 优化、大文件性能等 |

### 5.1 竞品分析摘要

| 能力 | Navicat | DBeaver | DataGrip | SQL All in One（当前） | 差距 |
|------|---------|---------|----------|---------------------|------|
| 多数据库连接 | ✅ 15+ | ✅ 80+ | ✅ 30+ | ❌ 仅 MySQL | 极大 |
| ER 图 | ✅ | ✅ | ✅ | ❌ | 大 |
| 数据同步/传输 | ✅ | ✅ | ✅ | ❌ | 大 |
| 查询构建器 | ✅ | ✅ | ❌ | ❌ | 中 |
| 执行计划对比 | ✅ | ✅ | ✅ | ❌ | 中 |
| SQL 格式化 | 基础 | 基础 | 基础 | ✅ 40+ 选项 | **领先** |
| Lint 规则 | 少量 | 少量 | 中等 | ✅ 30 条 | **领先** |
| 智能补全 | 中等 | 中等 | 优秀 | ✅ 7 类 | 持平 |

**结论**：插件在 SQL 格式化、Lint、补全等**编辑器能力**上领先，但在**数据库连接广度**和**高级数据库工具**（ER 图、数据同步）上差距明显。

---

## 6. 待补充功能点清单与优先级

### 6.1 优先级排序依据

优先级按以下四维加权评分（每维 1-5 分，总分 4-20）：

| 维度 | 权重 | 说明 |
|------|------|------|
| 用户价值 | 35% | 解决用户痛点的程度、影响面 |
| 战略对齐 | 25% | 与"全方言数据库工具"定位的契合度 |
| 实现可行性 | 25% | 技术难度、依赖现有架构的程度 |
| 紧迫性 | 15% | 是否阻塞上线、竞品压力 |

### 6.2 功能点清单

| ID | 功能点 | 优先级 | 评分 | 类别 | 来源 |
|----|--------|--------|------|------|------|
| **G01** | PostgreSQL 适配器 | **P0** | 18 | 数据库扩展 | PRD-008 + 竞品 |
| **G02** | SQLite 适配器 | **P0** | 17 | 数据库扩展 | PRD-008 + 竞品 |
| **G03** | Lint 规则方言化 | **P0** | 16 | 编辑器增强 | PRD-002 M3 |
| **G04** | 查询超时取消实际查询 | **P0** | 16 | 稳定性修复 | PRD-016 #15 |
| **G05** | 测试覆盖补齐 | **P0** | 15 | 质量保障 | PRD-016 测试薄弱 |
| **G06** | Hive/Spark 适配器 | **P1** | 14 | 数据库扩展 | PRD-008 + 用户需求 |
| **G07** | 执行计划对比 | **P1** | 13 | 高级功能 | 竞品分析 |
| **G08** | ER 图可视化 | **P1** | 12 | 高级功能 | 竞品分析 |
| **G09** | 数据同步/传输 | **P1** | 12 | 高级功能 | 竞品分析 |
| **G10** | 查询构建器（可视化） | **P2** | 11 | 高级功能 | 竞品分析 |
| **G11** | 大文件性能优化 | **P2** | 11 | 性能优化 | 用户反馈推断 |
| **G12** | 数据编辑器 UX 提升 | **P2** | 10 | UX 优化 | 用户反馈推断 |
| **G13** | 性能监控 Map 限制 | **P2** | 9 | 稳定性修复 | PRD-016 #13 |
| **G14** | 错误历史环形缓冲 | **P3** | 8 | 稳定性修复 | PRD-016 #26 |
| **G15** | AI 辅助 SQL（自然语言转 SQL） | **P3** | 8 | 创新功能 | 行业趋势 |

### 6.3 优先级排序说明

- **P0（必须做）**：G01-G05 是补齐核心能力缺口和阻塞上线的问题，评分 15+，战略价值最高
- **P1（应该做）**：G06-G09 是缩小与竞品差距的关键功能，评分 12-14
- **P2（可以做）**：G10-G13 是提升体验和稳定性的优化项，评分 9-11
- **P3（暂缓）**：G14-G15 是锦上添花或探索性功能，评分 ≤8

---

## 7. 高优先级功能详细方案

### 7.1 G01 - PostgreSQL 适配器（P0）

**需求描述**

实现 PostgreSQL 数据库适配器，使插件支持 PostgreSQL 的连接、查询、元数据浏览、执行计划、表设计等全功能。

**技术方案**

复用现有 `IDatabaseAdapter` 四子接口架构，新建 `PostgresAdapter`：

```
src/database/adapters/
  ├── PostgresAdapter.ts          (主适配器，组合 4 子适配器)
  ├── PostgresConnectionAdapter.ts (pg.Pool 连接池)
  ├── PostgresQueryAdapter.ts     (查询执行、参数化、取消)
  ├── PostgresMetadataAdapter.ts  (pg_catalog 元数据查询)
  └── PostgresSchemaAdapter.ts    (DDL、EXPLAIN ANALYZE)
```

**实现需求**

1. **依赖**：引入 `pg` 库（`npm install pg`），esbuild 打包
2. **连接池**：使用 `pg.Pool`，支持 SSL、连接超时、最大连接数
3. **元数据查询**：
   - `listDatabases`：`SELECT datname FROM pg_database`
   - `listSchemas`：`SELECT schema_name FROM information_schema.schemata`
   - `listTables`：`SELECT * FROM information_schema.tables WHERE table_schema = $1`
   - `describeTable`：查询 `information_schema.columns` + `pg_indexes` + `pg_constraint`
4. **DDL 获取**：无原生 `SHOW CREATE`，需基于元数据拼接 DDL
5. **执行计划**：`EXPLAIN (FORMAT JSON, ANALYZE)` 解析
6. **标识符引用**：双引号 `"identifier"`（MySQL 用反引号）
7. **AdapterFactory 注册**：`AdapterFactory.register('postgresql', PostgresAdapter)`
8. **方言能力**：`supportsSchema: true`，`supportsMultipleDatabases: true`

**预期效果**

- 用户可添加 PostgreSQL 连接，浏览 schema/表/视图/函数
- 执行 SQL 查询，查看结果
- 查看表 DDL、执行计划
- 表设计器支持 PostgreSQL 数据类型

**验收标准**

- [ ] PostgreSQL 连接成功（密码/SSL）
- [ ] 数据库/Schema/表/视图/函数列表正确
- [ ] 表结构描述正确（列/索引/外键）
- [ ] DDL 生成正确
- [ ] 查询执行返回正确结果
- [ ] EXPLAIN 解析正确
- [ ] 标识符引用使用双引号
- [ ] 单元测试覆盖 ≥80%

---

### 7.2 G02 - SQLite 适配器（P0）

**需求描述**

实现 SQLite 数据库适配器，支持本地 SQLite 文件数据库的连接和查询。

**技术方案**

```
src/database/adapters/
  ├── SqliteAdapter.ts
  ├── SqliteConnectionAdapter.ts (better-sqlite3 同步库 + Promise 包装)
  ├── SqliteQueryAdapter.ts
  ├── SqliteMetadataAdapter.ts   (sqlite_master + PRAGMA)
  └── SqliteSchemaAdapter.ts
```

**实现需求**

1. **依赖**：引入 `better-sqlite3`（同步 API，性能优）或 `sqlite3`（异步），包装为 Promise
2. **连接**：文件路径作为 host，无用户名/密码/端口
3. **元数据**：
   - `listTables`：`SELECT name FROM sqlite_master WHERE type='table'`
   - `describeTable`：`PRAGMA table_info(table)` + `PRAGMA index_list(table)`
   - `getTableDDL`：`SELECT sql FROM sqlite_master WHERE name = ?`
4. **执行计划**：`EXPLAIN QUERY PLAN`（格式与 MySQL 不同）
5. **方言能力**：`supportsSchema: false`，`supportsMultipleDatabases: false`
6. **ConnectionDialog 适配**：SQLite 连接表单需隐藏端口/用户/密码字段，显示文件选择器

**预期效果**

- 用户可打开本地 `.sqlite`/`.db` 文件
- 浏览表、查看 DDL、执行查询
- 支持 PRAGMA 语句

**验收标准**

- [ ] SQLite 文件连接成功
- [ ] 表列表正确
- [ ] 表结构（PRAGMA）解析正确
- [ ] DDL 获取正确
- [ ] 查询执行正确
- [ ] EXPLAIN QUERY PLAN 解析正确
- [ ] 连接对话框适配文件选择

---

### 7.3 G03 - Lint 规则方言化（P0）

**需求描述**

将 30 条通用 Lint 规则改造为方言感知，并新增 20+ 条方言专属规则（PRD-002 M3）。

**技术方案**

扩展 `LintRule` 接口，增加 `applicableDialects` 字段：

```typescript
export interface LintRule {
    id: string;
    applicableTypes: AstNodeType[];
    applicableDialects?: string[];  // 新增：未指定则全方言适用
    check(node: AstNode, context: RuleContext): LintDiagnostic[];
}
```

`RuleRegistry.getRules()` 根据当前方言过滤规则。

**实现需求**

1. **现有规则方言化**：
   - `missing_primary_key`：Hive 外部表可豁免（已有 `externalTableExempt`）
   - `use_current_timestamp`：MySQL 用 `CURRENT_TIMESTAMP`，Hive 用 `current_timestamp`
   - `date_function_usage`：扩展到各方言日期函数差异
2. **新增方言专属规则**（20+ 条）：
   - MySQL：`sql_no_cache_usage`、`implicit_type_conversion`
   - PostgreSQL：`serial_vs_identity`、`array_vs_jsonb`
   - Hive：`partition_column_missing`、`external_table_without_location`
   - Spark：`cross_join_warning`、`rdd_api_deprecation`
3. **RuleContext 扩展**：增加 `dialect` 字段供规则判断

**预期效果**

- Lint 规则根据当前 SQL 方言智能适配
- 方言专属最佳实践规则帮助用户避免方言陷阱

**验收标准**

- [ ] `applicableDialects` 字段生效
- [ ] 30 条现有规则方言化改造完成
- [ ] 20+ 条新规则实现
- [ ] 规则测试覆盖每条新规则
- [ ] 配置编辑器展示方言专属规则

---

### 7.4 G04 - 查询超时取消实际查询（P0）

**需求描述**

查询超时或用户取消时，不仅 reject Promise，还需通过 `cancelQuery()` 终止数据库端实际查询（PRD-016 #15）。

**技术方案**

修改 [QueryExecutor.ts](file:///Users/hao/Downloads/sql-all-in-one/src/database/query/QueryExecutor.ts) 的 `raceExecution` 逻辑：

```typescript
private async raceExecution(
    execution: Promise<QueryResult>,
    token: CancellationToken,
    queryId: string,
    adapter: IQueryAdapter
): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
        const onCancel = async () => {
            try {
                await adapter.cancelQuery(queryId);
            } catch (e) {
                console.warn('Cancel query failed:', e);
            }
            reject(new Error('Query cancelled'));
        };
        token.onCancellationRequested(onCancel);
        execution.then(resolve, reject);
    });
}
```

**实现需求**

1. 超时触发时调用 `adapter.cancelQuery(queryId)`
2. 用户取消时同样调用
3. MySQL：`KILL QUERY <thread_id>`（已有实现）
4. PostgreSQL：`SELECT pg_cancel_backend(<pid>)`
5. SQLite：同步库不支持取消，需用 `interrupt()` API
6. 取消失败时记录警告但不阻塞 reject

**验收标准**

- [ ] 超时后数据库端查询被终止
- [ ] 用户取消后数据库端查询被终止
- [ ] 取消失败有日志记录
- [ ] 不影响其他查询

---

### 7.5 G05 - 测试覆盖补齐（P0）

**需求描述**

补齐 PRD-016 指出的测试薄弱环节。

**实现需求**

| 模块 | 当前状态 | 目标 | 测试方法 |
|------|---------|------|---------|
| SSH 隧道 | 97 行，无实际连接 | 集成测试 | mock ssh2 Client，测试连接/认证/转发/关闭 |
| 补全提供者 | 仅类型定义 | 流程测试 | 模拟文档+位置，验证补全项 |
| Lint 规则 | 10 条无测试 | 全覆盖 | 每条规则至少 1 正例 + 1 反例 |
| 数据库适配器 | 仅断开状态 | 连接/查询/元数据 | mock mysql2 Pool |
| 扩展激活 | 仅验证存在 | 完整激活流程 | 验证所有模块注册 |

**验收标准**

- [ ] SSH 隧道测试覆盖连接/认证/转发/异常
- [ ] 补全流程测试覆盖 7 类补全
- [ ] 30 条 Lint 规则全部有测试
- [ ] 适配器测试覆盖连接/查询/元数据
- [ ] 测试覆盖率 ≥70%（nyc 报告）

---

### 7.6 G06 - Hive/Spark 适配器（P1）

**需求描述**

实现 Hive 和 SparkSQL 适配器，支持通过 JDBC 连接 HiveServer2 / Spark Thrift Server。

**技术方案**

由于 Hive/Spark 无原生 Node.js 驱动，采用两种方案：
- **方案 A**：引入 `hiveserver2` 或 `thrift` 库实现 Thrift 协议
- **方案 B**：通过 JDBC 桥接（需 Java 运行时）

**实现需求**

1. Thrift 协议连接 HiveServer2
2. 元数据查询适配 Hive Metastore
3. DDL 获取：`SHOW CREATE TABLE`
4. 执行计划：`EXPLAIN`（文本格式，非 JSON）
5. 方言能力：`supportsExplainAnalyze: false`

**验收标准**

- [ ] HiveServer2 连接成功
- [ ] 数据库/表/分区列表正确
- [ ] DDL 获取正确
- [ ] 查询执行正确
- [ ] EXPLAIN 解析正确

---

### 7.7 G07 - 执行计划对比（P1）

**需求描述**

支持对比两个执行计划（优化前后），高亮差异节点。

**技术方案**

扩展 [ExplainPlanPanel.ts](file:///Users/hao/Downloads/sql-all-in-one/src/views/explainPlan/ExplainPlanPanel.ts)：

1. 保存历史执行计划（最近 5 个）
2. 双栏对比视图，左右各显示一个执行计划
3. 节点按 `id` 匹配，差异节点高亮（成本变化、扫描行数变化）
4. 顶部显示汇总差异（总成本变化、总扫描行数变化）

**验收标准**

- [ ] 可选择历史执行计划进行对比
- [ ] 双栏视图正确渲染
- [ ] 差异节点高亮
- [ ] 汇总差异正确

---

### 7.8 G08 - ER 图可视化（P1）

**需求描述**

基于数据库表和外键关系，生成 ER 图（实体关系图），支持交互式布局。

**技术方案**

新建 Webview Panel，使用 `mermaid.js` 或 `cytoscape.js` 渲染：

```
src/views/erDiagram/
  ├── ErDiagramPanel.ts
  ├── erDiagram.html
  ├── erDiagram.css
  └── erDiagram.js  (mermaid/cytoscape 集成)
```

**实现需求**

1. 查询所有表 + 外键关系
2. 生成 mermaid `erDiagram` 语法
3. 支持拖拽布局、缩放
4. 点击表节点跳转到表设计器
5. 支持导出 PNG/SVG

**验收标准**

- [ ] ER 图正确渲染表和外键关系
- [ ] 支持拖拽和缩放
- [ ] 点击表节点跳转
- [ ] 导出图片功能

---

### 7.9 G09 - 数据同步/传输（P1）

**需求描述**

支持在不同数据库之间同步/传输数据（源表 → 目标表）。

**技术方案**

扩展 [DataTransferDialog.ts](file:///Users/hao/Downloads/sql-all-in-one/src/views/dataTransfer/DataTransferDialog.ts)：

1. 选择源连接 + 源表
2. 选择目标连接 + 目标表（新建或现有）
3. 字段映射
4. 同步策略：全量覆盖 / 增量更新 / 仅新增
5. 批量读取 + 批量写入（流式）

**验收标准**

- [ ] 跨连接数据传输正确
- [ ] 字段映射可配置
- [ ] 同步策略生效
- [ ] 进度显示正确
- [ ] 大数据集（10万行）传输成功

---

## 8. 开发时间轴与资源分配

### 8.1 迭代规划

采用 4 个迭代，每迭代 4 周（1 个月），共 16 周（4 个月）。

```
迭代 1（第 1-4 周）：核心缺口补齐
├── G01 PostgreSQL 适配器
├── G02 SQLite 适配器
├── G04 查询超时取消
└── G05 测试覆盖补齐（并行）

迭代 2（第 5-8 周）：编辑器能力深化
├── G03 Lint 规则方言化
├── G06 Hive/Spark 适配器
└── G11 大文件性能优化

迭代 3（第 9-12 周）：高级数据库工具
├── G07 执行计划对比
├── G08 ER 图可视化
└── G09 数据同步/传输

迭代 4（第 13-16 周）：体验优化与创新
├── G10 查询构建器
├── G12 数据编辑器 UX
├── G13 性能监控 Map 限制
├── G14 错误历史环形缓冲
└── G15 AI 辅助 SQL（探索）
```

### 8.2 资源分配

假设 2 人团队（1 主开发 + 1 测试/辅助开发）：

| 迭代 | 主开发任务 | 测试任务 | 产出 |
|------|-----------|---------|------|
| 迭代 1 | G01 + G02 适配器实现 | G05 测试补齐 + G04 验证 | v3.0：多方言连接 |
| 迭代 2 | G03 Lint 方言化 + G06 Hive/Spark | G03 规则测试 + G11 性能基准 | v3.1：方言深化 |
| 迭代 3 | G07 + G08 + G09 高级功能 | 三个功能的集成测试 | v3.2：高级工具 |
| 迭代 4 | G10 + G15 创新功能 | G12-G14 优化验证 | v3.3：体验优化 |

### 8.3 里程碑

| 里程碑 | 时间 | 版本 | 关键交付 |
|--------|------|------|---------|
| M1 | 第 4 周末 | v3.0 | PostgreSQL + SQLite 支持，测试覆盖 ≥70% |
| M2 | 第 8 周末 | v3.1 | Lint 方言化，Hive/Spark 连接 |
| M3 | 第 12 周末 | v3.2 | ER 图、执行计划对比、数据同步 |
| M4 | 第 16 周末 | v3.3 | 查询构建器、AI 辅助（beta） |

---

## 9. 验收标准与测试方法

### 9.1 通用验收标准

每个功能点需满足以下通用标准：

| 类别 | 标准 | 验证方法 |
|------|------|---------|
| 功能完整性 | 实现 PRD 规定的所有验收项 | 手动测试 + 自动化测试 |
| 代码质量 | TypeScript 编译 0 错误，ESLint 0 错误 | `npx tsc --noEmit` + `npm run lint` |
| 测试覆盖 | 新增代码覆盖率 ≥80% | `npm run test:coverage`（nyc） |
| 性能达标 | 满足非功能需求性能指标 | 性能基准测试 |
| 国际化 | 所有用户可见文本走 i18n | 代码审查 |
| 安全 | 无 SQL 注入、XSS 风险 | 安全审计 + CSP 检查 |
| 兼容性 | 不破坏现有功能 | 回归测试 |

### 9.2 测试方法体系

```
测试金字塔
┌─────────────────┐
│   E2E 测试       │  少量：完整用户流程（激活→连接→查询→结果）
├─────────────────┤
│  集成测试        │  中量：模块间协作（适配器+连接管理+查询执行）
├─────────────────┤
│  单元测试        │  大量：单个类/函数（Lint 规则、格式化器、解析器）
└─────────────────┘
```

**具体测试命令**：

```bash
# 编译检查
npx tsc --noEmit

# Lint 检查
npm run lint

# 单元测试
npm test

# 覆盖率报告
npm run test:coverage

# 性能基准
node out/test/perf.benchmark.novscode.js
```

### 9.3 持续集成

沿用现有 [ci.yml](file:///Users/hao/Downloads/sql-all-in-one/.github/workflows/ci.yml) 流程：

1. `npm ci` - 安装依赖
2. `npx tsc --noEmit` - 类型检查
3. `npm run lint` - 代码规范
4. `npm run vscode:prepublish` - 生产构建
5. `xvfb-run -a npm test` - 测试（需 Xvfb 支持 VSCode）
6. `npm audit --omit=dev` - 安全审计
7. Codecov 覆盖率上传

**新增要求**：每个 PR 必须包含相应测试，覆盖率不得下降。

---

## 10. 风险评估与缓解措施

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Hive/Spark 无成熟 Node.js 驱动 | 中 | 高 | 优先实现 PostgreSQL/SQLite；Hive/Spark 降级为 P1 并调研 JDBC 桥接方案 |
| 多方言适配器测试环境复杂 | 高 | 中 | 使用 Docker Compose 启动各数据库实例；mock 优先，集成测试补充 |
| ER 图渲染性能（大数据库） | 中 | 中 | 限制渲染表数量（如 ≤50）；支持按 schema 过滤 |
| node-sql-parser 对新方言支持不足 | 低 | 中 | 评估方言兼容性；必要时扩展自定义 AST 处理 |
| AI 辅助 SQL 依赖外部 API | 中 | 低 | 设计为可选功能；支持本地模型（如 Ollama） |
| 测试覆盖率目标过高影响进度 | 中 | 低 | 分阶段提升：先 50% → 70% → 80% |

---

## 附录 A：技术栈与依赖

### 当前依赖

| 依赖 | 版本 | 用途 | 加载策略 |
|------|------|------|---------|
| `node-sql-parser` | ^5.4.0 | SQL 解析为 AST | 懒加载（首次解析时 require） |
| `mysql2` | ^3.22.4 | MySQL 驱动 | esbuild 打包 |
| `ssh2` | ^1.17.0 | SSH 隧道 | 懒加载（await import） |
| `monaco-editor` | ^0.45.0 | Webview 编辑器（dev） | 静态资源加载 |

### 规划新增依赖

| 依赖 | 用途 | 引入迭代 |
|------|------|---------|
| `pg` | PostgreSQL 驱动 | 迭代 1 |
| `better-sqlite3` | SQLite 驱动 | 迭代 1 |
| `mermaid` 或 `cytoscape` | ER 图渲染 | 迭代 3 |

---

## 附录 B：配置项演进规划

当前 80+ 配置项，规划新增：

| 配置项 | 类别 | 默认值 | 引入版本 |
|--------|------|--------|---------|
| `dialect.postgresql.defaultSchema` | 数据库 | `public` | v3.0 |
| `dialect.sqlite.dbFile` | 数据库 | - | v3.0 |
| `lint.dialectAware` | Lint | `true` | v3.1 |
| `erDiagram.maxTables` | ER 图 | `50` | v3.2 |
| `erDiagram.layout` | ER 图 | `auto` | v3.2 |
| `ai.enabled` | AI | `false` | v3.3 |
| `ai.provider` | AI | `openai` | v3.3 |

---

## 附录 C：与 PRD 文档的对应关系

| PRD 文档 | 状态 | 本规划对应功能 |
|---------|------|--------------|
| 001-注释功能增强 | ✅ 已完成 | - |
| 002-方言支持扩展 | ⚠️ 部分完成（M3 Lint 方言化未完成） | G03 |
| 003-格式化配置增强 | ✅ 已完成 | - |
| 004-中英双语国际化 | ✅ 已完成 | - |
| 005-悬停提示功能 | ✅ 已完成 | - |
| 006-SQL解析器引入 | ✅ 已完成 | - |
| 007-跳转与导航增强 | ✅ 已完成 | - |
| 008-数据库适配器层与连接管理 | ⚠️ 部分完成（仅 MySQL） | G01、G02、G06 |
| 009-侧边栏数据库浏览器 | ✅ 已完成 | - |
| 010-SQL执行引擎 | ✅ 已完成 | G04（超时取消修复） |
| 011-查询结果面板基础版 | ✅ 已完成 | - |
| 012-数据编辑器 | ✅ 已完成 | G12（UX 提升） |
| 013-Schema感知智能补全 | ✅ 已完成 | - |
| 014-表设计器 | ✅ 已完成 | - |
| 015-执行计划与高级功能 | ✅ 已完成 | G07（对比增强） |
| 016-上线前问题修复清单 | ⚠️ P0-P1 已修复，P2-P3 部分待修 | G04、G05、G13、G14 |

---

*本方案基于 v2.19.0 源码审计编制，将随迭代进展持续更新。*
