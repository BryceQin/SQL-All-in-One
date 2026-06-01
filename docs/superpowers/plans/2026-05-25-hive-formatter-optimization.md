# SQL All in One 全面优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面优化 SQL All in One VSCode 插件，从类型安全、架构、性能、错误处理、测试覆盖等多个维度进行改进，同时保持所有现有功能完整。

**Architecture:** 采用渐进式优化策略，分阶段实施改进，每阶段确保功能完整性，充分利用 TypeScript 类型系统，改进缓存策略，统一错误处理机制。

**Tech Stack:** TypeScript, VSCode Extension API, node-sql-parser

---

## 文件结构概述

以下是本次优化将涉及的主要文件：

- **新建文件:**
  - `src/core/diContainer.ts` - 依赖注入容器
  - `src/core/performanceMonitor.ts` - 性能监控
  - `src/utils/lazy.ts` - 懒加载工具
  - `src/parser/astTypes.extended.ts` - 扩展 AST 类型定义
  - `src/parser/typeGuards.ts` - 类型守卫函数
  - `src/utils/lruCache.ts` - LRU 缓存实现

- **修改文件:**
  - `src/core/configManager.ts` - 配置管理器增强
  - `src/core/errorHandler.ts` - 错误处理增强
  - `src/parser/DocumentAstCache.ts` - 缓存策略改进
  - `src/extension.ts` - 懒加载初始化
  - `eslint.config.ts` - ESLint 规则调整
  - `package.json` - 添加依赖

---

## Task 1: 增强类型安全 - 定义完整 AST 类型系统

**Files:**
- Create: `src/parser/astTypes.extended.ts`
- Create: `src/parser/typeGuards.ts`
- Modify: `eslint.config.ts`

### 步骤说明

- [ ] **Step 1: 创建扩展的 AST 类型定义**

```typescript
// src/parser/astTypes.extended.ts
import type { AST } from 'node-sql-parser';

// 基础节点类型
export interface AstNode {
  type: string;
  [key: string]: unknown;
}

// SELECT 语句节点
export interface SelectNode extends AstNode {
  type: 'select';
  distinct?: boolean;
  columns: SelectColumn[];
  from?: FromItem[];
  where?: unknown;
  groupby?: GroupByClause;
  having?: unknown;
  orderby?: OrderByItem[];
  limit?: LimitClause;
  with?: CteClause[];
  _next?: SelectNode;
  set_op?: string;
}

// SELECT 列
export interface SelectColumn {
  expr?: unknown;
  as?: string;
  type?: string;
}

// FROM 子句项
export interface FromItem {
  table?: string | AstNode;
  db?: string;
  as?: string;
  join?: string;
  on?: unknown;
  using?: unknown;
  expr?: { ast: AstNode };
  type?: string;
}

// GROUP BY 子句
export interface GroupByClause {
  columns?: unknown[];
}

// ORDER BY 项
export interface OrderByItem {
  expr: unknown;
  type?: string;
}

// LIMIT 子句
export interface LimitClause {
  value?: unknown[];
  seperator?: string;
}

// CTE 子句
export interface CteClause {
  name: string;
  stmt: AstNode;
}

// INSERT 语句
export interface InsertNode extends AstNode {
  type: 'insert';
  table?: unknown;
  columns?: unknown[];
  values?: unknown[];
}

// UPDATE 语句
export interface UpdateNode extends AstNode {
  type: 'update';
  table?: unknown[];
  set?: Array<{ column: string; value: unknown }>;
  where?: unknown;
}

// DELETE 语句
export interface DeleteNode extends AstNode {
  type: 'delete';
  from?: unknown[];
  where?: unknown;
}

// CREATE 语句
export interface CreateNode extends AstNode {
  type: 'create';
  table?: unknown;
  [key: string]: unknown;
}

// 列引用
export interface ColumnRefNode extends AstNode {
  type: 'column_ref';
  table?: string;
  column: string;
}

// 函数调用
export interface FunctionCallNode extends AstNode {
  type: 'function';
  name: string;
  args: unknown[];
}

// 合并原始 AST 类型
export type ExtendedAst = 
  | SelectNode 
  | InsertNode 
  | UpdateNode 
  | DeleteNode 
  | CreateNode 
  | ColumnRefNode 
  | FunctionCallNode 
  | AstNode;
```

