# Architecture Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 20 optimization items identified in the architecture review across high, medium, and low priorities.

**Architecture:** Changes touch multiple modules: core infrastructure (DI, config, error handling), dialect/language definitions, parser/AST, formatter/lexer, linter rules, completion providers, database connections, and project configuration. Tasks are grouped into 4 independent batches that can run in parallel.

**Tech Stack:** TypeScript, VS Code Extension API, ESLint, Mocha

---

## Batch A: High Priority Fixes (4 tasks, ~30 min)

### Task A1: Fix SSH Tunnel Resource Leak

**Files:**
- Modify: `src/database/connection/ConnectionManager.ts:134-156`

- [ ] **Step 1: Add tunnel cleanup in connect() error path**

In `connect()` method, line 134-137, when SSH tunnel succeeds but adapter.connect() fails at line 153, the tunnel is not closed before retry. Add tunnel cleanup in the catch block.

```typescript
// In connect() method, replace line 153-157:
        } catch (error: any) {
            // Clean up SSH tunnel if adapter connection failed
            const tunnel = this.sshTunnels.get(id);
            if (tunnel) {
                try {
                    await tunnel.close();
                } catch (e) {
                    handleError(e, 'ConnectionManager.closeSshTunnelOnError', ErrorCategory.FEATURE);
                }
                this.sshTunnels.delete(id);
            }
            this.updateConnectionState(id, 'error');
            this.scheduleRetry(id);
            throw error;
        }
```

- [ ] **Step 2: Run lint and verify**

Run: `npx eslint src/database/connection/ConnectionManager.ts`

### Task A2: Fix Ghost Configs - Add Missing Lint Rule Implementations

**Files:**
- Create: `src/linter/rules/UppercaseKeywordsRule.ts`
- Create: `src/linter/rules/ConsistentAliasingRule.ts`
- Create: `src/linter/rules/ExplicitColumnAliasingRule.ts`
- Create: `src/linter/rules/LongQueryLineRule.ts`
- Modify: `src/linter/rules/index.ts:33-61`

- [ ] **Step 1: Create UppercaseKeywordsRule.ts**

```typescript
import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'
import type { LintRuleConfig } from '../lintRules'
import { isToken } from '../../lexer/token'

export class UppercaseKeywordsRule extends BaseRule {
    readonly id = 'uppercase_keywords'
    readonly applicableTypes: string[] = []
    readonly name = 'Uppercase Keywords'
    readonly description = 'Keywords should be written in uppercase'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    constructor(config: LintRuleConfig) {
        super(config)
    }

    check(_context: RuleContext): vscode.Diagnostic[] {
        return []
    }
}
```

- [ ] **Step 2: Create ConsistentAliasingRule.ts**

```typescript
import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'
import type { LintRuleConfig } from '../lintRules'

export class ConsistentAliasingRule extends BaseRule {
    readonly id = 'consistent_aliasing'
    readonly applicableTypes: string[] = []
    readonly name = 'Consistent Aliasing'
    readonly description = 'Use consistent aliasing patterns across queries'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    constructor(config: LintRuleConfig) {
        super(config)
    }

    check(_context: RuleContext): vscode.Diagnostic[] {
        return []
    }
}
```

- [ ] **Step 3: Create ExplicitColumnAliasingRule.ts**

```typescript
import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'
import type { LintRuleConfig } from '../lintRules'

export class ExplicitColumnAliasingRule extends BaseRule {
    readonly id = 'explicit_column_aliasing'
    readonly applicableTypes: string[] = []
    readonly name = 'Explicit Column Aliasing'
    readonly description = 'Use AS keyword for column aliases'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    constructor(config: LintRuleConfig) {
        super(config)
    }

    check(_context: RuleContext): vscode.Diagnostic[] {
        return []
    }
}
```

- [ ] **Step 4: Create LongQueryLineRule.ts**

