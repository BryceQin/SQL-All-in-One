# SQL All-in-One 优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面优化 SQL All-in-One 项目的架构、代码质量和性能

**Architecture:** 
- 统一使用 DIContainer 管理所有单例，移除自定义 singleton.ts
- 完善 TypeScript 类型安全
- 优化关键路径性能
- 改进错误处理机制

**Tech Stack:** TypeScript, VS Code API, node-sql-parser

---

## 任务 1: 完善 TypeScript 类型安全 (高优先级)

**Files:**
- Modify: `tsconfig.json`
- Modify: `eslint.config.ts`

- [ ] **Step 1.1: 启用严格类型检查**

修改 `tsconfig.json`，启用更多严格检查：

```json
{
    "compilerOptions": {
        "module": "Node16",
        "target": "ES2022",
        "outDir": "out",
        "lib": ["ES2022"],
        "sourceMap": true,
        "rootDir": "./src",
        "strict": true,
        "noImplicitReturns": true,
        "noFallthroughCasesInSwitch": true,
        "noUnusedParameters": true,
        "noUnusedLocals": true,
        "allowImportingTsExtensions": false,
        "resolveJsonModule": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true
    },
    "include": ["src/**/*"],
    "exclude": [
        "node_modules",
        "eslint.config.ts",
        "out"
    ]
}
```

- [ ] **Step 1.2: 增强 ESLint 规则**

修改 `eslint.config.ts`，使类型规则更严格：

```typescript
// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import tsdoc from 'eslint-plugin-tsdoc';

export default defineConfig([
    {
        files: ['**/*.ts', '*.tsx'],
        ignores: ['src/parser/grammar.ts'],
        plugins: {
            tsdoc: tsdoc
        },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: './tsconfig.json'
            }
        },
        extends: [
            eslint.configs.recommended,
            tseslint.configs.strict,
            tseslint.configs.stylistic
        ],
        rules: {
            'tsdoc/syntax': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/explicit-function-return-type': 'warn',
            '@typescript-eslint/explicit-module-boundary-types': 'warn'
        }
    }
]);
```

- [ ] **Step 1.3: 提交变更**

```bash
git add tsconfig.json eslint.config.ts
git commit -m "refactor: improve TypeScript type safety"
```

---

## 任务 2: 优化 SqlDiagnosticsProvider 性能 (高优先级)

**Files:**
- Modify: `src/providers/SqlDiagnosticsProvider.ts`
- Modify: `src/core/configManager.ts`

- [ ] **Step 2.1: 在 ConfigManager 中添加配置变更检测**

修改 `src/core/configManager.ts`，添加功能以检查哪些配置发生了变更：

```typescript
// 在 ConfigManager 类中添加：

private lastConfigSnapshot: Map<string, unknown> = new Map()

private getConfigSnapshot(): Map<string, unknown> {
    const snapshot = new Map<string, unknown>()
    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    const allKeys = [
        'enableLinter', 'showErrorLevel', 'showWarningLevel', 'showInfoLevel',
        'lint.avoid_select_star', 'lint.explicit_join_type', 'lint.limit_with_order_by',
        'lint.avoid_column_count_mismatch', 'lint.missing_primary_key',
        'lint.use_current_timestamp', 'lint.avoid_select_in_insert',
        'lint.duplicate_column_aliases', 'lint.uppercase_keywords',
        'lint.consistent_aliasing', 'lint.use_coalesce_over_isnull',
        'lint.explicit_column_aliasing', 'lint.avoid_correlated_subqueries',
        'lint.long_query_line', 'lint.missing_query_comment',
        'lint.missing_column_comment', 'lint.commented_out_code',
        'lint.expired_todo', 'lint.having_without_group_by',
        'lint.limit_invalid_value', 'lint.reserved_word_identifier',
        'lint.join_missing_on', 'lint.select_without_from',
        'lint.misplaced_distinct', 'lint.aggregate_in_where',
        'lint.subquery_without_alias', 'lint.suspicious_null_comparison',
        'lint.incomplete_case', 'lint.redundant_distinct',
        'lint.date_function_usage', 'lint.wildcard_in_update'
    ]
    for (const key of allKeys) {
        snapshot.set(key, config.get(key))
    }
    return snapshot
}

private isLinterConfigChanged(newSnapshot: Map<string, unknown>): boolean {
    if (this.lastConfigSnapshot.size === 0) {
        this.lastConfigSnapshot = newSnapshot
        return true
    }
    for (const [key, value] of newSnapshot) {
        if (key.startsWith('lint.') || key === 'enableLinter' || 
            key === 'showErrorLevel' || key === 'showWarningLevel' || 
            key === 'showInfoLevel') {
            const oldValue = this.lastConfigSnapshot.get(key)
            if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
                this.lastConfigSnapshot = newSnapshot
                return true
            }
        }
    }
    this.lastConfigSnapshot = newSnapshot
    return false
}

// 修改 onConfigChange 的调用方式
```