- [ ] **Step 2: 创建类型守卫函数**

```typescript
// src/parser/typeGuards.ts
import {
  AstNode,
  SelectNode,
  InsertNode,
  UpdateNode,
  DeleteNode,
  CreateNode,
  ColumnRefNode,
  FunctionCallNode,
  ExtendedAst,
  SelectColumn,
  FromItem,
} from './astTypes.extended';
import { AstNodeType } from '../formatter/AstNodeTypes';

// 基础守卫
export function isAstNode(node: unknown): node is AstNode {
  return node !== null && typeof node === 'object' && 'type' in node;
}

// SELECT 相关
export function isSelectNode(node: unknown): node is SelectNode {
  return isAstNode(node) && node.type === AstNodeType.SELECT;
}

export function isSelectColumn(col: unknown): col is SelectColumn {
  return col !== null && typeof col === 'object';
}

export function isFromItem(item: unknown): item is FromItem {
  return item !== null && typeof item === 'object';
}

// 其他语句类型
export function isInsertNode(node: unknown): node is InsertNode {
  return isAstNode(node) && node.type === 'insert';
}

export function isUpdateNode(node: unknown): node is UpdateNode {
  return isAstNode(node) && node.type === 'update';
}

export function isDeleteNode(node: unknown): node is DeleteNode {
  return isAstNode(node) && node.type === 'delete';
}

export function isCreateNode(node: unknown): node is CreateNode {
  return isAstNode(node) && ['create', 'alter', 'drop'].includes(node.type);
}

// 表达式类型
export function isColumnRefNode(node: unknown): node is ColumnRefNode {
  return isAstNode(node) && node.type === 'column_ref';
}

export function isFunctionCallNode(node: unknown): node is FunctionCallNode {
  return isAstNode(node) && node.type === 'function';
}

// 类型断言辅助函数
export function asSelectNode(node: unknown): SelectNode | null {
  return isSelectNode(node) ? node : null;
}

export function asAstNodeArray(nodes: unknown): AstNode[] {
  if (Array.isArray(nodes)) {
    return nodes.filter(isAstNode);
  }
  if (isAstNode(nodes)) {
    return [nodes];
  }
  return [];
}
```

- [ ] **Step 3: 调整 ESLint 配置**

```typescript
// eslint.config.ts
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
      parser: tseslint.parser
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
        varsIgnorePattern: '^_'
      }],
      // 将 no-explicit-any 改为 warn，逐步迁移
      '@typescript-eslint/no-explicit-any': 'warn',
      // 添加额外的类型安全规则
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
    }
  }
]);
```

- [ ] **Step 4: 运行 ESLint 检查**

```bash
npm run lint
```

- [ ] **Step 5: 提交更改**

```bash
git add src/parser/astTypes.extended.ts src/parser/typeGuards.ts eslint.config.ts
git commit -m "feat: enhance type safety with extended AST types and guards"
```

---

## Task 2: 改进架构 - 创建依赖注入容器

**Files:**
- Create: `src/core/diContainer.ts`
- Modify: `src/core/configManager.ts`
- Modify: `src/parser/DocumentAstCache.ts`
- Modify: `src/parser/SqlParserEngine.ts`

### 步骤说明

- [ ] **Step 1: 创建依赖注入容器**

