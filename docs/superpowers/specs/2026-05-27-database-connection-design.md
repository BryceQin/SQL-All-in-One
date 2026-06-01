# 数据库连接功能设计方案

> 日期：2026-05-27
> 项目：SQL All in One（VSCode 扩展）
> 状态：已确认
> 设计参考：Navicat Premium

---

## 一、设计理念

### 1.1 核心理念：Navicat 式一体化数据库开发体验

Navicat 之所以成为最受欢迎的数据库管理工具，核心在于其**一体化**设计理念——从连接管理、对象浏览、数据查看编辑、查询编写执行到数据导入导出，所有操作在同一个应用内无缝衔接，无需切换工具。

本设计将这一理念移植到 VSCode 扩展中，让 SQL All in One 从"离线 SQL 编辑增强工具"升级为"Navicat 级别的在线+离线一体化数据库开发平台"。

### 1.2 Navicat 功能对标矩阵

| Navicat 功能模块 | 本设计对应模块 | 优先级 |
|-----------------|--------------|--------|
| 连接管理（分组/颜色/配置文件/导入导出） | 连接管理层 | P0 |
| 对象浏览器（树形导航/虚拟组/收藏夹/筛选） | 侧边栏数据库浏览器 | P0 |
| 查询编辑器（语法高亮/代码补全/代码片段） | 现有补全 + Schema 补全增强 | P0 |
| 查询执行与结果查看 | SQL 执行与结果面板 | P0 |
| 数据编辑器（网格视图/表单视图/编辑提交） | 查询结果面板（可编辑模式） | P0 |
| 表设计器（字段/索引/外键/触发器/SQL预览） | 表设计器 | P1 |
| 数据查看器（BLOB/JSON/外键下拉/数据分析） | 数据查看器增强 | P1 |
| 可视化执行计划（EXPLAIN 可视化） | 执行计划面板 | P1 |
| 查询创建工具（可视化查询构建） | 可视化查询构建器 | P2 |
| 数据导入/导出向导 | 数据导入导出 | P1 |
| 数据传输与同步 | — | P2（远期） |
| ER 图表 | — | P2（远期） |
| 备份/还原 | — | P2（远期） |

### 1.3 方言支持策略

- 首期支持 MySQL（与 Navicat for MySQL 对标）
- 架构预留扩展性，新增数据库方言只需实现适配器，零侵入上层代码
- 后续按需扩展：PostgreSQL、SQLite、MariaDB 等

### 1.4 架构方案

采用**数据库抽象层 + 适配器模式**，与项目现有的 `dialectRegistry` + DI 容器 + 适配器模式一脉相承。

---

## 二、整体架构

### 2.1 模块划分

```
src/
├── database/                        # 数据库连接核心模块
│   ├── adapters/                    # 数据库适配器层
│   │   ├── IDatabaseAdapter.ts      # 适配器接口定义
│   │   ├── MysqlAdapter.ts          # MySQL 适配器实现
│   │   └── AdapterFactory.ts        # 适配器工厂
│   ├── connection/                  # 连接管理层
│   │   ├── ConnectionManager.ts     # 连接生命周期管理
│   │   ├── ConnectionConfig.ts      # 连接配置模型
│   │   ├── ConnectionStore.ts       # 连接信息存储（混合方案）
│   │   └── SshTunnel.ts            # SSH 隧道
│   ├── schema/                      # Schema 内省层
│   │   ├── SchemaProvider.ts        # Schema 信息提供者
│   │   └── SchemaCache.ts           # Schema 缓存
│   ├── query/                       # 查询执行层
│   │   ├── QueryExecutor.ts         # 查询执行器
│   │   ├── QueryResult.ts           # 查询结果模型
│   │   ├── SqlStatementDetector.ts  # SQL 语句智能识别
│   │   ├── SafeQueryGuard.ts        # 危险 SQL 拦截
│   │   └── ExplainPlan.ts          # 执行计划解析
│   ├── history/                     # 查询历史
│   │   └── QueryHistory.ts          # 查询历史管理
│   ├── transfer/                    # 数据传输
│   │   ├── DataExporter.ts          # 数据导出
│   │   └── DataImporter.ts          # 数据导入
│   └── DatabaseModule.ts            # 模块入口，DI 注册
├── views/                           # UI 视图层
│   ├── databaseExplorer/            # 侧边栏数据库浏览器
│   │   ├── DatabaseTreeProvider.ts  # 树形视图 Provider
│   │   ├── treeNodes.ts            # 树节点定义
│   │   └── objectFilters.ts        # 对象筛选器
│   ├── queryResult/                 # 查询结果 Webview（Navicat 数据编辑器）
│   │   ├── QueryResultPanel.ts      # Webview 面板管理
│   │   ├── resultPanel.html
│   │   ├── resultPanel.css
│   │   └── resultPanel.js
│   ├── tableDesigner/               # 表设计器（Navicat Table Designer）
│   │   ├── TableDesignerPanel.ts
│   │   ├── designerPanel.html
│   │   ├── designerPanel.css
│   │   └── designerPanel.js
│   ├── explainPlan/                 # 执行计划面板
│   │   ├── ExplainPlanPanel.ts
│   │   ├── explainPanel.html
│   │   ├── explainPanel.css
│   │   └── explainPanel.js
│   ├── connectionDialog/            # 连接配置对话框
│   │   ├── ConnectionDialog.ts
│   │   ├── dialog.html
│   │   ├── dialog.css
│   │   └── dialog.js
│   ├── dataTransfer/                # 数据导入导出向导
│   │   ├── DataTransferDialog.ts
│   │   ├── transferDialog.html
│   │   ├── transferDialog.css
│   │   └── transferDialog.js
│   └── queryBuilder/               # 可视化查询构建器（P2）
│       ├── QueryBuilderPanel.ts
│       ├── builderPanel.html
│       ├── builderPanel.css
│       └── builderPanel.js
```

### 2.2 数据流

```
用户操作 → 命令/Provider → ConnectionManager → IDatabaseAdapter → 数据库
                                                    ↓
                                            SchemaProvider / QueryExecutor
                                                    ↓
                              TreeProvider / QueryResultPanel / SchemaCompletionProvider
                              TableDesignerPanel / ExplainPlanPanel / DataTransferDialog
```

---

## 三、数据库适配器层

### 3.1 IDatabaseAdapter 接口

