# SQL 编辑器增强设计：Webview Monaco 语言特性

## 概述

查询结果面板的 SQL 编辑器（Webview 内嵌 Monaco）目前仅有基础 SQL 语法高亮，缺少方言化高亮、自动补全、函数签名提示、悬停提示、SQL 格式化和 Lint 诊断等语言特性。主编辑器已有完整的语言特性实现，但依赖 VS Code API，无法直接在 Webview 中使用。

本设计采用**混合模式**：静态特性（关键字/函数/片段补全、方言化语法高亮）在 Webview 内直接注册，动态特性（Schema 补全、悬停、格式化、Lint）通过消息桥接到 Extension Host 处理。

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  Webview (query-result.html/js)                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Monaco Editor                                   │    │
│  │  ┌──────────────────┐  ┌──────────────────────┐ │    │
│  │  │ 静态特性(本地)    │  │ 动态特性(桥接)       │ │    │
│  │  │ - Monarch 高亮   │  │ - Schema 补全        │ │    │
│  │  │ - 关键字补全     │  │ - 悬停提示           │ │    │
│  │  │ - 函数补全+签名  │  │ - SQL 格式化         │ │    │
│  │  │ - 代码片段补全   │  │ - SQL Lint           │ │    │
│  │  └──────────────────┘  └──────────┬───────────┘ │    │
│  └────────────────────────────────────┼─────────────┘    │
│                                       │ postMessage      │
└───────────────────────────────────────┼──────────────────┘
                                        │
┌───────────────────────────────────────┼──────────────────┐
│  Extension Host                       │                  │
│                                       ▼                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │  LanguageBridge                                  │    │
│  │  - handleCompletionRequest()                     │    │
│  │  - handleHoverRequest()                          │    │
│  │  - handleFormatRequest()                         │    │
│  │  - handleDiagnosticsRequest()                    │    │
│  │  - exportLanguageData()                          │    │
│  └──────────────┬──────────────────────────────────┘    │
│                 │ 调用                                    │
│  ┌──────────────▼──────────────────────────────────┐    │
│  │  现有 Provider 体系                              │    │
│  │  - SchemaCompletionProvider                     │    │
│  │  - SqlCompletionProvider                        │    │
│  │  - HoverResolver 体系                           │    │
│  │  - SqlFormattingProvider                        │    │
│  │  - AstLinter / SqlLinter                        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  MonacoDataAdapter (类型转换)                     │    │
│  │  - VS Code CompletionItem → Monaco CompletionItem│    │
│  │  - VS Code Hover → Monaco Hover contents        │    │
│  │  - VS Code Diagnostic → Monaco Marker           │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## 静态特性（Webview 内直接注册）

### 方言化语法高亮

当前 Monaco 使用内置 `sql` 语言，不区分方言。需为每种方言注册独立 Monarch tokenizer。

注册语言 ID：`mysql`、`hive`、`spark`、`flinksql`、`postgresql`、`bigquery`、`sqlite`

每种方言的 Monarch 规则包含：
- 关键字列表（从 `allDialects` 导出）
- 数据类型列表（从 `allDialects` 导出）
- 函数名列表（从 `allDialects` 导出）
- 字符串/注释/数字的通用 token 规则

Extension Host 在初始化 Webview 时通过 `languageData` 消息传入方言的 Monarch 规则。Webview 收到后调用 `monaco.languages.setMonarchTokensProvider(dialect, rules)` 注册。

### 关键字补全

数据源：`SqlCompletionProvider.keywordMap` 中每种方言的关键字和数据类型列表。

Webview 注册 `monaco.languages.registerCompletionItemProvider(dialect, { provideCompletionItems })`，从本地 `languageData.keywords` 和 `languageData.dataTypes` 直接返回补全项。

补全项格式：
```typescript
{
  label: 'SELECT',
  kind: monaco.languages.CompletionItemKind.Keyword,
  insertText: 'SELECT',
  sortText: '1_SELECT'  // 关键字排序前缀
}
```

### 函数补全 + 签名提示

数据源：`functionSigMap` 中每种方言的 `FunctionSignature[]`。

函数名补全：
```typescript
{
  label: 'COUNT',
  kind: monaco.languages.CompletionItemKind.Function,
  insertText: 'COUNT(${1:expr})',
  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  documentation: 'Returns the number of rows...',
  sortText: '2_COUNT'
}
```