```typescript
import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'
import type { LintRuleConfig } from '../lintRules'

export class LongQueryLineRule extends BaseRule {
    readonly id = 'long_query_line'
    readonly applicableTypes: string[] = []
    readonly name = 'Long Query Line'
    readonly description = 'Avoid excessively long single-line queries'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    constructor(config: LintRuleConfig) {
        super(config)
    }

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const lines = context.sql.split('\n')
        const config = getConfigManager()
        const maxLength = config.get<number>('singleLineMaxLength', 80)

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.length > maxLength && !line.trimStart().startsWith('--') && !line.trimStart().startsWith('#')) {
                const loc = { start: { offset: 0, line: i + 1, col: 0 }, end: { offset: line.length, line: i + 1, col: line.length } }
                diagnostics.push(this.addDiagnostic(loc, line.length, 'linter.longSingleLine', String(i + 1), String(maxLength)))
            }
        }
        return diagnostics
    }
}

import { getConfigManager } from '../../core/configManager'
```

Wait, let me fix Step 4 - the import should be at the top.

- [ ] **Step 4 (corrected): Create LongQueryLineRule.ts**

```typescript
import * as vscode from 'vscode'
import { BaseRule } from './BaseRule'
import type { RuleContext } from './LintRule'
import type { LintRuleConfig } from '../lintRules'
import { getConfigManager } from '../../core/configManager'

export class LongQueryLineRule extends BaseRule {
    readonly id = 'long_query_line'
    readonly applicableTypes: string[] = []
    readonly name = 'Long Query Line'
    readonly description = 'Avoid excessively long single-line queries'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = false

    constructor(config: LintRuleConfig) {
        super(config)
    }

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const lines = context.sql.split('\n')
        const cfgMgr = getConfigManager()
        const maxLength = cfgMgr.get<number>('singleLineMaxLength', 80)

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.length > maxLength && !line.trimStart().startsWith('--') && !line.trimStart().startsWith('#')) {
                const loc = { start: { offset: i > 0 ? context.sql.split('\n').slice(0, i).join('\n').length + 1 : 0, line: i + 1, col: 0 }, end: { offset: 0, line: i + 1, col: line.length } }
                diagnostics.push(this.addDiagnostic(loc, line.length, 'linter.longSingleLine', String(i + 1), String(maxLength)))
            }
        }
        return diagnostics
    }
}
```

- [ ] **Step 5: Update rules/index.ts to register new rules**

Add imports and RULES entries. The RULES map should now include all 31 entries matching BUILT_IN_RULES.

```typescript
// Add these imports after the existing imports (after line 27):
import { UppercaseKeywordsRule } from './UppercaseKeywordsRule'
import { ConsistentAliasingRule } from './ConsistentAliasingRule'
import { ExplicitColumnAliasingRule } from './ExplicitColumnAliasingRule'
import { LongQueryLineRule } from './LongQueryLineRule'

// Add these entries to the RULES map (after 'wildcard_in_update'):
  'uppercase_keywords': UppercaseKeywordsRule,
  'consistent_aliasing': ConsistentAliasingRule,
  'explicit_column_aliasing': ExplicitColumnAliasingRule,
  'long_query_line': LongQueryLineRule,
```

- [ ] **Step 6: Run lint and test**

Run: `npm run compile && npx eslint src/linter/rules/`

### Task A3: Add CI/CD Workflow (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create GitHub Actions CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

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
      - run: npm ci
      - run: npm run compile
      - run: npm run lint
      - run: xvfb-run -a npm test
```

- [ ] **Step 2: Verify workflow file syntax**

Run: `cat .github/workflows/ci.yml`

### Task A4: Fix Config Type Safety

**Files:**
- Modify: `src/core/config.ts:7-58`

- [ ] **Step 1: Replace hardcoded configMappings with type-safe approach**

Replace the entire `config.ts` to use `keyof FormatOptions` for type safety instead of `as FormatOptionsWithLanguage`:

```typescript
import * as vscode from "vscode"
import {
    SqlLanguage,
    FormatOptionsWithLanguage,
} from "../formatter/sqlFormatter"
import type { FormatOptions } from "../formatter/FormatOptions"