```typescript
// src/core/diContainer.ts
/**
 * 简单的依赖注入容器
 */
export class DIContainer {
  private services = new Map<string, unknown>();
  private factories = new Map<string, () => unknown>();

  /**
   * 注册一个服务实例
   */
  register<T>(token: string, service: T): void {
    this.services.set(token, service);
  }

  /**
   * 注册一个服务工厂（懒加载）
   */
  registerFactory<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  /**
   * 获取一个服务实例
   */
  get<T>(token: string): T {
    let service = this.services.get(token) as T | undefined;
    
    if (service === undefined) {
      const factory = this.factories.get(token);
      if (factory) {
        service = factory() as T;
        this.services.set(token, service);
      } else {
        throw new Error(`Service not registered: ${token}`);
      }
    }
    
    return service;
  }

  /**
   * 检查服务是否已注册
   */
  has(token: string): boolean {
    return this.services.has(token) || this.factories.has(token);
  }

  /**
   * 清空所有服务
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }
}

// 创建全局容器实例
const container = new DIContainer();

// 服务令牌
export const Tokens = {
  ConfigManager: 'ConfigManager',
  ParserEngine: 'ParserEngine',
  DocumentAstCache: 'DocumentAstCache',
  ErrorHandler: 'ErrorHandler',
  PerformanceMonitor: 'PerformanceMonitor',
} as const;

export type Token = typeof Tokens[keyof typeof Tokens];

export function getContainer(): DIContainer {
  return container;
}
```

- [ ] **Step 2: 修改 ConfigManager 支持 DI**

```typescript
// src/core/configManager.ts
import * as vscode from 'vscode';
import { initI18n } from '../i18n';
import { getContainer, Tokens } from './diContainer';

interface ConfigListener {
  (): void;
}

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
            try { 
              initI18n(); 
            } catch { 
              // ignore 
            }
          }
          for (const listener of this.listeners) {
            listener();
          }
        }
      }),
    );
  }

  /**
   * 注册配置验证器
   */
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
    
    // 验证配置
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

let instance: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
  if (!instance) {
    instance = new ConfigManager();
  }
  return instance;
}

// 在 DI 容器中注册
getContainer().registerFactory(Tokens.ConfigManager, getConfigManager);
```

- [ ] **Step 3: 修改其他核心类支持 DI**

更新 `DocumentAstCache.ts` 和 `SqlParserEngine.ts`，添加 DI 注册：

在 `DocumentAstCache.ts` 末尾添加：
```typescript
import { getContainer, Tokens } from '../core/diContainer';

// ... 现有代码 ...

// 在 DI 容器中注册
getContainer().registerFactory(Tokens.DocumentAstCache, getDocumentAstCache);
```

在 `SqlParserEngine.ts` 末尾添加：
```typescript
import { getContainer, Tokens } from '../core/diContainer';

// ... 现有代码 ...

// 在 DI 容器中注册
getContainer().registerFactory(Tokens.ParserEngine, getParserEngine);
```

- [ ] **Step 4: 提交更改**

```bash
git add src/core/diContainer.ts src/core/configManager.ts src/parser/DocumentAstCache.ts src/parser/SqlParserEngine.ts
git commit -m "feat: add dependency injection container"
```

---

## Task 3: 性能优化 - 添加 LRU 缓存和性能监控

**Files:**
- Create: `src/utils/lruCache.ts`
- Create: `src/core/performanceMonitor.ts`
- Modify: `src/parser/DocumentAstCache.ts`

### 步骤说明

- [ ] **Step 1: 创建 LRU 缓存实现**

```typescript
// src/utils/lruCache.ts
interface LRUCacheEntry<V> {
  value: V;
  timestamp: number;
  lastAccessed: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, LRUCacheEntry<V>>();
  private maxSize: number;
  private maxAge: number;

  constructor(options: { maxSize?: number; maxAge?: number } = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.maxAge = options.maxAge ?? 30000; // 默认 30 秒
  }

  set(key: K, value: V): void {
    // 先检查大小，超过限制则删除最旧的
    this.evictIfNeeded();

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }

    // 更新访问时间
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private evictIfNeeded(): void {
    if (this.cache.size >= this.maxSize) {
      // 删除最久未访问的条目
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      
      // 删除 20% 的旧条目
      const toRemove = Math.max(1, Math.floor(this.maxSize * 0.2));
      for (let i = 0; i < toRemove; i++) {
        if (entries[i]) {
          this.cache.delete(entries[i][0]);
        }
      }
    }
  }
}
```

