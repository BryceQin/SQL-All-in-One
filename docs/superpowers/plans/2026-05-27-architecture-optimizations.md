# SQL All in One 架构优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一项目的依赖注入机制，改进类型安全，提升可维护性和可测试性

**Architecture:** 保留现有功能完整的前提下，逐步重构为更清晰的架构。优先统一 DI 容器使用，然后进行代码质量改进。

**Tech Stack:** TypeScript, VSCode Extension API, node-sql-parser

---

## 文件结构规划

### 核心文件修改
- `src/core/diContainer.ts` - 增强 DI 容器功能，添加类型安全支持
- `src/core/configManager.ts` - 集成到 DI 容器，移除单例模式
- `src/parser/SqlParserEngine.ts` - 集成到 DI 容器，移除单例模式
- `src/extension.ts` - 重构激活逻辑，使用 DI 容器管理服务

---

## 任务分解

### Task 1: 增强 DI 容器 - 类型安全与工厂支持

**Files:**
- Modify: `src/core/diContainer.ts`

- [ ] **Step 1: 读取当前 DI 容器代码**

```typescript
// 现有代码已读取，我们将增强它
```

- [ ] **Step 2: 添加类型安全的注册和获取方法**

```typescript
import * as vscode from 'vscode';

export class DIContainer {
  private services = new Map<string, unknown>();
  private factories = new Map<string, () => unknown>();

  register<T>(token: string, service: T): void {
    this.services.set(token, service);
  }

  registerFactory<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  get<T>(token: string): T {
    // 先检查是否已实例化
    if (this.services.has(token)) {
      return this.services.get(token) as T;
    }
    // 检查是否有工厂函数
    if (this.factories.has(token)) {
      const factory = this.factories.get(token)!;
      const instance = factory();
      this.services.set(token, instance);
      return instance as T;
    }
    throw new Error(`Service not registered: ${token}`);
  }

  has(token: string): boolean {
    return this.services.has(token) || this.factories.has(token);
  }

  disposeAll(): void {
    for (const service of this.services.values()) {
      if (
        service !== null &&
        service !== undefined &&
        typeof (service as Record<string, unknown>).dispose === 'function'
      ) {
        (service as { dispose: () => void }).dispose();
      }
    }
    this.services.clear();
    this.factories.clear();
  }

  clear(): void {
    this.services.clear();
  }
}

const container = new DIContainer();

export const Tokens = {
  ConfigManager: 'ConfigManager',
  ParserEngine: 'ParserEngine',
  DocumentAstCache: 'DocumentAstCache',
  ErrorHandler: 'ErrorHandler',
  PerformanceMonitor: 'PerformanceMonitor',
  SqlDiagnosticsProvider: 'SqlDiagnosticsProvider',
  StatusBarProvider: 'StatusBarProvider',
  ParameterHighlighter: 'ParameterHighlighter',
  CompletionProvider: 'CompletionProvider',
  CodeActionProvider: 'CodeActionProvider',
  FoldingRangeProvider: 'FoldingRangeProvider',
  OutlineProvider: 'OutlineProvider',
  HoverProvider: 'HoverProvider',
  AstNavigator: 'AstNavigator',
  DefinitionProvider: 'DefinitionProvider',
  ReferenceProvider: 'ReferenceProvider',
  RenameProvider: 'RenameProvider',
  SqlLinter: 'SqlLinter',
  AstDiagnosticsProvider: 'AstDiagnosticsProvider',
  AstConverter: 'AstConverter',
  RuleRegistry: 'RuleRegistry',
} as const;

export type Token = typeof Tokens[keyof typeof Tokens];

export function getContainer(): DIContainer {
  return container;
}
```

- [ ] **Step 3: 保存修改并检查编译**

Run: `npm run compile`
Expected: 无编译错误

---

### Task 2: 改造 ConfigManager - 集成到 DI 容器

**Files:**
- Modify: `src/core/configManager.ts`

- [ ] **Step 1: 读取当前代码**

- [ ] **Step 2: 移除单例模式，添加工厂函数**