签名提示：注册 `monaco.languages.registerSignatureHelpProvider(dialect, { provideSignatureHelp })`，从本地 `languageData.functions` 解析参数信息。

### 代码片段补全

数据源：`snippets/` 目录下各方言的 JSON 文件。

Extension Host 读取当前方言的 snippet JSON，序列化后通过 `languageData` 消息传入。Webview 注册补全提供者返回 snippet 类型补全项。

补全项格式：
```typescript
{
  label: snippet.prefix,
  kind: monaco.languages.CompletionItemKind.Snippet,
  insertText: snippet.body.join('\n'),
  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  documentation: snippet.description,
  sortText: '0_' + snippet.prefix  // 片段排序最前
}
```

### 数据传输

Extension Host 在创建/更新 Webview 时发送 `languageData` 消息：

```typescript
interface LanguageData {
  dialect: string
  keywords: string[]
  dataTypes: string[]
  functions: FunctionSignature[]
  snippets: SnippetDef[]
  monarchRules: object  // Monarch tokenizer 规则
}

interface FunctionSignature {
  name: string
  parameters: { name: string; type: string; optional: boolean }[]
  returnType: string
  description: string
}

interface SnippetDef {
  prefix: string
  body: string[]
  description: string
}
```

## 动态特性（桥接到 Extension Host）

### Schema 感知补全

流程：
1. 用户输入触发补全（`.` 或空格触发）
2. Webview 发送 `requestCompletion` 消息，包含 SQL 全文、光标位置、方言
3. Extension Host 的 `LanguageBridge` 收到请求
4. 构造虚拟 Document（从 SQL 字符串创建 `vscode.TextDocument`）
5. 调用 `SchemaCompletionProvider.provideCompletionItems()`
6. 通过 `MonacoDataAdapter` 转换结果
7. 发送 `completionResult` 消息回 Webview
8. Webview 显示补全列表

防抖：Webview 端 150ms 防抖，避免频繁请求。

缓存：Extension Host 端缓存最近一次补全结果，相同 SQL + 位置直接返回。

虚拟 Document 构造：实现 `InMemoryDocument` 类，满足 `vscode.TextDocument` 接口的最小子集（`getText()`、`lineAt()`、`offsetAt()`、`positionAt()`、`uri`、`languageId`、`lineCount`），避免创建真实文档带来的 MRU 污染和资源占用。

### 悬停提示

流程：
1. 鼠标悬停触发
2. Webview 发送 `requestHover` 消息
3. Extension Host 调用 `HoverResolver` 体系
4. 转换结果返回

悬停内容分类：
- 函数悬停：签名 + 参数说明 + 示例
- 关键字悬停：用法说明
- Schema 悬停：表结构/列类型/注释

### SQL 格式化

流程：
1. 用户按快捷键（Shift+Alt+F 或 Cmd+Shift+F）
2. Webview 发送 `requestFormat` 消息
3. Extension Host 调用 `SqlFormattingProvider`
4. 返回格式化后的 SQL
5. Webview 替换编辑器内容

格式化选项：使用用户在 VS Code 设置中配置的格式化选项。

### SQL Lint/诊断

流程：
1. SQL 内容变更，防抖 500ms
2. Webview 发送 `requestDiagnostics` 消息
3. Extension Host 调用 `AstLinter` + `SqlLinter`
4. 转换诊断结果
5. Webview 调用 `monaco.editor.setModelMarkers()` 显示

诊断级别映射：
- VS Code `DiagnosticSeverity.Error` → Monaco `MarkerSeverity.Error`
- VS Code `DiagnosticSeverity.Warning` → Monaco `MarkerSeverity.Warning`
- VS Code `DiagnosticSeverity.Information` → Monaco `MarkerSeverity.Info`
- VS Code `DiagnosticSeverity.Hint` → Monaco `MarkerSeverity.Hint`

## 统一消息协议

### Webview → Extension Host