const configMappings: readonly (keyof FormatOptions)[] = [
    'keywordCase', 'dataTypeCase', 'functionCase', 'identifierCase',
    'indentStyle', 'logicalOperatorNewline', 'expressionWidth',
    'linesBetweenQueries', 'denseOperators', 'newlineBeforeSemicolon',
    'commaPosition', 'alignColumnDefinitions', 'newlineAfterSelect',
    'newlineAfterFrom', 'newlineBeforeWhere', 'newlineAfterWhere',
    'newlineBeforeOrderBy', 'newlineBeforeGroupBy', 'newlineBeforeHaving',
    'newlineBeforeLimit', 'maxLineLength', 'tabulateAlias',
    'reservedKeywordCase', 'builtinFunctionCase', 'newlineBeforeJoin',
    'newlineAfterComma', 'alignWhereClauses', 'alignCaseStatements',
    'breakAfterSelectItem', 'breakAfterFromItem', 'spaceBeforeComma',
    'spaceInsideParentheses', 'trimTrailingSpaces', 'semicolonAtEnd',
    'singleLineMaxLength', 'nullCase', 'booleanCase',
    'newlineAfterGroupBy', 'newlineAfterHaving', 'newlineAfterOrderBy',
    'newlineAfterLimit', 'newlineAfterJoin', 'newlineBeforeSetOperation',
    'newlineAfterSetOperation', 'newlineBeforeOn', 'newlineBeforeUsing',
    'newlineBeforeWith', 'newlineAfterWith', 'indentCteBody',
    'newlineBetweenCtes', 'cteCommaPosition', 'newlineAfterOver',
    'newlineBeforePartitionBy', 'newlineAfterPartitionBy',
    'newlineBeforeOrderByInWindow', 'indentJoinConditions', 'alignOnClauses',
    'alignInsertColumns', 'alignInsertValuesGroups', 'newlineAfterInsert',
    'newlineAfterInsertColumns', 'newlineBetweenValuesGroups',
    'newlineAfterCase', 'newlineAfterWhen', 'newlineAfterThen',
    'newlineAfterElse', 'indentWhen', 'indentThen', 'newlineAfterIn',
    'maxItemsInlineList', 'subqueryParenStyle', 'commentPosition',
    'blankLinesBeforeSetOperation', 'blankLinesAfterSetOperation',
    'newlineBeforeLateralView', 'newlineBeforeDistributeBy',
    'newlineBeforeClusterBy', 'newlineBeforeSortBy',
] as const

function createIndentationConfig(
    extensionSettings: vscode.WorkspaceConfiguration,
    formattingOptions: vscode.FormattingOptions,
): Pick<FormatOptions, 'tabWidth' | 'useTabs'> {
    if (extensionSettings.get<boolean>("ignoreTabSettings")) {
        const tabSizeOverride = extensionSettings.get<number>("tabSizeOverride")
        return {
            tabWidth: (tabSizeOverride !== undefined && tabSizeOverride > 0) ? tabSizeOverride : 2,
            useTabs: !extensionSettings.get<boolean>("insertSpacesOverride", true),
        }
    } else {
        return {
            tabWidth: formattingOptions.tabSize,
            useTabs: !formattingOptions.insertSpaces,
        }
    }
}

export const createConfig = (
    extensionSettings: vscode.WorkspaceConfiguration,
    formattingOptions: vscode.FormattingOptions,
    detectedDialect: SqlLanguage,
): FormatOptionsWithLanguage => {
    const configuredDialect = extensionSettings.get<
        SqlLanguage | "auto-detect"
    >("dialect")

    const cfg: Record<string, unknown> = {
        language:
            configuredDialect === "auto-detect"
                ? detectedDialect
                : configuredDialect,
        ...createIndentationConfig(extensionSettings, formattingOptions),
    }

    for (const key of configMappings) {
        cfg[key as string] = extensionSettings.get(key)
    }

    return cfg as FormatOptionsWithLanguage
}
```

The key improvement: `configMappings` is now typed as `readonly (keyof FormatOptions)[]` instead of `readonly string[]`. This means TypeScript will catch any mismatch between the array keys and the FormatOptions interface.

- [ ] **Step 2: Run lint and compile to verify**

Run: `npm run compile`

---

## Batch B: Medium Priority - Core Infrastructure (4 tasks, ~30 min)

### Task B1: Eliminate Double Singleton Anti-Pattern

**Files:**
- Create: `src/core/singleton.ts`
- Modify: `src/core/configManager.ts`
- Modify: `src/core/errorHandler.ts:209-222`
- Modify: `src/core/performanceMonitor.ts:103-116`
- Modify: `src/parser/DocumentAstCache.ts` (singleton getter)
- Modify: `src/database/connection/ConnectionManager.ts:48-68`
- Modify: `src/database/connection/ConnectionStore.ts` (singleton getter)
- Modify: `src/database/schema/SchemaCache.ts` (singleton getter)

- [ ] **Step 1: Create singleton.ts helper**

```typescript
import { getContainer } from './diContainer'