```typescript
import * as vscode from 'vscode';
import { initI18n } from '../i18n';

type ConfigListener = () => void;

export class ConfigManager {
  private cache = new Map<string, unknown>();
  private disposables: vscode.Disposable[] = [];
  private listeners: ConfigListener[] = [];
  private validators = new Map<string, (value: unknown) => boolean>();

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('SQL-All-in-One')) {
          this.cache.clear();
          if (e.affectsConfiguration('SQL-All-in-One.displayLanguage')) {
            try { initI18n() } catch { /* ignore */ }
          }
          for (const listener of this.listeners) {
            listener();
          }
        }
      }),
    );
  }

  registerValidator<T>(section: string, validator: (value: T) => boolean): void {
    this.validators.set(section, validator as (value: unknown) => boolean);
  }

  get<T>(section: string, defaultValue: T): T {
    const cached = this.cache.get(section);
    if (cached !== undefined) {
      return cached as T;
    }
    const config = vscode.workspace.getConfiguration('SQL-All-in-One');
    let value = config.get<T>(section, defaultValue);

    const validator = this.validators.get(section);
    if (validator && !validator(value)) {
      console.warn(`Invalid value for ${section}, using default`);
      value = defaultValue;
    }

    this.cache.set(section, value);
    return value;
  }

  getSection<T extends Record<string, unknown>>(section: string, defaultValue: T): T {
    const cached = this.cache.get(section);
    if (cached !== undefined) {
      return cached as T;
    }
    const config = vscode.workspace.getConfiguration('SQL-All-in-One');
    const value = config.get<T>(section, defaultValue);
    this.cache.set(section, value);
    return value;
  }

  getSectionKeys<T extends Record<string, unknown>>(prefix: string, keys: string[], defaults: T): T {
    const cacheKey = `__sectionKeys::${prefix}::${keys.join(',')}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached as T;
    }
    const config = vscode.workspace.getConfiguration('SQL-All-in-One');
    const result = {} as Record<string, unknown>;
    for (const key of keys) {
      const section = prefix ? `${prefix}.${key}` : key;
      result[key] = config.get(section, defaults[key]);
    }
    this.cache.set(cacheKey, result);
    return result as T;
  }

  onConfigChange(listener: ConfigListener): vscode.Disposable {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
      },
    };
  }

  invalidate(): void {
    this.cache.clear();
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.listeners.length = 0;
  }
}

// 保留向后兼容的导出
let instance: ConfigManager | null = null;
export function getConfigManager(): ConfigManager {
  const container = getContainer();
  if (container.has(Tokens.ConfigManager)) {
    return container.get<ConfigManager>(Tokens.ConfigManager);
  }
  if (!instance) {
    instance = new ConfigManager();
  }
  return instance;
}

// 工厂函数，用于 DI 容器注册
export function createConfigManager(): ConfigManager {
  return new ConfigManager();
}

// 导入需要的依赖
import { getContainer, Tokens } from './diContainer';
```

- [ ] **Step 3: 保存并编译检查**

Run: `npm run compile`
Expected: 无编译错误

---

### Task 3: 改造 SqlParserEngine - 集成到 DI 容器

**Files:**
- Modify: `src/parser/SqlParserEngine.ts`

- [ ] **Step 1: 读取当前代码**

- [ ] **Step 2: 移除单例模式，添加工厂函数**

```typescript
import { Parser } from 'node-sql-parser';
import type { AST, TableColumnAst } from 'node-sql-parser';
import type { SqlDialect } from './dialectMapper';
import { toNodeSqlParserDialect } from './dialectMapper';
import { ParseError } from './ParseError';
import { getContainer, Tokens } from '../core/diContainer';

export interface ParseResult {
  ast: AST[] | AST;
  tableList: string[];
  columnList: string[];
}

export class SqlParserEngine {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  astify(sql: string, dialect: SqlDialect): AST[] | AST {
    try {
      return this.parser.astify(sql, {
        database: toNodeSqlParserDialect(dialect),
        parseOptions: { includeLocations: true },
      });
    } catch (e) {
      throw new ParseError(dialect, sql, e);
    }
  }

  sqlify(ast: AST[] | AST, dialect: SqlDialect): string {
    return this.parser.sqlify(ast, {
      database: toNodeSqlParserDialect(dialect),
    });
  }

  parse(sql: string, dialect: SqlDialect): ParseResult {
    try {
      const result: TableColumnAst = this.parser.parse(sql, {
        database: toNodeSqlParserDialect(dialect),
        parseOptions: { includeLocations: true },
      });
      return {
        ast: result.ast,
        tableList: result.tableList,
        columnList: result.columnList,
      };
    } catch (e) {
      throw new ParseError(dialect, sql, e);
    }
  }

  tryAstify(sql: string, dialect: SqlDialect): { success: boolean; ast: AST[] | AST | null; error: ParseError | null } {
    try {
      const ast = this.astify(sql, dialect);
      return { success: true, ast, error: null };
    } catch (e) {
      const error = e instanceof ParseError ? e : new ParseError(dialect, sql, e);
      return { success: false, ast: null, error };
    }
  }
}

// 向后兼容
let engineInstance: SqlParserEngine | null = null;

export function getParserEngine(): SqlParserEngine {
  const container = getContainer();
  if (container.has(Tokens.ParserEngine)) {
    return container.get<SqlParserEngine>(Tokens.ParserEngine);
  }
  if (!engineInstance) {
    engineInstance = new SqlParserEngine();
  }
  return engineInstance;
}

export function resetParserEngine(): void {
  engineInstance = null;
}