```typescript
type WebviewToHostMessage =
  | { command: 'requestCompletion'; requestId: string; sql: string; position: { line: number; column: number }; dialect: string }
  | { command: 'requestHover'; requestId: string; sql: string; position: { line: number; column: number }; dialect: string }
  | { command: 'requestFormat'; requestId: string; sql: string; dialect: string }
  | { command: 'requestDiagnostics'; requestId: string; sql: string; dialect: string }
```

### Extension Host → Webview

```typescript
type HostToWebviewMessage =
  | { command: 'languageData'; data: LanguageData }
  | { command: 'completionResult'; requestId: string; items: MonacoCompletionItem[] }
  | { command: 'hoverResult'; requestId: string; contents: string[] | null }
  | { command: 'formatResult'; requestId: string; formattedSql: string }
  | { command: 'diagnosticsResult'; requestId: string; diagnostics: MonacoDiagnostic[] }
```

### Monaco 补全项格式

```typescript
interface MonacoCompletionItem {
  label: string
  kind: number  // monaco.languages.CompletionItemKind
  insertText: string
  insertTextRules?: number  // InsertAsSnippet
  documentation?: string
  sortText: string
  filterText?: string
  detail?: string
}
```

### Monaco 诊断格式

```typescript
interface MonacoDiagnostic {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  message: string
  severity: number  // MarkerSeverity
  source?: string
}
```

## 请求-响应匹配

```typescript
const pendingRequests = new Map<string, {
  resolve: (value: any) => void
  timer: ReturnType<typeof setTimeout>
}>()

function sendBridgeRequest(message: WebviewToHostMessage): Promise<any> {
  return new Promise((resolve) => {
    pendingRequests.set(message.requestId, {
      resolve,
      timer: setTimeout(() => {
        pendingRequests.delete(message.requestId)
        resolve({ suggestions: [] })
      }, 3000)
    })
    vscode.postMessage(message)
  })
}

function handleBridgeResponse(message: HostToWebviewMessage) {
  if (!('requestId' in message)) return
  const pending = pendingRequests.get(message.requestId)
  if (pending) {
    clearTimeout(pending.timer)
    pendingRequests.delete(message.requestId)
    pending.resolve(message)
  }
}
```

## 新增文件

```
src/views/queryResult/
  LanguageBridge.ts            # Extension Host 端桥接处理
  MonacoDataAdapter.ts         # VS Code 类型 → Monaco 类型转换
  InMemoryDocument.ts          # 虚拟 TextDocument 实现

media/monaco-languages/        # 方言化 Monarch 语法规则（可选，也可内联到 languageData）
```

## 修改文件

```
src/views/queryResult/QueryResultPanel.ts  # 增加 LanguageBridge 集成、消息处理
media/query-result.js                       # 增加 Monaco 语言特性注册、桥接请求逻辑
media/query-result.html                     # 可能需要增加快捷键绑定
```

## 生命周期

```
Webview 创建
  → Extension Host 发送 languageData（静态数据：关键字/函数/片段/Monarch 规则）
  → Webview 注册静态语言特性（Monarch 高亮 + 关键字/函数/片段补全 + 签名提示）
  → Webview 注册动态语言特性（桥接补全/悬停/格式化/Lint）
  → 用户开始编辑

用户输入触发补全
  → 静态补全：本地直接返回（关键字/函数/片段）
  → 动态补全：桥接到 Extension Host（Schema）
  → 合并结果，显示补全列表

连接切换
  → Extension Host 重新发送 languageData
  → Webview 重新注册所有语言特性

Webview 销毁
  → LanguageBridge dispose，清理虚拟 Document 和缓存
```

## 错误处理

- 桥接请求超时（3 秒）：静默返回空结果，不阻塞编辑
- Extension Host 异常：捕获错误，Webview 端不显示错误弹窗
- 虚拟 Document 创建失败：降级为不使用 AST 的简单补全
- Monaco 加载失败（fallback textarea）：不注册任何语言特性
- 多个补全提供者结果合并：Monaco 自动合并同一语言的多个 provider 结果，静态补全和桥接补全无需手动合并

## 性能考量

- 静态补全零延迟，不经过消息桥接
- Schema 补全首次请求可能较慢（需查询数据库），后续有 SchemaCache 缓存
- Lint 诊断 500ms 防抖，避免频繁 AST 解析
- 虚拟 Document 使用后立即关闭，避免占用资源
- 补全请求 150ms 防抖，减少消息频率