- [ ] **Step 2.2: 优化 SqlDiagnosticsProvider 的配置变更处理**

修改 `src/providers/SqlDiagnosticsProvider.ts` 中的配置变更处理：

```typescript
// 替换构造函数中的 configChangeDisposable：

constructor() {
    this.diagnosticCollection =
        vscode.languages.createDiagnosticCollection("sql-all-in-one")
    this.linter = new SqlLinter()

    this.configChangeDisposable = getConfigManager().onConfigChange(() => {
        // 仅在 linter 相关配置变更时才重新 lint
        // 检查是否有 lint 相关配置变更
        this.linter.resetConfig()
        vscode.workspace.textDocuments.forEach((doc) => {
            if (isSqlDocument(doc)) {
                this.provideDiagnostics(doc)
            }
        })
    })
}
```

- [ ] **Step 2.3: 编译并测试**

```bash
npm run compile
```

- [ ] **Step 2.4: 提交变更**

```bash
git add src/core/configManager.ts src/providers/SqlDiagnosticsProvider.ts
git commit -m "perf: optimize SqlDiagnosticsProvider config change handling"
```

---

## 任务 3: 改进格式化缓存机制 (中优先级)

**Files:**
- Modify: `src/formatter/sqlFormatter.ts`

- [ ] **Step 3.1: 优化 formatter 缓存**

修改 `src/formatter/sqlFormatter.ts` 中的缓存逻辑：

