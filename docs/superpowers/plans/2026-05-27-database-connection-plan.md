# 数据库连接功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SQL All in One 扩展新增 Navicat 级别的数据库连接功能，按迭代周期逐步交付可用的功能模块。

**Architecture:** 数据库抽象层 + 适配器模式，与现有 `dialectRegistry` + DI 容器 + 适配器模式一致。新增 `DatabaseModule` 作为 `ExtensionModule` 接入现有模块注册体系。UI 层使用 VSCode TreeDataProvider + Webview 实现。

**Tech Stack:** TypeScript, mysql2/promise, ssh2, VSCode Extension API (TreeDataProvider, Webview, SecretStorage, GlobalState)

---

## 迭代总览

| 迭代 | 名称 | 交付物 | 依赖 |
|------|------|--------|------|
| V1 | 数据库适配器层 + 连接管理 | 适配器接口、MySQL 适配器、连接管理、连接存储 | 无 |
| V2 | 侧边栏数据库浏览器 | 树形视图、对象浏览、右键菜单、收藏夹 | V1 |
| V3 | SQL 执行引擎 | 语句识别、查询执行、安全拦截、查询历史 | V1 |
| V4 | 查询结果面板（基础版） | 结果网格、分页、排序、导出 | V3 |
| V5 | 数据编辑器 | 单元格编辑、批量提交、表单视图、外键下拉 | V4 |
| V6 | Schema 感知补全 | Schema 补全 Provider、缓存、别名解析 | V1, V2 |
| V7 | 表设计器 | 字段/索引/外键/触发器设计、SQL 预览 | V1, V2 |
| V8 | 执行计划 + 高级功能 | 可视化 EXPLAIN、SSH 隧道、数据导入导出 | V1, V3 |

---

## V1：数据库适配器层 + 连接管理

**目标：** 建立数据库连接的底层基础设施，包括适配器接口、MySQL 实现、连接生命周期管理、配置存储。此迭代完成后，可通过命令行测试连接数据库。

### Task 1.1：适配器接口与类型定义

**Files:**
- Create: `src/database/adapters/IDatabaseAdapter.ts`
- Create: `src/database/adapters/AdapterFactory.ts`
- Create: `src/database/connection/ConnectionConfig.ts`
- Test: `src/test/database/adapter.test.ts`

- [ ] **Step 1: 创建连接配置类型文件**

`src/database/connection/ConnectionConfig.ts`:

```typescript
export interface ConnectionConfig {
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

export interface SSLConfig {
  enabled: boolean;
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

export interface SshConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  authentication: 'password' | 'privateKey';
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface ConnectionGroup {
  name: string;
  color: string;
}

export interface ConnectionsFile {
  version: number;
  groups: ConnectionGroup[];
  connections: Omit<ConnectionConfig, 'password'>[];
}

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error'
}

export interface TestConnectionResult {
  success: boolean;
  serverVersion?: string;
  latency?: number;
  error?: string;
}
```

- [ ] **Step 2: 创建适配器接口文件**

`src/database/adapters/IDatabaseAdapter.ts`:

```typescript
import { ConnectionConfig, TestConnectionResult } from '../connection/ConnectionConfig';

export interface QueryParam {
  name?: string;
  value: any;
}

export interface ColumnMeta {
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

export interface QueryResult {
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

export interface QueryError {
  code: string;
  message: string;
  sql?: string;
  position?: { line: number; offset: number };
}

export interface UpdateResult {
  affectedRows: number;
  insertId?: number;
  changedRows: number;
}

export interface DatabaseInfo {
  name: string;
  charset?: string;
  collation?: string;
}

export interface TableInfo {
  name: string;
  type: 'table' | 'view';
  engine?: string;
  rowCount?: number;
  comment?: string;
  charset?: string;
  collation?: string;
}

export interface ViewInfo {
  name: string;
  definition?: string;
  comment?: string;
}

export interface FunctionInfo {
  name: string;
  type: 'FUNCTION';
  returns?: string;
  definition?: string;
  comment?: string;
}

export interface ProcedureInfo {
  name: string;
  type: 'PROCEDURE';
  definition?: string;
  comment?: string;
}

export interface TriggerInfo {
  name: string;
  event: string;
  timing: string;
  statement: string;
}

export interface ColumnInfo {
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

export interface IndexInfo {
  name: string;
  type: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  comment?: string;
}

export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface TableStructure {
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

export type ObjectType = 'table' | 'view' | 'function' | 'procedure' | 'trigger' | 'event' | 'index';

export interface ObjectFilter {
  keyword?: string;
  type?: ObjectType;
}

export interface DialectCapabilities {
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

export interface IDatabaseAdapter {
  readonly dialect: string;

  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  testConnection(config: ConnectionConfig): Promise<TestConnectionResult>;

  executeQuery(sql: string, params?: QueryParam[]): Promise<QueryResult>;
  executeUpdate(sql: string, params?: QueryParam[]): Promise<UpdateResult>;

  listDatabases(): Promise<DatabaseInfo[]>;
  listSchemas(database: string): Promise<string[]>;
  listTables(database: string, schema?: string, filter?: ObjectFilter): Promise<TableInfo[]>;
  listViews(database: string, schema?: string): Promise<ViewInfo[]>;
  listFunctions(database: string, schema?: string): Promise<FunctionInfo[]>;
  listProcedures(database: string, schema?: string): Promise<ProcedureInfo[]>;
  listTriggers(database: string, schema?: string): Promise<TriggerInfo[]>;
  describeTable(database: string, table: string, schema?: string): Promise<TableStructure>;
  getTableDDL(database: string, table: string, schema?: string): Promise<string>;
  getViewDDL(database: string, view: string, schema?: string): Promise<string>;

  getExplainPlan(database: string, sql: string): Promise<any>;
  getTableRowCount(database: string, table: string, schema?: string): Promise<number>;

  getDialectCapabilities(): DialectCapabilities;
}
```

- [ ] **Step 3: 创建适配器工厂**

`src/database/adapters/AdapterFactory.ts`:

