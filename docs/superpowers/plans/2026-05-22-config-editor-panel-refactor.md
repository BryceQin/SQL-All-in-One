# ConfigEditorPanel 架构重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ConfigEditorPanel 中 1800+ 行内嵌 HTML/CSS/JS 模板外部化，并集中管理配置项定义，使核心 TypeScript 文件从 2400 行降至约 500 行。

**Architecture:** 创建 `src/config/configDefinitions.ts` 集中定义所有配置项元数据（名称、类型、默认值、分组），提供工具函数消除 `_updateConfig`、`_resetConfig`、`_sendCurrentConfig` 中的重复代码。将 HTML/CSS/JS 模板提取到 `media/` 目录下的独立文件，通过 VS Code Webview 资源加载机制引用。

**Tech Stack:** TypeScript, VS Code Extension API (Webview), Node.js fs/path

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/config/configDefinitions.ts` | 集中定义所有配置项元数据、默认值、预设、Lint 规则 |
| Create | `media/config-editor.html` | HTML 结构（从模板提取） |
| Create | `media/config-editor.css` | CSS 样式（从模板提取） |
| Create | `media/config-editor.js` | 前端交互逻辑（从模板提取） |
| Modify | `src/commands/configEditorCommand.ts` | 使用 configDefinitions 工具函数 + 外部模板加载 |
| Modify | `src/extension.ts` | 传递 extensionUri 到 ConfigEditorPanel |

---

### Task 1: 创建配置项定义模块 configDefinitions.ts

**Files:**
- Create: `src/config/configDefinitions.ts`

- [ ] **Step 1: 创建 configDefinitions.ts 文件，定义配置项类型和元数据**

```typescript
// src/config/configDefinitions.ts

export type ConfigValueType = 'string' | 'number' | 'boolean' | 'enum'

export interface ConfigItemDefinition {
    key: string
    type: ConfigValueType
    defaultValue: unknown
    group: 'basic' | 'format' | 'lint' | 'advanced' | 'newline' | 'comma' | 'other' | 'feature'
    label: string
    enumValues?: string[]
    configKey?: string
}

export interface LintRuleDefinition {
    ruleId: string
    configKey: string
    label: string
    defaultEnabled: boolean
    defaultSeverity: 'error' | 'warning' | 'information'
    enabledKey: string
    severityKey: string
}