```typescript
interface IDatabaseAdapter {
  readonly dialect: string;

  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  testConnection(config: ConnectionConfig): Promise<TestConnectionResult>;

  executeQuery(sql: string, params?: QueryParam[]): Promise<QueryResult>;
  executeUpdate(sql: string, params?: QueryParam[]): Promise<UpdateResult>;

  listDatabases(): Promise<DatabaseInfo[]>;
  listSchemas(database: string): Promise<SchemaInfo[]>;
  listTables(database: string, schema?: string, filter?: ObjectFilter): Promise<TableInfo[]>;
  listViews(database: string, schema?: string): Promise<ViewInfo[]>;
  listFunctions(database: string, schema?: string): Promise<FunctionInfo[]>;
  listProcedures(database: string, schema?: string): Promise<ProcedureInfo[]>;
  listTriggers(database: string, schema?: string): Promise<TriggerInfo[]>;
  describeTable(database: string, table: string, schema?: string): Promise<TableStructure>;
  getTableDDL(database: string, table: string, schema?: string): Promise<string>;
  getViewDDL(database: string, view: string, schema?: string): Promise<string>;

  getExplainPlan(database: string, sql: string): Promise<ExplainResult>;
  getTableRowCount(database: string, table: string, schema?: string): Promise<number>;

  getDialectCapabilities(): DialectCapabilities;
}

interface TestConnectionResult {
  success: boolean;
  serverVersion?: string;
  error?: string;
}

interface DialectCapabilities {
  supportsSchema: boolean;
  supportsMultipleDatabases: boolean;
  maxConcurrentQueries: number;
  supportsPreparedStatement: boolean;
  supportsExplain: boolean;
  supportsExplainAnalyze: boolean;
  supportsCancel: boolean;
  supportsSshTunnel: boolean;
  supportedObjectTypes: ObjectType[];
}

type ObjectType = 'table' | 'view' | 'function' | 'procedure' | 'trigger' | 'event' | 'index';

interface ObjectFilter {
  keyword?: string;
  type?: ObjectType;
}

interface TableStructure {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
  triggers: TriggerInfo[];
  ddl: string;
  rowCount: number;
  engine?: string;
  charset?: string;
  collation?: string;
  comment?: string;
}

interface ColumnInfo {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  defaultValue?: string | null;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  isUnique: boolean;
  comment?: string;
  extra?: string;
  enumValues?: string[];
  referencedTable?: string;
  referencedColumn?: string;
}

interface IndexInfo {
  name: string;
  type: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  comment?: string;
}

interface ForeignKeyInfo {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string;
  onUpdate: string;
}

interface TriggerInfo {
  name: string;
  event: string;
  timing: string;
  statement: string;
}
```

### 3.2 MySQL 适配器实现

- 驱动：`mysql2/promise`（支持异步/Promise）
- 内部维护连接池（`mysql2.createPool`），而非单连接
- 连接池参数：`connectionLimit: 5`，`connectTimeout: 10000`

| 方法 | SQL |
|------|-----|
| `testConnection()` | `SELECT VERSION()` |
| `listDatabases()` | `SHOW DATABASES` |
| `listTables()` | `SHOW TABLE STATUS FROM xxx` + `SHOW FULL TABLES FROM xxx WHERE Table_type = 'BASE TABLE'` |
| `listViews()` | `SHOW FULL TABLES FROM xxx WHERE Table_type = 'VIEW'` |
| `listFunctions()` | `SHOW FUNCTION STATUS WHERE Db = xxx` |
| `listProcedures()` | `SHOW PROCEDURE STATUS WHERE Db = xxx` |
| `listTriggers()` | `SHOW TRIGGERS FROM xxx` |
| `describeTable()` | `SHOW COLUMNS FROM xxx` + `SHOW INDEX FROM xxx` + `INFORMATION_SCHEMA` |
| `getTableDDL()` | `SHOW CREATE TABLE xxx` |
| `getViewDDL()` | `SHOW CREATE VIEW xxx` |
| `getExplainPlan()` | `EXPLAIN FORMAT=JSON xxx` |
| `getTableRowCount()` | `SHOW TABLE STATUS LIKE 'xxx'`（近似值，大表不 COUNT） |

### 3.3 适配器工厂

```typescript
class AdapterFactory {
  private static adapters = new Map<string, new (poolConfig: any) => IDatabaseAdapter>();

  static register(dialect: string, adapterClass: new (poolConfig: any) => IDatabaseAdapter): void;
  static create(dialect: string, poolConfig: any): IDatabaseAdapter;
}
```

扩展新数据库时：
1. 新增适配器文件（如 `PostgresAdapter.ts`）实现 `IDatabaseAdapter`
2. 调用 `AdapterFactory.register('postgresql', PostgresAdapter)`
3. 在 `dialectRegistry` 中注册对应方言

---

## 四、连接管理层

### 4.1 连接配置模型

```typescript
interface ConnectionConfig {
  id: string;
  name: string;
  dialect: string;
  group?: string;
  color?: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  database?: string;
  ssl?: SSLConfig;
  ssh?: SshConfig;
  connectTimeout?: number;
  options?: Record<string, any>;
}

interface SSLConfig {
  enabled: boolean;
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

interface SshConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  authentication: 'password' | 'privateKey';
  password?: string;
  privateKey?: string;
  passphrase?: string;
}
```

**Navicat 对标**：
- `color` — Navicat 的"自定义连接颜色"，在树视图中用颜色标识不同连接，快速区分开发/测试/生产环境
- `ssh` — Navicat 的"SSH 隧道"功能，通过 SSH 跳板机连接数据库
- `ssl` — Navicat 的"SSL 安全连接"

### 4.2 混合存储方案

**连接元数据**（不含密码）→ 用户级配置文件 `~/.sql-all-in-one/connections.json`：

```json
{
  "version": 1,
  "groups": [
    { "name": "开发环境", "color": "#4CAF50" },
    { "name": "测试环境", "color": "#FF9800" },
    { "name": "生产环境", "color": "#F44336" }
  ],
  "connections": [
    {
      "id": "uuid-xxx",
      "name": "开发库-MySQL",
      "dialect": "mysql",
      "group": "开发环境",
      "color": "#4CAF50",
      "host": "127.0.0.1",
      "port": 3306,
      "username": "root",
      "database": "mydb",
      "ssl": { "enabled": false },
      "ssh": { "enabled": false },
      "connectTimeout": 10000
    }
  ]
}
```

**密码** → VSCode SecretStorage API 加密存储：
- Key 格式：`sql-all-in-one.password.{connectionId}`
- SSH 密码/密钥同样通过 SecretStorage 存储
- 连接时从 SecretStorage 读取密码，注入到连接配置
- 密码永不出现在明文配置中

**Navicat 对标**：Navicat 的"导出/导入连接设置"功能

```typescript
class ConnectionStore {
  exportConnections(filePath: string, includePasswords: boolean): Promise<void>;
  importConnections(filePath: string): Promise<ImportResult>;
}
```

- 导出时可选是否包含密码（包含密码时文件加密）
- 导入时检测冲突（同名连接），提供覆盖/跳过/重命名选项

### 4.3 ConnectionManager

```typescript
class ConnectionManager {
  private activeConnections: Map<string, IDatabaseAdapter>;
  private connectionStates: Map<string, ConnectionState>;
  private activeConnectionId: string | undefined;

  addConnection(config: ConnectionConfig, password: string): Promise<void>;
  removeConnection(id: string): Promise<void>;
  updateConnection(id: string, config: ConnectionConfig): Promise<void>;
  connect(id: string): Promise<void>;
  disconnect(id: string): Promise<void>;
  disconnectAll(): Promise<void>;
  testConnection(id: string): Promise<TestConnectionResult>;

  getAdapter(id: string): IDatabaseAdapter | undefined;
  getState(id: string): ConnectionState;
  getAllConnections(): ConnectionConfig[];
  getActiveConnection(): ConnectionConfig | undefined;
  setActiveConnection(id: string): void;

  onDidChangeConnections: Event<ConnectionChangeEvent>;
  onDidChangeConnectionState: Event<ConnectionStateChangeEvent>;
  onDidChangeActiveConnection: Event<ActiveConnectionChangeEvent>;
}

enum ConnectionState {
  Disconnected,
  Connecting,
  Connected,
  Error
}
```

### 4.4 SSH 隧道

**Navicat 对标**：Navicat 的"SSH 隧道"功能，用于通过跳板机连接内网数据库。