- [ ] **Step 2: 创建性能监控器**

```typescript
// src/core/performanceMonitor.ts
import { getContainer, Tokens } from './diContainer';

interface Measurement {
  name: string;
  duration: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private measurements: Measurement[] = [];
  private maxMeasurements = 1000;
  private slowThreshold = 100; // 100ms

  /**
   * 测量函数执行时间
   */
  measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const duration = performance.now() - start;
      this.recordMeasurement(name, duration);
    }
  }

  /**
   * 异步版本的测量
   */
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.recordMeasurement(name, duration);
    }
  }

  private recordMeasurement(name: string, duration: number): void {
    const measurement: Measurement = {
      name,
      duration,
      timestamp: Date.now(),
    };

    this.measurements.push(measurement);

    // 保持大小限制
    if (this.measurements.length > this.maxMeasurements) {
      this.measurements = this.measurements.slice(-this.maxMeasurements);
    }

    // 记录慢操作
    if (duration > this.slowThreshold) {
      console.warn(`[Performance] Slow operation: ${name} took ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(name?: string): { 
    count: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
  } {
    const relevant = name 
      ? this.measurements.filter(m => m.name === name)
      : this.measurements;

    if (relevant.length === 0) {
      return { count: 0, avgDuration: 0, maxDuration: 0, minDuration: 0 };
    }

    const durations = relevant.map(m => m.duration);
    return {
      count: durations.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
    };
  }

  /**
   * 清空测量记录
   */
  clear(): void {
    this.measurements = [];
  }
}

let instance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}

// 在 DI 容器中注册
getContainer().registerFactory(Tokens.PerformanceMonitor, getPerformanceMonitor);
```

- [ ] **Step 3: 改进 DocumentAstCache 使用 LRU 缓存**

```typescript
// src/parser/DocumentAstCache.ts
import * as vscode from 'vscode';
import type { AST } from 'node-sql-parser';
import { getParserEngine } from './SqlParserEngine';
import type { SqlDialect } from './dialectMapper';
import type { ParseError } from './ParseError';
import { LRUCache } from '../utils/lruCache';
import { getPerformanceMonitor } from '../core/performanceMonitor';
import { getContainer, Tokens } from '../core/diContainer';

interface CacheEntry {
  version: number;
  ast: AST[] | AST;
  timestamp: number;
}

export class DocumentAstCache {
  private cache: LRUCache<string, CacheEntry>;
  private disposables: vscode.Disposable[] = [];
  private perfMonitor = getPerformanceMonitor();

  constructor() {
    // 使用 LRU 缓存，最多缓存 50 个文档，30秒过期
    this.cache = new LRUCache<string, CacheEntry>({
      maxSize: 50,
      maxAge: 30000,
    });

    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.cache.delete(doc.uri.toString());
      }),
    );
  }

  getOrParse(document: vscode.TextDocument, dialect: SqlDialect): {
    success: boolean;
    ast: AST[] | AST | null;
    error: ParseError | null;
  } {
    return this.perfMonitor.measure('DocumentAstCache.getOrParse', () => {
      const key = document.uri.toString();
      const version = document.version;
      const cached = this.cache.get(key);

      if (cached && cached.version === version) {
        return { success: true, ast: cached.ast, error: null };
      }

      const engine = getParserEngine();
      const result = engine.tryAstify(document.getText(), dialect);

      if (result.success && result.ast) {
        this.cache.set(key, {
          version,
          ast: result.ast,
          timestamp: Date.now(),
        });
      }

      return result;
    });
  }

  invalidate(uri: vscode.Uri): void {
    this.cache.delete(uri.toString());
  }

  dispose(): void {
    this.cache.clear();
    this.disposables.forEach((d) => d.dispose());
  }
}