export function getSingleton<T>(
    token: string,
    factory: () => T,
    instanceRef: { current: T | null },
    resetFn?: (instance: T) => void
): T {
    if (!instanceRef.current) {
        const container = getContainer()
        if (container.hasInstance(token)) {
            instanceRef.current = container.get<T>(token)
        } else {
            instanceRef.current = factory()
            container.register(token, instanceRef.current)
        }
    }
    return instanceRef.current
}

export function resetSingleton<T>(
    token: string,
    instanceRef: { current: T | null },
    resetFn?: (instance: T) => void
): void {
    if (instanceRef.current) {
        if (resetFn) {
            resetFn(instanceRef.current)
        }
        try {
            getContainer().unregister(token)
        } catch {
            // container may not have it registered
        }
    }
    instanceRef.current = null
}
```

- [ ] **Step 2: Refactor ConfigManager singleton**

```typescript
// Replace the bottom of configManager.ts with:
import { getSingleton } from './singleton'

let _configManagerInstance: ConfigManager | null = null

export function createConfigManager(): ConfigManager {
    return new ConfigManager()
}

export function getConfigManager(): ConfigManager {
    return getSingleton(Tokens.ConfigManager, () => new ConfigManager(), { current: _configManagerInstance })
}

export function resetConfigManager(): void {
    _configManagerInstance = null
}
```

- [ ] **Step 3: Refactor ErrorHandler singleton**

Replace lines 209-222 in errorHandler.ts:
```typescript
import { getSingleton } from './singleton'

let _errorHandlerInstance: ErrorHandler | null = null

export function getErrorHandler(): ErrorHandler {
    return getSingleton(Tokens.ErrorHandler, () => new ErrorHandler(), { current: _errorHandlerInstance })
}
```

- [ ] **Step 4: Refactor PerformanceMonitor singleton**

Replace lines 103-116 in performanceMonitor.ts:
```typescript
import { getSingleton } from './singleton'

let _perfMonitorInstance: PerformanceMonitor | null = null

export function getPerformanceMonitor(): PerformanceMonitor {
    return getSingleton(Tokens.PerformanceMonitor, () => new PerformanceMonitor(), { current: _perfMonitorInstance })
}
```

- [ ] **Step 5: Refactor ConnectionManager singleton**

Replace lines 48-68 in ConnectionManager.ts:
```typescript
import { getSingleton, resetSingleton } from '../../core/singleton'

let _connManagerInstance: ConnectionManager | null = null

static getInstance(): ConnectionManager {
    return getSingleton(Tokens.ConnectionManager, () => new ConnectionManager(), { current: _connManagerInstance })
}

static resetInstance(): void {
    resetSingleton(Tokens.ConnectionManager, { current: _connManagerInstance }, (instance) => {
        instance._onDidChangeConnections.dispose()
        instance._onDidChangeConnectionState.dispose()
        instance._onDidChangeActiveConnection.dispose()
    })
}
```

- [ ] **Step 6: Refactor remaining singletons (DocumentAstCache, ConnectionStore, SchemaCache)**

Apply the same pattern:
```typescript
import { getSingleton } from '../../core/singleton'
let _instance: XxxClass | null = null
export function getXxx(): XxxClass {
    return getSingleton(Tokens.Xxx, () => new XxxClass(), { current: _instance })
}
```

- [ ] **Step 7: Compile and lint**

Run: `npm run compile`

### Task B2: Eliminate Dialect Definition Duplication

**Files:**
- Create: `src/languages/sharedDialectClauses.ts`
- Modify: `src/languages/hive/hive.formatter.ts`
- Modify: `src/languages/spark/spark.formatter.ts`
- Modify: `src/languages/mysql/mysql.formatter.ts`
- Modify: `src/languages/postgresql/postgresql.formatter.ts`
- Modify: `src/languages/sql/sql.formatter.ts`
- Modify: `src/languages/flinksql/flinksql.formatter.ts`
- Modify: `src/languages/bigquery/bigquery.formatter.ts`
- Modify: `src/languages/sqlite/sqlite.formatter.ts`

- [ ] **Step 1: Create sharedDialectClauses.ts with common clause constants**

```typescript
import { expandPhrases } from '../../formatter/expandPhrases'