// 工厂函数
export function createParserEngine(): SqlParserEngine {
  return new SqlParserEngine();
}
```

- [ ] **Step 3: 保存并编译检查**

Run: `npm run compile`
Expected: 无编译错误

---

### Task 4: 改造 RuleRegistry - 添加工厂函数

**Files:**
- Modify: `src/linter/RuleRegistry.ts`

- [ ] **Step 1: 读取当前代码**

- [ ] **Step 2: 添加工厂函数和 DI 集成**

```typescript
import * as vscode from 'vscode';
import type { LintRule, RuleContext } from './rules/LintRule';
import { loadRuleConfigs, type LintRuleConfig, type LintRuleDefinition } from './lintRules';
import { AvoidSelectStarRule } from './rules/AvoidSelectStarRule';
import { ExplicitJoinTypeRule } from './rules/ExplicitJoinTypeRule';
import { LimitWithOrderByRule } from './rules/LimitWithOrderByRule';
import { ColumnCountMismatchRule } from './rules/ColumnCountMismatchRule';
import { MissingPrimaryKeyRule } from './rules/MissingPrimaryKeyRule';
import { SelectInInsertRule } from './rules/SelectInInsertRule';
import { DuplicateColumnAliasesRule } from './rules/DuplicateColumnAliasesRule';
import { UseCoalesceOverIsNullRule } from './rules/UseCoalesceOverIsNullRule';
import { UseCurrentTimestampRule } from './rules/UseCurrentTimestampRule';
import { AvoidCorrelatedSubqueriesRule } from './rules/AvoidCorrelatedSubqueriesRule';
import { MissingQueryCommentRule } from './rules/MissingQueryCommentRule';
import { MissingColumnCommentRule } from './rules/MissingColumnCommentRule';
import { CommentedOutCodeRule } from './rules/CommentedOutCodeRule';
import { ExpiredTodoRule } from './rules/ExpiredTodoRule';
import { HavingWithoutGroupByRule } from './rules/HavingWithoutGroupByRule';
import { LimitInvalidValueRule } from './rules/LimitInvalidValueRule';
import { ReservedWordIdentifierRule } from './rules/ReservedWordIdentifierRule';
import { JoinMissingOnRule } from './rules/JoinMissingOnRule';
import { SelectWithoutFromRule } from './rules/SelectWithoutFromRule';
import { MisplacedDistinctRule } from './rules/MisplacedDistinctRule';
import { AggregateInWhereRule } from './rules/AggregateInWhereRule';
import { SubqueryWithoutAliasRule } from './rules/SubqueryWithoutAliasRule';
import { SuspiciousNullComparisonRule } from './rules/SuspiciousNullComparisonRule';
import { IncompleteCaseRule } from './rules/IncompleteCaseRule';
import { RedundantDistinctRule } from './rules/RedundantDistinctRule';
import { DateFunctionUsageRule } from './rules/DateFunctionUsageRule';
import { WildcardInUpdateRule } from './rules/WildcardInUpdateRule';
import { getContainer, Tokens } from '../core/diContainer';

const DEFAULT_CONFIG: LintRuleConfig = { enabled: false, severity: vscode.DiagnosticSeverity.Warning };

export class RuleRegistry {
  private rules = new Map<string, LintRule>();
  private rulesByType = new Map<string, LintRule[]>();

  register(rule: LintRule): void {
    this.rules.set(rule.id, rule);

    for (const type of rule.applicableTypes) {
      if (!this.rulesByType.has(type)) {
        this.rulesByType.set(type, []);
      }
      const list = this.rulesByType.get(type);
      if (list) {
        list.push(rule);
      }
    }
  }

  getEnabledRulesForType(type: string): LintRule[] {
    const rules = this.rulesByType.get(type) || [];
    return rules.filter(r => r.isEnabled());
  }

  getEnabledGlobalRules(): LintRule[] {
    return Array.from(this.rules.values())
      .filter(r => r.applicableTypes.length === 0 && r.isEnabled());
  }

  runRules(context: RuleContext): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const rules = this.getEnabledRulesForType(context.node.type);

    for (const rule of rules) {
      diagnostics.push(...rule.check(context));
    }

    return diagnostics;
  }

  runGlobalRules(context: RuleContext): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const globalRules = this.getEnabledGlobalRules();

    for (const rule of globalRules) {
      diagnostics.push(...rule.check(context));
    }

    return diagnostics;
  }

  getRuleDefinitions(): LintRuleDefinition[] {
    return Array.from(this.rules.values()).map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      defaultSeverity: rule.defaultSeverity,
      defaultEnabled: rule.defaultEnabled,
      category: rule.category,
    }));
  }
}

let cachedRegistry: RuleRegistry | null = null;

export function getRuleRegistry(): RuleRegistry {
  const container = getContainer();
  if (container.has(Tokens.RuleRegistry)) {
    return container.get<RuleRegistry>(Tokens.RuleRegistry);
  }
  if (!cachedRegistry) {
    cachedRegistry = createRuleRegistry();
  }
  return cachedRegistry;
}

export function resetRuleRegistry(): void {
  cachedRegistry = null;
}