```typescript
class SshTunnel {
  private tunnel: SshTunnelConfig;

  async open(config: SshConfig, targetHost: string, targetPort: number): Promise<TunnelResult>;
  async close(): Promise<void>;
  getLocalPort(): number;
  isOpen(): boolean;
}

interface TunnelResult {
  localHost: string;
  localPort: number;
}
```

- 使用 `ssh2` 库建立 SSH 隧道
- 连接流程：先建立 SSH 隧道 → 获取本地映射端口 → 通过本地端口连接数据库
- 隧道生命周期与数据库连接绑定，断开连接时自动关闭隧道

### 4.5 关键设计决策

- **懒连接**：添加连接配置后不立即建立连接，用户点击"连接"时才建立（与 Navicat 行为一致）
- **自动重连**：连接断开后自动重试 3 次，间隔 2s/4s/8s（指数退避）
- **扩展停用时清理**：在 `deactivate()` 中调用 `disconnectAll()` 释放所有连接和 SSH 隧道
- **连接状态事件驱动**：状态变化通过事件通知 UI 层更新
- **活动连接**：记录当前活动连接，用于 SQL 执行和补全（Navicat 中当前选中的连接即为活动连接）
- **连接颜色标识**：树视图中连接节点和查询标签页均显示连接颜色，快速区分环境

---

## 五、侧边栏数据库浏览器

### 5.1 树形视图结构（Navicat 对标）

Navicat 的对象浏览器是左侧面板的核心，按"连接 → 数据库 → 对象类型 → 对象"层级展示，支持虚拟组、收藏夹、对象筛选。

```
📦 SQL All in One
├── 🔍 搜索对象...                     ← 全局搜索框
├── ⭐ 收藏夹                          ← 收藏夹（Navicat Favorites）
│   ├── 📋 users
│   └── 📋 orders
├── 📁 开发环境 🟢                     ← 连接分组（带颜色标识）
│   ├── 🔌 开发库-MySQL 🟢 [已连接]    ← 连接节点（带颜色圆点）
│   │   ├── 📂 mydb                    ← 数据库节点
│   │   │   ├── 📋 表 (12)            ← 表分组（显示数量）
│   │   │   │   ├── 📋 users          ← 表节点
│   │   │   │   │   ├── 🔑 id INT PK AI
│   │   │   │   │   ├── 📧 email VARCHAR(255) UK
│   │   │   │   │   ├── 📅 created_at DATETIME
│   │   │   │   │   └── 📊 索引 (2)
│   │   │   │   │       ├── idx_email (UNIQUE)
│   │   │   │   │       └── idx_created_at
│   │   │   │   ├── 📋 orders
│   │   │   │   └── 📋 products
│   │   │   ├── 👁 视图 (3)           ← 视图分组
│   │   │   │   └── v_order_summary
│   │   │   ├── ⚡ 函数 (5)           ← 函数分组
│   │   │   │   └── fn_calc_total
│   │   │   ├── ⚙ 存储过程 (2)       ← 存储过程分组
│   │   │   │   └── sp_sync_data
│   │   │   └── 🔔 触发器 (1)         ← 触发器分组
│   │   │       └── trg_before_insert
│   │   └── 📂 information_schema
│   └── 🔌 测试库-MySQL ⚪ [未连接]
├── 📁 生产环境 🔴
│   └── 🔌 主库-MySQL ⚪ [未连接]
└── ＋ 添加新连接
```

**与 Navicat 的关键差异**：Navicat 是独立窗口应用，有更大的空间展示对象标签页（Tables/Views/Functions 等作为平级标签）。在 VSCode 侧边栏中，我们采用**分组折叠**方式，将对象类型作为数据库节点下的子分组，更适配窄面板。

### 5.2 DatabaseTreeProvider

```typescript
class DatabaseTreeProvider implements TreeDataProvider<TreeNode> {
  getChildren(element?: TreeNode): ProviderResult<TreeNode[]>;
  getTreeItem(element: TreeNode): TreeItem;
  getParent(element: TreeNode): ProviderResult<TreeNode>;

  refresh(element?: TreeNode): void;
}

type TreeNode =
  | GroupNode
  | ConnectionNode
  | DatabaseNode
  | ObjectGroupNode
  | TableNode
  | ViewNode
  | FunctionNode
  | ProcedureNode
  | TriggerNode
  | ColumnNode
  | IndexNode;
```

### 5.3 右键菜单操作（Navicat 对标）

| 节点类型 | 右键操作 |
|---------|---------|
| 分组节点 | 新建连接、重命名分组、删除分组、设置分组颜色 |
| 连接节点 | 连接/断开、编辑连接、复制连接、删除连接、刷新全部、新建查询、命令行界面 |
| 数据库节点 | 设为默认数据库、新建查询、转储 SQL 文件、运行 SQL 文件、导出数据 |
| 表分组节点 | 新建表、筛选表 |
| 表节点 | 打开表（查看数据）、设计表、查看 DDL、生成 SQL（SELECT/INSERT/UPDATE/DELETE）、转储数据、添加到收藏夹 |
| 视图节点 | 打开视图、查看定义、设计视图 |
| 函数节点 | 查看定义、编辑函数 |
| 存储过程节点 | 查看定义、编辑存储过程 |
| 触发器节点 | 查看定义、编辑触发器 |
| 列节点 | 复制列名、复制列定义 |

**Navicat 对标**：
- "打开表" — Navicat 双击表直接打开数据视图
- "设计表" — Navicat 的 Table Designer
- "转储 SQL 文件" — Navicat 的 Dump SQL File
- "运行 SQL 文件" — Navicat 的 Run SQL File
- "命令行界面" — Navicat 的 Command Line Interface（在 VSCode 终端中打开 mysql CLI）
- "添加到收藏夹" — Navicat 的 Favorites

### 5.4 快捷操作（Navicat 对标）

| 操作 | Navicat 行为 | 本设计实现 |
|------|-------------|-----------|
| 双击表 | 打开表数据视图 | 自动生成 `SELECT * FROM table LIMIT 100` 并在结果面板展示 |
| 双击视图 | 打开视图数据 | 同上 |
| 双击列 | — | 复制列名到剪贴板 |
| 拖拽表名到编辑器 | — | 插入表名 |
| 右键表 → 生成 SQL | Navicat 生成 SQL 模板 | 子菜单：SELECT / INSERT / UPDATE / DELETE / CREATE / DROP |
| 右键数据库 → 新建查询 | Navicat 在该数据库上下文中新建查询 | 新建 .sql 文件并自动添加 `USE database` |
| Ctrl+Q | Navicat 新建查询 | 新建查询（自动设置连接上下文） |

### 5.5 对象搜索（Navicat 对标）

Navicat 的"数据库范围搜索"功能，在所有数据库对象中搜索关键字。

```typescript
class ObjectSearchService {
  async search(
    connectionId: string,
    keyword: string,
    options: SearchOptions
  ): Promise<SearchResult[]>;
}

interface SearchOptions {
  scope: 'database' | 'allDatabases';
  objectTypes: ObjectType[];
  searchIn: ('name' | 'definition' | 'comment')[];
}

interface SearchResult {
  database: string;
  objectType: ObjectType;
  objectName: string;
  matchField: string;
  matchContext: string;
}
```

- 在树视图顶部提供搜索框
- 搜索结果以列表形式展示，点击可跳转到对应的树节点或打开对象

### 5.6 关键设计