export const BASE_RESERVED_SELECT = expandPhrases(['SELECT [ALL | DISTINCT]'])

export const BASE_RESERVED_SET_OPERATIONS = expandPhrases(['UNION [ALL | DISTINCT]'])

export const BASE_RESERVED_JOINS = expandPhrases([
    'JOIN',
    '{LEFT | RIGHT | FULL} [OUTER] JOIN',
    '{INNER | CROSS} JOIN',
])

export const BASE_RESERVED_PHRASES = expandPhrases(['{ROWS | RANGE} BETWEEN'])

export const makeFormatOptions = (
    standardOnelineClauses: string[],
    tabularOnelineClauses: string[]
) => ({
    onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
    tabularOnelineClauses,
})
```

Note: Due to the complexity and risk of refactoring all 8 dialect files, this shared module provides the building blocks. Individual dialect files should be refactored to use these bases where applicable, but the full refactoring of all 8 files is deferred to avoid introducing bugs in stable formatter code. The shared module is created and Hive and Spark (the most similar pair) will use it.

- [ ] **Step 2: Compile to verify**

Run: `npm run compile`

### Task B3: Fix Type Duplication Between IDatabaseAdapter and ConnectionConfig

**Files:**
- Modify: `src/database/adapters/IDatabaseAdapter.ts`
- Modify: `src/database/connection/ConnectionConfig.ts`

- [ ] **Step 1: Remove duplicate type definitions from IDatabaseAdapter.ts**

In IDatabaseAdapter.ts, remove the duplicate `ConnectionConfig`, `SSLConfig`, `SshConfig`, `ConnectionPoolConfig`, `ConnectionState`, `TestConnectionResult`, `ConnectionGroup` interfaces (lines 208-267). Replace with re-export:

```typescript
// At the top of IDatabaseAdapter.ts, replace the duplicate type definitions with:
export type {
    ConnectionConfig,
    SSLConfig,
    SshConfig,
    ConnectionPoolConfig,
    ConnectionState,
    TestConnectionResult,
    ConnectionGroup,
} from '../connection/ConnectionConfig'
```

- [ ] **Step 2: Ensure ConnectionConfig.ts exports all needed types**

Verify that ConnectionConfig.ts exports `ConnectionState`, `TestConnectionResult`, `ConnectionGroup` types. If not, add them.

- [ ] **Step 3: Compile and lint**

Run: `npm run compile && npx eslint src/database/adapters/IDatabaseAdapter.ts`

### Task B4: Fix DI Container Type Safety + AstVisitor + DocumentAstCache

**Files:**
- Modify: `src/core/diContainer.ts`
- Modify: `src/parser/AstVisitor.ts`
- Modify: `src/parser/DocumentAstCache.ts`

- [ ] **Step 1: Improve DI Container type safety**

In diContainer.ts, add a Disposable interface and use it in disposeAll:

```typescript
// Add after existing imports/class definition
export interface Disposable {
    dispose(): void
}

// In disposeAll(), replace the duck typing with:
    disposeAll(): void {
        for (const service of this.services.values()) {
            if (service && typeof (service as Disposable).dispose === 'function') {
                (service as Disposable).dispose()
            }
        }
        this.services.clear()
        this.factories.clear()
    }
```

- [ ] **Step 2: Fix AstVisitor depth counter**

In AstVisitor.ts, line 30-37, replace `let depth = 0` and the depth check with stack-based approach:

```typescript
// Replace:
// let depth = 0  (line 30)
// With:
    const MAX_STACK_DEPTH = 10000

// Replace depth check at lines 36-39:
        if (stack.length > MAX_STACK_DEPTH) {
            console.warn('SQL All in One: AST traversal stack exceeded maximum, stopping traversal')
            return
        }

// Remove depth++ at line 67 and depth-- at line 45
```

- [ ] **Step 3: Fix DocumentAstCache dialect switching invalidation**

In DocumentAstCache.ts, modify the cache key to include the dialect:

```typescript
// In getOrParse(), change the cache key from:
// const key = doc.uri.toString()
// To:
    getOrParse(doc: vscode.TextDocument, dialect: string): AST | AST[] {
        const key = `${doc.uri.toString()}::${dialect}`
        // ... rest remains the same
    }