let instance: DocumentAstCache | null = null;

export function getDocumentAstCache(): DocumentAstCache {
  if (!instance) {
    instance = new DocumentAstCache();
  }
  return instance;
}

// 在 DI 容器中注册
getContainer().registerFactory(Tokens.DocumentAstCache, getDocumentAstCache);
```

- [ ] **Step 4: 提交更改**

```bash
git add src/utils/lruCache.ts src/core/performanceMonitor.ts src/parser/DocumentAstCache.ts
git commit -m "perf: add LRU cache and performance monitoring"
```

---

## Task 4: 增强错误处理系统

**Files:**
- Modify: `src/core/errorHandler.ts`

### 步骤说明

- [ ] **Step 1: 重写增强的错误处理器**

```typescript
// src/core/errorHandler.ts
import * as vscode from 'vscode';
import { t } from '../i18n';
import { getContainer, Tokens } from './diContainer';

export enum ErrorLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  FATAL = 'fatal'
}

export enum ErrorCategory {
  CRITICAL = 'critical',
  FEATURE = 'feature',
  SUB_ITEM = 'sub_item',
  PARSE = 'parse',
  FORMAT = 'format',
  CONFIG = 'config',
}

export interface FormatterError {
  message: string;
  originalError?: unknown;
  context: string;
  level: ErrorLevel;
  category: ErrorCategory;
  timestamp: number;
  stack?: string;
}

export class ErrorHandler {
  private listeners: ((error: FormatterError) => void)[] = [];
  private errorHistory: FormatterError[] = [];
  private maxHistorySize = 100;
  private showNotifications = true;

  /**
   * 处理错误
   */
  handle(
    error: unknown, 
    context: string, 
    level: ErrorLevel = ErrorLevel.ERROR,
    category: ErrorCategory = ErrorCategory.FEATURE
  ): FormatterError {
    const formattedError = this.normalizeError(error, context, level, category);
    this.logError(formattedError);
    this.notifyListeners(formattedError);
    this.maybeShowNotification(formattedError);
    return formattedError;
  }

  /**
   * 尝试执行操作，自动处理错误
   */
  try<T>(
    fn: () => T, 
    context: string,
    options: {
      fallback?: T;
      level?: ErrorLevel;
      category?: ErrorCategory;
      rethrow?: boolean;
    } = {}
  ): T | undefined {
    const { 
      fallback, 
      level = ErrorLevel.ERROR, 
      category = ErrorCategory.FEATURE,
      rethrow = false
    } = options;

    try {
      return fn();
    } catch (error) {
      this.handle(error, context, level, category);
      
      if (rethrow) {
        throw error;
      }
      
      return fallback;
    }
  }

  /**
   * 异步版本的 try
   */
  async tryAsync<T>(
    fn: () => Promise<T>, 
    context: string,
    options: {
      fallback?: T;
      level?: ErrorLevel;
      category?: ErrorCategory;
      rethrow?: boolean;
    } = {}
  ): Promise<T | undefined> {
    const { 
      fallback, 
      level = ErrorLevel.ERROR, 
      category = ErrorCategory.FEATURE,
      rethrow = false
    } = options;

    try {
      return await fn();
    } catch (error) {
      this.handle(error, context, level, category);
      
      if (rethrow) {
        throw error;
      }
      
      return fallback;
    }
  }

