# SQL All in One 全面优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复所有架构缺陷、实现全链路国际化、提升代码质量和类型安全性

**Architecture:** 按优先级分 13 个独立 Task，P0 先执行（互不依赖），P1/P2/P3 后续跟进

**Tech Stack:** TypeScript, VS Code Extension API, node-sql-parser

---

### Task 1: 修复 `createLazyProviders` 闭包引用问题

**Files:**
- Modify: `src/extension.ts:45-61`

**说明:** `definitionProvider`/`referenceProvider`/`renameProvider` 的工厂函数在 `providers` 变量赋值完成前引用了它。

- [ ] **Step 1: 修改 `createLazyProviders` 使用延迟闭包**

将 [src/extension.ts](file:///Users/hao/Downloads/sql-all-in-one/src/extension.ts#L45-L61) 中：

```typescript
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
    definitionProvider: lazy(() => new SqlDefinitionProvider(providers.astNavigator.get())),
    referenceProvider: lazy(() => new SqlReferenceProvider(providers.astNavigator.get())),
    renameProvider: lazy(() => new SqlRenameProvider(providers.astNavigator.get())),
  }
  return providers
}
```

替换为：

```typescript
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
      const nav = providers.astNavigator.get()
      return new SqlDefinitionProvider(nav)
    }),
    referenceProvider: lazy(() => {
      const nav = providers.astNavigator.get()
      return new SqlReferenceProvider(nav)
    }),
    renameProvider: lazy(() => {
      const nav = providers.astNavigator.get()
      return new SqlRenameProvider(nav)
    }),
  }
  return providers
}
```

- [ ] **Step 2: 运行编译验证**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

---

### Task 2: 统一 DI 机制，修复 `deactivate()` 内存泄漏

**Files:**
- Modify: `src/extension.ts` (deactivate, activate)
- Modify: `src/core/diContainer.ts`
- Modify: `src/core/errorHandler.ts`
- Modify: `src/core/performanceMonitor.ts`
- Modify: `src/core/configManager.ts`
- Modify: `src/parser/SqlParserEngine.ts`
- Modify: `src/parser/DocumentAstCache.ts`

**说明:** 当前三套单例机制混用：模块级变量+getter、Lazy 包装器、DIContainer。需在 deactivate() 中释放所有资源。

- [ ] **Step 1: 增强 DIContainer 的 disposeAll 方法，支持递归销毁工厂创建的实例**

修改 `src/core/diContainer.ts` 的 `disposeAll()` 方法，使其能追踪工厂创建的实例：

```typescript
export class DIContainer {
  private services = new Map<string, unknown>();
  private factories = new Map<string, () => unknown>();
  private factoryInstances = new Set<unknown>();

  registerFactory<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  registerLazySingleton<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  get<T>(token: string): T {
    let service = this.services.get(token) as T | undefined;
    if (service === undefined) {
      const factory = this.factories.get(token);
      if (factory) {
        service = factory() as T;
        this.services.set(token, service);
        this.factoryInstances.add(service);
      } else {
        throw new Error(`Service not registered: ${token}`);
      }
    }
    return service;
  }

  has(token: string): boolean {
    return this.services.has(token) || this.factories.has(token);
  }

  disposeAll(): void {
    for (const service of this.services.values()) {
      if (service !== null && service !== undefined) {
        if (typeof (service as Record<string, unknown>).dispose === 'function') {
          (service as { dispose: () => void }).dispose();
        }
      }
    }
    this.services.clear();
    this.factories.clear();
    this.factoryInstances.clear();
  }

  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.factoryInstances.clear();
  }
}
```

- [ ] **Step 2: 修改 `extension.ts` `deactivate()` 统一销毁**

修改 [src/extension.ts](file:///Users/hao/Downloads/sql-all-in-one/src/extension.ts#L251-L253)：

```typescript
export function deactivate(): void {
  getContainer().disposeAll()
  lazyProviders = undefined as unknown as ProviderMap
}
```

- [ ] **Step 3: 运行编译验证**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

---

### Task 3: 配置项描述 NLS 迁移 — `package.json` 国际化

**Files:**
- Modify: `package.json` (所有 `markdownDescription` + `enumDescriptions`)
- Modify: `package.nls.json` (追加英文翻译)
- Modify: `package.nls.zh-cn.json` (追加中文翻译，从 package.json 迁移)

**说明:** 将 `package.json` 中约 100 处硬编码中文替换为 `%key%` 占位符，分别在 `package.nls.json`（英文）和 `package.nls.zh-cn.json`（中文）中定义翻译文本。

- [ ] **Step 1: 修改 `package.json`，替换所有 `markdownDescription` 为 `%key%` 占位符**

遍历 `package.json` 中 `contributes.configuration.properties` 下的每个配置项，将所有硬编码中文 `markdownDescription` 替换为 `%sql-all-in-one.config.{propertyName}.markdownDescription%`。

例如：
```json
// 修改前
"SQL-All-in-One.keywordCase": {
    "markdownDescription": "以大写、小写或保留现状来格式化关键字"
}

// 修改后
"SQL-All-in-One.keywordCase": {
    "markdownDescription": "%sql-all-in-one.config.keywordCase.markdownDescription%"
}
```

同时为所有 enum 类型配置项补充 `enumDescriptions`，使用 `%sql-all-in-one.config.{propertyName}.enumDescriptions.{value}%` 格式。

配置项映射规则（propertyName 从 `SQL-All-in-One.xxx` 中提取 `xxx`）：

| package.json 中的 key | NLS 占位符前缀 |
|----------------------|---------------|
| `SQL-All-in-One.dialect` | `sql-all-in-one.config.dialect` |
| `SQL-All-in-One.displayLanguage` | `sql-all-in-one.config.displayLanguage` |
| `SQL-All-in-One.keywordCase` | `sql-all-in-one.config.keywordCase` |
| `SQL-All-in-One.lint.avoid_select_star` | `sql-all-in-one.config.lint.avoid_select_star` |
| ... (所有配置项) | ... |

- [ ] **Step 2: 更新 `package.nls.json`（英文）**

为每个配置项追加英文翻译。新增约 120 个 key。格式：

```json
{
    "sql-all-in-one.config.keywordCase.markdownDescription": "Format keywords to UPPER case, lower case, or preserve as-is",
    "sql-all-in-one.config.keywordCase.enumDescriptions.preserve": "Preserve original casing",
    "sql-all-in-one.config.keywordCase.enumDescriptions.upper": "Convert to UPPER CASE",
    "sql-all-in-one.config.keywordCase.enumDescriptions.lower": "Convert to lower case"
}
```

- [ ] **Step 3: 更新 `package.nls.zh-cn.json`（中文）**

将原来硬编码在 `package.json` 中的中文描述迁移到此文件，格式同上。

- [ ] **Step 4: 验证**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

---

### Task 4: 可视化配置编辑器 WebView 国际化

**Files:**
- Modify: `src/commands/configEditorCommand.ts`
- Modify: `media/config-editor.html`
- Modify: `media/config-editor.js`
- Modify: `src/i18n/messages.en.json` (追加 configEditor 翻译 key)
- Modify: `src/i18n/messages.zh.json` (追加 configEditor 翻译 key)

- [ ] **Step 1: 添加配置编辑器的翻译 key**

在 `src/i18n/messages.en.json` 追加：

```json
{
    "configEditor.title": "SQL All in One - Config Editor",
    "configEditor.subtitle": "Visually adjust SQL formatting options with live preview",
    "configEditor.presets": "Quick Presets",
    "configEditor.presetDefault": "Default",
    "configEditor.presetHive": "Hive",
    "configEditor.presetMySQL": "MySQL",
    "configEditor.presetCompact": "Compact",
    "configEditor.resetDefault": "Reset Defaults",
    "configEditor.save": "Save Config",
    "configEditor.previewTitle": "Preview",
    "configEditor.previewPlaceholder": "Enter SQL here to preview formatting...",
    "configEditor.formatPreviewBtn": "Format Preview",
    "configEditor.formattingOptions": "Formatting Options",
    "configEditor.loadFailed": "Failed to load config editor",
    "configEditor.reinstall": "Please reinstall the extension."
}
```

在 `src/i18n/messages.zh.json` 追加：

```json
{
    "configEditor.title": "SQL All in One - 配置编辑器",
    "configEditor.subtitle": "可视化调整 SQL 格式化选项，实时预览效果",
    "configEditor.presets": "快速预设",
    "configEditor.presetDefault": "默认",
    "configEditor.presetHive": "Hive",
    "configEditor.presetMySQL": "MySQL",
    "configEditor.presetCompact": "紧凑",
    "configEditor.resetDefault": "重置默认",
    "configEditor.save": "保存配置",
    "configEditor.previewTitle": "预览",
    "configEditor.previewPlaceholder": "输入 SQL 预览格式化效果...",
    "configEditor.formatPreviewBtn": "格式化预览",
    "configEditor.formattingOptions": "格式化选项",
    "configEditor.loadFailed": "配置编辑器加载失败",
    "configEditor.reinstall": "请重新安装插件。"
}
```

- [ ] **Step 2: 修改 `configEditorCommand.ts` 注入翻译字典**

修改 [src/commands/configEditorCommand.ts](file:///Users/hao/Downloads/sql-all-in-one/src/commands/configEditorCommand.ts) 中的 `_getHtmlForWebview()` 方法，在 HTML 中注入 `window.__I18N__` 和 `window.__LANG__`：

```typescript
import { t, getLanguage } from '../i18n'
import type { MessageKey } from '../i18n'

// 在类中添加方法
private _getConfigEditorI18n(): Record<string, string> {
    const keys: MessageKey[] = [
        'configEditor.title', 'configEditor.subtitle',
        'configEditor.presets', 'configEditor.presetDefault',
        'configEditor.presetHive', 'configEditor.presetMySQL',
        'configEditor.presetCompact', 'configEditor.resetDefault',
        'configEditor.save', 'configEditor.previewTitle',
        'configEditor.previewPlaceholder', 'configEditor.formatPreviewBtn',
        'configEditor.formattingOptions', 'configEditor.loadFailed',
        'configEditor.reinstall',
    ]
    const dict: Record<string, string> = {}
    for (const key of keys) {
        dict[key] = t(key)
    }
    return dict
}
```

修改 `_getHtmlForWebview()` 方法，在 html 中注入：

```typescript
private _getHtmlForWebview(): string {
    try {
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'config-editor.html')
        let html = fs.readFileSync(htmlPath, 'utf-8')

        const cssUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'config-editor.css')
        )
        const jsUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'config-editor.js')
        )

        const i18nDict = this._getConfigEditorI18n()
        const i18nScript = `<script>window.__I18N__ = ${JSON.stringify(i18nDict)}; window.__LANG__ = "${getLanguage()}";</script>`

        html = html.replace('{{I18N_INJECT}}', i18nScript)
        html = html.replace('{{CSS_URI}}', cssUri.toString())
        html = html.replace('{{JS_URI}}', jsUri.toString())

        return html
    } catch {
        return `<html><body><h2>${t('configEditor.loadFailed')}</h2><p>${t('configEditor.reinstall')}</p></body></html>`
    }
}
```

- [ ] **Step 3: 修改 `config-editor.html` 使用 `data-i18n` 属性**

将所有硬编码中文标签替换为 `data-i18n` 属性，默认英文作为 fallback：

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title data-i18n="configEditor.title">SQL All in One - Config Editor</title>
    <link rel="stylesheet" href="{{CSS_URI}}">
    {{I18N_INJECT}}
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-logo">⚡</div>
            <div class="header-info">
                <h1 data-i18n="configEditor.title">SQL All in One Config Editor</h1>
                <div class="header-sub" data-i18n="configEditor.subtitle">Visually adjust SQL formatting options with live preview</div>
            </div>
            <div class="header-actions">
                <button class="btn btn-ghost" onclick="resetConfig()" data-i18n="configEditor.resetDefault">Reset Defaults</button>
                <button class="btn btn-primary" onclick="saveConfig()" data-i18n="configEditor.save">Save Config</button>
            </div>
        </div>

        <div class="presets-bar">
            <span class="presets-bar-label" data-i18n="configEditor.presets">Quick Presets</span>
            <div class="presets-row">
                <button class="preset-chip active" onclick="applyPreset('default')" data-i18n="configEditor.presetDefault">Default</button>
                <button class="preset-chip" onclick="applyPreset('hive')" data-i18n="configEditor.presetHive">Hive</button>
                <button class="preset-chip" onclick="applyPreset('mysql')" data-i18n="configEditor.presetMySQL">MySQL</button>
                <button class="preset-chip" onclick="applyPreset('compact')" data-i18n="configEditor.presetCompact">Compact</button>
            </div>
        </div>
        <!-- ... rest of HTML with data-i18n attributes on all text nodes ... -->
    </div>
    <script src="{{JS_URI}}"></script>
</body>
</html>
```

- [ ] **Step 4: 修改 `config-editor.js` 添加 i18n 初始化**

在 `config-editor.js` 顶部添加：

```javascript
(function() {
    const dict = window.__I18N__ || {}
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        const key = el.getAttribute('data-i18n')
        if (dict[key]) {
            if (el.tagName === 'TITLE') {
                document.title = dict[key]
            } else {
                el.textContent = dict[key]
            }
        }
    })
})()
```

- [ ] **Step 5: 验证编译**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

---

### Task 5: `ErrorHandler.try` 中 `rethrow` 丢失上下文修复

**Files:**
- Modify: `src/core/errorHandler.ts:51-74`

- [ ] **Step 1: 修改 `try` 方法的 rethrow 逻辑**

修改 [src/core/errorHandler.ts](file:///Users/hao/Downloads/sql-all-in-one/src/core/errorHandler.ts#L51-L74) 中的 `try` 方法：

```typescript
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
    const { fallback, level = ErrorLevel.ERROR, category = ErrorCategory.FEATURE, rethrow = false } = options;

    try {
      return fn();
    } catch (error) {
      const formattedError = this.handle(error, context, level, category);
      
      if (rethrow) {
        throw formattedError;
      }
      
      return fallback;
    }
  }