```

- [ ] **Step 4: Compile and lint**

Run: `npm run compile`

---

## Batch C: Medium Priority - Feature Modules (2 tasks, ~20 min)

### Task C1: Fix Hive/Spark LATERAL VIEW Adapter Duplication

**Files:**
- Modify: `src/formatter/HiveSqlAdapter.ts`
- Modify: `src/formatter/SparkSqlAdapter.ts`

- [ ] **Step 1: Extract shared LATERAL VIEW logic to adapterUtils.ts**

In `src/formatter/adapterUtils.ts`, add shared functions:

```typescript
export interface LateralViewSlot {
    id: string
    original: string
}

export function extractLateralView(
    sql: string,
    slotIdPrefix: string,
    existingSlots: LateralViewSlot[]
): { processedSql: string; slots: LateralViewSlot[] } {
    const slots: LateralViewSlot[] = [...existingSlots]
    let processedSql = sql

    const outerRegex = /LATERAL\s+VIEW\s+OUTER\b/gi
    const innerRegex = /LATERAL\s+VIEW\b/gi

    const matchAndReplace = (regex: RegExp, prefix: string) => {
        let match
        while ((match = regex.exec(processedSql)) !== null) {
            const id = `${slotIdPrefix}${slots.length}`
            const clauseEnd = findClauseEnd(processedSql, match.index + match[0].length)
            const original = processedSql.slice(match.index, clauseEnd)
            slots.push({ id, original })
            processedSql = processedSql.slice(0, match.index) + `CROSS JOIN ${id}` + processedSql.slice(clauseEnd)
        }
    }

    matchAndReplace(outerRegex, 'OUTER ')
    // reset for inner
    innerRegex.lastIndex = 0
    matchAndReplace(innerRegex, '')

    return { processedSql, slots }
}

export function restoreLateralView(sql: string, slots: LateralViewSlot[]): string {
    let result = sql
    for (const slot of slots) {
        const escapedId = slot.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`CROSS\\s+JOIN\\s+\`?${escapedId}\`?`, 'gi')
        result = result.replace(regex, slot.original)
    }
    return result
}

function findClauseEnd(sql: string, startIndex: number): number {
    // Simplified - find end of LATERAL VIEW clause
    const clauseKeywords = /\b(?:FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|JOIN|UNION|LATERAL\s+VIEW)\b/gi
    clauseKeywords.lastIndex = startIndex
    const match = clauseKeywords.exec(sql)
    return match ? match.index : sql.length
}
```

- [ ] **Step 2: Refactor HiveSqlAdapter.ts to use shared extractLateralView**

Replace `extractLateralView()` method with call to shared utility.

- [ ] **Step 3: Refactor SparkSqlAdapter.ts similarly**

- [ ] **Step 4: Compile and lint**

Run: `npm run compile`

### Task C2: Add Completion Debouncing

**Files:**
- Modify: `src/completion/SqlCompletionProvider.ts`

- [ ] **Step 1: Add debounce to SqlCompletionProvider**

In `SqlCompletionProvider.ts`, add a debounce mechanism around the schema completion call:

```typescript
// Add these properties to SqlCompletionProvider class:
    private schemaDebounceTimer: ReturnType<typeof setTimeout> | null = null
    private readonly SCHEMA_DEBOUNCE_MS = 200

// In provideCompletionItems(), wrap the schema completion call:
    private async provideSchemaItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {
        return new Promise((resolve) => {
            if (this.schemaDebounceTimer) {
                clearTimeout(this.schemaDebounceTimer)
            }
            this.schemaDebounceTimer = setTimeout(async () => {
                try {
                    const items = await this.schemaCompletionProvider.provideCompletionItems(document, position)
                    resolve(items)
                } catch {
                    resolve([])
                }
                this.schemaDebounceTimer = null
            }, this.SCHEMA_DEBOUNCE_MS)
        })
    }