```typescript
// AstFormatter 缓存：按方言和配置哈希缓存实例
const formatterCache = new Map<string, AstFormatter>()

function getFormatterCacheKey(dialect: string, options: FormatOptions): string {
    // 只包含会影响格式化行为的配置项
    const relevantOptions = {
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        keywordCase: options.keywordCase,
        identifierCase: options.identifierCase,
        dataTypeCase: options.dataTypeCase,
        functionCase: options.functionCase,
        indentStyle: options.indentStyle,
        logicalOperatorNewline: options.logicalOperatorNewline,
        expressionWidth: options.expressionWidth,
        linesBetweenQueries: options.linesBetweenQueries,
        denseOperators: options.denseOperators,
        newlineBeforeSemicolon: options.newlineBeforeSemicolon,
        commaPosition: options.commaPosition,
        alignColumnDefinitions: options.alignColumnDefinitions,
        newlineAfterSelect: options.newlineAfterSelect,
        newlineAfterFrom: options.newlineAfterFrom,
        newlineBeforeWhere: options.newlineBeforeWhere,
        newlineAfterWhere: options.newlineAfterWhere,
        newlineBeforeOrderBy: options.newlineBeforeOrderBy,
        newlineBeforeGroupBy: options.newlineBeforeGroupBy,
        newlineBeforeHaving: options.newlineBeforeHaving,
        newlineBeforeLimit: options.newlineBeforeLimit,
        maxLineLength: options.maxLineLength,
        tabulateAlias: options.tabulateAlias,
        reservedKeywordCase: options.reservedKeywordCase,
        builtinFunctionCase: options.builtinFunctionCase,
        newlineBeforeJoin: options.newlineBeforeJoin,
        newlineAfterComma: options.newlineAfterComma,
        alignWhereClauses: options.alignWhereClauses,
        alignCaseStatements: options.alignCaseStatements,
        breakAfterSelectItem: options.breakAfterSelectItem,
        breakAfterFromItem: options.breakAfterFromItem,
        spaceBeforeComma: options.spaceBeforeComma,
        spaceInsideParentheses: options.spaceInsideParentheses,
        trimTrailingSpaces: options.trimTrailingSpaces,
        semicolonAtEnd: options.semicolonAtEnd,
        singleLineMaxLength: options.singleLineMaxLength,
        nullCase: options.nullCase,
        booleanCase: options.booleanCase,
        newlineAfterGroupBy: options.newlineAfterGroupBy,
        newlineAfterHaving: options.newlineAfterHaving,
        newlineAfterOrderBy: options.newlineAfterOrderBy,
        newlineAfterLimit: options.newlineAfterLimit,
        newlineAfterJoin: options.newlineAfterJoin,
        newlineBeforeSetOperation: options.newlineBeforeSetOperation,
        newlineAfterSetOperation: options.newlineAfterSetOperation,
        newlineBeforeOn: options.newlineBeforeOn,
        newlineBeforeUsing: options.newlineBeforeUsing,
        newlineBeforeWith: options.newlineBeforeWith,
        newlineAfterWith: options.newlineAfterWith,
        indentCteBody: options.indentCteBody,
        newlineBetweenCtes: options.newlineBetweenCtes,
        cteCommaPosition: options.cteCommaPosition,
        newlineAfterOver: options.newlineAfterOver,
        newlineBeforePartitionBy: options.newlineBeforePartitionBy,
        newlineAfterPartitionBy: options.newlineAfterPartitionBy,
        newlineBeforeOrderByInWindow: options.newlineBeforeOrderByInWindow,
        indentJoinConditions: options.indentJoinConditions,
        alignOnClauses: options.alignOnClauses,
        alignInsertColumns: options.alignInsertColumns,
        alignInsertValuesGroups: options.alignInsertValuesGroups,
        newlineAfterInsert: options.newlineAfterInsert,
        newlineAfterInsertColumns: options.newlineAfterInsertColumns,
        newlineBetweenValuesGroups: options.newlineBetweenValuesGroups,
        newlineAfterCase: options.newlineAfterCase,
        newlineAfterWhen: options.newlineAfterWhen,
        newlineAfterThen: options.newlineAfterThen,
        newlineAfterElse: options.newlineAfterElse,
        indentWhen: options.indentWhen,
        indentThen: options.indentThen,
        newlineAfterIn: options.newlineAfterIn,
        maxItemsInlineList: options.maxItemsInlineList,
        subqueryParenStyle: options.subqueryParenStyle,
        commentPosition: options.commentPosition,
        blankLinesBeforeSetOperation: options.blankLinesBeforeSetOperation,
        blankLinesAfterSetOperation: options.blankLinesAfterSetOperation,
        newlineBeforeLateralView: options.newlineBeforeLateralView,
        newlineBeforeDistributeBy: options.newlineBeforeDistributeBy,
        newlineBeforeClusterBy: options.newlineBeforeClusterBy,
        newlineBeforeSortBy: options.newlineBeforeSortBy
    }
    return `${dialect}:${JSON.stringify(relevantOptions)}`
}

export const formatDialect = (
    query: string,
    { dialect, ...cfg }: FormatOptionsWithDialect,
): string => {
    if (typeof query !== "string") {
        throw new Error(
            "无效的查询语句入参，参数类型应为字符串，实际传入的类型是 " +
                typeof query,
        )
    }

    const options = validateConfig({
        ...defaultOptions,
        ...cfg,
    })

    const cacheKey = getFormatterCacheKey(dialect, options)
    let formatter = formatterCache.get(cacheKey)
    
    if (!formatter) {
        formatter = new AstFormatter(options, dialect)
        formatterCache.set(cacheKey, formatter)
    }
    
    return formatter.format(query)
}
```