- **懒加载**：只在节点展开时才请求子节点数据（Navicat 同样采用懒加载）
- **Schema 缓存**：已加载的 Schema 信息缓存，减少数据库查询
- **图标差异化**：PK 用钥匙图标、UK 用盾牌、FK 用链接图标、普通列用圆点
- **状态指示**：连接节点显示连接状态（已连接🟢/未连接⚪/错误🔴），颜色与连接配置中的 `color` 一致
- **连接分组**：支持按分组（开发环境/生产环境等）组织连接，分组可设置颜色
- **收藏夹**：常用表/视图可添加到收藏夹，快速访问
- **对象数量**：分组节点显示对象数量，如"表 (12)"
- **表注释**：表节点悬停时显示 COMMENT 信息

---

## 六、SQL 执行与查询结果面板

### 6.1 查询执行流程

```
1. 用户在编辑器中选中 SQL 或光标位于某条 SQL 内
2. 按快捷键 Ctrl+R（Navicat 快捷键）或 Ctrl+Shift+E
3. 命令处理器：
   a. 识别当前活动连接（状态栏显示 / 树视图选中 / 查询标签页绑定）
   b. 提取要执行的 SQL：
      - 有选区 → 执行选区内容（Navicat: Ctrl+Shift+R）
      - 无选区 → 执行光标所在语句（Navicat: Ctrl+R）
   c. SafeQueryGuard 检查危险 SQL
   d. 调用 QueryExecutor.execute(adapter, sql)
4. 执行期间：编辑器中对应 SQL 高亮为"执行中"状态，结果面板显示 loading
5. 执行完成：结果面板展示查询结果
6. 执行失败：结果面板"消息"标签展示错误信息，包含 SQL 错误位置
7. 记录查询历史
```

### 6.2 SQL 语句智能识别

```typescript
class SqlStatementDetector {
  detectCurrentStatement(
    document: TextDocument,
    position: Position
  ): DetectedStatement;

  detectAllStatements(document: TextDocument): DetectedStatement[];
}

interface DetectedStatement {
  sql: string;
  range: Range;
  type: StatementType;
}
```

复用项目已有的 `SqlParserEngine` 和 `DocumentAstCache` 做 AST 级别的语句识别。比 Navicat 基于分号的简单分割更准确。

### 6.3 QueryExecutor

```typescript
class QueryExecutor {
  private runningQueries: Map<string, CancellationTokenSource>;

  async execute(
    adapter: IDatabaseAdapter,
    sql: string,
    options?: QueryOptions
  ): Promise<QueryResult>;

  cancel(queryId: string): void;

  onDidStartQuery: Event<QueryStartEvent>;
  onDidEndQuery: Event<QueryEndEvent>;
}

interface QueryOptions {
  maxRows: number;
  timeout: number;
  params?: QueryParam[];
  database?: string;
}

interface QueryResult {
  queryId: string;
  status: 'success' | 'error' | 'cancelled';
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  rowCount: number;
  totalRowCount?: number;
  affectedRows?: number;
  executionTime: number;
  error?: QueryError;
  database: string;
}

interface ColumnMeta {
  name: string;
  type: string;
  length?: number;
  nullable: boolean;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  isEnum: boolean;
  enumValues?: string[];
  referencedTable?: string;
  referencedColumn?: string;
  comment?: string;
}
```

### 6.4 Tab 式多查询管理（Navicat 对标）

Navicat 的核心交互模式：每个查询在独立标签页中打开，标签页绑定到特定连接和数据库。

```
┌─────────────────────────────────────────────────────────────┐
│ [查询1.sql 🔴] [查询2.sql 🔵] [+]                          │  ← 标签页（🔴🔵为连接颜色）
├─────────────────────────────────────────────────────────────┤
│ 连接: [开发库-MySQL 🔴 ▼]  数据库: [mydb ▼]                 │  ← 连接/数据库选择器
├─────────────────────────────────────────────────────────────┤
│ SELECT u.id, u.name, o.total                               │
│ FROM users u                                                │  ← SQL 编辑区
│ JOIN orders o ON u.id = o.user_id                           │
│ WHERE o.total > 100;                                        │
├─────────────────────────────────────────────────────────────┤
│ [结果集] [消息] [历史] [执行计划]                             │  ← 结果区标签
├─────────────────────────────────────────────────────────────┤
│  id  │ name  │ total │                                      │
│  1   │ Alice │  250  │                                      │  ← 结果面板
│  2   │ Bob   │  180  │                                      │
├─────────────────────────────────────────────────────────────┤
│ 记录数: 2  耗时: 0.023s                                      │  ← 状态栏
└─────────────────────────────────────────────────────────────┘
```

每个查询标签页独立维护：
- 各自的 SQL 内容（对应一个 .sql 文件）
- 各自的查询结果
- 各自绑定的数据库连接（标签页显示连接颜色）
- 各自的活动数据库
- 关闭标签页时提示是否保存

**连接/数据库选择器**：
- 编辑器顶部工具栏显示当前连接和数据库
- 可通过下拉切换连接和数据库
- 切换连接后，补全和 Schema 信息自动更新

### 6.5 Webview 查询结果面板（Navicat 数据编辑器对标）

Navicat 的数据编辑器是其最核心的功能之一，支持网格视图、表单视图、数据编辑、外键下拉、数据分析等。

**布局**：

```
┌──────────────────────────────────────────────────────────────┐
│ 📊 查询结果 - 开发库-MySQL 🔴                    耗时: 23ms  │
├──────────────────────────────────────────────────────────────┤
│ 工具栏:                                                      │
│ [▶ 执行] [⏹ 取消] [🔄 刷新]                                 │
│ [📥 导出▼] [🔍 筛选] [🔍 查找替换]                           │
│ [📝 编辑模式] [✅ 提交更改] [↩ 回滚更改] [＋ 添加行] [🗑 删除行]│
├──────────┬──────────┬──────────┬─────────────────────────────┤
│ ▶ │ id   │ name     │ email    │ created_at                  │
│   │ INT🔑│ VARCHAR  │ VARCHAR🛡│ DATETIME                    │
├──────────┼──────────┼──────────┼─────────────────────────────┤
│ ▶ │ 1    │ Alice    │ a@b.com  │ 2024-01-01 00:00            │
│ ▶ │ 2*   │ Bob_     │ b@b.com  │ 2024-01-02 00:00            │  ← *标记已修改
│ ▶ │ +    │          │          │                              │  ← 新行占位
├──────────┴──────────┴──────────┴─────────────────────────────┤
│ [结果集] [消息] [历史] [执行计划]                              │
├──────────────────────────────────────────────────────────────┤
│ 显示 1-100 / 共 1,234 行  [上一页] [1] [2] ... [13] [下一页]  │
│ 待提交: 1 修改, 0 新增, 0 删除    [✅ 提交] [↩ 回滚]         │
└──────────────────────────────────────────────────────────────┘
```

**四标签切换**：

| 标签 | 功能 | Navicat 对标 |
|------|------|-------------|
| **结果集** | 表格展示查询结果，支持排序/筛选/编辑 | Navicat 数据编辑器的 Grid View |
| **消息** | 执行日志、错误信息、影响行数 | Navicat 的消息面板 |
| **历史** | 当前会话查询历史，可点击重新执行 | Navicat 的查询历史 |
| **执行计划** | EXPLAIN 结果可视化 | Navicat 的可视化解释 |

**核心交互功能**：