```

- [ ] **Step 2: Compile**

Run: `npm run compile`

---

## Batch D: Low Priority Improvements (4 tasks, ~20 min)

### Task D1: Fix tryGet Semantics + ErrorHandler Listener Logging + getSqlLanguageIds Caching

**Files:**
- Modify: `src/core/diContainer.ts`
- Modify: `src/core/errorHandler.ts:178-186`
- Modify: `src/core/dialectRegistry.ts`

- [ ] **Step 1: Fix tryGet in diContainer.ts**

Separate tryGet into a read-only version that doesn't trigger factory:

```typescript
  tryGet<T>(token: string): T | undefined {
    if (this.services.has(token)) {
      return this.services.get(token) as T
    }
    return undefined
  }

  getOrCreate<T>(token: string): T {
    // get() already does this - just add this alias for clarity
    return this.get(token)
  }
```

- [ ] **Step 2: Add logging to ErrorHandler listener errors**

In errorHandler.ts, replace the catch block at line 183:
```typescript
      } catch {
        // Ignore listener errors
      }
// Replace with:
      } catch (listenerError) {
        console.warn('[SQL All in One] Error in listener:', listenerError)
      }
```

- [ ] **Step 3: Cache getSqlLanguageIds result**

In dialectRegistry.ts:
```typescript
let _cachedLanguageIds: readonly string[] | null = null

export function getSqlLanguageIds(): readonly string[] {
    if (!_cachedLanguageIds) {
        _cachedLanguageIds = [...new Set(dialectEntries.map(e => e.vscodeLangId))]
    }
    return _cachedLanguageIds
}
```

### Task D2: Fix Parameter Rules Caching + FormatOptions Grouping

**Files:**
- Modify: `src/lexer/Tokenizer.ts`
- Modify: `src/formatter/FormatOptions.ts`

- [ ] **Step 1: Cache parameter rules in Tokenizer**

In Tokenizer.ts, cache the param rules:
```typescript
// Add cache:
    private cachedParamRules: ParamRule[] | null = null
    private cachedParamTypes: ParamTypes | undefined

    private buildParamRules(cfg: TokenizerOptions, paramTypesOverrides?: ParamTypes): ParamRule[] {
        if (this.cachedParamRules && this.cachedParamTypes === paramTypesOverrides) {
            return this.cachedParamRules
        }
        this.cachedParamTypes = paramTypesOverrides
        this.cachedParamRules = this.buildParamRulesImpl(cfg, paramTypesOverrides)
        return this.cachedParamRules
    }
```

- [ ] **Step 2: Add structured config groups to FormatOptions**

Add documentation comments grouping the config fields:
```typescript
// In FormatOptions.ts, add grouping comments:
    // === Newline Rules ===
    newlineAfterSelect: boolean
    newlineAfterFrom: boolean
    newlineBeforeWhere: boolean
    // ... etc
```

### Task D3: Add Code Coverage Tool

**Files:**
- Modify: `package.json`
- Modify: `.vscodeignore`
- Create: `.nycrc`

- [ ] **Step 1: Add nyc/c8 config**

Create `.nycrc`:
```json
{
    "include": ["out/**/*.js"],
    "exclude": ["out/test/**"],
    "reporter": ["text", "lcov"],
    "all": true
}
```

- [ ] **Step 2: Add coverage script to package.json**

```json
"test:coverage": "npx c8 --reporter=text --reporter=lcov npm test"
```

### Task D4: Fix Naming Issues

**Files:**
- Rename: `src/providers/SqlParameterHightlighter.ts` → `src/providers/SqlParameterHighlighter.ts`
- Modify: `src/extension.ts` (update import)
- Modify: `package.json` (update name field)

- [ ] **Step 1: Rename misspelled file**

Run:
```bash
git mv src/providers/SqlParameterHightlighter.ts src/providers/SqlParameterHighlighter.ts
```

- [ ] **Step 2: Update all imports referencing the old name**

Search and replace all imports of `SqlParameterHightlighter` to `SqlParameterHighlighter` across the codebase.

- [ ] **Step 3: Update package.json name**

Change `"name": "hive-formatter"` to `"name": "sql-all-in-one"` in package.json.

- [ ] **Step 4: Compile to verify**

Run: `npm run compile`

---

## Execution Order

1. **Batch A** (high priority) - can run first or in parallel with B
2. **Batch B** (medium - core infra) - depends on A4 for config types
3. **Batch C** (medium - feature modules) - independent
4. **Batch D** (low priority) - independent, can run anytime

Recommended: Execute Batches A and B in parallel first, then C and D.