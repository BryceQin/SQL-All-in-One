# SQL 智能补全（IntelliSense）设计文档

## 概述

为 SQL All in One 插件添加完整的 SQL 智能补全功能，包括关键字补全、函数补全（含签名和描述）、代码片段触发补全、CTE 名称补全、表名/列名上下文补全。

## 技术方案

采用**混合方案**：简单场景用正则/预计算数据，上下文感知场景用 Token 流推断。

| 补全类型 | 实现方式 | 原因 |
|----------|----------|------|
| 关键字 | 预计算数组 | 不依赖文档上下文 |
| 函数（含签名） | 预计算数组 | 不依赖文档上下文 |
| 代码片段 | 读取 `snippets/sql.json` | 不依赖文档上下文 |
| CTE 名称 | 正则扫描 WITH 块 | 上下文简单，正则可覆盖 |
| 表名/列名 | Token 流推断上下文 + 正则降级 | 需要确定光标位置在哪个子句中 |

## 方言覆盖

hive / mysql / spark / sql 四种方言全部覆盖，函数签名和描述数据在各方言的 `languages/*/functions.ts` 中内聚管理。

## 文件结构

```
src/
├── completion/                          # 新增：补全模块
│   ├── SqlCompletionProvider.ts         # 主入口，实现 CompletionItemProvider 接口
│   ├── keywordCompletion.ts             # 关键字补全数据生成
│   ├── functionCompletion.ts            # 函数补全（含签名 + 描述）
│   ├── functionSignatures.ts            # 函数签名数据结构定义
│   ├── snippetCompletion.ts             # 代码片段补全
│   ├── cteCompletion.ts                 # CTE 名称补全（正则扫描）
│   └── identifierCompletion.ts          # 表名/列名上下文补全（Token 流推断）
├── languages/                           # 修改：扩展各方言函数数据
│   ├── hive/hive.functions.ts           # 扩展：从 string[] 改为 FunctionSignature[]
│   ├── mysql/mysql.functions.ts         # 同上
│   ├── spark/spark.functions.ts         # 同上
│   └── sql/sql.functions.ts             # 同上
├── extension.ts                         # 修改：注册 CompletionItemProvider
└── package.json                         # 修改：新增 enableCompletion 配置项
```

## 核心数据结构

### 函数签名接口

```typescript
export interface FunctionSignature {
    name: string                    // 函数名，如 "SUBSTR"
    params: string[]                // 参数列表，如 ["string str", "int start", "int length"]
    returnType?: string             // 返回类型，如 "string"
    description: string             // 功能描述，如 "返回字符串的子串"
    category: FunctionCategory      // 分类
}

export type FunctionCategory = 
    | 'string' | 'math' | 'date' | 'aggregate' | 'conditional'
    | 'window' | 'collection' | 'type-conversion' | 'encryption' | 'table' | 'other'
```

### 现有函数数据改造

从：
```typescript
export const functions: string[] = ['ABS', 'ACOS', 'ASIN', ...]
```

改为：
```typescript
export const functions: FunctionSignature[] = [
    {
        name: 'SUBSTR',
        params: ['string str', 'int start', 'int length'],
        returnType: 'string',
        description: '返回字符串的子串，从 start 位置开始截取指定长度',
        category: 'string',
    },
    // ...
]
```

## 核心类设计

### SqlCompletionProvider（编排入口）

实现 `vscode.CompletionItemProvider` 接口，在 `provideCompletionItems` 中调用各子模块并合并结果。

数据流：
```
用户输入 → provideCompletionItems(doc, pos, token)
  ├─ getDialect(langId)                    确定方言
  ├─ getKeywordItems(dialect)              关键字补全
  ├─ getFunctionItems(dialect)             函数补全
  ├─ getSnippetItems()                     代码片段补全
  ├─ getCTEItems(doc, pos)                 CTE 名称补全
  └─ getIdentifierItems(doc, pos, tokenizer) 表名/列名上下文补全
       ↓
  合并 + 去重 → vscode.CompletionItem[]
```

### 补全项排序规则

通过 `sortText` 控制排序：

| 优先级 | 类型 | sortText 前缀 | CompletionItemKind |
|--------|------|---------------|--------------------|
| 1 | 代码片段 | `0_` | Snippet |
| 2 | 关键字 | `1_` | Keyword / TypeParameter |
| 3 | 函数 | `2_` | Function |
| 4 | CTE 名称 | `3_` | Variable |
| 5 | 表名/列名 | `4_` | Field / Class |

### 注册方式

```typescript
const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.']
vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'sql' },
    completionProvider, ...triggerChars
)
vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'hive' },
    completionProvider, ...triggerChars
)
```

## 各子模块设计