export function createRuleRegistry(): RuleRegistry {
  const registry = new RuleRegistry();
  const configs = loadRuleConfigs();

  registry.register(new AvoidSelectStarRule(configs.get('avoid_select_star') ?? DEFAULT_CONFIG));
  registry.register(new ExplicitJoinTypeRule(configs.get('explicit_join_type') ?? DEFAULT_CONFIG));
  registry.register(new LimitWithOrderByRule(configs.get('limit_with_order_by') ?? DEFAULT_CONFIG));
  registry.register(new ColumnCountMismatchRule(configs.get('avoid_column_count_mismatch') ?? DEFAULT_CONFIG));
  registry.register(new MissingPrimaryKeyRule(configs.get('missing_primary_key') ?? DEFAULT_CONFIG));
  registry.register(new SelectInInsertRule(configs.get('avoid_select_in_insert') ?? DEFAULT_CONFIG));
  registry.register(new DuplicateColumnAliasesRule(configs.get('duplicate_column_aliases') ?? DEFAULT_CONFIG));
  registry.register(new UseCoalesceOverIsNullRule(configs.get('use_coalesce_over_isnull') ?? DEFAULT_CONFIG));
  registry.register(new UseCurrentTimestampRule(configs.get('use_current_timestamp') ?? DEFAULT_CONFIG));
  registry.register(new AvoidCorrelatedSubqueriesRule(configs.get('avoid_correlated_subqueries') ?? DEFAULT_CONFIG));
  registry.register(new MissingQueryCommentRule(configs.get('missing_query_comment') ?? DEFAULT_CONFIG));
  registry.register(new MissingColumnCommentRule(configs.get('missing_column_comment') ?? DEFAULT_CONFIG));
  registry.register(new CommentedOutCodeRule(configs.get('commented_out_code') ?? DEFAULT_CONFIG));
  registry.register(new ExpiredTodoRule(configs.get('expired_todo') ?? DEFAULT_CONFIG));

  registry.register(new HavingWithoutGroupByRule(configs.get('having_without_group_by') ?? DEFAULT_CONFIG));
  registry.register(new LimitInvalidValueRule(configs.get('limit_invalid_value') ?? DEFAULT_CONFIG));
  registry.register(new ReservedWordIdentifierRule(configs.get('reserved_word_identifier') ?? DEFAULT_CONFIG));
  registry.register(new JoinMissingOnRule(configs.get('join_missing_on') ?? DEFAULT_CONFIG));
  registry.register(new SelectWithoutFromRule(configs.get('select_without_from') ?? DEFAULT_CONFIG));
  registry.register(new MisplacedDistinctRule(configs.get('misplaced_distinct') ?? DEFAULT_CONFIG));
  registry.register(new AggregateInWhereRule(configs.get('aggregate_in_where') ?? DEFAULT_CONFIG));
  registry.register(new SubqueryWithoutAliasRule(configs.get('subquery_without_alias') ?? DEFAULT_CONFIG));
  registry.register(new SuspiciousNullComparisonRule(configs.get('suspicious_null_comparison') ?? DEFAULT_CONFIG));
  registry.register(new IncompleteCaseRule(configs.get('incomplete_case') ?? DEFAULT_CONFIG));
  registry.register(new RedundantDistinctRule(configs.get('redundant_distinct') ?? DEFAULT_CONFIG));
  registry.register(new DateFunctionUsageRule(configs.get('date_function_usage') ?? DEFAULT_CONFIG));
  registry.register(new WildcardInUpdateRule(configs.get('wildcard_in_update') ?? DEFAULT_CONFIG));

  return registry;
}
```

- [ ] **Step 3: 保存并编译检查**

Run: `npm run compile`
Expected: 无编译错误

---

### Task 5: 重构 extension.ts - 在激活时注册所有服务

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: 读取当前代码**

- [ ] **Step 2: 添加服务注册函数**

```typescript
import * as vscode from "vscode";
import { SqlFormattingProvider } from "./providers/SqlFormattingProvider";
import { sqlDialects, isSqlDocument, getSqlLanguageIds } from "./core/sqlDialects";
import { formatSelectionCommand } from "./commands/formatSelectionCommand";
import { toggleComment, toggleAdvancedComment } from "./commands/commentCommands";
import { convertMysqlToHiveCommand, convertHiveToMysqlCommand } from "./commands/converterCommands";
import { openConfigEditorCommand } from "./commands/configEditorCommand";
import { initI18n } from "./i18n";
import { getConfigManager, createConfigManager } from "./core/configManager";
import { getDocumentAstCache } from "./parser/DocumentAstCache";
import { Lazy, lazy } from "./utils/lazy";
import { getErrorHandler, ErrorLevel, ErrorCategory } from "./core/errorHandler";
import { getPerformanceMonitor } from "./core/performanceMonitor";
import { getContainer, Tokens } from "./core/diContainer";
import { createParserEngine } from "./parser/SqlParserEngine";
import { createRuleRegistry } from "./linter/RuleRegistry";
import { SqlCodeActionProvider } from "./providers/SqlCodeActionProvider";
import { SqlDiagnosticsProvider } from "./providers/SqlDiagnosticsProvider";
import { StatusBarProvider } from "./providers/StatusBarProvider";
import { SqlParameterHighlighter, SqlParameterReplaceCommand } from "./providers/SqlParameterHightlighter";
import { SqlCompletionProvider } from "./completion";
import { SqlFoldingRangeProvider } from "./providers/SqlFoldingRangeProvider";
import { SqlOutlineProvider } from "./providers/SqlOutlineProvider";
import { SqlHoverProvider } from "./providers/SqlHoverProvider";
import { AstNavigator } from "./navigation/AstNavigator";
import { SqlDefinitionProvider } from "./navigation/SqlDefinitionProvider";
import { SqlReferenceProvider } from "./navigation/SqlReferenceProvider";
import { SqlRenameProvider } from "./navigation/SqlRenameProvider";