const FORMAT_CONFIG_ITEMS: ConfigItemDefinition[] = [
    { key: 'dialect', type: 'enum', defaultValue: 'hive', group: 'basic', label: 'SQL 方言', enumValues: ['hive', 'mysql', 'spark', 'sql', 'postgresql', 'bigquery', 'sqlite'] },
    { key: 'keywordCase', type: 'enum', defaultValue: 'preserve', group: 'format', label: '关键字大小写', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'dataTypeCase', type: 'enum', defaultValue: 'preserve', group: 'format', label: '数据类型大小写', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'functionCase', type: 'enum', defaultValue: 'preserve', group: 'format', label: '函数名大小写', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'identifierCase', type: 'enum', defaultValue: 'preserve', group: 'format', label: '标识符大小写', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'indentStyle', type: 'enum', defaultValue: 'standard', group: 'format', label: '缩进风格', enumValues: ['standard', 'tabularLeft', 'tabularRight'] },
    { key: 'logicalOperatorNewline', type: 'enum', defaultValue: 'before', group: 'format', label: '逻辑运算符换行', enumValues: ['before', 'after'] },
    { key: 'expressionWidth', type: 'number', defaultValue: 50, group: 'format', label: '表达式宽度' },
    { key: 'linesBetweenQueries', type: 'number', defaultValue: 1, group: 'format', label: '查询间隔行数' },
    { key: 'commaPosition', type: 'enum', defaultValue: 'after', group: 'comma', label: '逗号位置', enumValues: ['after', 'before'] },
    { key: 'alignColumnDefinitions', type: 'boolean', defaultValue: false, group: 'comma', label: '对齐列定义' },
    { key: 'tabulateAlias', type: 'boolean', defaultValue: false, group: 'comma', label: '对齐表别名' },
    { key: 'newlineAfterSelect', type: 'boolean', defaultValue: true, group: 'newline', label: 'SELECT 后换行' },
    { key: 'newlineAfterFrom', type: 'boolean', defaultValue: true, group: 'newline', label: 'FROM 后换行' },
    { key: 'newlineBeforeWhere', type: 'boolean', defaultValue: true, group: 'newline', label: 'WHERE 前换行' },
    { key: 'newlineAfterWhere', type: 'boolean', defaultValue: true, group: 'newline', label: 'WHERE 后换行' },
    { key: 'newlineBeforeOrderBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'ORDER BY 前换行' },
    { key: 'newlineBeforeGroupBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'GROUP BY 前换行' },
    { key: 'newlineBeforeHaving', type: 'boolean', defaultValue: true, group: 'newline', label: 'HAVING 前换行' },
    { key: 'newlineBeforeLimit', type: 'boolean', defaultValue: true, group: 'newline', label: 'LIMIT 前换行' },
    { key: 'newlineAfterGroupBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'GROUP BY 后换行' },
    { key: 'newlineAfterHaving', type: 'boolean', defaultValue: true, group: 'newline', label: 'HAVING 后换行' },
    { key: 'newlineAfterOrderBy', type: 'boolean', defaultValue: true, group: 'newline', label: 'ORDER BY 后换行' },
    { key: 'newlineAfterLimit', type: 'boolean', defaultValue: false, group: 'newline', label: 'LIMIT 后换行' },
    { key: 'newlineAfterJoin', type: 'boolean', defaultValue: true, group: 'newline', label: 'JOIN 后换行' },
    { key: 'newlineBeforeOn', type: 'boolean', defaultValue: true, group: 'newline', label: 'ON 前换行' },
    { key: 'newlineBeforeSetOperation', type: 'boolean', defaultValue: true, group: 'newline', label: 'UNION 前换行' },
    { key: 'newlineAfterCase', type: 'boolean', defaultValue: true, group: 'newline', label: 'CASE 后换行' },
    { key: 'newlineAfterWhen', type: 'boolean', defaultValue: true, group: 'newline', label: 'WHEN 后换行' },
    { key: 'newlineAfterThen', type: 'boolean', defaultValue: false, group: 'newline', label: 'THEN 后换行' },
    { key: 'newlineAfterElse', type: 'boolean', defaultValue: false, group: 'newline', label: 'ELSE 后换行' },
    { key: 'newlineAfterIn', type: 'boolean', defaultValue: false, group: 'newline', label: 'IN 后换行' },
    { key: 'maxLineLength', type: 'number', defaultValue: 120, group: 'other', label: '最大行长度' },
    { key: 'reservedKeywordCase', type: 'enum', defaultValue: 'preserve', group: 'advanced', label: '保留关键字大小写', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'builtinFunctionCase', type: 'enum', defaultValue: 'preserve', group: 'advanced', label: '内置函数大小写', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'newlineBeforeJoin', type: 'boolean', defaultValue: true, group: 'advanced', label: 'JOIN 前换行' },
    { key: 'newlineAfterComma', type: 'boolean', defaultValue: true, group: 'advanced', label: '逗号后换行' },
    { key: 'breakAfterSelectItem', type: 'boolean', defaultValue: true, group: 'advanced', label: '每个 SELECT 项后换行' },
    { key: 'breakAfterFromItem', type: 'boolean', defaultValue: true, group: 'advanced', label: '每个 FROM 项后换行' },
    { key: 'alignWhereClauses', type: 'boolean', defaultValue: false, group: 'advanced', label: '对齐 WHERE 子句' },
    { key: 'alignCaseStatements', type: 'boolean', defaultValue: false, group: 'advanced', label: '对齐 CASE 语句' },
    { key: 'spaceBeforeComma', type: 'boolean', defaultValue: false, group: 'advanced', label: '逗号前加空格' },
    { key: 'spaceInsideParentheses', type: 'boolean', defaultValue: false, group: 'advanced', label: '括号内加空格' },
    { key: 'trimTrailingSpaces', type: 'boolean', defaultValue: true, group: 'advanced', label: '修剪尾部空格' },
    { key: 'semicolonAtEnd', type: 'boolean', defaultValue: true, group: 'advanced', label: '语句结尾添加分号' },
    { key: 'denseOperators', type: 'boolean', defaultValue: false, group: 'advanced', label: '紧凑运算符' },
    { key: 'newlineBeforeSemicolon', type: 'boolean', defaultValue: false, group: 'advanced', label: '分号另起一行' },
    { key: 'indentJoinConditions', type: 'boolean', defaultValue: true, group: 'advanced', label: 'JOIN 条件缩进' },
    { key: 'indentWhen', type: 'boolean', defaultValue: true, group: 'advanced', label: 'WHEN 缩进' },
    { key: 'indentThen', type: 'boolean', defaultValue: true, group: 'advanced', label: 'THEN 缩进' },
    { key: 'indentCteBody', type: 'boolean', defaultValue: true, group: 'advanced', label: 'CTE 体缩进' },
    { key: 'alignOnClauses', type: 'boolean', defaultValue: false, group: 'advanced', label: '对齐 ON 条件' },
    { key: 'alignInsertColumns', type: 'boolean', defaultValue: false, group: 'advanced', label: '对齐 INSERT 列' },
    { key: 'alignInsertValuesGroups', type: 'boolean', defaultValue: false, group: 'advanced', label: '对齐 VALUES 组' },
    { key: 'maxItemsInlineList', type: 'number', defaultValue: 5, group: 'advanced', label: 'IN 列表阈值' },
    { key: 'cteCommaPosition', type: 'enum', defaultValue: 'before', group: 'advanced', label: 'CTE 逗号位置', enumValues: ['before', 'after'] },
    { key: 'subqueryParenStyle', type: 'enum', defaultValue: 'inline', group: 'advanced', label: '子查询括号风格', enumValues: ['inline', 'newline'] },
    { key: 'commentPosition', type: 'enum', defaultValue: 'preserve', group: 'advanced', label: '注释位置策略', enumValues: ['preserve', 'newline', 'inline'] },
    { key: 'blankLinesBeforeSetOperation', type: 'number', defaultValue: 1, group: 'advanced', label: 'UNION 前空行数' },
    { key: 'blankLinesAfterSetOperation', type: 'number', defaultValue: 0, group: 'advanced', label: 'UNION 后空行数' },
    { key: 'newlineBeforeLateralView', type: 'boolean', defaultValue: true, group: 'advanced', label: 'LATERAL VIEW 前换行 (Hive)' },
    { key: 'newlineBeforeDistributeBy', type: 'boolean', defaultValue: true, group: 'advanced', label: 'DISTRIBUTE BY 前换行 (Hive)' },
    { key: 'newlineBeforeClusterBy', type: 'boolean', defaultValue: true, group: 'advanced', label: 'CLUSTER BY 前换行 (Hive)' },
    { key: 'newlineBeforeSortBy', type: 'boolean', defaultValue: true, group: 'advanced', label: 'SORT BY 前换行 (Hive)' },
    { key: 'singleLineMaxLength', type: 'number', defaultValue: 80, group: 'other', label: '单行查询最大长度' },
    { key: 'nullCase', type: 'enum', defaultValue: 'preserve', group: 'format', label: 'NULL 大小写', enumValues: ['preserve', 'upper', 'lower'] },
    { key: 'booleanCase', type: 'enum', defaultValue: 'preserve', group: 'format', label: '布尔值大小写', enumValues: ['preserve', 'upper', 'lower'] },
]

const FEATURE_CONFIG_ITEMS: ConfigItemDefinition[] = [
    { key: 'ignoreTabSettings', type: 'boolean', defaultValue: false, group: 'feature', label: '忽略编辑器 Tab 设置' },
    { key: 'tabSizeOverride', type: 'number', defaultValue: 2, group: 'feature', label: 'Tab 宽度覆盖' },
    { key: 'insertSpacesOverride', type: 'boolean', defaultValue: true, group: 'feature', label: '使用空格缩进' },
    { key: 'enableEnhancedChecks', type: 'boolean', defaultValue: true, group: 'feature', label: '启用增强语法检查' },
    { key: 'enableLinter', type: 'boolean', defaultValue: true, group: 'feature', label: '启用 SQL Lint 功能' },
    { key: 'showErrorLevel', type: 'boolean', defaultValue: true, group: 'feature', label: '显示错误级别诊断' },
    { key: 'showWarningLevel', type: 'boolean', defaultValue: true, group: 'feature', label: '显示警告级别诊断' },
    { key: 'showInfoLevel', type: 'boolean', defaultValue: true, group: 'feature', label: '显示信息级别提示' },
    { key: 'enableCodeFolding', type: 'boolean', defaultValue: true, group: 'feature', label: '启用代码折叠' },
    { key: 'enableOutlineView', type: 'boolean', defaultValue: true, group: 'feature', label: '启用大纲视图' },
    { key: 'enableStatusBar', type: 'boolean', defaultValue: true, group: 'feature', label: '启用状态栏' },
    { key: 'enableParameterHighlight', type: 'boolean', defaultValue: true, group: 'feature', label: '启用参数高亮' },
    { key: 'enableSnippets', type: 'boolean', defaultValue: true, group: 'feature', label: '启用代码片段' },
    { key: 'enableQuickFix', type: 'boolean', defaultValue: true, group: 'feature', label: '启用快速修复' },
    { key: 'enableSmartCommentToggle', type: 'boolean', defaultValue: true, group: 'feature', label: '启用智能注释切换' },
    { key: 'headerAuthor', type: 'string', defaultValue: '', group: 'feature', label: '注释模板作者' },
    { key: 'headerModifier', type: 'string', defaultValue: '', group: 'feature', label: '注释模板修改人' },
    { key: 'completionCommentSnippets', type: 'boolean', defaultValue: true, group: 'feature', label: '注释模板补全', configKey: 'completion.commentSnippets' },
]

const LINT_RULES: LintRuleDefinition[] = [
    { ruleId: 'avoidSelectStar', configKey: 'lint.avoid_select_star', label: '避免 SELECT *', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintAvoidSelectStarEnabled', severityKey: 'lintAvoidSelectStarSeverity' },
    { ruleId: 'explicitJoinType', configKey: 'lint.explicit_join_type', label: '显式 JOIN 类型', defaultEnabled: true, defaultSeverity: 'information', enabledKey: 'lintExplicitJoinTypeEnabled', severityKey: 'lintExplicitJoinTypeSeverity' },
    { ruleId: 'limitWithOrderBy', configKey: 'lint.limit_with_order_by', label: 'LIMIT 配合 ORDER BY', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintLimitWithOrderByEnabled', severityKey: 'lintLimitWithOrderBySeverity' },
    { ruleId: 'avoidColumnCountMismatch', configKey: 'lint.avoid_column_count_mismatch', label: '列数不匹配检测', defaultEnabled: true, defaultSeverity: 'error', enabledKey: 'lintAvoidColumnCountMismatchEnabled', severityKey: 'lintAvoidColumnCountMismatchSeverity' },
    { ruleId: 'missingPrimaryKey', configKey: 'lint.missing_primary_key', label: '缺失主键检测', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintMissingPrimaryKeyEnabled', severityKey: 'lintMissingPrimaryKeySeverity' },
    { ruleId: 'useCurrentTimestamp', configKey: 'lint.use_current_timestamp', label: '使用 CURRENT_TIMESTAMP', defaultEnabled: true, defaultSeverity: 'information', enabledKey: 'lintUseCurrentTimestampEnabled', severityKey: 'lintUseCurrentTimestampSeverity' },
    { ruleId: 'avoidSelectInInsert', configKey: 'lint.avoid_select_in_insert', label: '避免 INSERT 中的 SELECT', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintAvoidSelectInInsertEnabled', severityKey: 'lintAvoidSelectInInsertSeverity' },
    { ruleId: 'duplicateColumnAliases', configKey: 'lint.duplicate_column_aliases', label: '重复列别名检测', defaultEnabled: true, defaultSeverity: 'warning', enabledKey: 'lintDuplicateColumnAliasesEnabled', severityKey: 'lintDuplicateColumnAliasesSeverity' },
    { ruleId: 'uppercaseKeywords', configKey: 'lint.uppercase_keywords', label: '关键字大写', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintUppercaseKeywordsEnabled', severityKey: 'lintUppercaseKeywordsSeverity' },
    { ruleId: 'consistentAliasing', configKey: 'lint.consistent_aliasing', label: '一致的别名', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintConsistentAliasingEnabled', severityKey: 'lintConsistentAliasingSeverity' },
    { ruleId: 'useCoalesceOverIsnull', configKey: 'lint.use_coalesce_over_isnull', label: '使用 COALESCE 而非 ISNULL', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintUseCoalesceOverIsnullEnabled', severityKey: 'lintUseCoalesceOverIsnullSeverity' },
    { ruleId: 'explicitColumnAliasing', configKey: 'lint.explicit_column_aliasing', label: '显式列别名', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintExplicitColumnAliasingEnabled', severityKey: 'lintExplicitColumnAliasingSeverity' },
    { ruleId: 'avoidCorrelatedSubqueries', configKey: 'lint.avoid_correlated_subqueries', label: '避免关联子查询', defaultEnabled: false, defaultSeverity: 'warning', enabledKey: 'lintAvoidCorrelatedSubqueriesEnabled', severityKey: 'lintAvoidCorrelatedSubqueriesSeverity' },
    { ruleId: 'longQueryLine', configKey: 'lint.long_query_line', label: '长查询行检测', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintLongQueryLineEnabled', severityKey: 'lintLongQueryLineSeverity' },
    { ruleId: 'missingQueryComment', configKey: 'lint.missing_query_comment', label: '复杂查询缺注释', defaultEnabled: false, defaultSeverity: 'warning', enabledKey: 'lintMissingQueryCommentEnabled', severityKey: 'lintMissingQueryCommentSeverity' },
    { ruleId: 'missingColumnComment', configKey: 'lint.missing_column_comment', label: 'DDL 列缺 COMMENT', defaultEnabled: false, defaultSeverity: 'warning', enabledKey: 'lintMissingColumnCommentEnabled', severityKey: 'lintMissingColumnCommentSeverity' },
    { ruleId: 'commentedOutCode', configKey: 'lint.commented_out_code', label: '注释掉的代码', defaultEnabled: false, defaultSeverity: 'information', enabledKey: 'lintCommentedOutCodeEnabled', severityKey: 'lintCommentedOutCodeSeverity' },
    { ruleId: 'expiredTodo', configKey: 'lint.expired_todo', label: '过期 TODO/FIXME', defaultEnabled: false, defaultSeverity: 'warning', enabledKey: 'lintExpiredTodoEnabled', severityKey: 'lintExpiredTodoSeverity' },
]

export const ALL_CONFIG_ITEMS: ConfigItemDefinition[] = [...FORMAT_CONFIG_ITEMS, ...FEATURE_CONFIG_ITEMS]

export { FORMAT_CONFIG_ITEMS, FEATURE_CONFIG_ITEMS, LINT_RULES }

export function getDefaultConfig(): Record<string, unknown> {
    const defaults: Record<string, unknown> = {}
    for (const item of ALL_CONFIG_ITEMS) {
        defaults[item.key] = item.defaultValue
    }
    for (const rule of LINT_RULES) {
        defaults[rule.enabledKey] = rule.defaultEnabled
        defaults[rule.severityKey] = rule.defaultSeverity
    }
    return defaults
}

export function getConfigKey(item: ConfigItemDefinition): string {
    return item.configKey || item.key
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit src/config/configDefinitions.ts 2>&1 | head -20`
Expected: 无错误输出

---

### Task 2: 提取 CSS 到独立文件

**Files:**
- Create: `media/config-editor.css`

- [ ] **Step 1: 创建 media 目录并提取 CSS**

从 `src/commands/configEditorCommand.ts` 第 200-499 行的 `<style>` 标签内容提取到 `media/config-editor.css`。

创建 `media/config-editor.css`，内容为原文件中 `<style>` 和 `</style>` 之间的所有 CSS 规则（即第 231 行到第 497 行之间的内容），包括：
- `:root` CSS 变量
- `*` 全局重置
- `.container`, `.header`, `.header-logo` 等 header 相关样式
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost` 按钮样式
- `.presets-bar`, `.preset-chip` 预设栏样式
- `.main-content`, `.preview-panel`, `.preview-body`, `.preview-col`, `.preview-editor`, `.preview-result` 预览面板样式
- `.resize-handle` 拖拽手柄样式
- `.config-section`, `.section-header`, `.section-body` 配置区域样式
- `.config-group`, `.cg-header`, `.cg-arrow`, `.cg-icon`, `.cg-title`, `.cg-badge`, `.cg-body` 折叠组样式
- `.config-item`, `.ci-label`, `.ci-label-text`, `.ci-label-hint` 配置项样式
- `.config-select`, `.config-input` 输入控件样式
- `.toggle-row`, `.toggle`, `.toggle-slider` 开关样式
- `.severity-badge`, `.severity-dot`, `.lint-rule`, `.lint-rule-name`, `.lint-rule-severity`, `.lint-rule-toggle` Lint 规则样式
- `.toast` 提示样式
- 滚动条样式
- `.empty-state` 空状态样式

文件内容完全从原文件复制，不做任何修改。

---

### Task 3: 提取 JavaScript 到独立文件

**Files:**
- Create: `media/config-editor.js`

- [ ] **Step 1: 提取前端 JavaScript 逻辑到 media/config-editor.js**

从 `src/commands/configEditorCommand.ts` 第 971-2001 行的 `<script>` 标签内容提取到 `media/config-editor.js`。

创建 `media/config-editor.js`，内容为原文件中 `<script>` 和 `</script>` 之间的所有 JavaScript 代码，包括：
- `currentConfig` 变量
- `presets` 对象（default, hive, mysql, compact, postgresql, bigquery, sqlite）
- `window.addEventListener('message', ...)` 消息监听
- `loadConfig(config)` 函数
- `collectConfig()` 函数
- `saveConfig()` 函数
- `showToast(message, type)` 函数
- `toggleGroup(header)` 函数
- `resetConfig()` 函数
- `applyPreset(presetName)` 函数
- `previewFormat()` 函数
- `showPreviewResult(result)` 函数
- `updateTabOverrideGroup()` 函数
- `ignoreTabSettings` change 事件监听
- resize handle 拖拽逻辑
- `acquireVsCodeApi()` 调用和初始消息发送

文件内容完全从原文件复制，不做任何修改。

---

### Task 4: 提取 HTML 到独立文件

**Files:**
- Create: `media/config-editor.html`

- [ ] **Step 1: 创建 HTML 模板文件**

从 `src/commands/configEditorCommand.ts` 提取 HTML 结构部分（不含 `<style>` 和 `<script>` 内联内容），创建 `media/config-editor.html`。

HTML 文件结构：
- 引用外部 CSS：`<link rel="stylesheet" href="{{CSS_URI}}">`
- 保留所有 HTML body 内容（header、presets-bar、main-content、preview-panel、config-section 等）
- 引用外部 JS：`<script src="{{JS_URI}}"></script>`

关键替换点：
- 将 `<style>...</style>` 替换为 `<link rel="stylesheet" href="{{CSS_URI}}">`
- 将 `<script>...</script>` 替换为 `<script src="{{JS_URI}}"></script>`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL All in One - 配置编辑器</title>
    <link rel="stylesheet" href="{{CSS_URI}}">
</head>
<body>
    <div class="container">
        <!-- 原文件第 469-968 行的 HTML body 内容保持不变 -->
    </div>
    <div class="toast" id="toast"></div>
    <script src="{{JS_URI}}"></script>
</body>
</html>
```

---

### Task 5: 重构 ConfigEditorPanel 使用外部模板和配置定义

**Files:**
- Modify: `src/commands/configEditorCommand.ts`

这是核心重构步骤，将 ConfigEditorPanel 的 `_getHtmlForWebview`、`_updateConfig`、`_resetConfig`、`_sendCurrentConfig` 方法全部替换为使用外部模板和 `configDefinitions` 工具函数。

- [ ] **Step 1: 重写 configEditorCommand.ts**

新的 `src/commands/configEditorCommand.ts` 完整内容：

```typescript
import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { format, type SqlLanguage } from '../formatter/sqlFormatter'
import type { KeywordCase, DataTypeCase, FunctionCase, IndentStyle, LogicalOperatorNewline } from '../formatter/FormatOptions'
import { t } from '../i18n'
import { ALL_CONFIG_ITEMS, LINT_RULES, getDefaultConfig, getConfigKey } from '../config/configDefinitions'

export class ConfigEditorPanel {
    public static currentPanel: ConfigEditorPanel | undefined
    public static readonly viewType = 'sqlAllInOneConfig'

    private readonly _panel: vscode.WebviewPanel
    private readonly _extensionUri: vscode.Uri
    private _disposables: vscode.Disposable[] = []

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        if (ConfigEditorPanel.currentPanel) {
            ConfigEditorPanel.currentPanel._panel.reveal(column)
            return
        }

        const panel = vscode.window.createWebviewPanel(
            ConfigEditorPanel.viewType,
            t('configEditor.panelTitle'),
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
            }
        )

        ConfigEditorPanel.currentPanel = new ConfigEditorPanel(panel, extensionUri)
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel
        this._extensionUri = extensionUri

        this._update()

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'updateConfig':
                        try {
                            await this._updateConfig(message.data)
                            this._panel.webview.postMessage({ command: 'saveResult', success: true })
                        } catch {
                            this._panel.webview.postMessage({ command: 'saveResult', success: false })
                        }
                        break
                    case 'resetConfig':
                        await this._resetConfig()
                        break
                    case 'previewFormat':
                        await this._previewFormat(message.sql, message.config)
                        break
                    case 'getCurrentConfig':
                        await this._sendCurrentConfig()
                        break
                }
            },
            null,
            this._disposables
        )
    }

    public dispose() {
        ConfigEditorPanel.currentPanel = undefined
        this._panel.dispose()

        while (this._disposables.length) {
            const x = this._disposables.pop()
            if (x) {
                x.dispose()
            }
        }
    }

    private async _update() {
        this._panel.webview.html = this._getHtmlForWebview()
        await this._sendCurrentConfig()
    }

    private _getHtmlForWebview(): string {
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'config-editor.html')
        let html = fs.readFileSync(htmlPath, 'utf-8')

        const cssUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'config-editor.css')
        )
        const jsUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'config-editor.js')
        )

        html = html.replace('{{CSS_URI}}', cssUri.toString())
        html = html.replace('{{JS_URI}}', jsUri.toString())

        return html
    }

    private async _sendCurrentConfig() {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const data: Record<string, unknown> = {}

        for (const item of ALL_CONFIG_ITEMS) {
            const configKey = getConfigKey(item)
            data[item.key] = config.get(configKey, item.defaultValue as any)
        }

        for (const rule of LINT_RULES) {
            const ruleConfig = config.get(rule.configKey, { enabled: rule.defaultEnabled, severity: rule.defaultSeverity })
            data[rule.enabledKey] = ruleConfig.enabled
            data[rule.severityKey] = ruleConfig.severity
        }

        this._panel.webview.postMessage({
            command: 'loadConfig',
            data
        })
    }

    private async _updateConfig(data: Record<string, unknown>) {
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')

        for (const item of ALL_CONFIG_ITEMS) {
            const value = data[item.key]
            const configKey = getConfigKey(item)
            try { await config.update(configKey, value, vscode.ConfigurationTarget.Global) } catch { /* skip */ }
        }

        for (const rule of LINT_RULES) {
            const enabled = data[rule.enabledKey]
            const severity = data[rule.severityKey]
            try {
                await config.update(rule.configKey, { enabled, severity }, vscode.ConfigurationTarget.Global)
            } catch { /* skip */ }
        }

        vscode.window.showInformationMessage(t('notification.configSaved'))
    }

    private async _resetConfig() {
        const defaults = getDefaultConfig()
        await this._updateConfig(defaults)
        await this._sendCurrentConfig()
    }

    private async _previewFormat(sql: string, webviewConfig?: Record<string, unknown>) {
        try {
            const config = vscode.workspace.getConfiguration('SQL-All-in-One')
            const get = <T>(key: string, defaultValue: T): T => {
                if (webviewConfig && key in webviewConfig && webviewConfig[key] !== undefined) {
                    return webviewConfig[key] as T
                }
                return config.get<T>(key, defaultValue)
            }
            const result = format(sql, {
                language: get('dialect', 'hive') as SqlLanguage,
                keywordCase: get('keywordCase', 'preserve') as KeywordCase,
                dataTypeCase: get('dataTypeCase', 'preserve') as DataTypeCase,
                functionCase: get('functionCase', 'preserve') as FunctionCase,
                identifierCase: get('identifierCase', 'preserve') as KeywordCase,
                indentStyle: get('indentStyle', 'standard') as IndentStyle,
                logicalOperatorNewline: get('logicalOperatorNewline', 'before') as LogicalOperatorNewline,
                expressionWidth: get('expressionWidth', 50),
                linesBetweenQueries: get('linesBetweenQueries', 1),
                denseOperators: get('denseOperators', false),
                newlineBeforeSemicolon: get('newlineBeforeSemicolon', false)
            })

            this._panel.webview.postMessage({
                command: 'previewResult',
                data: result
            })
        } catch (error) {
            vscode.window.showErrorMessage('格式化预览失败: ' + (error as Error).message)
        }
    }
}

export function openConfigEditorCommand(extensionUri: vscode.Uri) {
    ConfigEditorPanel.createOrShow(extensionUri)
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -30`
Expected: 无错误输出

---

### Task 6: 构建验证和功能回归测试

**Files:**
- None (verification only)

- [ ] **Step 1: 运行完整编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1`
Expected: 编译成功，无错误

- [ ] **Step 2: 验证 media 目录文件完整**

Run: `ls -la /Users/hao/Downloads/sql-all-in-one/media/`
Expected: 显示 `config-editor.html`, `config-editor.css`, `config-editor.js` 三个文件

- [ ] **Step 3: 验证 configEditorCommand.ts 行数大幅减少**

Run: `wc -l /Users/hao/Downloads/sql-all-in-one/src/commands/configEditorCommand.ts`
Expected: 约 150-200 行（从原来的 2394 行大幅减少）

- [ ] **Step 4: 验证 configDefinitions.ts 存在且完整**

Run: `wc -l /Users/hao/Downloads/sql-all-in-one/src/config/configDefinitions.ts`
Expected: 约 150-200 行

- [ ] **Step 5: 运行 ESLint 检查**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx eslint src/config/configDefinitions.ts src/commands/configEditorCommand.ts 2>&1 | head -30`
Expected: 无错误或仅有可忽略的警告

- [ ] **Step 6: Commit**

```bash
cd /Users/hao/Downloads/sql-all-in-one
git add src/config/configDefinitions.ts media/config-editor.html media/config-editor.css media/config-editor.js src/commands/configEditorCommand.ts
git commit -m "refactor: extract ConfigEditorPanel template and centralize config definitions

- Extract HTML/CSS/JS from inline template to media/ directory
- Create configDefinitions.ts with centralized config item metadata
- Replace hardcoded config mappings in _updateConfig/_resetConfig/_sendCurrentConfig
- Reduce configEditorCommand.ts from 2400+ to ~170 lines"
```