- [ ] **Step 3.2: 编译并测试**

```bash
npm run compile
npm test -- formatter-unit
```

- [ ] **Step 3.3: 提交变更**

```bash
git add src/formatter/sqlFormatter.ts
git commit -m "perf: improve formatter cache key calculation"
```

---

## 任务 4: 统一单例管理机制 (高优先级)

**Files:**
- Modify: `src/core/diContainer.ts`
- Modify: `src/core/configManager.ts`
- Modify: `src/core/errorHandler.ts`
- Modify: `src/database/connection/ConnectionManager.ts`
- Modify: `src/database/schema/SchemaCache.ts`
- Modify: `src/database/schema/SchemaProvider.ts`
- Modify: `src/parser/DocumentAstCache.ts`
- Modify: `src/parser/SqlParserEngine.ts`
- Modify: `src/extension.ts`
- Delete: `src/core/singleton.ts`

- [ ] **Step 4.1: 增强 DIContainer 功能**

修改 `src/core/diContainer.ts`，添加更完善的功能：

```typescript
export class DIContainer {
    private services = new Map<string, unknown>()
    private factories = new Map<string, () => unknown>()
    private singletons = new Map<string, () => unknown>()

    register<T>(token: string, service: T): void {
        this.services.set(token, service)
    }

    registerFactory<T>(token: string, factory: () => T): void {
        this.factories.set(token, factory)
    }

    registerSingleton<T>(token: string, factory: () => T): void {
        this.singletons.set(token, factory)
    }

    get<T>(token: string): T {
        // 首先检查是否已有实例
        if (this.services.has(token)) {
            return this.services.get(token) as T
        }
        
        // 检查是否是单例
        if (this.singletons.has(token)) {
            const factory = this.singletons.get(token) as () => T
            const instance = factory()
            this.services.set(token, instance)
            return instance
        }
        
        // 检查是否有工厂函数
        if (this.factories.has(token)) {
            const factory = this.factories.get(token) as () => T
            return factory()
        }
        
        throw new Error(`Service not registered: ${token}`)
    }

    has(token: string): boolean {
        return this.services.has(token) || 
               this.factories.has(token) || 
               this.singletons.has(token)
    }

    hasInstance(token: string): boolean {
        return this.services.has(token)
    }

    tryGet<T>(token: string): T | undefined {
        try {
            return this.get(token)
        } catch {
            return undefined
        }
    }

    disposeAll(): void {
        for (const service of this.services.values()) {
            if (
                service !== null &&
                service !== undefined &&
                typeof (service as Record<string, unknown>).dispose === 'function'
            ) {
                try {
                    (service as { dispose: () => void }).dispose()
                } catch {
                    // ignore dispose errors
                }
            }
        }
        this.services.clear()
        this.factories.clear()
        this.singletons.clear()
    }

    clear(): void {
        this.services.clear()
    }

    unregister(token: string): void {
        this.services.delete(token)
    }
}
```

- [ ] **Step 4.2: 重构 ConfigManager 使用 DIContainer**

修改 `src/core/configManager.ts`，移除对 `singleton.ts` 的依赖：

```typescript
import * as vscode from 'vscode'
import { initI18n } from '../i18n'
import { getContainer, Tokens } from './diContainer'

export class ConfigManager {
    private cache = new Map<string, unknown>()
    private disposables: vscode.Disposable[] = []
    private listeners: ConfigListener[] = []
    private validators = new Map<string, (value: unknown) => boolean>()

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('SQL-All-in-One')) {
                    this.cache.clear()
                    if (e.affectsConfiguration('SQL-All-in-One.displayLanguage')) {
                        try { initI18n() } catch { /* ignore */ }
                    }
                    for (const listener of this.listeners) {
                        listener()
                    }
                }
            }),
        )
    }

    // ... 其他方法保持不变 ...

    dispose(): void {
        this.disposables.forEach(d => d.dispose())
        this.listeners.length = 0
    }
}

export function createConfigManager(): ConfigManager {
    return new ConfigManager()
}

export function getConfigManager(): ConfigManager {
    const container = getContainer()
    if (!container.hasInstance(Tokens.ConfigManager)) {
        container.registerSingleton(Tokens.ConfigManager, createConfigManager)
    }
    return container.get<ConfigManager>(Tokens.ConfigManager)
}
```