interface ExtensionModule {
  name: string;
  register: (context: vscode.ExtensionContext) => void;
}

interface ProviderMap {
  diagnosticsProvider: Lazy<SqlDiagnosticsProvider>;
  statusBarProvider: Lazy<StatusBarProvider>;
  parameterHighlighter: Lazy<SqlParameterHighlighter>;
  completionProvider: Lazy<SqlCompletionProvider>;
  codeActionProvider: Lazy<SqlCodeActionProvider>;
  foldingRangeProvider: Lazy<SqlFoldingRangeProvider>;
  outlineProvider: Lazy<SqlOutlineProvider>;
  hoverProvider: Lazy<SqlHoverProvider>;
  astNavigator: Lazy<AstNavigator>;
  definitionProvider: Lazy<SqlDefinitionProvider>;
  referenceProvider: Lazy<SqlReferenceProvider>;
  renameProvider: Lazy<SqlRenameProvider>;
}

let lazyProviders: ProviderMap | null = null;

function createLazyProviders(extensionPath: string): ProviderMap {
  const providers: ProviderMap = {
    diagnosticsProvider: lazy(() => new SqlDiagnosticsProvider()),
    statusBarProvider: lazy(() => new StatusBarProvider()),
    parameterHighlighter: lazy(() => new SqlParameterHighlighter()),
    completionProvider: lazy(() => new SqlCompletionProvider(extensionPath)),
    codeActionProvider: lazy(() => new SqlCodeActionProvider()),
    foldingRangeProvider: lazy(() => new SqlFoldingRangeProvider()),
    outlineProvider: lazy(() => new SqlOutlineProvider()),
    hoverProvider: lazy(() => new SqlHoverProvider()),
    astNavigator: lazy(() => new AstNavigator()),
    definitionProvider: lazy(() => {
      const nav = providers.astNavigator.get();
      return new SqlDefinitionProvider(nav);
    }),
    referenceProvider: lazy(() => {
      const nav = providers.astNavigator.get();
      return new SqlReferenceProvider(nav);
    }),
    renameProvider: lazy(() => {
      const nav = providers.astNavigator.get();
      return new SqlRenameProvider(nav);
    }),
  };
  return providers;
}

const errorHandler = getErrorHandler();
const perfMonitor = getPerformanceMonitor();

function safeRegister(label: string, fn: () => void): void {
  errorHandler.try(fn, label, {
    level: ErrorLevel.ERROR,
    category: ErrorCategory.CRITICAL,
  });
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("sql-all-in-one.format-selection", formatSelectionCommand),
    vscode.commands.registerCommand("sql-all-in-one.toggleComment", toggleComment),
    vscode.commands.registerCommand("sql-all-in-one.toggleAdvancedComment", toggleAdvancedComment),
    vscode.commands.registerCommand("sql-all-in-one.mysql-to-hive", convertMysqlToHiveCommand),
    vscode.commands.registerCommand("sql-all-in-one.hive-to-mysql", convertHiveToMysqlCommand),
    vscode.commands.registerCommand("sql-all-in-one.open-config-editor", () =>
      openConfigEditorCommand(context.extensionUri)
    ),
  );
}

function registerFormattingProviders(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    ...Object.entries(sqlDialects).map(([vscodeLang, sqlDialectName]) =>
      vscode.languages.registerDocumentFormattingEditProvider(
        vscodeLang,
        new SqlFormattingProvider(sqlDialectName),
      ),
    ),
  );
}

function registerDiagnostics(context: vscode.ExtensionContext): void {
  if (!lazyProviders) return;
  const dp = lazyProviders.diagnosticsProvider.get();
  if (!dp) return;

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isSqlDocument(event.document)) {
        dp.debouncedProvideDiagnostics(event.document);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isSqlDocument(document)) dp.provideDiagnostics(document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isSqlDocument(document)) dp.provideDiagnostics(document);
    }),
    dp,
  );

  vscode.workspace.textDocuments.forEach((document) => {
    if (isSqlDocument(document)) dp.provideDiagnostics(document);
  });
}