| 功能 | 说明 | Navicat 对标 |
|------|------|-------------|
| 虚拟滚动 | 大数据集（1000+行）使用虚拟滚动，只渲染可见行 | Navicat 网格视图 |
| 列排序 | 点击列头排序，支持升序/降序/取消 | Navicat 排序 |
| 列筛选 | Navicat 风格筛选栏，支持多条件组合 | Navicat 筛选 |
| 分页 | 默认每页 100 行，分页加载 | Navicat 分页 |
| 导出 | CSV / JSON / SQL INSERT / SQL DDL / Excel | Navicat 导出向导 |
| 单元格编辑 | 双击进入编辑，回车提交，Esc 取消 | Navicat 数据编辑 |
| 批量提交 | 多个修改可批量提交（生成 UPDATE/INSERT/DELETE） | Navicat 提交更改 |
| 行操作 | 插入新行、删除行 | Navicat 添加/删除记录 |
| NULL 高亮 | NULL 值灰色斜体显示，与空字符串区分 | Navicat NULL 显示 |
| 类型图标 | 列头显示数据类型图标 | Navicat 数据类型颜色 |
| 单元格复制 | 选中单元格后 Ctrl+C 复制 | Navicat 复制 |
| 查找替换 | 在结果集中查找/替换数据 | Navicat 查找和替换 |
| 外键下拉 | 外键列显示下拉选择器，列出引用表的值 | Navicat 外键数据选择 |
| ENUM 选择器 | ENUM/SET 类型列显示下拉选择器 | Navicat SET/ENUM 选择器 |
| BLOB 预览 | BLOB 列显示预览按钮（文本/十六进制/图片） | Navicat BLOB 查看器 |
| 修改标记 | 已修改的行/单元格用颜色标记 | Navicat 修改标记 |
| 表单视图 | 切换为单行表单视图，逐条浏览记录 | Navicat 表单视图 |
| 自定义数据类型颜色 | 不同数据类型的列头用不同颜色标识 | Navicat 自定义数据类型颜色 |

**Navicat 风格筛选栏**：

```
┌──────────────────────────────────────────────────────────────┐
│ 筛选: [列名 ▼] [运算符 ▼] [值________] [＋添加条件] [应用]   │
│       status     =        'active'                            │
│       age        >        18                                  │
│                                                               │
│ 运算符选项: =, !=, >, <, >=, <=, LIKE, NOT LIKE, IN,         │
│            NOT IN, IS NULL, IS NOT NULL, BETWEEN              │
└──────────────────────────────────────────────────────────────┘
```

**Navicat 表单视图**：

```
┌──────────────────────────────────────────────────────────┐
│ [◀ 上一条] [1/1234] [下一条 ▶]  [网格视图] [表单视图]    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  id:         1                                           │
│  name:       Alice                                       │
│  email:      a@b.com                                     │
│  status:     [active ▼]          ← ENUM 下拉选择器       │
│  dept_id:    [3 ▼]               ← 外键下拉选择器        │
│  avatar:     [查看图片]           ← BLOB 预览按钮        │
│  bio:        Lorem ipsum...      ← TEXT 展开编辑器       │
│  created_at: 2024-01-01 00:00                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**单元格编辑模型**：

```typescript
interface EditableResultGrid {
  editMode: 'readonly' | 'editable';

  startEdit(row: number, col: number): void;
  commitEdit(row: number, col: number, value: any): void;
  cancelEdit(): void;

  pendingChanges: PendingChange[];
  commitAll(): Promise<void>;
  rollbackAll(): void;

  insertRow(): void;
  deleteRow(row: number): void;

  getForeignKeyOptions(column: ColumnMeta): Promise<ForeignKeyOption[]>;
  getEnumValues(column: ColumnMeta): string[];
}

interface PendingChange {
  type: 'update' | 'insert' | 'delete';
  table: string;
  primaryKey: Record<string, any>;
  changes?: Record<string, { old: any; new: any }>;
}

interface ForeignKeyOption {
  value: any;
  displayText: string;
}
```

### 6.6 可视化执行计划（Navicat 对标）

Navicat 的"可视化解释"功能，将 EXPLAIN 结果以图形化方式展示。

```typescript
class ExplainPlanService {
  async getExplainPlan(
    adapter: IDatabaseAdapter,
    database: string,
    sql: string
  ): Promise<ExplainResult>;
}

interface ExplainResult {
  format: 'json' | 'text' | 'visual';
  raw: any;
  nodes: ExplainNode[];
}

interface ExplainNode {
  id: number;
  operation: string;
  table?: string;
  rows?: number;
  cost?: number;
  key?: string;
  extra?: string;
  children: ExplainNode[];
}
```

**执行计划面板布局**：

```
┌──────────────────────────────────────────────────────────┐
│ 执行计划 - SELECT * FROM users WHERE status = 'active'   │
├──────────────────────────────────────────────────────────┤
│ [可视化] [表格] [JSON]                                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐                                        │
│  │ SELECT       │  扫描行: 1234  成本: 0.35               │
│  └──────┬───────┘                                        │
│         │                                                │
│  ┌──────┴───────┐                                        │
│  │ TABLE SCAN   │  users  使用索引: idx_status            │
│  │ (ref)        │  扫描行: 56  成本: 0.12                 │
│  └──────────────┘                                        │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ 优化建议: 考虑添加复合索引 (status, created_at)           │
└──────────────────────────────────────────────────────────┘
```

- **可视化视图**：以树形/流程图展示执行计划节点，节点大小反映成本
- **表格视图**：传统 EXPLAIN 结果表格
- **JSON 视图**：原始 EXPLAIN FORMAT=JSON 输出

### 6.7 Webview 通信协议

```typescript
type ExtensionMessage =
  | { type: 'queryResult'; data: QueryResult }
  | { type: 'queryStart'; data: { sql: string } }
  | { type: 'queryError'; data: QueryError }
  | { type: 'exportData'; data: ExportPayload }
  | { type: 'explainResult'; data: ExplainResult }
  | { type: 'foreignKeyOptions'; data: { column: string; options: ForeignKeyOption[] } }
  | { type: 'commitResult'; data: { success: boolean; errors?: string[] } };

type WebviewMessage =
  | { type: 'executeQuery'; data: { sql: string } }
  | { type: 'cancelQuery' }
  | { type: 'requestExport'; data: { format: ExportFormat; table?: string } }
  | { type: 'requestSort'; data: { column: string; direction: 'asc' | 'desc' | 'none' } }
  | { type: 'requestFilter'; data: FilterCondition[] }
  | { type: 'commitChanges'; data: PendingChange[] }
  | { type: 'requestPage'; data: { page: number } }
  | { type: 'requestForeignKeyOptions'; data: { column: string } }
  | { type: 'requestExplain'; data: { sql: string } }
  | { type: 'findInResults'; data: { keyword: string; replace?: string } }
  | { type: 'switchView'; data: { view: 'grid' | 'form' } };

type ExportFormat = 'csv' | 'json' | 'insert' | 'ddl' | 'excel' | 'xml';