```typescript
import { IDatabaseAdapter } from './IDatabaseAdapter';

type AdapterConstructor = new (poolConfig: any) => IDatabaseAdapter;

export class AdapterFactory {
  private static adapters = new Map<string, AdapterConstructor>();

  static register(dialect: string, adapterClass: AdapterConstructor): void {
    AdapterFactory.adapters.set(dialect, adapterClass);
  }

  static create(dialect: string, poolConfig: any): IDatabaseAdapter {
    const AdapterClass = AdapterFactory.adapters.get(dialect);
    if (!AdapterClass) {
      throw new Error(`No adapter registered for dialect: ${dialect}`);
    }
    return new AdapterClass(poolConfig);
  }

  static has(dialect: string): boolean {
    return AdapterFactory.adapters.has(dialect);
  }

  static getRegisteredDialects(): string[] {
    return Array.from(AdapterFactory.adapters.keys());
  }
}
```

- [ ] **Step 4: 编写接口类型测试**

`src/test/database/adapter.test.ts`:

```typescript
import * as assert from 'assert';
import { AdapterFactory } from '../../database/adapters/AdapterFactory';

suite('AdapterFactory', () => {
  teardown(() => {
    (AdapterFactory as any).adapters.clear();
  });

  test('should register and create adapter', () => {
    class MockAdapter {
      readonly dialect = 'mock';
      connect = async () => {};
      disconnect = async () => {};
      isConnected = () => false;
      testConnection = async () => ({ success: true });
      executeQuery = async () => ({}) as any;
      executeUpdate = async () => ({}) as any;
      listDatabases = async () => [];
      listSchemas = async () => [];
      listTables = async () => [];
      listViews = async () => [];
      listFunctions = async () => [];
      listProcedures = async () => [];
      listTriggers = async () => [];
      describeTable = async () => ({}) as any;
      getTableDDL = async () => '';
      getViewDDL = async () => '';
      getExplainPlan = async () => ({});
      getTableRowCount = async () => 0;
      getDialectCapabilities = () => ({}) as any;
    }

    AdapterFactory.register('mock', MockAdapter as any);
    const adapter = AdapterFactory.create('mock', {});
    assert.strictEqual(adapter.dialect, 'mock');
  });

  test('should throw for unregistered dialect', () => {
    assert.throws(() => AdapterFactory.create('unknown', {}), /No adapter registered/);
  });

  test('should check if dialect is registered', () => {
    assert.strictEqual(AdapterFactory.has('mysql'), false);
  });

  test('should list registered dialects', () => {
    assert.deepStrictEqual(AdapterFactory.getRegisteredDialects(), []);
  });
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vscode-test-cli -- src/test/database/adapter.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/database/adapters/IDatabaseAdapter.ts src/database/adapters/AdapterFactory.ts src/database/connection/ConnectionConfig.ts src/test/database/adapter.test.ts
git commit -m "feat(database): add adapter interface, factory, and connection config types"
```

---

### Task 1.2：MySQL 适配器实现

**Files:**
- Create: `src/database/adapters/MysqlAdapter.ts`
- Test: `src/test/database/mysqlAdapter.test.ts`

- [ ] **Step 1: 安装 mysql2 依赖**

Run: `npm install mysql2`

- [ ] **Step 2: 实现 MySQL 适配器**

`src/database/adapters/MysqlAdapter.ts` — 实现 `IDatabaseAdapter` 接口，核心要点：
- 使用 `mysql2/promise` 的 `createPool` 管理连接池
- `connect()`: 创建连接池，执行 `SELECT 1` 验证连接
- `disconnect()`: 关闭连接池 `pool.end()`
- `testConnection()`: 创建临时连接，执行 `SELECT VERSION()`，返回版本和延迟
- `executeQuery()`: 使用 `pool.query()` 执行查询，构建 `QueryResult`
- `listDatabases()`: `SHOW DATABASES`
- `listTables()`: `SHOW TABLE STATUS FROM ?`
- `listViews()`: `SHOW FULL TABLES FROM ? WHERE Table_type = 'VIEW'`
- `listFunctions()`: `SHOW FUNCTION STATUS WHERE Db = ?`
- `listProcedures()`: `SHOW PROCEDURE STATUS WHERE Db = ?`
- `listTriggers()`: `SHOW TRIGGERS FROM ?`
- `describeTable()`: 组合 `SHOW COLUMNS` + `SHOW INDEX` + `SHOW TABLE STATUS`
- `getTableDDL()`: `SHOW CREATE TABLE`
- `getViewDDL()`: `SHOW CREATE VIEW`
- `getExplainPlan()`: `EXPLAIN FORMAT=JSON`
- `getTableRowCount()`: `SHOW TABLE STATUS LIKE ?` 取 `Rows` 近似值
- `getDialectCapabilities()`: 返回 MySQL 特性集

- [ ] **Step 3: 编写 MySQL 适配器单元测试**

`src/test/database/mysqlAdapter.test.ts` — 测试要点：
- 测试 `getDialectCapabilities()` 返回正确的 MySQL 特性
- 测试 `connect()` 在无效连接参数时抛出错误
- 测试 `isConnected()` 状态转换
- 注意：涉及真实数据库连接的测试标记为 `skip`，CI 环境中不执行

- [ ] **Step 4: 运行测试**

Run: `npx vscode-test-cli -- src/test/database/mysqlAdapter.test.ts`

- [ ] **Step 5: 在 DatabaseModule 中注册 MySQL 适配器**

`src/database/DatabaseModule.ts` (部分创建):

```typescript
import { AdapterFactory } from './adapters/AdapterFactory';
import { MysqlAdapter } from './adapters/MysqlAdapter';

export function registerDatabaseAdapters(): void {
  AdapterFactory.register('mysql', MysqlAdapter);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/database/adapters/MysqlAdapter.ts src/database/DatabaseModule.ts src/test/database/mysqlAdapter.test.ts package.json package-lock.json
git commit -m "feat(database): implement MySQL adapter with connection pool"
```

---

### Task 1.3：连接存储（ConnectionStore）

**Files:**
- Create: `src/database/connection/ConnectionStore.ts`
- Test: `src/test/database/connectionStore.test.ts`

- [ ] **Step 1: 实现 ConnectionStore**