### 1. 关键字补全（keywordCompletion.ts）

- 输入：方言的 `keywords: string[]` 和 `dataTypes: string[]`
- 输出：`CompletionItem[]`，kind 分别为 `Keyword` 和 `TypeParameter`
- 在 Provider 构造时预计算并缓存，不随文档变化

### 2. 函数补全（functionCompletion.ts）

- 输入：方言的 `FunctionSignature[]`
- 输出：`CompletionItem[]`
- `insertText` 使用 `SnippetString` 实现参数占位符和 Tab 跳转
- `detail` 显示签名摘要（如 `string | SUBSTR(string str, int start, int length)`）
- `documentation` 使用 `MarkdownString` 展示完整说明
- 在 Provider 构造时预计算并缓存

### 3. 代码片段补全（snippetCompletion.ts）

- 读取 `snippets/sql.json` 的 17 个现有代码片段
- `label` 使用中文描述，`filterText` 使用英文前缀
- `insertText` 保留原有的 `$1`、`$2` 占位符逻辑
- 在 Provider 构造时预计算并缓存

### 4. CTE 名称补全（cteCompletion.ts）

- 正则扫描光标之前的文本，提取 `WITH xxx AS (...)` 中的 CTE 名称
- 仅当光标在 WITH 块之后（即已有 SELECT/INSERT 等主查询）时提供补全
- 作用域采用简化策略：文档级全局可见，不做嵌套作用域分析

### 5. 表名/列名上下文补全（identifierCompletion.ts）

使用 **Token 流推断**（不修改 AST 结构）：

```
光标位置 offset → Tokenizer.tokenize(fullText) → Token[]
  ↓
找到包含 offset 的 Token
  ↓
向前扫描最近的子句关键字：
  - FROM / JOIN → 提示表名
  - SELECT / WHERE / GROUP / ORDER → 提示列名
```

点号触发场景（`alias.`）：
- 正则提取 `.` 前的别名
- 从 FROM/JOIN 中查找别名对应的表名
- 返回文档中已出现的该表列名

解析失败时的降级：回退到正则提取文档中所有标识符作为候选。

## 位置追踪

采用 Token 流 `start` 字段做位置追踪，**不修改 `grammar.ne` 和 `ast.ts`**。

- `Token` 接口已有 `start: number`（字符偏移量）
- 遍历 Token 流找到包含光标位置的 Token
- 从该 Token 向前扫描找到最近的子句关键字
- Token 流分析在线性时间内完成，即使 SQL 未写完也有效

## 配置项

在 `package.json` 的 `contributes.configuration` 中新增：

| 配置键 | 类型 | 默认 | 说明 |
|--------|------|------|------|
| `SQL-All-in-One.enableCompletion` | boolean | true | 总开关 |
| `SQL-All-in-One.completion.keywords` | boolean | true | 关键字补全 |
| `SQL-All-in-One.completion.functions` | boolean | true | 函数补全 |
| `SQL-All-in-One.completion.snippets` | boolean | true | 代码片段补全 |
| `SQL-All-in-One.completion.cteNames` | boolean | true | CTE 名称补全 |
| `SQL-All-in-One.completion.identifiers` | boolean | true | 表名/列名补全 |

## 边界情况与错误处理

| 场景 | 处理策略 |
|------|----------|
| 空文件 | 仅返回关键字 + 函数 + 片段补全 |
| SQL 语法错误 / 解析失败 | Token 流降级推断；CTE 正则降级 |
| 超大文件（> 10 万字符） | 线性 Token 遍历，不做回溯正则 |
| 嵌套 CTE | 文档级全局可见，不做作用域分析 |
| 多语句 SQL | 从光标位置向上扫描确定语句边界 |
| 候选过多 | 每类限制 200 个候选 |

## 测试策略

| 类型 | 覆盖内容 | 工具 |
|------|----------|------|
| 单元测试 | keywordCompletion / functionCompletion / snippetCompletion 输出格式 | Mocha |
| 单元测试 | extractCTENames 正则正确性 | Mocha |
| 单元测试 | Token 流上下文推断准确性 | Mocha |
| 集成测试 | "SEL" → SELECT 补全 | vscode-test |
| 集成测试 | WITH 块后 CTE 名称提示 | vscode-test |
| 集成测试 | alias. 列名补全触发 | vscode-test |

## 已知限制

1. **无真实 schema**：列名补全只能从当前文档中已出现的列推导，无法查询数据库元数据
2. **CTE 作用域简化**：不做嵌套子查询的 CTE 作用域隔离
3. **不实现 SignatureHelp**：函数参数签名通过 SnippetString 的占位符实现，不额外实现 `SignatureHelpProvider`