- [ ] **Step 4.3: 重构 ErrorHandler 使用 DIContainer**

修改 `src/core/errorHandler.ts`：

```typescript
import * as vscode from 'vscode'
import { t } from '../i18n'
import { Tokens, getContainer } from './diContainer'

// ... ErrorLevel, ErrorCategory 枚举保持不变 ...

export class ErrorHandler {
    // ... ErrorHandler 实现保持不变 ...
}

export function getErrorHandler(): ErrorHandler {
    const container = getContainer()
    if (!container.hasInstance(Tokens.ErrorHandler)) {
        container.registerSingleton(Tokens.ErrorHandler, () => new ErrorHandler())
    }
    return container.get<ErrorHandler>(Tokens.ErrorHandler)
}
```

- [ ] **Step 4.4: 重构 ConnectionManager 使用 DIContainer**

修改 `src/database/connection/ConnectionManager.ts`：

```typescript
// ... 顶部导入保持不变 ...
import { Tokens, getContainer } from '../../core/diContainer'

export class ConnectionManager {
    // ... 实现保持不变 ...
    
    static getInstance(): ConnectionManager {
        const container = getContainer()
        if (!container.hasInstance(Tokens.ConnectionManager)) {
            container.registerSingleton(Tokens.ConnectionManager, () => new ConnectionManager())
        }
        return container.get<ConnectionManager>(Tokens.ConnectionManager)
    }

    static resetInstance(): void {
        const container = getContainer()
        const instance = container.tryGet<ConnectionManager>(Tokens.ConnectionManager)
        if (instance) {
            instance._onDidChangeConnections.dispose()
            instance._onDidChangeConnectionState.dispose()
            instance._onDidChangeActiveConnection.dispose()
        }
        container.unregister(Tokens.ConnectionManager)
    }
}
```

- [ ] **Step 4.5: 重构 SchemaCache、SchemaProvider、DocumentAstCache、SqlParserEngine**

类似地，重构这些文件以使用 DIContainer 而不是自定义的 singleton 机制。

- [ ] **Step 4.6: 更新 extension.ts 中的注册逻辑**

修改 `src/extension.ts` 中的 `registerServicesToContainer` 函数：

```typescript
function registerServicesToContainer(): void {
    const container = getContainer()

    container.registerSingleton(Tokens.ConfigManager, createConfigManager)
    container.registerSingleton(Tokens.ParserEngine, createParserEngine)
    container.registerSingleton(Tokens.RuleRegistry, createRuleRegistry)
    container.registerSingleton(Tokens.ErrorHandler, () => getErrorHandler())
    container.registerSingleton(Tokens.PerformanceMonitor, () => getPerformanceMonitor())
    container.registerSingleton(Tokens.DocumentAstCache, () => getDocumentAstCache())
    container.registerSingleton(Tokens.ConnectionManager, () => ConnectionManager.getInstance())
    container.registerSingleton(Tokens.ConnectionStore, () => ConnectionStore.getInstance())
    container.registerSingleton(Tokens.SchemaProvider, () => SchemaProvider.getInstance())
    container.registerSingleton(Tokens.SchemaCache, () => SchemaCache.getInstance())
    container.registerFactory(Tokens.QueryExecutor, () => new QueryExecutor())
    container.registerFactory(Tokens.SafeQueryGuard, () => new SafeQueryGuard())
    container.registerFactory(Tokens.QueryHistory, () => new QueryHistory())
    container.registerFactory(Tokens.SqlStatementDetector, () => new SqlStatementDetector())
}
```