`src/database/connection/ConnectionStore.ts` — 核心功能：
- `load()`: 读取 `~/.sql-all-in-one/connections.json`，不存在则创建默认文件
- `save()`: 写入连接文件，自动创建目录
- `addConnection()`: 添加连接配置
- `removeConnection()`: 删除连接配置
- `updateConnection()`: 更新连接配置
- `getConnections()`: 返回所有连接
- `getGroups()`: 返回所有分组
- `addGroup()` / `removeGroup()` / `updateGroup()`: 分组管理
- `exportConnections()` / `importConnections()`: 导入导出
- 文件权限检查：非 600 时发出警告

- [ ] **Step 2: 编写 ConnectionStore 测试**

`src/test/database/connectionStore.test.ts` — 使用临时目录测试文件读写

- [ ] **Step 3: 运行测试**

Run: `npx vscode-test-cli -- src/test/database/connectionStore.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/database/connection/ConnectionStore.ts src/test/database/connectionStore.test.ts
git commit -m "feat(database): implement connection store with file-based persistence"
```

---

### Task 1.4：连接管理器（ConnectionManager）

**Files:**
- Create: `src/database/connection/ConnectionManager.ts`
- Test: `src/test/database/connectionManager.test.ts`

- [ ] **Step 1: 实现 ConnectionManager**

`src/database/connection/ConnectionManager.ts` — 核心功能：
- 管理 `activeConnections: Map<string, IDatabaseAdapter>`
- 管理 `connectionStates: Map<string, ConnectionState>`
- 管理 `activeConnectionId: string | undefined`
- `addConnection()`: 通过 ConnectionStore 保存配置，密码存入 SecretStorage
- `removeConnection()`: 先断开连接，再从 Store 删除
- `connect()`: 创建适配器实例，调用 `adapter.connect()`，更新状态
- `disconnect()`: 调用 `adapter.disconnect()`，更新状态
- `disconnectAll()`: 遍历断开所有连接
- `testConnection()`: 临时创建适配器测试连接
- `getActiveConnection()` / `setActiveConnection()`: 活动连接管理
- 事件发射：`onDidChangeConnections`、`onDidChangeConnectionState`、`onDidChangeActiveConnection`
- 自动重连：连接断开时指数退避重试 3 次

- [ ] **Step 2: 编写 ConnectionManager 测试**

`src/test/database/connectionManager.test.ts` — 使用 mock 适配器测试生命周期

- [ ] **Step 3: 运行测试**

Run: `npx vscode-test-cli -- src/test/database/connectionManager.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/database/connection/ConnectionManager.ts src/test/database/connectionManager.test.ts
git commit -m "feat(database): implement connection manager with lifecycle and events"
```

---

### Task 1.5：DI 集成与扩展入口注册

**Files:**
- Modify: `src/core/diContainer.ts` — 新增 Tokens
- Modify: `src/extension.ts` — 注册 DatabaseModule
- Create: `src/database/DatabaseModule.ts` — 完整实现

- [ ] **Step 1: 在 diContainer.ts 中新增数据库相关 Tokens**

在 `Tokens` 对象中新增：
```typescript
ConnectionManager: 'ConnectionManager',
ConnectionStore: 'ConnectionStore',
SchemaProvider: 'SchemaProvider',
QueryExecutor: 'QueryExecutor',
```

- [ ] **Step 2: 完善 DatabaseModule**

`src/database/DatabaseModule.ts`:
- `registerDatabaseAdapters()`: 注册所有数据库适配器
- `registerServices()`: 向 DI 容器注册 ConnectionManager、ConnectionStore
- 导出 `createDatabaseModule()` 返回 `ExtensionModule`

- [ ] **Step 3: 在 extension.ts 中注册 DatabaseModule**

在 `createModules()` 返回的数组中，在 `services` 模块之后添加 `database` 模块。

- [ ] **Step 4: 在 deactivate 中调用 disconnectAll**

在 `deactivate()` 函数中，从 DI 容器获取 ConnectionManager 并调用 `disconnectAll()`。