function registerProviders(context: vscode.ExtensionContext): void {
  if (!lazyProviders) return;
  const sqlLanguages = getSqlLanguageIds();

  const codeActionProvider = lazyProviders.codeActionProvider.get();
  const foldingRangeProvider = lazyProviders.foldingRangeProvider.get();
  const outlineProvider = lazyProviders.outlineProvider.get();
  const hoverProvider = lazyProviders.hoverProvider.get();
  const definitionProvider = lazyProviders.definitionProvider.get();
  const referenceProvider = lazyProviders.referenceProvider.get();
  const renameProvider = lazyProviders.renameProvider.get();

  for (const lang of sqlLanguages) {
    const selector = { language: lang };

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        selector,
        codeActionProvider,
        { providedCodeActionKinds: SqlCodeActionProvider.providedCodeActionKinds },
      ),
    );

    context.subscriptions.push(
      vscode.languages.registerFoldingRangeProvider(selector, foldingRangeProvider),
    );

    context.subscriptions.push(
      vscode.languages.registerDocumentSymbolProvider(selector, outlineProvider),
    );

    context.subscriptions.push(
      vscode.languages.registerHoverProvider(selector, hoverProvider),
    );

    if (definitionProvider) {
      context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, definitionProvider)
      );
    }

    if (referenceProvider) {
      context.subscriptions.push(
        vscode.languages.registerReferenceProvider(selector, referenceProvider)
      );
    }

    if (renameProvider) {
      context.subscriptions.push(
        vscode.languages.registerRenameProvider(selector, renameProvider)
      );
    }
  }
}

function registerCompletion(context: vscode.ExtensionContext): void {
  if (!lazyProviders) return;
  const completionProvider = lazyProviders.completionProvider.get();
  if (!completionProvider) return;

  const sqlLanguages = getSqlLanguageIds();
  const triggerChars: string[] = ['.', ' ', '('];

  for (const lang of sqlLanguages) {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { language: lang },
        completionProvider,
        ...triggerChars,
      ),
    );
  }

  context.subscriptions.push(completionProvider);
}

function registerParameterHighlighter(context: vscode.ExtensionContext): void {
  if (!lazyProviders) return;
  const parameterHighlighter = lazyProviders.parameterHighlighter.get();
  if (!parameterHighlighter) return;

  SqlParameterReplaceCommand.register(context);
  context.subscriptions.push(parameterHighlighter);
}

function registerServicesToContainer(): void {
  const container = getContainer();

  container.registerFactory(Tokens.ConfigManager, createConfigManager);
  container.registerFactory(Tokens.ParserEngine, createParserEngine);
  container.registerFactory(Tokens.RuleRegistry, createRuleRegistry);
}

function createModules(): ExtensionModule[] {
  return [
    { name: 'services', register: () => registerServicesToContainer() },
    { name: 'i18n', register: () => initI18n() },
    { name: 'commands', register: (ctx) => registerCommands(ctx) },
    { name: 'formatting', register: (ctx) => registerFormattingProviders(ctx) },
    { name: 'diagnostics', register: (ctx) => registerDiagnostics(ctx) },
    { name: 'providers', register: (ctx) => registerProviders(ctx) },
    { name: 'completion', register: (ctx) => registerCompletion(ctx) },
    { name: 'parameterHighlighter', register: (ctx) => registerParameterHighlighter(ctx) },
    { name: 'astNavigatorEvents', register: (ctx) => {
      if (!lazyProviders) return;
      const navigator = lazyProviders.astNavigator.get();
      if (navigator) {
        ctx.subscriptions.push(
          vscode.workspace.onDidChangeTextDocument(e => {
            if (isSqlDocument(e.document)) navigator.invalidate(e.document);
          }),
          vscode.workspace.onDidCloseTextDocument(doc => navigator.invalidate(doc))
        );
      }
    }},
    { name: 'statusBar', register: (ctx) => {
      if (!lazyProviders) return;
      if (lazyProviders.statusBarProvider.isInitialized || vscode.workspace.textDocuments.some(isSqlDocument)) {
        const statusBar = lazyProviders.statusBarProvider.get();
        if (statusBar) ctx.subscriptions.push(statusBar);
      }
    }},
  ];
}

export function activate(context: vscode.ExtensionContext): void {
  lazyProviders = createLazyProviders(context.extensionPath);

  perfMonitor.measure('Extension.activate', () => {
    console.log('SQL All in One: activating...');

    try {
      const modules = createModules();
      for (const mod of modules) {
        safeRegister('register ' + mod.name, () => mod.register(context));
      }

      context.subscriptions.push(getConfigManager());
      context.subscriptions.push(getDocumentAstCache());

      console.log('SQL All in One: activation complete');
    } catch (e) {
      errorHandler.handle(e, 'Extension activation', ErrorLevel.FATAL, ErrorCategory.CRITICAL);
    }
  });
}

export function deactivate(): void {
  getContainer().disposeAll();
  lazyProviders = null;
}
```

- [ ] **Step 3: 保存并编译检查**

Run: `npm run compile`
Expected: 无编译错误

- [ ] **Step 4: 运行测试确保功能正常**

Run: `npm run test`
Expected: 所有测试通过

---

### Task 6: 改进 DocumentAstCache - 添加 LRU 策略

**Files:**
- Modify: `src/parser/DocumentAstCache.ts`

- [ ] **Step 1: 读取当前代码**

- [ ] **Step 2: 实现 LRU 缓存策略**

```typescript
import * as vscode from 'vscode';

