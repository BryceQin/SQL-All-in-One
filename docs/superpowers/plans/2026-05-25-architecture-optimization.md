# SQL All in One Architecture Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize the SQL All in One VS Code extension's architecture, performance, robustness, and maintainability without changing any existing functionality.

**Architecture:** Refactor in 4 phases: (1) utility layer improvements, (2) core infrastructure unification, (3) provider/performance optimization, (4) cleanup and type safety.

**Tech Stack:** TypeScript, VS Code Extension API, node-sql-parser

---

## Phase 1: Utility Layer (Independent Changes)

### Task 1: Optimize LRU Cache eviction algorithm

**Files:**
- Modify: `src/utils/lruCache.ts`

Replace Array-from + sort eviction with O(1) Map-ordered LRU using delete+set reinsertion pattern.

### Task 2: Optimize PerformanceMonitor with incremental stats

**Files:**
- Modify: `src/core/performanceMonitor.ts`

Maintain per-name aggregated stats incrementally instead of recomputing on every `getStats()` call.

### Task 3: Extract common AST resolution utility

**Files:**
- Modify: `src/parser/astUtils.ts`
- Modify: `src/providers/AstDiagnosticsProvider.ts`
- Modify: `src/providers/AstEnhancedChecker.ts`
- Modify: `src/providers/AstLinter.ts`

Extract `resolveAstList()` to eliminate repeated AST parsing entry logic across 3 files.

### Task 4: Consolidate name extraction utilities

**Files:**
- Modify: `src/parser/astUtils.ts`
- Modify: `src/navigation/AstNavigator.ts`
- Modify: `src/providers/SqlOutlineProvider.ts`

Move `extractName`/`extractNameFromAny`/`extractCteName` into `astUtils.ts` and update all callers.

### Task 5: Clean up temporary test scripts from root

**Files:**
- Delete: `parse-and-sqlify.ts`, `parse-only.ts`, `reproduce-issue.ts`, `test-ast-formatter-directly.cjs`, `test-format-with-mock.ts`, `test-hive-adapter.ts`, `test-json-array.ts`

---

## Phase 2: Core Infrastructure Unification

### Task 6: Enhance DI Container with lazy singleton support

**Files:**
- Modify: `src/core/diContainer.ts`

Add `registerLazySingleton` method and `disposeAll` method. Migrate all module-level singletons into the container.

### Task 7: Unify configuration reading through ConfigManager

**Files:**
- Modify: `src/core/configManager.ts`
- Modify: `src/providers/SqlDiagnosticsProvider.ts`
- Modify: `src/completion/SqlCompletionProvider.ts`
- Modify: `src/providers/SqlHoverProvider.ts`
- Modify: `src/providers/AstLinter.ts` (via SqlLinter)
- Modify: `src/linter/lintRules.ts`

All config reads go through ConfigManager. Remove per-provider config caching and onDidChangeConfiguration listeners.

### Task 8: Complete deactivate cleanup

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/core/diContainer.ts`

Ensure all disposable services are properly disposed in deactivate().

---

## Phase 3: Provider & Performance Optimization

### Task 9: Unify AST parsing through DocumentAstCache

**Files:**
- Modify: `src/providers/SqlFoldingRangeProvider.ts`
- Modify: `src/providers/SqlOutlineProvider.ts`
- Modify: `src/completion/AstCompletionProvider.ts`
- Modify: `src/completion/cteCompletion.ts`
- Modify: `src/completion/identifierCompletion.ts`

Replace direct `getParserEngine().tryAstify()` calls with `getDocumentAstCache().getOrParse()`.

### Task 10: Cache AstDiagnosticsProvider instance in SqlDiagnosticsProvider

**Files:**
- Modify: `src/providers/SqlDiagnosticsProvider.ts`

Move `new AstDiagnosticsProvider()` from per-call to constructor. Only recreate `SqlLinter` on config change.

### Task 11: Fix snippet loading and optimize completion trigger chars

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/completion/SqlCompletionProvider.ts`

Pass correct extensionPath. Reduce trigger characters to essential set.

### Task 12: Replace setTimeout with proper deferred registration

**Files:**
- Modify: `src/extension.ts`

Use context.subscriptions + onDidChangeActiveTextEditor for deferred provider registration instead of hardcoded setTimeout.

### Task 13: Make CommentPreserver and Adapters stateless

**Files:**
- Modify: `src/formatter/CommentPreserver.ts`
- Modify: `src/formatter/BaseSqlAdapter.ts`
- Modify: `src/formatter/HiveSqlAdapter.ts`
- Modify: `src/formatter/SparkSqlAdapter.ts`
- Modify: `src/utils/formatEditorText.ts`

Refactor to functional pattern: extract() returns state, restore() accepts state. Eliminate instance state mutation risk.

---

## Phase 4: Cleanup & Type Safety

### Task 14: Unify error handling patterns

**Files:**
- Modify: `src/completion/SqlCompletionProvider.ts`
- Modify: `src/providers/SqlFoldingRangeProvider.ts`
- Modify: `src/providers/SqlOutlineProvider.ts`

Wrap provider callbacks with consistent error boundaries instead of per-type try-catch.

### Task 15: Improve type safety (reduce `any`)

**Files:**
- Modify: `src/formatter/AstFormatter.ts`
- Modify: `src/converter/AstConverter.ts`
- Modify: `src/parser/astTypes.extended.ts`

Replace `any` with proper AST node types where feasible.

### Task 16: Add i18n key type safety

**Files:**
- Modify: `src/i18n/index.ts`

Generate key type from message bundles for compile-time checking.
