# SQL All in One Schema 感知智能补全 PRD

> 版本：v1.1 | 日期：2026-05-28 | 优先级：P1
> 前置依赖：008-数据库适配器层与连接管理, 009-侧边栏数据库浏览器

---

## 目录

- [1. 功能概览](#1-功能概览)
- [2. P1-1：SchemaProvider 与缓存](#2-p1-1schemaprovider-与缓存)
- [3. P1-2：SchemaCompletionProvider 集成](#3-p1-2schemacompletionprovider-集成)
- [4. 配置项汇总](#4-配置项汇总)
- [5. 验收标准](#5-验收标准)
- [6. 非功能需求](#6-非功能需求)

---

## 1. 功能概览

连接数据库后，补全真实表名、列名，支持别名解析。从"基于内置关键字/函数库的静态补全"升级为"感知真实数据库结构的动态补全"。

| 编号 | 功能 | 一句话描述 | 用户感知强度 |
|------|------|-----------|-------------|
| P1-1 | SchemaProvider 与缓存 | 多级缓存的 Schema 信息提供者 | ★★☆☆☆ |
| P1-2 | SchemaCompletionProvider 集成 | AST 感知的动态补全，接入现有补全体系 | ★★★★★ |

---

## 2. P1-1：SchemaProvider 与缓存

### 2.1 背景与问题

Schema 信息查询频繁但变更不频繁，需要多级缓存减少数据库查询次数。

### 2.2 功能需求

#### 2.2.1 SchemaCache

**三级缓存**：

| 缓存层 | Key | TTL | 配置项 | 说明 |
|--------|-----|-----|--------|------|
| `databaseCache` | `{connectionId}` | 10min | `databaseTtl` | 数据库列表 |
| `tableCache` | `{connectionId}:{database}` | 5min | `tableTtl` | 表列表 |
| `columnCache` | `{connectionId}:{database}:{table}` | 2min | `columnTtl` | 列信息 |
| `functionCache` | `{connectionId}:{database}` | 10min | `functionTtl` | 函数/存储过程列表 |

**SchemaCache API**：

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getDatabases` | `connectionId` | `Promise<DatabaseInfo[]>` | 获取数据库列表 |
| `getTables` | `connectionId, database` | `Promise<TableInfo[]>` | 获取表列表 |
| `getColumns` | `connectionId, database, table` | `Promise<ColumnInfo[]>` | 获取列信息 |
| `getFunctions` | `connectionId, database` | `Promise<FunctionInfo[]>` | 获取函数列表 |
| `getProcedures` | `connectionId, database` | `Promise<ProcedureInfo[]>` | 获取存储过程列表 |
| `invalidate` | `connectionId, scope?` | `void` | 清除缓存 |

**缓存策略**：
- 优先返回缓存数据
- 缓存过期后重新查询并更新缓存
- `invalidate` 可按范围清除：`database` / `table` / `column` / `function` / `procedure`
- DDL 执行成功后自动调用 `invalidate` 刷新对应表缓存（受 `sql-all-in-one.schemaCache.refreshOnDDL` 配置控制）
- 数据编辑器（PRD-012）批量提交成功后，若涉及 DDL 变更，触发 `invalidate` 刷新对应表缓存
- 表设计器（PRD-014）保存成功后，触发 `invalidate` 刷新对应表缓存

**缓存预热**（受 `sql-all-in-one.schemaCache.prefetchOnConnect` 配置控制）：
- 连接成功后异步预热：加载默认数据库的表列表和列信息
- 预热在后台执行，不阻塞连接完成通知
- 预热失败不影响正常使用（下次补全时按需加载）

#### 2.2.2 SchemaProvider

**SchemaProvider API**：

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getCompletionItems` | `context: CompletionContext` | `Promise<CompletionItem[]>` | 获取补全项 |
| `getTableColumns` | `database, table` | `Promise<ColumnInfo[]>` | 获取表列信息 |
| `resolveAlias` | `alias, fromClause` | `string?` | 别名解析（返回表名） |

**CompletionContext 结构**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `connectionId` | `string` | 当前连接 ID |
| `database` | `string` | 当前数据库 |
| `clauseType` | `ClauseType` | 当前 SQL 子句类型 |
| `prefix` | `string` | 用户已输入的前缀 |
| `aliasMap` | `Map<string, string>` | 已解析的别名映射 |

**ClauseType 枚举**：

```
'USE' | 'FROM' | 'JOIN' | 'SELECT' | 'WHERE' | 'ORDER_BY' | 'GROUP_BY' | 'HAVING' | 'INSERT_INTO' | 'UPDATE' | 'CALL' | 'OTHER'
```

#### 2.2.3 别名解析

解析 SQL 中的表别名映射：

```sql
SELECT u.id, o.total
FROM users u
JOIN orders o ON u.id = o.user_id
```

解析结果：`{ u: 'users', o: 'orders' }`

**解析策略**：
1. 使用 `SqlParserEngine` 解析 SQL 为 AST
2. 遍历 `FROM` 和 `JOIN` 子句
3. 提取表名和别名
4. 构建 `aliasMap`

### 2.3 验收标准

- [ ] 缓存命中时不发起数据库查询
- [ ] 缓存过期后自动刷新
- [ ] `invalidate` 按范围正确清除
- [ ] DDL 执行后自动刷新对应表缓存
- [ ] 别名解析正确处理 FROM + JOIN

---

## 3. P1-2：SchemaCompletionProvider 集成

### 3.1 背景与问题

需要将 Schema 补全集成到现有的 `SqlCompletionProvider` 中，作为新的子 Provider。

### 3.2 功能需求

#### 3.2.1 SchemaCompletionProvider

**触发条件**：仅在有活动数据库连接时生效。

**补全类型**：

| 补全类型 | 触发场景 | 图标 | 优先级 |
|---------|---------|------|--------|
| 数据库名 | `USE` 后 | 📂 | 最高 |
| 表名 | `FROM` / `JOIN` / `INSERT INTO` / `UPDATE` 后 | 📋 | 最高 |
| 列名 | `SELECT` / `WHERE` / `ORDER BY` / `GROUP BY` 后 | 🔹 | 最高 |
| 别名后列名 | `alias.` 后 | 🔹 | 最高 |
| 视图名 | `FROM` / `JOIN` 后 | 👁 | 最高 |
| 函数名 | 任意位置 | ⚡ | 高 |
| 存储过程名 | `CALL` 后 | ⚙ | 最高 |

#### 3.2.2 补全项格式

| 类型 | label | detail | documentation |
|------|-------|--------|---------------|
| 数据库 | `mydb` | `Database` | 字符集、排序规则 |
| 表 | `users` | `Table · 1234 rows` | 表注释 |
| 列 | `id` | `INT · PK` | 列注释 |
| 视图 | `v_summary` | `View` | 视图定义摘要 |
| 函数 | `fn_calc` | `FUNCTION → INT` | 函数定义摘要 |
| 存储过程 | `sp_sync` | `PROCEDURE` | 过程定义摘要 |

#### 3.2.3 AST 感知上下文识别

| SQL 上下文 | 补全类型 | 示例 |
|-----------|---------|------|
| `USE \|` | 数据库名 | `USE mydb` |
| `SELECT * FROM \|` | 表名/视图名 | `FROM users` |
| `SELECT * FROM users u JOIN \|` | 表名/视图名 | `JOIN orders` |
| `SELECT \| FROM users` | 列名 | `SELECT id, name` |
| `SELECT u.\| FROM users u` | users 表的列名 | `u.id, u.name` |
| `WHERE \|` | 列名 | `WHERE status = 1` |
| `ORDER BY \|` | 列名 | `ORDER BY created_at` |
| `INSERT INTO \|` | 表名 | `INSERT INTO users` |
| `UPDATE \|` | 表名 | `UPDATE users` |
| `CALL \|` | 存储过程名 | `CALL sp_sync` |

#### 3.2.3a 补全项排序策略

当候选补全项超过 200 项上限时，使用以下优先级排序：

| 优先级 | 规则 | 说明 |
|--------|------|------|
| 1 | 精确匹配 | `label === prefix` 的项排在最前 |
| 2 | 前缀匹配 | `label.startsWith(prefix)` |
| 3 | 包含匹配 | `label.includes(prefix)` |
| 4 | MRU 优先 | 最近使用的表/排列在前面（基于 MRU 缓存，GlobalState 存储最近 50 条引用） |
| 5 | 主键优先 | 主键列排在普通列前面 |

超过 200 项的截断时，底部显示提示：`... 还有 N 项匹配，输入更多字符缩小范围`

#### 3.2.4 补全优先级

在 `SqlCompletionProvider.provideCompletionItems()` 中的排序：

```
1. Schema 补全（表名、列名）— 来自真实数据库，优先级最高
2. CTE 名称补全 — 来自当前文档
3. 函数补全 — 来自内置函数库 + 数据库函数
4. 关键字补全 — 来自内置关键字库
5. 片段补全 — 来自 snippets
```

#### 3.2.5 集成方式

在 `SqlCompletionProvider.provideCompletionItems()` 中，在现有 6 类补全之前插入 Schema 补全收集：

```typescript
if (connectionManager.getActiveConnection()) {
  await tryCollect('schema', () => schemaCompletionProvider.provideCompletionItems(...));
}
```

Schema 补全受现有 `sql-all-in-one.enableCompletion` 全局开关控制，同时新增独立开关 `sql-all-in-one.completion.schema`。

#### 3.2.6 性能要求

| 指标 | 要求 |
|------|------|
| 补全响应时间 | ≤ 100ms（缓存命中时） |
| 首次补全 | ≤ 500ms（需查询数据库） |
| 补全项数量 | 最多 200 项 |

#### 3.2.7 悬停提示增强

连接数据库后，悬停表名/列名时显示实际 Schema 信息：

| 悬停对象 | 显示内容 |
|---------|---------|
| 表名 | 表注释、引擎、行数、字符集 |
| 列名 | 类型、是否可空、默认值、注释、约束 |

**集成方式**：在现有 `HoverProvider` 的 `provideHover` 方法中，对于表名/列名的悬停请求，若存在活动连接，优先查询 Schema 信息返回。Schema 信息优先级低于文档内定义（如 CTE），高于内置关键字说明。无活动连接时回退到现有静态悬停逻辑。

### 3.3 验收标准

- [ ] 连接数据库后，`FROM` 后补全显示真实表名
- [ ] `SELECT u.` 后补全显示对应表的列名
- [ ] `USE` 后补全显示数据库名
- [ ] `CALL` 后补全显示存储过程名
- [ ] 断开连接后，Schema 补全不出现
- [ ] Schema 补全优先级高于关键字补全
- [ ] 补全响应时间 ≤ 100ms（缓存命中）
- [ ] 悬停表名显示实际 Schema 信息

---

## 4. 配置项汇总

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| `sql-all-in-one.completion.schema` | `boolean` | `true` | 启用 Schema 补全 |
| `sql-all-in-one.schemaCache.databaseTtl` | `number` | `600` | 数据库列表缓存 TTL(s) |
| `sql-all-in-one.schemaCache.tableTtl` | `number` | `300` | 表列表缓存 TTL(s) |
| `sql-all-in-one.schemaCache.columnTtl` | `number` | `120` | 列信息缓存 TTL(s) |
| `sql-all-in-one.schemaCache.functionTtl` | `number` | `600` | 函数/存储过程缓存 TTL(s) |
| `sql-all-in-one.schemaCache.refreshOnDDL` | `boolean` | `true` | DDL 执行后自动刷新缓存 |
| `sql-all-in-one.schemaCache.prefetchOnConnect` | `boolean` | `true` | 连接后异步预热 Schema 缓存 |

---

## 5. 验收标准

### 5.1 功能验收

| 编号 | 验收项 | 验证方式 |
|------|--------|---------|
| AC-01 | 表名补全 | 输入 `SELECT * FROM ` → 显示真实表名 |
| AC-02 | 列名补全 | 输入 `SELECT ` → 显示列名 |
| AC-03 | 别名解析 | 输入 `SELECT u.` → 显示 users 表的列名 |
| AC-04 | 数据库名补全 | 输入 `USE ` → 显示数据库名 |
| AC-05 | 存储过程补全 | 输入 `CALL ` → 显示存储过程名 |
| AC-06 | 断开连接 | 断开后 → Schema 补全消失 |
| AC-07 | 缓存 | 第二次补全 → 响应更快 |
| AC-08 | DDL 刷新 | 执行 ALTER TABLE → 补全反映变更 |

---

## 6. 非功能需求

### 6.1 文件清单

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/database/schema/SchemaProvider.ts` | 新建 | Schema 信息提供者 |
| `src/database/schema/SchemaCache.ts` | 新建 | Schema 缓存 |
| `src/completion/SchemaCompletionProvider.ts` | 新建 | Schema 补全 Provider |
| `src/completion/SqlCompletionProvider.ts` | 修改 | 接入 Schema 补全 |
| `src/hover/` | 修改 | 悬停提示增强 |
| `src/database/DatabaseModule.ts` | 修改 | 注册 SchemaProvider |