  /**
   * 注册错误监听器
   */
  addListener(listener: (error: FormatterError) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  /**
   * 获取错误历史
   */
  getHistory(): FormatterError[] {
    return [...this.errorHistory];
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  private normalizeError(
    error: unknown, 
    context: string, 
    level: ErrorLevel,
    category: ErrorCategory
  ): FormatterError {
    let message = 'Unknown error';
    let stack: string | undefined;

    if (error instanceof Error) {
      message = error.message;
      stack = error.stack;
    } else if (typeof error === 'string') {
      message = error;
    } else {
      try {
        message = JSON.stringify(error);
      } catch {
        message = String(error);
      }
    }

    return {
      message,
      originalError: error,
      context,
      level,
      category,
      timestamp: Date.now(),
      stack,
    };
  }

  private logError(error: FormatterError): void {
    const logPrefix = `[SQL All in One] [${error.level.toUpperCase()}]`;
    const logMessage = `${logPrefix} [${error.context}] ${error.message}`;

    switch (error.level) {
      case ErrorLevel.DEBUG:
        console.debug(logMessage, error.originalError);
        break;
      case ErrorLevel.INFO:
        console.info(logMessage, error.originalError);
        break;
      case ErrorLevel.WARNING:
        console.warn(logMessage, error.originalError);
        break;
      case ErrorLevel.ERROR:
      case ErrorLevel.FATAL:
        console.error(logMessage, error.originalError);
        break;
    }

    // 添加到历史
    this.errorHistory.push(error);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  private notifyListeners(error: FormatterError): void {
    for (const listener of this.listeners) {
      try {
        listener(error);
      } catch {
        // 防止监听器错误影响主流程
      }
    }
  }

  private maybeShowNotification(error: FormatterError): void {
    if (!this.showNotifications) return;

    switch (error.level) {
      case ErrorLevel.FATAL:
        vscode.window.showErrorMessage(
          t('notification.fatalError', `${error.context}: ${error.message}`)
        );
        break;
      case ErrorLevel.ERROR:
        if (error.category === ErrorCategory.CRITICAL) {
          vscode.window.showErrorMessage(
            t('notification.error', `${error.context}: ${error.message}`)
          );
        }
        break;
      case ErrorLevel.WARNING:
        // 只有重要的警告才显示通知
        if (error.category === ErrorCategory.CRITICAL) {
          vscode.window.showWarningMessage(
            t('notification.warning', `${error.context}: ${error.message}`)
          );
        }
        break;
    }
  }
}

let instance: ErrorHandler | null = null;

export function getErrorHandler(): ErrorHandler {
  if (!instance) {
    instance = new ErrorHandler();
  }
  return instance;
}

// 保持向后兼容的旧函数
export function handleError(error: unknown, context: string, category: ErrorCategory): void {
  const level = category === ErrorCategory.CRITICAL ? ErrorLevel.ERROR : ErrorLevel.WARNING;
  getErrorHandler().handle(error, context, level, category);
}

// 在 DI 容器中注册
getContainer().registerFactory(Tokens.ErrorHandler, getErrorHandler);
```

- [ ] **Step 2: 提交更改**

```bash
git add src/core/errorHandler.ts
git commit -m "feat: enhance error handling system"
```

---

## Task 5: 添加懒加载工具和优化启动流程

**Files:**
- Create: `src/utils/lazy.ts`
- Modify: `src/extension.ts`

### 步骤说明

- [ ] **Step 1: 创建懒加载工具**

```typescript
// src/utils/lazy.ts
/**
 * 懒加载包装器
 */
export class Lazy<T> {
  private instance: T | null = null;
  private factory: () => T;
  private initialized = false;

  constructor(factory: () => T) {
    this.factory = factory;
  }

  get(): T {
    if (!this.initialized) {
      this.instance = this.factory();
      this.initialized = true;
    }
    return this.instance as T;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.instance = null;
    this.initialized = false;
  }
}

/**
 * 创建一个懒加载的值
 */
export function lazy<T>(factory: () => T): Lazy<T> {
  return new Lazy(factory);
}

/**
 * 异步懒加载
 */
export class LazyAsync<T> {
  private instance: T | null = null;
  private factory: () => Promise<T>;
  private promise: Promise<T> | null = null;
  private initialized = false;

  constructor(factory: () => Promise<T>) {
    this.factory = factory;
  }

  async get(): Promise<T> {
    if (this.initialized && this.instance !== null) {
      return this.instance;
    }

    if (this.promise !== null) {
      return this.promise;
    }

    this.promise = this.factory();
    this.instance = await this.promise;
    this.initialized = true;
    this.promise = null;
    return this.instance;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}

export function lazyAsync<T>(factory: () => Promise<T>): LazyAsync<T> {
  return new LazyAsync(factory);
}
```

- [ ] **Step 2: 优化 extension.ts 使用懒加载**

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { SqlFormattingProvider } from './providers/SqlFormattingProvider';
import { sqlDialects, isSqlDocument, getSqlLanguageIds } from './core/sqlDialects';
import { formatSelectionCommand } from './commands/formatSelectionCommand';
import { toggleComment, toggleAdvancedComment } from './commands/commentCommands';
import { convertMysqlToHiveCommand, convertHiveToMysqlCommand } from './commands/converterCommands';
import { openConfigEditorCommand } from './commands/configEditorCommand';
import { initI18n } from './i18n';
import { getConfigManager } from './core/configManager';
import { resetParserEngine } from './parser/SqlParserEngine';
import { getDocumentAstCache } from './parser/DocumentAstCache';
import { Lazy, lazy } from './utils/lazy';
import { getErrorHandler, ErrorLevel, ErrorCategory } from './core/errorHandler';
import { getPerformanceMonitor } from './core/performanceMonitor';

// 懒加载各种 provider
const lazyProviders = {
  diagnosticsProvider: lazy(() => {
    const { SqlDiagnosticsProvider } = require('./providers/SqlDiagnosticsProvider');
    return new SqlDiagnosticsProvider();
  }),
  statusBarProvider: lazy(() => {
    const { StatusBarProvider } = require('./providers/StatusBarProvider');
    return new StatusBarProvider();
  }),
  parameterHighlighter: lazy(() => {
    const { SqlParameterHighlighter } = require('./providers/SqlParameterHightlighter');
    return new SqlParameterHighlighter();
  }),
  completionProvider: lazy(() => {
    const { SqlCompletionProvider } = require('./completion');
    return new SqlCompletionProvider('');
  }),
  codeActionProvider: lazy(() => {
    const { SqlCodeActionProvider } = require('./providers/SqlCodeActionProvider');
    return new SqlCodeActionProvider();
  }),
  foldingRangeProvider: lazy(() => {
    const { SqlFoldingRangeProvider } = require('./providers/SqlFoldingRangeProvider');
    return new SqlFoldingRangeProvider();
  }),
  outlineProvider: lazy(() => {
    const { SqlOutlineProvider } = require('./providers/SqlOutlineProvider');
    return new SqlOutlineProvider();
  }),
  hoverProvider: lazy(() => {
    const { SqlHoverProvider } = require('./providers/SqlHoverProvider');
    return new SqlHoverProvider();
  }),
};

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
    vscode.commands.registerCommand('sql-all-in-one.format-selection', formatSelectionCommand),
    vscode.commands.registerCommand('sql-all-in-one.toggleComment', toggleComment),
    vscode.commands.registerCommand('sql-all-in-one.toggleAdvancedComment', toggleAdvancedComment),
    vscode.commands.registerCommand('sql-all-in-one.mysql-to-hive', convertMysqlToHiveCommand),
    vscode.commands.registerCommand('sql-all-in-one.hive-to-mysql', convertHiveToMysqlCommand),
    vscode.commands.registerCommand('sql-all-in-one.open-config-editor', () => 
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
  const sqlLanguages = getSqlLanguageIds();

  const codeActionProvider = lazyProviders.codeActionProvider.get();
  const foldingRangeProvider = lazyProviders.foldingRangeProvider.get();
  const outlineProvider = lazyProviders.outlineProvider.get();
  const hoverProvider = lazyProviders.hoverProvider.get();

  for (const lang of sqlLanguages) {
    const selector = { language: lang };

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        selector,
        codeActionProvider,
        { providedCodeActionKinds: (codeActionProvider as any).constructor.providedCodeActionKinds },
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
  }
}

function registerCompletion(context: vscode.ExtensionContext): void {
  const completionProvider = lazyProviders.completionProvider.get();
  if (!completionProvider) return;
  
  const sqlLanguages = getSqlLanguageIds();
  const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.'];

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
  const parameterHighlighter = lazyProviders.parameterHighlighter.get();
  if (!parameterHighlighter) return;
  
  const { SqlParameterReplaceCommand } = require('./providers/SqlParameterHightlighter');
  SqlParameterReplaceCommand.register(context);
  context.subscriptions.push(parameterHighlighter);
}

export function activate(context: vscode.ExtensionContext): void {
  perfMonitor.measure('Extension.activate', () => {
    console.log('SQL All in One: activating...');

    try {
      // Phase 1: 核心初始化
      safeRegister('initialize i18n', () => initI18n());
      
      // Phase 2: 注册命令和格式化（总是需要）
      safeRegister('register commands', () => registerCommands(context));
      safeRegister('register formatting providers', () => registerFormattingProviders(context));

      // Phase 3: 延迟注册其他功能
      setTimeout(() => {
        safeRegister('register diagnostics', () => registerDiagnostics(context));
        safeRegister('register providers', () => registerProviders(context));
        safeRegister('register completion', () => registerCompletion(context));
        safeRegister('register parameter highlighter', () => registerParameterHighlighter(context));
        
        if (lazyProviders.statusBarProvider.isInitialized || vscode.workspace.textDocuments.some(isSqlDocument)) {
          const statusBar = lazyProviders.statusBarProvider.get();
          if (statusBar) {
            context.subscriptions.push(statusBar);
          }
        }
      }, 100);

      // 注册基础服务
      context.subscriptions.push(getConfigManager());
      context.subscriptions.push(getDocumentAstCache());

      console.log('SQL All in One: activation complete');
    } catch (error) {
      errorHandler.handle(error, 'Extension activation', ErrorLevel.FATAL, ErrorCategory.CRITICAL);
    }
  });
}

export function deactivate(): void {
  if (lazyProviders.diagnosticsProvider.isInitialized) {
    const dp = lazyProviders.diagnosticsProvider.get();
    if (dp) {
      dp.dispose();
    }
  }
  resetParserEngine();
}
```

- [ ] **Step 3: 提交更改**

```bash
git add src/utils/lazy.ts src/extension.ts
git commit -m "perf: add lazy loading and optimize startup"
```

---

## Task 6: 运行测试确保一切正常

**Files:**
- Run: 测试命令

### 步骤说明

- [ ] **Step 1: 安装依赖并编译**

```bash
npm install
npm run compile
```

- [ ] **Step 2: 运行 ESLint 检查**

```bash
npm run lint
```

- [ ] **Step 3: 运行测试**

```bash
npm run test
```

- [ ] **Step 4: 提交最终更改（如果有修复）**

```bash
# 只有在有需要修复的问题时才执行
git add <修复的文件>
git commit -m "fix: resolve issues found in testing"
```

---

## 总结

本实施计划涵盖了以下主要优化内容：

1. ✅ **类型安全增强** - 扩展 AST 类型定义，添加类型守卫，逐步改进 ESLint 规则
2. ✅ **架构改进** - 添加依赖注入容器，解耦组件依赖
3. ✅ **性能优化** - 实现 LRU 缓存策略，添加性能监控系统
4. ✅ **错误处理增强** - 统一错误处理机制，支持错误恢复和监控
5. ✅ **启动优化** - 添加懒加载机制，优化激活流程

所有优化都保持了向后兼容性，确保现有功能不受影响。