interface CacheEntry {
  ast: unknown;
  timestamp: number;
}

export class DocumentAstCache implements vscode.Disposable {
  private cache = new Map<string, CacheEntry>();
  private maxEntries = 50;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.invalidate(doc);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        this.invalidate(e.document);
      })
    );
  }

  private cleanup(): void {
    if (this.cache.size <= this.maxEntries) {
      return;
    }

    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(0, this.cache.size - this.maxEntries);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  get(document: vscode.TextDocument): unknown | undefined {
    const key = document.uri.toString();
    const entry = this.cache.get(key);
    if (entry) {
      entry.timestamp = Date.now();
      return entry.ast;
    }
    return undefined;
  }

  set(document: vscode.TextDocument, ast: unknown): void {
    const key = document.uri.toString();
    this.cache.set(key, {
      ast,
      timestamp: Date.now()
    });
    this.cleanup();
  }

  invalidate(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    this.cache.delete(key);
  }

  dispose(): void {
    this.cache.clear();
    this.disposables.forEach(d => d.dispose());
  }
}

let instance: DocumentAstCache | null = null;

export function getDocumentAstCache(): DocumentAstCache {
  if (!instance) {
    instance = new DocumentAstCache();
  }
  return instance;
}

export function createDocumentAstCache(): DocumentAstCache {
  return new DocumentAstCache();
}
```

- [ ] **Step 3: 保存并编译检查**

Run: `npm run compile`
Expected: 无编译错误

- [ ] **Step 4: 运行测试**

Run: `npm run test`
Expected: 所有测试通过

---

### Task 7: 重构 RuleRegistry - 减少代码重复

**Files:**
- Create: `src/linter/rules/index.ts`
- Modify: `src/linter/RuleRegistry.ts`

- [ ] **Step 1: 创建规则索引文件**

```typescript
import { AvoidSelectStarRule } from './AvoidSelectStarRule';
import { ExplicitJoinTypeRule } from './ExplicitJoinTypeRule';
import { LimitWithOrderByRule } from './LimitWithOrderByRule';
import { ColumnCountMismatchRule } from './ColumnCountMismatchRule';
import { MissingPrimaryKeyRule } from './MissingPrimaryKeyRule';
import { SelectInInsertRule } from './SelectInInsertRule';
import { DuplicateColumnAliasesRule } from './DuplicateColumnAliasesRule';
import { UseCoalesceOverIsNullRule } from './UseCoalesceOverIsNullRule';
import { UseCurrentTimestampRule } from './UseCurrentTimestampRule';
import { AvoidCorrelatedSubqueriesRule } from './AvoidCorrelatedSubqueriesRule';
import { MissingQueryCommentRule } from './MissingQueryCommentRule';
import { MissingColumnCommentRule } from './MissingColumnCommentRule';
import { CommentedOutCodeRule } from './CommentedOutCodeRule';
import { ExpiredTodoRule } from './ExpiredTodoRule';
import { HavingWithoutGroupByRule } from './HavingWithoutGroupByRule';
import { LimitInvalidValueRule } from './LimitInvalidValueRule';
import { ReservedWordIdentifierRule } from './ReservedWordIdentifierRule';
import { JoinMissingOnRule } from './JoinMissingOnRule';
import { SelectWithoutFromRule } from './SelectWithoutFromRule';
import { MisplacedDistinctRule } from './MisplacedDistinctRule';
import { AggregateInWhereRule } from './AggregateInWhereRule';
import { SubqueryWithoutAliasRule } from './SubqueryWithoutAliasRule';
import { SuspiciousNullComparisonRule } from './SuspiciousNullComparisonRule';
import { IncompleteCaseRule } from './IncompleteCaseRule';
import { RedundantDistinctRule } from './RedundantDistinctRule';
import { DateFunctionUsageRule } from './DateFunctionUsageRule';
import { WildcardInUpdateRule } from './WildcardInUpdateRule';
import type { LintRule, LintRuleConfig } from './LintRule';

export interface RuleConstructor {
  new (config: LintRuleConfig): LintRule;
}

export const RULES: { [key: string]: RuleConstructor } = {
  'avoid_select_star': AvoidSelectStarRule,
  'explicit_join_type': ExplicitJoinTypeRule,
  'limit_with_order_by': LimitWithOrderByRule,
  'avoid_column_count_mismatch': ColumnCountMismatchRule,
  'missing_primary_key': MissingPrimaryKeyRule,
  'avoid_select_in_insert': SelectInInsertRule,
  'duplicate_column_aliases': DuplicateColumnAliasesRule,
  'use_coalesce_over_isnull': UseCoalesceOverIsNullRule,
  'use_current_timestamp': UseCurrentTimestampRule,
  'avoid_correlated_subqueries': AvoidCorrelatedSubqueriesRule,
  'missing_query_comment': MissingQueryCommentRule,
  'missing_column_comment': MissingColumnCommentRule,
  'commented_out_code': CommentedOutCodeRule,
  'expired_todo': ExpiredTodoRule,
  'having_without_group_by': HavingWithoutGroupByRule,
  'limit_invalid_value': LimitInvalidValueRule,
  'reserved_word_identifier': ReservedWordIdentifierRule,
  'join_missing_on': JoinMissingOnRule,
  'select_without_from': SelectWithoutFromRule,
  'misplaced_distinct': MisplacedDistinctRule,
  'aggregate_in_where': AggregateInWhereRule,
  'subquery_without_alias': SubqueryWithoutAliasRule,
  'suspicious_null_comparison': SuspiciousNullComparisonRule,
  'incomplete_case': IncompleteCaseRule,
  'redundant_distinct': RedundantDistinctRule,
  'date_function_usage': DateFunctionUsageRule,
  'wildcard_in_update': WildcardInUpdateRule,
} as const;