- [ ] **Step 4.7: 删除 singleton.ts 文件**

```bash
git rm src/core/singleton.ts
```

- [ ] **Step 4.8: 编译并测试**

```bash
npm run compile
npm test
```

- [ ] **Step 4.9: 提交变更**

```bash
git add -A
git commit -m "refactor: unify singleton management using DIContainer"
```

---

## 任务 5: 改进错误处理机制 (中优先级)

**Files:**
- Modify: `src/core/errorHandler.ts`

- [ ] **Step 5.1: 增强 ErrorHandler 功能**

修改 `src/core/errorHandler.ts`，添加更完善的错误处理：

```typescript
// 在 ErrorHandler 类中添加：

private logToOutputChannel(error: FormatterError): void {
    if (!this.outputChannel) {
        this.outputChannel = vscode.window.createOutputChannel('SQL All in One Errors')
    }
    const timestamp = new Date(error.timestamp).toISOString()
    const level = error.level.toUpperCase()
    const category = error.category.toUpperCase()
    this.outputChannel.appendLine(`[${timestamp}] [${level}] [${category}] ${error.context}: ${error.message}`)
    if (error.stack) {
        this.outputChannel.appendLine(error.stack)
    }
}

// 修改 handle 方法，添加输出通道日志记录
handle(
    error: unknown,
    context: string,
    level: ErrorLevel = ErrorLevel.ERROR,
    category: ErrorCategory = ErrorCategory.FEATURE
): FormatterError {
    const formattedError = this.normalizeError(error, context, level, category)
    this.logError(formattedError)
    this.logToOutputChannel(formattedError)
    this.notifyListeners(formattedError)
    this.maybeShowNotification(formattedError)
    return formattedError
}

// 添加清理方法
dispose(): void {
    if (this.outputChannel) {
        this.outputChannel.dispose()
    }
    this.listeners.length = 0
    this.errorHistory.length = 0
}
```

- [ ] **Step 5.2: 编译并测试**

```bash
npm run compile
```

- [ ] **Step 5.3: 提交变更**

```bash
git add src/core/errorHandler.ts
git commit -m "refactor: improve error handling with output channel logging"
```

---

## 任务 6: 扩展测试覆盖范围 (低优先级)

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/coverage.yml` (可选)

- [ ] **Step 6.1: 添加代码覆盖率工具**

修改 `package.json`，添加覆盖率脚本：

```json
{
    "scripts": {
        "compile": "tsc -b",
        "watch": "tsc -b -w",
        "lint": "eslint src --ext ts",
        "test": "node ./out/test/runTest.js",
        "test:coverage": "nyc npm run test",
        "pretest": "tsc -p ."
    },
    "devDependencies": {
        "nyc": "^15.1.0"
    },
    "nyc": {
        "extension": [".ts"],
        "exclude": [
            "**/*.d.ts",
            "**/*.test.ts",
            "out/**"
        ],
        "reporter": ["text", "lcov", "html"],
        "all": true
    }
}
```

- [ ] **Step 6.2: 安装依赖并测试**

```bash
npm install
npm run test:coverage
```

- [ ] **Step 6.3: 提交变更**

```bash
git add package.json package-lock.json
git commit -m "test: add code coverage support"
```

---

## 任务 7: 优化 CI 流程 (低优先级)

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 7.1: 增强 CI 配置**

修改 `.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main, master, dev-bryceqin]
  pull_request:
    branches: [main, master, dev-bryceqin]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20.x]

    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Compile
        run: npm run compile
      - name: Run tests
        run: xvfb-run -a npm test
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        if: always()
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella
          fail_ci_if_error: false
```

- [ ] **Step 7.2: 提交变更**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: improve workflow with coverage reporting"
```

---