```

同时修改 `tryAsync` 方法：

```typescript
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
    const { fallback, level = ErrorLevel.ERROR, category = ErrorCategory.FEATURE, rethrow = false } = options;

    try {
      return await fn();
    } catch (error) {
      const formattedError = this.handle(error, context, level, category);
      
      if (rethrow) {
        throw formattedError;
      }
      
      return fallback;
    }
  }
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

---

### Task 6: 合并 `formatEditorText.ts` 重复分支

**Files:**
- Modify: `src/utils/formatEditorText.ts:12-22`

- [ ] **Step 1: 移除 flinksql 重复分支**

修改 [src/utils/formatEditorText.ts](file:///Users/hao/Downloads/sql-all-in-one/src/utils/formatEditorText.ts#L12-L22)：

```typescript
// 修改前
if (config.language === 'spark') {
    formatted = formatSparkSql(processedSql, config)
} else if (config.language === 'hive') {
    formatted = formatHiveSql(processedSql, config)
} else if (config.language === 'flinksql') {
    formatted = formatWithFallback(processedSql, config)
} else {
    formatted = formatWithFallback(processedSql, config)
}

// 修改后
if (config.language === 'spark') {
    formatted = formatSparkSql(processedSql, config)
} else if (config.language === 'hive') {
    formatted = formatHiveSql(processedSql, config)
} else {
    formatted = formatWithFallback(processedSql, config)
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

---

### Task 7: 模块化 `activate()` 函数

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: 定义 ExtensionModule 接口并将各注册函数重构为模块**

在 `src/extension.ts` 顶部添加接口并在 `activate()` 中使用模块数组：

```typescript
interface ExtensionModule {
  name: string
  register: (context: vscode.ExtensionContext) => void
}

function createModules(extensionPath: string): ExtensionModule[] {
  return [
    { name: 'i18n', register: () => initI18n() },
    { name: 'commands', register: (ctx) => registerCommands(ctx) },
    { name: 'formatting', register: (ctx) => registerFormattingProviders(ctx) },
    { name: 'diagnostics', register: (ctx) => registerDiagnostics(ctx) },
    { name: 'providers', register: (ctx) => registerProviders(ctx) },
    { name: 'completion', register: (ctx) => registerCompletion(ctx) },
    { name: 'parameterHighlighter', register: (ctx) => registerParameterHighlighter(ctx) },
    { name: 'astNavigator', register: (ctx) => {
      const navigator = lazyProviders.astNavigator.get()
      if (navigator) {
        ctx.subscriptions.push(
          vscode.workspace.onDidChangeTextDocument(e => {
            if (isSqlDocument(e.document)) navigator.invalidate(e.document)
          }),
          vscode.workspace.onDidCloseTextDocument(doc => navigator.invalidate(doc))
        )
      }
    }},
    { name: 'statusBar', register: (ctx) => {
      if (lazyProviders.statusBarProvider.isInitialized || vscode.workspace.textDocuments.some(isSqlDocument)) {
        const statusBar = lazyProviders.statusBarProvider.get()
        if (statusBar) ctx.subscriptions.push(statusBar)
      }
    }},
  ]
}
```

修改 `activate()` 函数：

```typescript
export function activate(context: vscode.ExtensionContext): void {
  lazyProviders = createLazyProviders(context.extensionPath)

  perfMonitor.measure('Extension.activate', () => {
    console.log('SQL All in One: activating...')

    try {
      const modules = createModules(context.extensionPath)
      for (const mod of modules) {
        safeRegister(`register ${mod.name}`, () => mod.register(context))
      }

      context.subscriptions.push(getConfigManager())
      context.subscriptions.push(getDocumentAstCache())

      console.log('SQL All in One: activation complete')
    } catch (e) {
      errorHandler.handle(e, 'Extension activation', ErrorLevel.FATAL, ErrorCategory.CRITICAL)
    }
  })
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

---

### Task 8: `ExpressionFormatter2.ts` 重命名

**Files:**
- Rename: `src/formatter/nodeFormatters/ExpressionFormatter2.ts` → `src/formatter/nodeFormatters/ExpressionFormatter.ts`
- Modify: All imports referencing this file

**说明:** 移除文件名中的版本号后缀 `2`，确认无旧版本 `ExpressionFormatter.ts` 遗留。

- [ ] **Step 1: 确认无旧版本**

```bash
ls /Users/hao/Downloads/sql-all-in-one/src/formatter/nodeFormatters/ExpressionFormatter*.ts
```

- [ ] **Step 2: 重命名文件并更新所有导入**

```bash
cd /Users/hao/Downloads/sql-all-in-one
mv src/formatter/nodeFormatters/ExpressionFormatter2.ts src/formatter/nodeFormatters/ExpressionFormatter.ts
```

更新所有引用文件中的导入路径：
- `src/formatter/AstFormatter.ts`
- 其他引用 `ExpressionFormatter2` 的文件

- [ ] **Step 3: 验证编译**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

---

### Task 9: README.md 双语化

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 创建双语 README**

将 `README.md` 从纯中文改为中英双语混合格式。在文件开头添加语言切换导航：

```markdown
# SQL All in One

[English](#english) | [中文](#中文)

---

## English

A powerful SQL formatting VSCode extension supporting Hive, MySQL, SparkSQL, FlinkSQL, PostgreSQL, BigQuery, SQLite and more...

> **🎉 v1.7.0 Navigation Enhancement** — Go to Definition (CTE/table alias/column alias), Find All References, Rename Symbol, Breadcrumb clause-level navigation.

### Features
... (full English translation)

### Quick Start
... (full English translation)

---

## 中文

一个强大的 SQL 格式化 VSCode 插件，支持 Hive、MySQL、SparkSQL、FlinkSQL、PostgreSQL、BigQuery、SQLite 等多种 SQL 方言...

> **🎉 v1.7.0 跳转与导航增强** — Go to Definition（CTE/表别名/列别名）、Find All References、Rename Symbol（含保留字/冲突校验）、Breadcrumb 子句级导航。

### 特性
... (保持原有内容)
```

---

### Task 10: CHANGELOG.md 双语化

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 创建双语 CHANGELOG**

```markdown
# Changelog / 更新日志

## 1.7.0

### 🧭 Navigation Enhancement / 跳转与导航增强

| English | 中文 |
|---------|------|
| Go to Definition: CTE, table alias, column alias definition jump (F12) | Go to Definition：支持 CTE、表别名、列别名跳转到定义（F12） |
| Find All References: find all references for CTE, table alias, column alias (Shift+F12) | Find All References：查找 CTE、表别名、列别名的所有引用（Shift+F12） |
| Rename Symbol: rename CTE, table alias, column alias (F2) with reserved word/conflict checks | Rename Symbol：CTE、表别名、列别名重命名（F2），含保留字/冲突校验 |
| Breadcrumb: clause-level breadcrumb navigation enhanced | Breadcrumb：子句级面包屑导航增强 |
| AstNavigator shared navigation engine: builds symbol index via DocumentAstCache | AstNavigator：共享导航引擎，复用 DocumentAstCache |
| Reference context labels: fine-grained context (FROM/JOIN/WHERE/ON/SELECT/ORDER BY/HAVING) | 引用上下文标签：细粒度上下文 |
| enableNavigation config: unified toggling of navigation features | enableNavigation：统一管控导航功能 |

### 🔄 Other Changes / 其他变更

| English | 中文 |
|---------|------|
| ... | ... |
```

---

### Task 11: P1 AST 节点类型层定义（渐进式）

**Files:**
- Modify: `src/parser/astTypes.extended.ts`
- Create: 无新文件，扩展现有类型定义

**说明:** 此为渐进式优化，本次先修复 ESLint 警告最多的 3 个核心文件。

- [ ] **Step 1: 扩展 AST 类型定义**

在 `src/parser/astTypes.extended.ts` 中添加常用但缺少的 AST 节点类型：

```typescript
export interface SelectStatementNode extends AstNode {
    type: 'select'
    columns: SelectColumnNode[] | null
    from: FromItemNode[] | null
    where: ExpressionNode | null
    groupby: GroupByItemNode[] | null
    having: ExpressionNode | null
    orderby: OrderByItemNode[] | null
    limit: LimitNode | null
    with: WithClauseNode | null
    distinct: string | null
    _next: SelectStatementNode | null
}

export interface SelectColumnNode {
    expr: ExpressionNode
    as: string | null
    type?: string
}

export interface FromItemNode {
    table: string | ExpressionNode
    as: string | null
    db: string | null
    join: string | null
    on: ExpressionNode | null
    type?: string
    loc?: { start: AstLocation, end: AstLocation }
}

export interface WithClauseNode {
    type: 'with'
    value: CTEDefinitionNode[]
}

export interface CTEDefinitionNode {
    name: string | { value: string }
    stmt: ExpressionNode
    loc?: { start: AstLocation, end: AstLocation }
}

export interface GroupByItemNode {
    expr: ExpressionNode
    type: string
}

export interface OrderByItemNode {
    expr: ExpressionNode
    type: string
}

export interface LimitNode {
    seperator: string
    value: ExpressionNode[]
}

export interface InsertNode extends AstNode {
    type: 'insert' | 'replace'
    table: unknown[]
    columns: string[] | null
    values: InsertValueGroupNode[]
}

export interface InsertValueGroupNode {
    type: 'expr_list'
    value: ExpressionNode[]
}

export interface UpdateNode extends AstNode {
    type: 'update'
    table: FromItemNode[]
    set: SetClauseNode[] | null
    where: ExpressionNode | null
}

export interface SetClauseNode {
    column: string
    value: ExpressionNode
}

export interface DeleteNode extends AstNode {
    type: 'delete'
    from: FromItemNode[]
    where: ExpressionNode | null
}

export type ExpressionNode = Record<string, unknown> & { type: string }
```

- [ ] **Step 2: 为 `SelectFormatter.ts` 添加类型守卫**

在 `src/parser/typeGuards.ts` 中添加 Select 相关辅助类型：

```typescript
export interface TypedSelectStmt {
    with: unknown[] | null
    from: TypedFromItem[] | null
    where: unknown | null
    groupby: unknown[] | null
    having: unknown | null
    orderby: unknown[] | null
    limit: unknown | null
    _next: unknown | null
    columns: TypedSelectColumn[] | null
    distinct: string | null
}

export interface TypedFromItem {
    db: string | null
    table: unknown
    as: string | null
    join: string | null
    on: unknown | null
    type?: string
}

export interface TypedSelectColumn {
    expr: unknown
    as: string | null
    type?: string
}

export function asSelectStmt(stmt: unknown): TypedSelectStmt | null {
    if (stmt == null || typeof stmt !== 'object') return null
    const s = stmt as Record<string, unknown>
    if (s.type !== 'select') return null
    return {
        with: s.with as unknown[] | null ?? null,
        from: s.from as TypedFromItem[] | null ?? null,
        where: s.where ?? null,
        groupby: s.groupby as unknown[] | null ?? null,
        having: s.having ?? null,
        orderby: s.orderby as unknown[] | null ?? null,
        limit: s.limit ?? null,
        _next: s._next ?? null,
        columns: s.columns as TypedSelectColumn[] | null ?? null,
        distinct: s.distinct as string | null ?? null,
    }
}
```

- [ ] **Step 3: 修复 `SelectFormatter.ts` 中的 any 类型**

使用 `asSelectStmt()` 和 `TypedSelectStmt` 替换 `as any` 和 `Record<string, unknown>`：

```typescript
// 修改前
formatSelect(stmt: Record<string, unknown>) { ... }
const withClause = stmt.with as unknown[]

// 修改后
formatSelect(stmt: unknown): string {
    const select = asSelectStmt(stmt)
    if (!select) return ''
    // ...
}
```

- [ ] **Step 4: 运行 ESLint 验证警告减少**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx eslint src/formatter/nodeFormatters/SelectFormatter.ts --format compact
```

---

### Task 12: P2 统一方言注册中心

**Files:**
- Create: `src/core/dialectRegistry.ts`
- Modify: `src/core/sqlDialects.ts`
- Modify: `src/parser/dialectMapper.ts`
- Modify: `src/formatter/sqlFormatter.ts`
- Modify: `src/languages/dialect.ts`

- [ ] **Step 1: 创建统一方言注册中心**

创建 `src/core/dialectRegistry.ts`：

```typescript
import type { SqlDialect } from '../parser/dialectMapper'
import type { SqlLanguage } from '../formatter/sqlFormatter'

export interface DialectEntry {
    vscodeLangId: string
    sqlLanguage: SqlLanguage
    sqlDialect: SqlDialect
    nodeSqlParserDialect: string
}

const dialectEntries: DialectEntry[] = [
    { vscodeLangId: 'sql', sqlLanguage: 'sql', sqlDialect: 'sql', nodeSqlParserDialect: 'MySQL' },
    { vscodeLangId: 'hive', sqlLanguage: 'hive', sqlDialect: 'hive', nodeSqlParserDialect: 'Hive' },
    { vscodeLangId: 'hive-sql', sqlLanguage: 'hive', sqlDialect: 'hive', nodeSqlParserDialect: 'Hive' },
    { vscodeLangId: 'mysql', sqlLanguage: 'mysql', sqlDialect: 'mysql', nodeSqlParserDialect: 'MySQL' },
    { vscodeLangId: 'spark', sqlLanguage: 'spark', sqlDialect: 'spark', nodeSqlParserDialect: 'Hive' },
    { vscodeLangId: 'flinksql', sqlLanguage: 'flinksql', sqlDialect: 'flinksql', nodeSqlParserDialect: 'FlinkSQL' },
    { vscodeLangId: 'flink-sql', sqlLanguage: 'flinksql', sqlDialect: 'flinksql', nodeSqlParserDialect: 'FlinkSQL' },
    { vscodeLangId: 'postgresql', sqlLanguage: 'postgresql', sqlDialect: 'postgresql', nodeSqlParserDialect: 'PostgreSQL' },
    { vscodeLangId: 'postgres', sqlLanguage: 'postgresql', sqlDialect: 'postgresql', nodeSqlParserDialect: 'PostgreSQL' },
    { vscodeLangId: 'bigquery', sqlLanguage: 'bigquery', sqlDialect: 'bigquery', nodeSqlParserDialect: 'BigQuery' },
    { vscodeLangId: 'sqlite', sqlLanguage: 'sqlite', sqlDialect: 'sqlite', nodeSqlParserDialect: 'SQLite' },
]

export function getDialectEntries(): readonly DialectEntry[] {
    return dialectEntries
}

export function findDialectByLangId(langId: string): DialectEntry | undefined {
    return dialectEntries.find(e => e.vscodeLangId === langId)
}

export function getSqlLanguageIds(): readonly string[] {
    return [...new Set(dialectEntries.map(e => e.vscodeLangId))]
}

export function isSqlDocument(document: { languageId: string }): boolean {
    return dialectEntries.some(e => e.vscodeLangId === document.languageId)
}

export function toSqlDialect(langId: string): SqlDialect {
    const entry = findDialectByLangId(langId)
    return entry ? entry.sqlDialect : 'sql'
}

export function toNodeSqlParserDialect(dialect: SqlDialect): string {
    const entry = dialectEntries.find(e => e.sqlDialect === dialect)
    return entry ? entry.nodeSqlParserDialect : 'MySQL'
}
```

- [ ] **Step 2: 更新引用文件**

更新 `src/core/sqlDialects.ts` 从 dialectRegistry 导入：

```typescript
export { isSqlDocument, toSqlDialect, getSqlLanguageIds } from './dialectRegistry'
export const sqlDialects: Record<string, SqlLanguage> = Object.fromEntries(
    getDialectEntries().map(e => [e.vscodeLangId, e.sqlLanguage])
) as Record<string, SqlLanguage>
```

更新 `src/parser/dialectMapper.ts` 从 dialectRegistry 导入。

- [ ] **Step 3: 验证编译**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

---

### Task 13: P3 验证 — 运行全量测试和 Lint

- [ ] **Step 1: TypeScript 编译**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit
```

- [ ] **Step 2: ESLint**

```bash
cd /Users/hao/Downloads/sql-all-in-one && npx eslint src
```

- [ ] **Step 3: 确认无回归**

确保所有功能（格式化、诊断、补全、导航、配置编辑器）正常工作。

---