interface FilterCondition {
  column: string;
  operator: string;
  value: string;
}
```

---

## 七、表设计器（Navicat Table Designer 对标）

Navicat 的表设计器是一个功能丰富的可视化工具，支持字段、索引、外键、触发器的可视化设计，并提供 SQL 预览。

右键表 → "设计表" 打开 Webview 面板：

```
┌──────────────────────────────────────────────────────────────┐
│ 📋 users - 表设计器                              [保存] [✕]  │
├──────────────────────────────────────────────────────────────┤
│ [字段] [索引] [外键] [触发器] [选项] [SQL 预览]              │
├──────┬──────────┬──────────┬──────┬─────┬──────┬────────────┤
│ 字段 │ 类型     │ 长度     │ 允空 │ 默认值│ 备注 │            │
├──────┼──────────┼──────────┼──────┼─────┼──────┼────────────┤
│ id   │ INT ▼   │ 11       │ ✗    │ AI  │ 用户ID│ 🔑 PK      │
│ name │ VARCHAR ▼│ 255      │ ✗    │     │ 用户名│            │
│ email│ VARCHAR ▼│ 255      │ ✓    │ NULL│ 邮箱  │ 🛡 UNIQUE  │
│ status│TINYINT ▼│ 1        │ ✓    │ 1   │ 状态  │            │
│ +    │          │          │      │     │      │            │
├──────┴──────────┴──────────┴──────┴─────┴──────┴────────────┤
│ 表选项:                                                      │
│ 引擎: [InnoDB ▼]  字符集: [utf8mb4 ▼]  排序: [utf8mb4_general_ci ▼] │
│ 表注释: [用户信息表_________________________________]         │
├──────────────────────────────────────────────────────────────┤
│ SQL 预览:                                                    │
│ CREATE TABLE `users` (                                       │
│   `id` INT NOT NULL AUTO_INCREMENT,                          │
│   `name` VARCHAR(255) NOT NULL COMMENT '用户名',             │
│   `email` VARCHAR(255) DEFAULT NULL COMMENT '邮箱',          │
│   `status` TINYINT DEFAULT 1 COMMENT '状态',                 │
│   PRIMARY KEY (`id`),                                        │
│   UNIQUE KEY `uk_email` (`email`)                            │
│ ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户信息表';│
└──────────────────────────────────────────────────────────────┘
```

**六个标签页**：

| 标签 | 功能 | Navicat 对标 |
|------|------|-------------|
| **字段** | 添加/编辑/删除字段，设置类型、约束、默认值、注释 | Navicat 字段选项卡 |
| **索引** | 添加/编辑/删除索引，设置索引类型、包含列 | Navicat 索引选项卡 |
| **外键** | 添加/编辑/删除外键，设置引用关系、级联操作 | Navicat 外键选项卡 |
| **触发器** | 查看触发器定义 | Navicat 触发器选项卡 |
| **选项** | 表引擎、字符集、排序规则、自增起始值、表注释 | Navicat 选项选项卡 |
| **SQL 预览** | 实时预览设计变更对应的 SQL 语句 | Navicat SQL 预览 |

**关键交互**：
- 修改任何设计后，SQL 预览实时更新（Navicat 行为）
- 新建表时生成 `CREATE TABLE`，修改表时生成 `ALTER TABLE`
- 保存时弹出确认对话框，显示即将执行的 SQL
- 类型选择器以下拉方式展示所有 MySQL 数据类型
- 字段支持拖拽排序

---

## 八、连接配置对话框（Navicat 对标）

Navicat 的连接配置对话框采用标签页形式，分为"常规"、"SSH"、"SSL"、"高级"等标签。

```
┌──────────────────────────────────────────────────────┐
│  新建连接 - MySQL                            [✕]     │
├──────────────────────────────────────────────────────┤
│ [常规] [SSH] [SSL] [高级]                             │
├──────────────────────────────────────────────────────┤
│                                                      │
│  连接名: [________________]                          │
│  分  组: [开发环境 ▼]                                │
│  颜  色: [🟢 ▼]                                     │
│                                                      │
│  主  机: [127.0.0.1]              端口: [3306]       │
│  用户名: [root]                                      │
│  密  码: [••••••]  [记住密码 ☑]                      │
│  数据库: [mydb______]                                │
│                                                      │
│           [测试连接]  [取消]  [确定]                  │
└──────────────────────────────────────────────────────┘
```

**SSH 标签页**：

```
┌──────────────────────────────────────────────────────┐
│  [常规] [SSH] [SSL] [高级]                            │
├──────────────────────────────────────────────────────┤
│  ☑ 使用 SSH 隧道                                     │
│                                                      │
│  主  机: [jump-server.example.com]  端口: [22]       │
│  用户名: [deploy]                                    │
│  验证方式: [密码 ▼] / [公钥 ▼]                       │
│  密  码: [••••••]                                    │
│  私钥文件: [~/.ssh/id_rsa]  [浏览...]               │
│  私钥密码: [••••••]                                  │
└──────────────────────────────────────────────────────┘
```

**SSL 标签页**：

```
┌──────────────────────────────────────────────────────┐
│  [常规] [SSH] [SSL] [高级]                            │
├──────────────────────────────────────────────────────┤
│  ☑ 使用 SSL                                          │
│                                                      │
│  CA 证书: [_______________]  [浏览...]               │
│  客户端证书: [_______________]  [浏览...]            │
│  客户端密钥: [_______________]  [浏览...]            │
│  ☑ 验证服务器证书                                    │
└──────────────────────────────────────────────────────┘
```

**高级标签页**：

```
┌──────────────────────────────────────────────────────┐
│  [常规] [SSH] [SSL] [高级]                            │
├──────────────────────────────────────────────────────┤
│  连接超时: [10000] ms                                 │
│  连接池大小: [5]                                      │
│  查询超时: [30000] ms                                 │
│  最大结果行数: [1000]                                 │
│  自动提交: [☑]                                       │
│  字符集: [utf8mb4 ▼]                                 │
│  时区: [+08:00 ▼]                                    │
│  初始 SQL: [SET NAMES utf8mb4;_________________]     │
└──────────────────────────────────────────────────────┘
```

**测试连接**：点击"测试连接"按钮，尝试建立连接并返回：
- 连接成功/失败
- 数据库版本信息（如 `MySQL 8.0.32`）
- 连接延迟
- 如果使用 SSH 隧道，同时验证 SSH 连接

---

## 九、Schema 感知智能补全

### 9.1 与现有补全体系的集成

新增 `SchemaCompletionProvider` 作为子 Provider 接入现有 `SqlCompletionProvider`，仅在有活动数据库连接时生效。

**Navicat 对标**：Navicat 的"自动完成代码"功能，在输入时弹出建议列表，包含数据库对象（数据库、表、字段、视图）及其相应图标。

```typescript
class SchemaCompletionProvider {
  async provideCompletionItems(
    document: TextDocument,
    position: Position,
    context: CompletionContext,
    schemaProvider: SchemaProvider
  ): Promise<CompletionItem[]>;
}
```

### 9.2 补全类型

| 补全类型 | 触发场景 | 图标 | Navicat 对标 |
|---------|---------|------|-------------|
| 数据库名 | USE / FROM / JOIN 后 | 📂 | Navicat 数据库对象补全 |
| 表名 | FROM / JOIN / INSERT INTO / UPDATE 后 | 📋 | Navicat 表对象补全 |
| 列名 | SELECT / WHERE / ORDER BY / GROUP BY 后 | 🔹 | Navicat 字段对象补全 |
| 别名解析 | `SELECT u.` 后 | 🔹 | Navicat 别名解析 |
| 视图名 | FROM / JOIN 后 | 👁 | Navicat 视图对象补全 |
| 函数名 | 任意位置 | ⚡ | Navicat 函数对象补全 |
| 存储过程名 | CALL 后 | ⚙ | Navicat 过程对象补全 |

### 9.3 补全优先级

```
1. Schema 补全（表名、列名）— 来自真实数据库，优先级最高
2. CTE 名称补全 — 来自当前文档
3. 函数补全 — 来自内置函数库 + 数据库函数
4. 关键字补全 — 来自内置关键字库
5. 片段补全 — 来自 snippets
```

### 9.4 Schema 缓存策略

```typescript
class SchemaCache {
  private databaseCache: Map<string, DatabaseInfo[]>;     // TTL 10min
  private tableCache: Map<string, TableInfo[]>;           // TTL 5min
  private columnCache: Map<string, ColumnInfo[]>;         // TTL 2min
  private functionCache: Map<string, FunctionInfo[]>;     // TTL 10min
  private procedureCache: Map<string, ProcedureInfo[]>;   // TTL 10min

  invalidate(connectionId: string, scope?: 'database' | 'table' | 'column' | 'function' | 'procedure'): void;
}
```

- 列信息 TTL 最短（2min），DDL 变更最频繁
- 表列表 TTL 中等（5min）
- 数据库/函数/存储过程列表 TTL 最长（10min）
- 提供 `sql-all-in-one.schemaCache.refreshOnDDL` 配置项：DDL 执行成功后自动刷新对应表缓存

### 9.5 AST 感知的上下文识别

复用 AST 解析能力，精准判断补全上下文：

- `SELECT * FROM u|` → 补全表名
- `SELECT u.| FROM users u` → 补全 users 表的列名
- `SELECT * FROM users u JOIN orders o ON u.|` → 补全 users 表的列名
- `CALL |` → 补全存储过程名
- `USE |` → 补全数据库名

---

## 十、查询历史

**Navicat 对标**：Navicat 的查询历史面板，记录所有执行过的查询。

```typescript
interface QueryHistoryEntry {
  id: string;
  sql: string;
  connectionId: string;
  connectionName: string;
  database: string;
  executedAt: Date;
  executionTime: number;
  rowCount: number;
  affectedRows?: number;
  status: 'success' | 'error';
  errorMessage?: string;
}
```

- 存储位置：VSCode GlobalState，最多保留 500 条
- 持久化：跨会话保留
- 搜索：支持按 SQL 文本搜索历史
- 筛选：按连接、数据库、状态筛选
- 操作：
  - 点击历史条目 → 在编辑器中打开 SQL
  - 双击历史条目 → 直接重新执行
  - 右键 → 复制 SQL / 删除条目 / 清空历史

---

## 十一、数据导入导出（Navicat 对标）

### 11.1 数据导出

**Navicat 对标**：Navicat 的"导出向导"，支持将查询结果或表数据导出为多种格式。

| 导出格式 | 说明 | Navicat 对标 |
|---------|------|-------------|
| CSV | 带表头，可配置分隔符/编码/引号 | Navicat 导出 CSV |
| JSON | 数组格式或行格式 | Navicat 导出 JSON |
| SQL INSERT | 生成 INSERT 语句 | Navicat 导出 SQL |
| SQL DDL | 导出表结构 | Navicat 转储 SQL 文件 |
| Excel | .xlsx 格式 | Navicat 导出 Excel |
| XML | XML 格式 | Navicat 导出 XML |
| Markdown | Markdown 表格格式 | — （VSCode 场景特色） |

导出源：
- 查询结果集
- 整个表数据
- 表结构（DDL）

### 11.2 数据导入

**Navicat 对标**：Navicat 的"导入向导"，支持从多种格式导入数据到表。

| 导入格式 | 说明 |
|---------|------|
| CSV | 带表头，可配置分隔符/编码 |
| JSON | 数组格式或行格式 |
| SQL | 执行 SQL 文件 |
| Excel | .xlsx/.xls 格式 |

导入流程（向导式）：
1. 选择数据源文件
2. 选择目标表（新建或已有表）
3. 字段映射（源列 → 目标列）
4. 导入选项（遇到错误跳过/中止、去重策略）
5. 预览并执行

### 11.3 转储/运行 SQL 文件

**Navicat 对标**：Navicat 的"转储 SQL 文件"和"运行 SQL 文件"。

- **转储 SQL 文件**：将数据库/表的结构和数据导出为 .sql 文件
- **运行 SQL 文件**：执行 .sql 文件中的 SQL 语句

---

## 十二、错误处理与安全设计

### 12.1 错误处理策略

```typescript
class DatabaseErrorHandler {
  // 1. 连接层错误 — 自动重试
  //    ECONNREFUSED → 重试 3 次，指数退避
  //    ETIMEDOUT → 提示检查网络/防火墙
  //    ER_ACCESS_DENIED_ERROR → 提示检查用户名密码，不重试
  //    ER_DBACCESS_DENIED_ERROR → 提示无数据库权限
  //    ECONNRESET → 自动重连

  // 2. 查询层错误 — 展示给用户
  //    ER_PARSE_ERROR → 标注 SQL 错误位置，与现有语法错误检测联动
  //    ER_NO_SUCH_TABLE → 提示表不存在，建议刷新 Schema 缓存
  //    ER_DUP_ENTRY → 唯一键冲突提示
  //    ER_LOCK_WAIT_TIMEOUT → 锁等待超时，建议检查事务
  //    ER_DEADLOCK → 死锁提示，建议重试

  // 3. SSH 隧道错误
  //    ECONNREFUSED (SSH) → SSH 服务器不可达
  //    EAUTH → SSH 认证失败
  //    KEY_PARSE_ERROR → 私钥格式错误

  // 4. 未知错误 — 通用兜底
  //    记录到 OutputChannel
  //    通知栏提示用户
}
```

所有面向用户的错误消息通过 i18n 系统翻译。

### 12.2 安全设计

| 安全措施 | 说明 | Navicat 对标 |
|---------|------|-------------|
| 密码加密存储 | SecretStorage API，永不明文存储 | Navicat 密码保存 |
| SSH 隧道 | 通过 SSH 加密通道连接数据库 | Navicat SSH 隧道 |
| SSL/TLS | 支持 SSL 加密连接 | Navicat SSL 连接 |
| 连接配置文件权限 | 检查 `connections.json` 文件权限，非 600 时警告 | — |
| SQL 注入防护 | 查询执行使用预处理语句，禁止拼接用户输入 | — |
| 连接信息不落日志 | 日志中脱敏处理，主机用 `***` 遮盖，密码不输出 | — |
| 连接超时 | 默认 10s 连接超时 + 30s 查询超时 | — |
| 连接池上限 | 每个连接池最大 5 个并发 | — |
| 敏感操作确认 | DELETE/UPDATE/DDL 无 WHERE 条件时弹出确认对话框 | Navicat 危险操作确认 |
| 导出连接密码 | 导出连接配置时，密码单独加密，需输入导出密码 | Navicat 导出连接设置 |

### 12.3 危险 SQL 拦截

```typescript
class SafeQueryGuard {
  analyze(sql: string): SafetyCheckResult;

  // 拦截规则：
  // 1. DELETE 无 WHERE → 警告
  // 2. UPDATE 无 WHERE → 警告
  // 3. DROP TABLE → 确认
  // 4. TRUNCATE → 确认
  // 5. ALTER TABLE DROP COLUMN → 确认
  // 6. DROP DATABASE → 确认
}
```

拦截级别配置 `sql-all-in-one.safetyGuard.level`：
- `strict` — 全部拦截
- `moderate` — 仅拦截 DROP/TRUNCATE（默认）
- `off` — 不拦截

---

## 十三、命令与快捷键

### 13.1 新增命令

| 命令 | 快捷键 | 说明 | Navicat 对标 |
|------|--------|------|-------------|
| `sqlAllInOne.addConnection` | — | 添加新数据库连接 | Navicat 新建连接 |
| `sqlAllInOne.removeConnection` | — | 删除连接 | Navicat 删除连接 |
| `sqlAllInOne.editConnection` | — | 编辑连接配置 | Navicat 连接属性 |
| `sqlAllInOne.connect` | — | 连接数据库 | Navicat 打开连接 |
| `sqlAllInOne.disconnect` | — | 断开连接 | Navicat 关闭连接 |
| `sqlAllInOne.executeQuery` | `Ctrl+R` | 执行当前 SQL | Navicat Ctrl+R |
| `sqlAllInOne.executeSelection` | `Ctrl+Shift+R` | 执行选中的 SQL | Navicat Ctrl+Shift+R |
| `sqlAllInOne.cancelQuery` | — | 取消正在执行的查询 | Navicat 停止 |
| `sqlAllInOne.refreshSchema` | `F5` | 刷新 Schema 缓存 | Navicat 刷新 |
| `sqlAllInOne.newQuery` | `Ctrl+Q` | 新建查询 | Navicat Ctrl+Q |
| `sqlAllInOne.exportResults` | — | 导出查询结果 | Navicat 导出向导 |
| `sqlAllInOne.importData` | — | 导入数据 | Navicat 导入向导 |
| `sqlAllInOne.viewTableData` | — | 查看表数据 | Navicat 打开表 |
| `sqlAllInOne.designTable` | — | 设计表 | Navicat 设计表 |
| `sqlAllInOne.viewTableDDL` | — | 查看表 DDL | Navicat 对象信息 |
| `sqlAllInOne.explainQuery` | — | 查看执行计划 | Navicat 可视化解释 |
| `sqlAllInOne.dumpSqlFile` | — | 转储 SQL 文件 | Navicat 转储 SQL 文件 |
| `sqlAllInOne.runSqlFile` | — | 运行 SQL 文件 | Navicat 运行 SQL 文件 |
| `sqlAllInOne.openCommandLine` | `F6` | 打开命令行 | Navicat F6 命令行界面 |
| `sqlAllInOne.searchObjects` | `Ctrl+Shift+F` | 搜索数据库对象 | Navicat 数据库范围搜索 |
| `sqlAllInOne.addToFavorites` | — | 添加到收藏夹 | Navicat 收藏夹 |
| `sqlAllInOne.switchConnection` | — | 切换活动连接 | Navicat 切换连接 |

### 13.2 新增配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| `sqlAllInOne.query.maxRows` | number | 1000 | 查询结果最大行数 |
| `sqlAllInOne.query.timeout` | number | 30000 | 查询超时时间(ms) |
| `sqlAllInOne.query.pageSize` | number | 100 | 结果面板每页行数 |
| `sqlAllInOne.query.editMode` | string | 'readonly' | 结果面板编辑模式 |
| `sqlAllInOne.query.autoCommit` | boolean | true | 自动提交模式 |
| `sqlAllInOne.query.defaultView` | string | 'grid' | 结果面板默认视图（grid/form） |
| `sqlAllInOne.schemaCache.ttl` | number | 300 | Schema 缓存 TTL(s) |
| `sqlAllInOne.schemaCache.refreshOnDDL` | boolean | true | DDL 执行后自动刷新缓存 |
| `sqlAllInOne.safetyGuard.level` | string | 'moderate' | 危险 SQL 拦截级别 |
| `sqlAllInOne.connection.autoConnect` | boolean | false | 打开工作区时自动连接 |
| `sqlAllInOne.connection.colorCoding` | boolean | true | 启用连接颜色标识 |
| `sqlAllInOne.history.maxEntries` | number | 500 | 查询历史最大条数 |
| `sqlAllInOne.dataEditor.typeColors` | object | {...} | 自定义数据类型颜色映射 |
| `sqlAllInOne.export.defaultFormat` | string | 'csv' | 默认导出格式 |
| `sqlAllInOne.export.csvDelimiter` | string | ',' | CSV 分隔符 |
| `sqlAllInOne.export.csvEncoding` | string | 'utf-8' | CSV 编码 |
| `sqlAllInOne.export.includeHeaders` | boolean | true | 导出时包含列头 |

---

## 十四、与现有模块的集成点

| 现有模块 | 集成方式 |
|---------|---------|
| DI 容器 | 注册 ConnectionManager、SchemaProvider、QueryExecutor、ExplainPlanService 为单例服务 |
| 方言注册中心 | 新增数据库适配器注册，与格式化/解析方言注册解耦 |
| AST 解析引擎 | 复用 AST 解析做 SQL 语句识别、危险 SQL 检测 |
| 文档 AST 缓存 | 复用缓存机制，避免重复解析 |
| 补全体系 | 新增 SchemaCompletionProvider 作为子 Provider 接入 |
| 悬停提示 | 连接后悬停表名/列名时显示实际 Schema 信息（类型、注释、约束） |
| 状态栏 | 新增连接状态显示（如 `MySQL: dev-db 🟢`），点击切换连接 |
| i18n | 所有新增 UI 文本走 i18n 体系 |
| 错误处理 | 数据库错误纳入统一错误处理框架 |
| SQL 格式化 | 查询编辑器中集成 SQL 美化/简化功能（Navicat SQL 美化） |
| Lint 规则 | 连接后可基于实际 Schema 增强部分 Lint 规则（如列名存在性检查） |

---

## 十五、扩展新数据库步骤

以 PostgreSQL 为例：

1. 安装驱动：`npm install pg`
2. 新增适配器：`src/database/adapters/PostgresAdapter.ts`，实现 `IDatabaseAdapter`
   - `listDatabases()` → `SELECT datname FROM pg_database`
   - `listTables()` → `SELECT tablename FROM pg_tables WHERE schemaname = $1`
   - `describeTable()` → 查询 `information_schema.columns`
   - `getExplainPlan()` → `EXPLAIN (FORMAT JSON) xxx`
3. 注册适配器：`AdapterFactory.register('postgresql', PostgresAdapter)`
4. 注册方言：`dialectRegistry.register('postgresql', { ... })`
5. 更新 i18n：添加 PostgreSQL 相关 UI 文本
6. 完成，无需修改任何上层代码

---

## 十六、P2 远期功能

以下功能对标 Navicat 企业级特性，作为远期规划：

| 功能 | Navicat 对标 | 说明 |
|------|-------------|------|
| 可视化查询构建器 | Navicat 查询创建工具 | 拖拽式可视化构建 SELECT 查询，自动生成 SQL |
| 数据传输 | Navicat 数据传输 | 跨数据库/跨服务器数据传输 |
| 数据同步 | Navicat 数据同步 | 比较并同步两个数据库的数据 |
| 结构同步 | Navicat 结构同步 | 比较并同步两个数据库的结构 |
| ER 图表 | Navicat ER 图表 | 可视化数据库关系图 |
| 数据字典 | Navicat 数据字典 | 生成数据库文档 |
| 数据分析 | Navicat 数据分析 | 数据分布统计、异常值检测 |
| 备份还原 | Navicat 备份还原 | 数据库备份和还原 |