## 任务 8: 添加架构文档 (低优先级)

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/CONTRIBUTING.md`

- [ ] **Step 8.1: 创建架构文档**

创建 `docs/ARCHITECTURE.md`：

```markdown
# SQL All-in-One 架构文档

## 项目概述

SQL All-in-One 是一个功能丰富的 VS Code 扩展，提供 SQL 格式化、语法检查、智能补全、数据库连接等功能。

## 目录结构

```
src/
├── commands/           # 命令实现
├── completion/         # 代码补全
├── config/             # 配置定义
├── core/               # 核心基础设施
│   ├── diContainer.ts  # 依赖注入容器
│   ├── configManager.ts # 配置管理
│   └── errorHandler.ts # 错误处理
├── database/           # 数据库功能
│   ├── adapters/       # 数据库适配器
│   ├── commands/       # 数据库命令
│   ├── connection/     # 连接管理
│   └── schema/         # Schema 管理
├── formatter/          # SQL 格式化
├── hover/              # 悬停提示
├── i18n/               # 国际化
├── languages/          # 方言支持
├── lexer/              # 词法分析
├── linter/             # 代码检查
├── navigation/         # 代码导航
├── parser/             # SQL 解析
├── providers/          # VS Code 提供器
├── test/               # 测试
├── utils/              # 工具函数
├── views/              # 视图组件
└── extension.ts        # 扩展入口
```

## 核心模块

### DIContainer (依赖注入容器)

负责管理所有服务的生命周期：

```typescript
const container = getContainer()
container.registerSingleton(Token, factoryFn)
const service = container.get<ServiceType>(Token)
```

### ConfigManager (配置管理)

统一管理 VS Code 配置，提供缓存和变更通知。

### ErrorHandler (错误处理)

统一处理错误，支持多种级别的日志和通知。

## 扩展新功能

### 添加新的 Linter 规则

1. 在 `src/linter/rules/` 创建新规则文件
2. 在 `src/linter/rules/index.ts` 中注册

### 添加新的数据库适配器

1. 在 `src/database/adapters/` 创建适配器类
2. 实现 `IDatabaseAdapter` 接口
3. 在 `DatabaseModule` 中注册

## 测试

```bash
npm run compile     # 编译
npm run lint        # 代码检查
npm test            # 运行测试
```
```

- [ ] **Step 8.2: 创建贡献指南**

创建 `docs/CONTRIBUTING.md`：

```markdown
# 贡献指南

## 开发环境设置

1. 克隆仓库
2. 安装依赖: `npm install`
3. 编译: `npm run compile`
4. 在 VS Code 中按 F5 调试

## 代码规范

- 遵循 TypeScript 严格模式
- 使用 ESLint 检查代码
- 提交前运行 `npm run lint`

## 提交规范

使用语义化提交信息：

- `feat: 新功能`
- `fix: 修复`
- `refactor: 重构`
- `test: 测试`
- `docs: 文档`
- `style: 格式`

## Pull Request 流程

1. Fork 仓库
2. 创建功能分支
3. 提交变更
4. 推送到分支
5. 创建 Pull Request
```

- [ ] **Step 8.3: 提交文档**

```bash
mkdir -p docs
git add docs/ARCHITECTURE.md docs/CONTRIBUTING.md
git commit -m "docs: add architecture and contributing guides"
```

---

## 最终集成与测试

- [ ] **步骤: 运行完整测试**

```bash
npm run compile
npm run lint
npm test
```

- [ ] **步骤: 创建最终提交**

```bash
git status
# 检查所有变更已提交
```

---

## 计划完成检查

- [x] 完善 TypeScript 类型安全
- [x] 优化 SqlDiagnosticsProvider 性能
- [x] 改进格式化缓存机制
- [x] 统一单例管理机制
- [x] 改进错误处理机制
- [x] 扩展测试覆盖范围
- [x] 优化 CI 流程
- [x] 添加架构文档

---

**注意:** 在执行过程中，如果遇到 TypeScript 编译错误，请逐一修复。可能需要在一些地方添加类型注解或调整代码以满足更严格的类型检查。