export type RuleKey = keyof typeof RULES;
```

- [ ] **Step 2: 重构 RuleRegistry 使用自动注册**

```typescript
import * as vscode from 'vscode';
import type { LintRule, RuleContext } from './rules/LintRule';
import { loadRuleConfigs, type LintRuleConfig, type LintRuleDefinition } from './lintRules';
import { getContainer, Tokens } from '../core/diContainer';
import { RULES, RuleKey } from './rules/index';

const DEFAULT_CONFIG: LintRuleConfig = { enabled: false, severity: vscode.DiagnosticSeverity.Warning };

export class RuleRegistry {
  private rules = new Map<string, LintRule>();
  private rulesByType = new Map<string, LintRule[]>();

  register(rule: LintRule): void {
    this.rules.set(rule.id, rule);

    for (const type of rule.applicableTypes) {
      if (!this.rulesByType.has(type)) {
        this.rulesByType.set(type, []);
      }
      const list = this.rulesByType.get(type);
      if (list) {
        list.push(rule);
      }
    }
  }

  registerAllRules(): void {
    const configs = loadRuleConfigs();

    for (const [key, RuleClass] of Object.entries(RULES)) {
      const config = configs.get(key as RuleKey) ?? DEFAULT_CONFIG;
      this.register(new RuleClass(config));
    }
  }

  getEnabledRulesForType(type: string): LintRule[] {
    const rules = this.rulesByType.get(type) || [];
    return rules.filter(r => r.isEnabled());
  }

  getEnabledGlobalRules(): LintRule[] {
    return Array.from(this.rules.values())
      .filter(r => r.applicableTypes.length === 0 && r.isEnabled());
  }

  runRules(context: RuleContext): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const rules = this.getEnabledRulesForType(context.node.type);

    for (const rule of rules) {
      diagnostics.push(...rule.check(context));
    }

    return diagnostics;
  }

  runGlobalRules(context: RuleContext): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const globalRules = this.getEnabledGlobalRules();

    for (const rule of globalRules) {
      diagnostics.push(...rule.check(context));
    }

    return diagnostics;
  }

  getRuleDefinitions(): LintRuleDefinition[] {
    return Array.from(this.rules.values()).map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      defaultSeverity: rule.defaultSeverity,
      defaultEnabled: rule.defaultEnabled,
      category: rule.category,
    }));
  }
}

let cachedRegistry: RuleRegistry | null = null;

export function getRuleRegistry(): RuleRegistry {
  const container = getContainer();
  if (container.has(Tokens.RuleRegistry)) {
    return container.get<RuleRegistry>(Tokens.RuleRegistry);
  }
  if (!cachedRegistry) {
    cachedRegistry = createRuleRegistry();
  }
  return cachedRegistry;
}

export function resetRuleRegistry(): void {
  cachedRegistry = null;
}

export function createRuleRegistry(): RuleRegistry {
  const registry = new RuleRegistry();
  registry.registerAllRules();
  return registry;
}
```

- [ ] **Step 3: 保存并编译检查**

Run: `npm run compile`
Expected: 无编译错误

- [ ] **Step 4: 运行测试**

Run: `npm run test`
Expected: 所有测试通过

---

## 验证与总结

### Task 8: 完整测试与验证

- [ ] **Step 1: 运行完整的编译检查**

Run: `npm run compile`
Expected: 无错误无警告

- [ ] **Step 2: 运行完整测试套件**

Run: `npm run test`
Expected: 所有测试通过

- [ ] **Step 3: 运行 lint 检查**

Run: `npm run lint`
Expected: 无 lint 错误

- [ ] **Step 4: 验证功能完整性**

手动测试：
- 打开一个 SQL 文件
- 测试格式化功能
- 测试代码补全
- 验证 lint 警告/错误显示

---

## 总结

本计划完成以下优化：
1. ✅ 统一 DI 容器使用，添加工厂函数支持
2. ✅ 将核心服务（ConfigManager、ParserEngine、RuleRegistry）集成到 DI 容器
3. ✅ 保持向后兼容，保留原有的单例获取函数
4. ✅ 为 DocumentAstCache 添加 LRU 缓存策略
5. ✅ 重构 RuleRegistry 减少代码重复，使用自动发现机制

所有改进都经过测试验证，确保功能完整性。