- [ ] **Step 5: 编译验证**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/core/diContainer.ts src/extension.ts src/database/DatabaseModule.ts
git commit -m "feat(database): integrate database module into DI container and extension lifecycle"
```

---

### Task 1.6：连接配置对话框

**Files:**
- Create: `src/views/connectionDialog/ConnectionDialog.ts`
- Create: `src/views/connectionDialog/dialog.html`
- Create: `src/views/connectionDialog/dialog.css`
- Create: `src/views/connectionDialog/dialog.js`
- Modify: `package.json` — 新增命令

- [ ] **Step 1: 在 package.json 中注册连接相关命令**

新增命令：
- `sql-all-in-one.addConnection` — "添加数据库连接"
- `sql-all-in-one.editConnection` — "编辑连接"
- `sql-all-in-one.removeConnection` — "删除连接"
- `sql-all-in-one.connect` — "连接数据库"
- `sql-all-in-one.disconnect` — "断开连接"
- `sql-all-in-one.testConnection` — "测试连接"

- [ ] **Step 2: 实现 ConnectionDialog Webview**

`ConnectionDialog.ts` — Webview 面板管理器：
- `showNewDialog()`: 新建连接对话框
- `showEditDialog(config)`: 编辑连接对话框
- 四标签页：常规 / SSH / SSL / 高级
- 表单验证：主机/端口/用户名必填
- 测试连接按钮：调用 `ConnectionManager.testConnection()`
- 保存时调用 `ConnectionManager.addConnection()` 或 `updateConnection()`

- [ ] **Step 3: 实现 Webview 前端**

`dialog.html` / `dialog.css` / `dialog.js`:
- 标签页切换（常规/SSH/SSL/高级）
- 表单字段绑定
- 测试连接按钮（loading 状态 + 结果展示）
- 颜色选择器（连接颜色）
- 分组下拉选择（含新建分组）

- [ ] **Step 4: 注册命令处理器**

在 DatabaseModule 中注册命令，绑定到 ConnectionManager 和 ConnectionDialog。

- [ ] **Step 5: 编译验证**

Run: `npx tsc --noEmit`

- [ ] **Step 6: 手动测试**

- 打开命令面板 → "添加数据库连接" → 填写 MySQL 连接信息 → 测试连接 → 保存
- 验证 `~/.sql-all-in-one/connections.json` 文件已创建
- 验证密码已存入 SecretStorage

- [ ] **Step 7: Commit**

```bash
git add src/views/connectionDialog/ package.json
git commit -m "feat(database): add connection configuration dialog with SSH/SSL support"
```

---

### Task 1.7：i18n 与配置项注册

**Files:**
- Modify: `src/i18n/messages.en.json`
- Modify: `src/i18n/messages.zh.json`
- Modify: `package.json` — 新增配置项
- Modify: `package.nls.json` / `package.nls.zh-cn.json`

- [ ] **Step 1: 在 package.json 中新增数据库相关配置项**

```json
"sql-all-in-one.connection.autoConnect": {
  "type": "boolean",
  "default": false,
  "description": "%connection.autoConnect%"
},
"sql-all-in-one.connection.colorCoding": {
  "type": "boolean",
  "default": true,
  "description": "%connection.colorCoding%"
},
"sql-all-inOne.query.maxRows": { ... },
"sql-all-inOne.query.timeout": { ... },
"sql-all-inOne.safetyGuard.level": { ... }
```

- [ ] **Step 2: 添加 i18n 消息**

在 `messages.en.json` 和 `messages.zh.json` 中添加所有数据库功能的 UI 文本。

- [ ] **Step 3: 添加 package.nls 描述**

在 `package.nls.json` 和 `package.nls.zh-cn.json` 中添加配置项描述。

- [ ] **Step 4: Commit**

```bash
git add src/i18n/ package.json package.nls.json package.nls.zh-cn.json
git commit -m "feat(database): add i18n messages and configuration items"
```

---

## V2：侧边栏数据库浏览器

**目标：** 实现侧边栏树形视图，浏览数据库对象，支持右键操作、收藏夹、对象搜索。

### Task 2.1：树节点定义与 TreeProvider

**Files:**
- Create: `src/views/databaseExplorer/treeNodes.ts`
- Create: `src/views/databaseExplorer/DatabaseTreeProvider.ts`
- Modify: `package.json` — 注册视图

- [ ] **Step 1: 在 package.json 中注册 TreeView**

```json
"views": {
  "explorer": [
    {
      "id": "sql-all-in-one.databaseExplorer",
      "name": "SQL All in One",
      "icon": "$(database)"
    }
  ]
},
"viewsWelcome": [
  {
    "view": "sql-all-in-one.databaseExplorer",
    "contents": "No database connections.\n[Add Connection](command:sql-all-in-one.addConnection)"
  }
]
```

- [ ] **Step 2: 定义树节点类型**

`treeNodes.ts` — 定义 `GroupNode`、`ConnectionNode`、`DatabaseNode`、`ObjectGroupNode`、`TableNode`、`ViewNode`、`FunctionNode`、`ProcedureNode`、`TriggerNode`、`ColumnNode`、`IndexNode`、`FavoritesNode` 等节点类，每个节点类持有标签、图标、上下文值（用于右键菜单匹配）、可折叠状态。

- [ ] **Step 3: 实现 DatabaseTreeProvider**

`DatabaseTreeProvider.ts`:
- 实现 `TreeDataProvider<TreeNode>` 接口
- `getChildren()`: 按节点类型懒加载子节点
  - 根节点 → 收藏夹 + 分组节点 + 连接节点
  - 连接节点 → 数据库列表（调用 `adapter.listDatabases()`）
  - 数据库节点 → 对象分组（表/视图/函数/存储过程/触发器）
  - 对象分组 → 对象列表
  - 表节点 → 列 + 索引
- `getTreeItem()`: 返回 `TreeItem`，设置图标、上下文值、描述
- `refresh()`: 刷新指定节点或整棵树
- 监听 `ConnectionManager` 事件自动刷新

- [ ] **Step 4: 注册 TreeProvider**

在 DatabaseModule 中注册 `vscode.window.registerTreeDataProvider`。

- [ ] **Step 5: 编译验证 + 手动测试**

- 侧边栏出现 "SQL All in One" 视图
- 添加连接后，连接节点出现在树中
- 点击连接 → 展开显示数据库列表
- 点击数据库 → 展开显示对象分组

- [ ] **Step 6: Commit**

```bash
git add src/views/databaseExplorer/ package.json
git commit -m "feat(database): add sidebar database explorer with tree view"
```

---

### Task 2.2：右键菜单与快捷操作

**Files:**
- Modify: `package.json` — 注册 menus
- Modify: `src/views/databaseExplorer/DatabaseTreeProvider.ts`
- Modify: `src/database/DatabaseModule.ts`

- [ ] **Step 1: 在 package.json 中注册上下文菜单**

```json
"menus": {
  "view/item/context": [
    { "command": "sql-all-in-one.connect", "when": "viewItem == connectionDisconnected" },
    { "command": "sql-all-in-one.disconnect", "when": "viewItem == connectionConnected" },
    { "command": "sql-all-in-one.editConnection", "when": "viewItem =~ /connection/" },
    { "command": "sql-all-in-one.removeConnection", "when": "viewItem =~ /connection/" },
    { "command": "sql-all-in-one.viewTableData", "when": "viewItem == table" },
    { "command": "sql-all-in-one.viewTableDDL", "when": "viewItem == table" },
    { "command": "sql-all-in-one.newQuery", "when": "viewItem =~ /database|connection/" },
    { "command": "sql-all-in-one.refreshSchema", "when": "viewItem =~ /database|connection|objectGroup" }
  ]
}
```

- [ ] **Step 2: 实现命令处理器**

- `viewTableData`: 生成 `SELECT * FROM table LIMIT 100` 并执行（V3 完成后生效）
- `viewTableDDL`: 调用 `adapter.getTableDDL()` 并在新编辑器中展示
- `newQuery`: 新建 .sql 文件，自动添加 `USE database`
- `refreshSchema`: 刷新树节点

- [ ] **Step 3: 实现双击打开表**

监听 TreeView 的 `onDidChangeSelection` 事件，双击表节点时触发 `viewTableData`。

- [ ] **Step 4: Commit**

```bash
git add package.json src/views/databaseExplorer/ src/database/DatabaseModule.ts
git commit -m "feat(database): add context menus and quick actions for tree nodes"
```

---

### Task 2.3：收藏夹与对象搜索

**Files:**
- Create: `src/views/databaseExplorer/objectFilters.ts`
- Modify: `src/views/databaseExplorer/treeNodes.ts`
- Modify: `src/views/databaseExplorer/DatabaseTreeProvider.ts`

- [ ] **Step 1: 实现收藏夹功能**

- 收藏夹数据存储在 GlobalState 中：`sql-all-in-one.favorites`
- 收藏夹节点始终显示在树顶部
- 右键表/视图 → "添加到收藏夹"
- 收藏夹条目显示：连接名/数据库名/对象名
- 点击收藏夹条目 → 打开对应对象

- [ ] **Step 2: 实现对象搜索**

`objectFilters.ts`:
- 树视图顶部搜索框（TreeView `treeItem` 的 `description` 区域）
- 搜索命令：`sql-all-in-one.searchObjects`
- 搜索范围：当前数据库或所有数据库
- 搜索目标：对象名称、定义、注释
- 搜索结果以扁平列表展示在树中

- [ ] **Step 3: Commit**

```bash
git add src/views/databaseExplorer/objectFilters.ts src/views/databaseExplorer/treeNodes.ts src/views/databaseExplorer/DatabaseTreeProvider.ts
git commit -m "feat(database): add favorites and object search to database explorer"
```

---

## V3：SQL 执行引擎

**目标：** 实现 SQL 语句识别、查询执行、安全拦截、查询历史。

### Task 3.1：SQL 语句智能识别

**Files:**
- Create: `src/database/query/SqlStatementDetector.ts`
- Test: `src/test/database/statementDetector.test.ts`

- [ ] **Step 1: 实现 SqlStatementDetector**

`SqlStatementDetector.ts`:
- `detectCurrentStatement(document, position)`: 识别光标所在语句
  - 优先使用 AST 解析（复用 `SqlParserEngine`）识别语句边界
  - 回退方案：基于分号 + 引号感知的文本分割
- `detectSelectionOrCurrent(document, selection)`: 有选区返回选区，无选区返回当前语句
- `detectAllStatements(document)`: 识别文档中所有语句

- [ ] **Step 2: 编写测试**

`statementDetector.test.ts`:
- 测试单语句识别
- 测试多语句中光标定位
- 测试选区优先
- 测试带分号/不带分号的语句

- [ ] **Step 3: 运行测试**

Run: `npx vscode-test-cli -- src/test/database/statementDetector.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/database/query/SqlStatementDetector.ts src/test/database/statementDetector.test.ts
git commit -m "feat(database): implement SQL statement detection using AST"
```

---

### Task 3.2：查询执行器

**Files:**
- Create: `src/database/query/QueryExecutor.ts`
- Create: `src/database/query/QueryResult.ts`
- Test: `src/test/database/queryExecutor.test.ts`

- [ ] **Step 1: 创建 QueryResult 类型**

`QueryResult.ts` — 复用 `IDatabaseAdapter.ts` 中已定义的 `QueryResult`、`QueryError`、`ColumnMeta` 等类型，并新增：
- `QueryOptions`: maxRows, timeout, params, database
- `QueryStartEvent` / `QueryEndEvent`: 执行事件

- [ ] **Step 2: 实现 QueryExecutor**

`QueryExecutor.ts`:
- `execute()`: 执行查询，支持取消（CancellationTokenSource）
- `cancel()`: 取消正在执行的查询
- 事件发射：`onDidStartQuery`、`onDidEndQuery`
- 超时控制：使用 `Promise.race` + `setTimeout`
- 结果行数限制：`maxRows` 截断

- [ ] **Step 3: 编写测试**

使用 mock 适配器测试执行、取消、超时。

- [ ] **Step 4: Commit**

```bash
git add src/database/query/QueryExecutor.ts src/database/query/QueryResult.ts src/test/database/queryExecutor.test.ts
git commit -m "feat(database): implement query executor with timeout and cancellation"
```

---

### Task 3.3：安全拦截与查询命令

**Files:**
- Create: `src/database/query/SafeQueryGuard.ts`
- Modify: `package.json` — 注册执行命令
- Modify: `src/database/DatabaseModule.ts`

- [ ] **Step 1: 实现 SafeQueryGuard**

`SafeQueryGuard.ts`:
- `analyze(sql)`: 基于 AST 分析危险 SQL 模式
- 拦截规则：DELETE/UPDATE 无 WHERE、DROP TABLE、TRUNCATE、DROP DATABASE
- 返回 `SafetyCheckResult`: { safe, warnings, confirmations }
- 读取 `sql-all-in-one.safetyGuard.level` 配置

- [ ] **Step 2: 注册 SQL 执行命令**

`package.json` 新增：
- `sql-all-in-one.executeQuery` — 快捷键 `Ctrl+R` (Win) / `Cmd+R` (Mac)
- `sql-all-in-one.executeSelection` — 快捷键 `Ctrl+Shift+R`

- [ ] **Step 3: 实现命令处理器**

- 获取活动连接（无连接时提示选择）
- 调用 `SqlStatementDetector` 提取 SQL
- 调用 `SafeQueryGuard` 检查
- 如有确认项，弹出确认对话框
- 调用 `QueryExecutor.execute()`
- 查询历史记录

- [ ] **Step 4: Commit**

```bash
git add src/database/query/SafeQueryGuard.ts package.json src/database/DatabaseModule.ts
git commit -m "feat(database): add safe query guard and execute commands"
```

---

### Task 3.4：查询历史

**Files:**
- Create: `src/database/history/QueryHistory.ts`
- Modify: `src/database/query/QueryExecutor.ts` — 执行后记录历史

- [ ] **Step 1: 实现 QueryHistory**

`QueryHistory.ts`:
- 使用 GlobalState 存储，key: `sql-all-in-one.queryHistory`
- `add(entry)`: 添加历史条目，超出 `maxEntries` 时删除最旧
- `getAll()`: 返回所有历史
- `search(keyword)`: 按 SQL 文本搜索
- `clear()`: 清空历史
- `getRecent(count)`: 获取最近 N 条

- [ ] **Step 2: 在 QueryExecutor 中集成**

执行完成后自动调用 `QueryHistory.add()`。

- [ ] **Step 3: Commit**

```bash
git add src/database/history/QueryHistory.ts src/database/query/QueryExecutor.ts
git commit -m "feat(database): add query history with search and persistence"
```

---

## V4：查询结果面板（基础版）

**目标：** 实现查询结果的 Webview 展示，支持网格视图、分页、排序、基础导出。

### Task 4.1：结果面板 Webview 框架

**Files:**
- Create: `src/views/queryResult/QueryResultPanel.ts`
- Create: `src/views/queryResult/resultPanel.html`
- Create: `src/views/queryResult/resultPanel.css`
- Create: `src/views/queryResult/resultPanel.js`

- [ ] **Step 1: 实现 QueryResultPanel**

`QueryResultPanel.ts`:
- 管理 Webview 面板的生命周期
- `showResult(result)`: 向 Webview 发送查询结果
- `showLoading()`: 显示加载状态
- `showError(error)`: 显示错误信息
- 消息处理：监听 Webview 消息（排序、筛选、分页、导出）
- 面板标题显示连接名 + 数据库 + 耗时

- [ ] **Step 2: 实现 Webview 前端（基础网格）**

`resultPanel.html` / `resultPanel.css` / `resultPanel.js`:
- 工具栏：执行、取消、导出、筛选
- 数据网格：表头（列名 + 类型图标）+ 数据行
- 虚拟滚动：只渲染可见行，支持大数据集
- NULL 值灰色斜体显示
- 状态栏：记录数 + 耗时
- 三标签切换：结果集 / 消息 / 历史

- [ ] **Step 3: 集成到 SQL 执行流程**

修改 V3 的执行命令处理器，执行完成后调用 `QueryResultPanel.showResult()`。

- [ ] **Step 4: 手动测试**

- 执行 SELECT 查询 → 结果面板展示数据
- 执行错误 SQL → 消息标签显示错误
- 切换结果集/消息/历史标签

- [ ] **Step 5: Commit**

```bash
git add src/views/queryResult/
git commit -m "feat(database): add query result panel with grid view and virtual scrolling"
```

---

### Task 4.2：分页、排序与筛选

**Files:**
- Modify: `src/views/queryResult/resultPanel.js`
- Modify: `src/views/queryResult/resultPanel.css`

- [ ] **Step 1: 实现分页**

- 底部分页控件：上一页/下一页/页码
- 默认每页 100 行
- 分页切换时发送 `requestPage` 消息到扩展

- [ ] **Step 2: 实现列排序**

- 点击列头切换排序：升序 → 降序 → 取消
- 排序图标指示当前排序状态
- 客户端排序（对已加载的数据）+ 服务端排序（重新查询）

- [ ] **Step 3: 实现筛选栏**

- Navicat 风格多条件筛选
- 列名下拉 + 运算符下拉 + 值输入
- 运算符：=, !=, >, <, >=, <=, LIKE, IN, IS NULL, IS NOT NULL, BETWEEN
- 添加/删除条件按钮
- 应用筛选 → 重新查询

- [ ] **Step 4: Commit**

```bash
git add src/views/queryResult/
git commit -m "feat(database): add pagination, sorting, and filtering to result panel"
```

---

### Task 4.3：基础数据导出

**Files:**
- Create: `src/database/transfer/DataExporter.ts`
- Modify: `src/views/queryResult/QueryResultPanel.ts`

- [ ] **Step 1: 实现 DataExporter**

`DataExporter.ts`:
- `exportToCsv(rows, columns, options)`: CSV 导出
- `exportToJson(rows, columns, options)`: JSON 导出
- `exportToInsert(rows, columns, tableName)`: SQL INSERT 导出
- `exportToDdl(adapter, database, table)`: DDL 导出
- 所有导出都写入文件（通过 `vscode.window.showSaveDialog`）

- [ ] **Step 2: 在结果面板中集成导出**

- 工具栏"导出"下拉：CSV / JSON / SQL INSERT / DDL
- 导出查询结果或整表数据

- [ ] **Step 3: Commit**

```bash
git add src/database/transfer/DataExporter.ts src/views/queryResult/QueryResultPanel.ts
git commit -m "feat(database): add data export to CSV, JSON, SQL INSERT, and DDL"
```

---

## V5：数据编辑器

**目标：** 在结果面板中支持数据编辑、批量提交、表单视图、外键下拉、ENUM 选择器。

### Task 5.1：单元格编辑与批量提交

**Files:**
- Modify: `src/views/queryResult/resultPanel.js`
- Modify: `src/views/queryResult/resultPanel.css`
- Modify: `src/views/queryResult/QueryResultPanel.ts`

- [ ] **Step 1: 实现编辑模式切换**

- 工具栏新增"编辑模式"按钮（只读/可编辑切换）
- 可编辑模式下：双击单元格进入编辑、回车提交、Esc 取消
- 修改标记：已修改行前显示 `*` 标记，单元格背景色变化
- 新行占位：表格底部显示 `+` 行

- [ ] **Step 2: 实现 PendingChange 追踪**

- `pendingChanges: PendingChange[]` 数组
- 修改单元格 → 添加 `update` 变更
- 添加行 → 添加 `insert` 变更
- 删除行 → 添加 `delete` 变更
- 底部状态栏显示待提交数量

- [ ] **Step 3: 实现批量提交**

- "提交更改"按钮 → 发送 `commitChanges` 消息
- 扩展端：遍历 `pendingChanges`，生成 SQL 语句执行
  - update → `UPDATE table SET col=val WHERE pk=pkVal`
  - insert → `INSERT INTO table (cols) VALUES (vals)`
  - delete → `DELETE FROM table WHERE pk=pkVal`
- 执行成功 → 清空 pendingChanges，刷新数据
- 执行失败 → 显示错误，保留 pendingChanges

- [ ] **Step 4: Commit**

```bash
git add src/views/queryResult/
git commit -m "feat(database): add cell editing and batch commit to result panel"
```

---

### Task 5.2：表单视图、外键下拉、ENUM 选择器

**Files:**
- Modify: `src/views/queryResult/resultPanel.js`
- Modify: `src/views/queryResult/resultPanel.css`
- Modify: `src/views/queryResult/QueryResultPanel.ts`

- [ ] **Step 1: 实现表单视图**

- 网格/表单视图切换按钮
- 表单视图：逐条展示记录，每行一个字段
- 上一条/下一条导航
- 表单视图中同样支持编辑

- [ ] **Step 2: 实现外键下拉选择器**

- 检测列的 `referencedTable` 属性
- 编辑外键列时，发送 `requestForeignKeyOptions` 消息
- 扩展端：查询 `SELECT pk, display_col FROM referenced_table LIMIT 100`
- 返回选项列表，Webview 渲染为下拉选择器

- [ ] **Step 3: 实现 ENUM/SET 选择器**

- 检测列的 `isEnum` 和 `enumValues` 属性
- 编辑 ENUM 列时，显示下拉选择器列出所有可选值

- [ ] **Step 4: Commit**

```bash
git add src/views/queryResult/
git commit -m "feat(database): add form view, FK dropdown, and ENUM selector"
```

---

## V6：Schema 感知补全

**目标：** 连接数据库后，补全真实表名、列名，支持别名解析。

### Task 6.1：SchemaProvider 与缓存

**Files:**
- Create: `src/database/schema/SchemaProvider.ts`
- Create: `src/database/schema/SchemaCache.ts`
- Test: `src/test/database/schemaProvider.test.ts`

- [ ] **Step 1: 实现 SchemaCache**

`SchemaCache.ts`:
- 三级缓存：databaseCache(10min)、tableCache(5min)、columnCache(2min)
- `getDatabases()`: 优先缓存，过期则重新查询
- `getTables()`: 同上
- `getColumns()`: 同上
- `invalidate()`: 按范围清除缓存
- DDL 执行后自动刷新（读取 `refreshOnDDL` 配置）

- [ ] **Step 2: 实现 SchemaProvider**

`SchemaProvider.ts`:
- 依赖 ConnectionManager 和 SchemaCache
- `getCompletionItems(context)`: 根据补全上下文返回补全项
- `getTableColumns(database, table)`: 获取表列信息
- `resolveAlias(alias, fromClause)`: 别名解析

- [ ] **Step 3: 编写测试**

- 测试缓存 TTL 行为
- 测试 invalidate 清除
- 测试 SchemaProvider 返回正确的补全项

- [ ] **Step 4: Commit**

```bash
git add src/database/schema/ src/test/database/schemaProvider.test.ts
git commit -m "feat(database): add schema provider with multi-level cache"
```

---

### Task 6.2：SchemaCompletionProvider 集成

**Files:**
- Create: `src/completion/SchemaCompletionProvider.ts`
- Modify: `src/completion/SqlCompletionProvider.ts` — 接入 Schema 补全
- Modify: `src/database/DatabaseModule.ts`

- [ ] **Step 1: 实现 SchemaCompletionProvider**

`SchemaCompletionProvider.ts`:
- 仅在有活动数据库连接时生效
- 补全类型：数据库名、表名、列名、视图名、函数名、存储过程名
- AST 感知上下文识别：
  - `FROM` / `JOIN` 后 → 表名/视图名
  - `SELECT` / `WHERE` / `ORDER BY` 后 → 列名
  - `USE` 后 → 数据库名
  - `CALL` 后 → 存储过程名
  - 别名后 `.` → 对应表的列名
- 补全项图标：数据库📂、表📋、列🔹、视图👁、函数⚡、过程⚙

- [ ] **Step 2: 集成到 SqlCompletionProvider**

在 `SqlCompletionProvider.provideCompletionItems()` 中，在现有 6 类补全之前，插入 Schema 补全收集：
```typescript
if (connectionManager.getActiveConnection()) {
  await tryCollect('schema', () => schemaProvider.provideCompletionItems(...));
}
```

- [ ] **Step 3: 手动测试**

- 连接数据库后，输入 `SELECT * FROM ` → 补全列表显示真实表名
- 输入 `SELECT u.` → 补全列表显示对应表的列名
- 断开连接后，Schema 补全不出现

- [ ] **Step 4: Commit**

```bash
git add src/completion/SchemaCompletionProvider.ts src/completion/SqlCompletionProvider.ts src/database/DatabaseModule.ts
git commit -m "feat(database): integrate schema-aware completion with AST context"
```

---

## V7：表设计器

**目标：** 实现可视化的表设计器，支持字段、索引、外键、触发器设计，实时 SQL 预览。

### Task 7.1：表设计器 Webview

**Files:**
- Create: `src/views/tableDesigner/TableDesignerPanel.ts`
- Create: `src/views/tableDesigner/designerPanel.html`
- Create: `src/views/tableDesigner/designerPanel.css`
- Create: `src/views/tableDesigner/designerPanel.js`
- Modify: `package.json` — 注册 designTable 命令

- [ ] **Step 1: 实现 TableDesignerPanel**

`TableDesignerPanel.ts`:
- `openForCreate(database)`: 新建表设计器
- `openForEdit(database, table)`: 编辑已有表
- 加载表结构 → 发送到 Webview
- 保存时：生成 SQL → 确认对话框 → 执行

- [ ] **Step 2: 实现 Webview 前端**

六标签页：
- **字段**：添加/编辑/删除字段，类型下拉，约束勾选
- **索引**：添加/编辑/删除索引，选择列
- **外键**：添加/编辑/删除外键，引用关系
- **触发器**：查看触发器定义
- **选项**：引擎、字符集、排序规则、表注释
- **SQL 预览**：实时预览 CREATE TABLE / ALTER TABLE

- [ ] **Step 3: 实现 SQL 生成**

- 新建表 → `CREATE TABLE ...`
- 修改表 → `ALTER TABLE ... ADD/DROP/MODIFY COLUMN ...`
- SQL 预览随设计变更实时更新

- [ ] **Step 4: 注册命令**

`package.json` 新增 `sql-all-in-one.designTable` 命令，右键表节点触发。

- [ ] **Step 5: Commit**

```bash
git add src/views/tableDesigner/ package.json
git commit -m "feat(database): add table designer with SQL preview"
```

---

## V8：执行计划 + 高级功能

**目标：** 实现可视化执行计划、SSH 隧道、数据导入。

### Task 8.1：可视化执行计划

**Files:**
- Create: `src/database/query/ExplainPlan.ts`
- Create: `src/views/explainPlan/ExplainPlanPanel.ts`
- Create: `src/views/explainPlan/explainPanel.html`
- Create: `src/views/explainPlan/explainPanel.css`
- Create: `src/views/explainPlan/explainPanel.js`
- Modify: `package.json` — 注册 explainQuery 命令

- [ ] **Step 1: 实现 ExplainPlan 解析**

`ExplainPlan.ts`:
- `parseMysqlExplain(raw)`: 解析 MySQL EXPLAIN FORMAT=JSON 输出
- 转换为 `ExplainNode[]` 树结构

- [ ] **Step 2: 实现 ExplainPlanPanel**

- 三种视图切换：可视化 / 表格 / JSON
- 可视化视图：树形/流程图展示执行节点
- 表格视图：传统 EXPLAIN 结果表格
- JSON 视图：原始输出

- [ ] **Step 3: 集成到结果面板**

结果面板新增"执行计划"标签，点击后对当前 SQL 执行 EXPLAIN。

- [ ] **Step 4: Commit**

```bash
git add src/database/query/ExplainPlan.ts src/views/explainPlan/ package.json
git commit -m "feat(database): add visual explain plan panel"
```

---

### Task 8.2：SSH 隧道

**Files:**
- Create: `src/database/connection/SshTunnel.ts`
- Modify: `src/database/connection/ConnectionManager.ts`
- Modify: `src/views/connectionDialog/dialog.html` — SSH 标签页

- [ ] **Step 1: 安装 ssh2 依赖**

Run: `npm install ssh2`

- [ ] **Step 2: 实现 SshTunnel**

`SshTunnel.ts`:
- 使用 `ssh2` 的 `Client` 建立 SSH 连接
- `open()`: 建立 SSH 隧道，返回本地映射端口
- `close()`: 关闭隧道
- 生命周期与数据库连接绑定

- [ ] **Step 3: 集成到 ConnectionManager**

`connect()` 流程修改：
1. 检查 SSH 配置是否启用
2. 启用 → 先建立 SSH 隧道 → 获取本地端口 → 通过本地端口连接数据库
3. `disconnect()` 时同时关闭 SSH 隧道

- [ ] **Step 4: 连接对话框 SSH 标签页**

已在 V1 Task 1.6 中创建 SSH 标签页 UI，此处确保与 SshTunnel 集成。

- [ ] **Step 5: 手动测试**

- 配置 SSH 隧道连接 → 测试连接 → 验证通过隧道连接数据库

- [ ] **Step 6: Commit**

```bash
git add src/database/connection/SshTunnel.ts src/database/connection/ConnectionManager.ts package.json package-lock.json
git commit -m "feat(database): add SSH tunnel support for database connections"
```

---

### Task 8.3：数据导入

**Files:**
- Create: `src/database/transfer/DataImporter.ts`
- Create: `src/views/dataTransfer/DataTransferDialog.ts`
- Create: `src/views/dataTransfer/transferDialog.html`
- Create: `src/views/dataTransfer/transferDialog.css`
- Create: `src/views/dataTransfer/transferDialog.js`
- Modify: `package.json` — 注册 importData 命令

- [ ] **Step 1: 实现 DataImporter**

`DataImporter.ts`:
- `importFromCsv(filePath, tableName, mapping)`: CSV 导入
- `importFromJson(filePath, tableName)`: JSON 导入
- `importFromSql(filePath)`: SQL 文件执行
- 字段映射：源列 → 目标列
- 错误处理：跳过/中止策略

- [ ] **Step 2: 实现导入向导 Webview**

向导式流程：
1. 选择数据源文件
2. 选择目标表
3. 字段映射
4. 导入选项
5. 预览并执行

- [ ] **Step 3: 注册命令**

`package.json` 新增 `sql-all-in-one.importData` 命令。

- [ ] **Step 4: Commit**

```bash
git add src/database/transfer/DataImporter.ts src/views/dataTransfer/ package.json
git commit -m "feat(database): add data import wizard for CSV, JSON, and SQL"
```

---

## 自检清单

### 1. Spec 覆盖检查

| Spec 章节 | 对应迭代 | 状态 |
|-----------|---------|------|
| 三、数据库适配器层 | V1 Task 1.1, 1.2 | ✅ |
| 四、连接管理层 | V1 Task 1.3, 1.4, 1.5, 1.6, 1.7 | ✅ |
| 五、侧边栏数据库浏览器 | V2 Task 2.1, 2.2, 2.3 | ✅ |
| 六、SQL 执行与结果面板 | V3 + V4 + V5 | ✅ |
| 七、表设计器 | V7 Task 7.1 | ✅ |
| 八、连接配置对话框 | V1 Task 1.6 | ✅ |
| 九、Schema 感知补全 | V6 Task 6.1, 6.2 | ✅ |
| 十、查询历史 | V3 Task 3.4 | ✅ |
| 十一、数据导入导出 | V4 Task 4.3 + V8 Task 8.3 | ✅ |
| 十二、错误处理与安全 | V1 Task 1.4 + V3 Task 3.3 + V8 Task 8.2 | ✅ |
| 十三、命令与快捷键 | 各迭代中逐步注册 | ✅ |
| 十四、与现有模块集成 | V1 Task 1.5 + V6 Task 6.2 | ✅ |

### 2. Placeholder 扫描

- 无 TBD / TODO / "implement later" / "fill in details" — ✅
- 所有 Task 均有具体文件路径和实现要点 — ✅

### 3. 类型一致性

- `ConnectionConfig` 在 Task 1.1 定义，后续所有 Task 引用同一类型 — ✅
- `IDatabaseAdapter` 接口在 Task 1.1 定义，Task 1.2 实现同一接口 — ✅
- `QueryResult` 类型在 Task 1.1 定义，Task 3.2 和 Task 4.1 引用同一类型 — ✅
