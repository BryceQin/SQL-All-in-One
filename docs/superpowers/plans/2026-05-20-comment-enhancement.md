# 注释功能增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 PRD 001 的三大注释增强功能：智能注释切换、注释模板补全、注释 Lint 规则

**Architecture:** 新建 `src/commands/commentCommands.ts` 处理智能注释切换命令，新建 `src/completion/commentCompletion.ts` 处理动态注释补全（header/col/tbl），在现有 `SqlLinter.ts` 中新增 4 条注释 Lint 规则，在 `SqlCodeActionProvider.ts` 中新增对应 Code Action。静态 Snippet（todo/fixme/hack/desc/section）追加到 `snippets/sql.json`。

**Tech Stack:** TypeScript, VS Code Extension API (commands, completions, diagnostics, code actions, workspace edit)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/commands/commentCommands.ts` | Create | 智能注释切换命令（toggleComment, toggleAdvancedComment） |
| `src/completion/commentCompletion.ts` | Create | 动态注释补全（header/col/tbl Snippet） |
| `src/providers/SqlLinter.ts` | Modify | 新增 4 条注释 Lint 规则 |
| `src/providers/SqlCodeActionProvider.ts` | Modify | 新增注释相关 Code Action |
| `src/providers/StatusBarProvider.ts` | Modify | 新增临时状态消息方法 |
| `src/extension.ts` | Modify | 注册新命令和补全 |
| `src/completion/SqlCompletionProvider.ts` | Modify | 集成动态注释补全 |
| `src/completion/index.ts` | Modify | 导出 commentCompletion |
| `snippets/sql.json` | Modify | 追加 5 个静态注释 Snippet |
| `package.json` | Modify | 新增命令、快捷键、菜单、配置项 |

---

### Task 1: 新增 package.json 配置项和命令声明

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在 package.json 的 contributes.commands 中添加两个新命令**

在 `commands` 数组末尾（`replaceParameter` 命令之后）添加：

```json
{
    "command": "sql-all-in-one.toggleComment",
    "title": "SQL All in One: 切换注释"
},
{
    "command": "sql-all-in-one.toggleAdvancedComment",
    "title": "SQL All in One: 切换高级注释"
}
```

- [ ] **Step 2: 在 keybindings 数组中添加快捷键绑定**

在现有 `replaceParameter` keybinding 之后添加：

```json
{
    "command": "sql-all-in-one.toggleComment",
    "key": "ctrl+/",
    "mac": "cmd+/",
    "when": "editorTextFocus && editorLangId =~ /sql|hive/"
},
{
    "command": "sql-all-in-one.toggleAdvancedComment",
    "key": "ctrl+shift+/",
    "mac": "cmd+shift+/",
    "when": "editorTextFocus && editorLangId =~ /sql|hive/"
}
```

- [ ] **Step 3: 在 configuration.properties 中添加新配置项**

在 `SQL-All-in-One.completion.identifiers` 之后添加：

```json
"SQL-All-in-One.enableSmartCommentToggle": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "是否启用 SQL 感知的智能注释切换（关闭后回退到 VSCode 默认行为）"
},
"SQL-All-in-One.headerAuthor": {
    "type": "string",
    "default": "",
    "markdownDescription": "文件头注释中的作者名（为空时 header Snippet 的「作者」留空等待输入）"
},
"SQL-All-in-One.headerModifier": {
    "type": "string",
    "default": "",
    "markdownDescription": "文件头注释中的修改人（为空时回退取 headerAuthor 的值）"
},
"SQL-All-in-One.completion.commentSnippets": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "补全列表中是否包含注释模板片段"
},
"SQL-All-in-One.lint.missing_query_comment": {
    "type": "object",
    "default": { "enabled": true, "severity": "warning" },
    "markdownDescription": "配置 `missing_query_comment` 规则（复杂查询缺少说明注释）"
},
"SQL-All-in-One.lint.missing_query_comment_threshold_line_count": {
    "type": "number",
    "default": 20,
    "markdownDescription": "触发 missing_query_comment 的最小查询行数"
},
"SQL-All-in-One.lint.missing_query_comment_threshold_join_count": {
    "type": "number",
    "default": 3,
    "markdownDescription": "触发 missing_query_comment 的最小 JOIN 数量"
},
"SQL-All-in-One.lint.missing_query_comment_threshold_subquery_count": {
    "type": "number",
    "default": 2,
    "markdownDescription": "触发 missing_query_comment 的最小子查询数量"
},
"SQL-All-in-One.lint.missing_column_comment": {
    "type": "object",
    "default": { "enabled": true, "severity": "warning" },
    "markdownDescription": "配置 `missing_column_comment` 规则（DDL 列定义缺少 COMMENT）"
},
"SQL-All-in-One.lint.missing_column_comment_aggregate": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "同一 DDL 中多个缺失 COMMENT 的列是否聚合为一条诊断"
},
"SQL-All-in-One.lint.missing_column_comment_external_table_exempt": {
    "type": "boolean",
    "default": false,
    "markdownDescription": "外部表（EXTERNAL TABLE）是否豁免 missing_column_comment 检查"
},
"SQL-All-in-One.lint.commented_out_code": {
    "type": "object",
    "default": { "enabled": true, "severity": "information" },
    "markdownDescription": "配置 `commented_out_code` 规则（疑似注释掉的大段代码）"
},
"SQL-All-in-One.lint.commented_out_code_threshold_lines": {
    "type": "number",
    "default": 3,
    "markdownDescription": "触发 commented_out_code 的最小注释代码行数"
},
"SQL-All-in-One.lint.expired_todo": {
    "type": "object",
    "default": { "enabled": true, "severity": "information" },
    "markdownDescription": "配置 `expired_todo` 规则（过期的 TODO/FIXME 标记）"
},
"SQL-All-in-One.lint.expired_todo_grace_period_days": {
    "type": "number",
    "default": 7,
    "markdownDescription": "TODO 过期判定宽限期（天）"
}
```

- [ ] **Step 4: 在 package.json 中添加右键菜单（menus）**

在 `contributes` 中添加 `menus` 字段（与 `commands` 同级）：

```json
"menus": {
    "editor/context": [
        {
            "command": "sql-all-in-one.toggleComment",
            "when": "editorLangId =~ /sql|hive/",
            "group": "1_comment@1"
        },
        {
            "command": "sql-all-in-one.toggleAdvancedComment",
            "when": "editorLangId =~ /sql|hive/",
            "group": "1_comment@2"
        }
    ]
}
```

- [ ] **Step 5: 编译验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -5`
Expected: 编译成功，无错误

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "feat: add comment enhancement config, commands, keybindings to package.json"
```

---

### Task 2: 创建智能注释切换命令

**Files:**
- Create: `src/commands/commentCommands.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: 创建 commentCommands.ts 基础框架**

创建 `src/commands/commentCommands.ts`，实现 `toggleComment` 和 `toggleAdvancedComment` 两个命令：

```typescript
import * as vscode from 'vscode'
import { StatusBarProvider } from '../providers/StatusBarProvider'

export function toggleComment(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    if (!config.get<boolean>('enableSmartCommentToggle', true)) {
        vscode.commands.executeCommand('editor.action.commentLine')
        return
    }
    const selections = editor.selections
    const hasMultiLineSelection = selections.some(s => !s.isSingleLine || s.start.line !== s.end.line)
    if (hasMultiLineSelection) {
        toggleBlockComment(editor)
    } else {
        vscode.commands.executeCommand('editor.action.commentLine')
    }
}

export function toggleAdvancedComment(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    if (!config.get<boolean>('enableSmartCommentToggle', true)) {
        vscode.commands.executeCommand('editor.action.blockComment')
        return
    }
    const selection = editor.selection
    const text = editor.document.getText(selection)
    if (!selection.isEmpty && isCompleteSqlStatement(text)) {
        wrapWithFormatterDisable(editor)
    } else if (selection.isEmpty && isDdlColumnLine(editor)) {
        addColumnComment(editor)
    } else {
        toggleBlockComment(editor)
    }
}

function toggleBlockComment(editor: vscode.TextEditor): void {
    const selection = editor.selection
    if (selection.isEmpty) {
        vscode.commands.executeCommand('editor.action.blockComment')
        return
    }
    const text = editor.document.getText(selection)
    const trimmed = text.trim()
    if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) {
        removeBlockComment(editor, selection, text)
    } else {
        addBlockComment(editor, selection, text)
    }
}

function addBlockComment(editor: vscode.TextEditor, selection: vscode.Selection, text: string): void {
    const edit = new vscode.WorkspaceEdit()
    const start = selection.start
    const end = selection.end
    const startPos = editor.document.offsetAt(start)
    const endPos = editor.document.offsetAt(end)
    const fullText = editor.document.getText()
    const beforeText = fullText.substring(0, startPos)
    const selectedText = fullText.substring(startPos, endPos)
    const linePrefix = editor.document.lineAt(start.line).text.match(/^(\s*)/)?.[1] || ''
    const newText = `/* ${selectedText.replace(/\n/g, `\n   `)} */`
    edit.replace(editor.document.uri, selection, newText)
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) StatusBarProvider.showTemporaryMessage('已添加块注释')
    })
}

function removeBlockComment(editor: vscode.TextEditor, selection: vscode.Selection, text: string): void {
    const edit = new vscode.WorkspaceEdit()
    let cleaned = text.trim()
    if (cleaned.startsWith('/*')) cleaned = cleaned.substring(2)
    if (cleaned.endsWith('*/')) cleaned = cleaned.substring(0, cleaned.length - 2)
    cleaned = cleaned.replace(/^\s{0,3}/gm, '')
    cleaned = cleaned.trim()
    edit.replace(editor.document.uri, selection, cleaned)
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) StatusBarProvider.showTemporaryMessage('已移除块注释')
    })
}

function isCompleteSqlStatement(text: string): boolean {
    const trimmed = text.trim()
    const startsWithSqlKeyword = /^\b(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH)\b/i.test(trimmed)
    const endsWithSemicolon = /;\s*$/.test(trimmed) || trimmed.endsWith('\n')
    return startsWithSqlKeyword
}

function isDdlColumnLine(editor: vscode.TextEditor): boolean {
    const line = editor.document.lineAt(editor.selection.active.line).text
    return /^\s*\w+\s+\w+.*(?:,|$)/.test(line) && isInsideCreateTable(editor)
}

function isInsideCreateTable(editor: vscode.TextEditor): boolean {
    const lineCount = editor.document.lineCount
    const currentLine = editor.selection.active.line
    let depth = 0
    for (let i = currentLine; i >= 0; i--) {
        const lineText = editor.document.lineAt(i).text.toUpperCase()
        if (lineText.includes(')')) depth++
        if (lineText.includes('CREATE') && lineText.includes('TABLE')) {
            if (lineText.includes('(')) depth--
            return depth <= 0
        }
        if (lineText.includes('(')) depth--
        if (depth < 0) return false
    }
    return false
}

function addColumnComment(editor: vscode.TextEditor): void {
    const line = editor.document.lineAt(editor.selection.active.line)
    const lineText = line.text
    if (/COMMENT\s+'/.test(lineText)) {
        const commentMatch = lineText.match(/COMMENT\s+'([^']*)'/)
        if (commentMatch && commentMatch.index !== undefined) {
            const quoteStart = lineText.indexOf("'", commentMatch.index)
            const quoteEnd = lineText.indexOf("'", quoteStart + 1)
            if (quoteStart !== -1 && quoteEnd !== -1) {
                editor.selection = new vscode.Selection(
                    line.range.start.translate(0, quoteStart + 1),
                    line.range.start.translate(0, quoteEnd)
                )
            }
        }
        return
    }
    const edit = new vscode.WorkspaceEdit()
    const hasComma = lineText.trimEnd().endsWith(',')
    const insertPos = hasComma
        ? line.range.end.translate(0, -1)
        : line.range.end
    const insertText = hasComma ? " COMMENT ''" : " COMMENT ''"
    edit.insert(editor.document.uri, insertPos, insertText)
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) {
            const newLine = editor.document.lineAt(editor.selection.active.line).text
            const quoteStart = newLine.indexOf("COMMENT '") + 9
            const quoteEnd = newLine.indexOf("'", quoteStart)
            if (quoteStart > 8 && quoteEnd !== -1) {
                editor.selection = new vscode.Selection(
                    editor.selection.active.line,
                    quoteStart,
                    editor.selection.active.line,
                    quoteEnd
                )
            }
            StatusBarProvider.showTemporaryMessage('已添加 DDL 列注释')
        }
    })
}

function wrapWithFormatterDisable(editor: vscode.TextEditor): void {
    const selection = editor.selection
    const edit = new vscode.WorkspaceEdit()
    const linePrefix = editor.document.lineAt(selection.start.line).text.match(/^(\s*)/)?.[1] || ''
    edit.insert(editor.document.uri, selection.start, `/* sql-formatter-disable */\n${linePrefix}`)
    edit.insert(editor.document.uri, selection.end, `\n${linePrefix}/* sql-formatter-enable */`)
    vscode.workspace.applyEdit(edit).then(success => {
        if (success) StatusBarProvider.showTemporaryMessage('已添加格式化禁用标记')
    })
}
```

- [ ] **Step 2: 在 extension.ts 中注册注释命令**

在 `extension.ts` 顶部添加 import：

```typescript
import { toggleComment, toggleAdvancedComment } from "./commands/commentCommands"
```

在 `context.subscriptions.push(` 块中，`format-selection` 命令之后添加：

```typescript
vscode.commands.registerCommand(
    "sql-all-in-one.toggleComment",
    toggleComment,
),
vscode.commands.registerCommand(
    "sql-all-in-one.toggleAdvancedComment",
    toggleAdvancedComment,
),
```

- [ ] **Step 3: 编译验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -5`
Expected: 编译成功（StatusBarProvider.showTemporaryMessage 方法还未添加，会有编译错误，在 Task 3 中添加）

- [ ] **Step 4: Commit**

```bash
git add src/commands/commentCommands.ts src/extension.ts
git commit -m "feat: implement smart comment toggle commands"
```

---

### Task 3: 扩展 StatusBarProvider 支持临时消息

**Files:**
- Modify: `src/providers/StatusBarProvider.ts`

- [ ] **Step 1: 添加 showTemporaryMessage 静态方法**

在 `StatusBarProvider` 类中添加一个静态方法用于显示临时状态消息。修改 `StatusBarProvider.ts`：

在类顶部添加静态属性：

```typescript
private static tempItem: vscode.StatusBarItem | undefined
private static tempTimeout: ReturnType<typeof setTimeout> | undefined
```

在类末尾（`dispose()` 方法之前）添加静态方法：

```typescript
public static showTemporaryMessage(message: string): void {
    if (StatusBarProvider.tempItem) {
        StatusBarProvider.tempItem.dispose()
    }
    if (StatusBarProvider.tempTimeout) {
        clearTimeout(StatusBarProvider.tempTimeout)
    }
    StatusBarProvider.tempItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99)
    StatusBarProvider.tempItem.text = `$(check) ${message}`
    StatusBarProvider.tempItem.show()
    StatusBarProvider.tempTimeout = setTimeout(() => {
        if (StatusBarProvider.tempItem) {
            StatusBarProvider.tempItem.dispose()
            StatusBarProvider.tempItem = undefined
        }
    }, 2000)
}
```

- [ ] **Step 2: 编译验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add src/providers/StatusBarProvider.ts
git commit -m "feat: add temporary status bar message support"
```

---

### Task 4: 添加静态注释 Snippet 到 sql.json

**Files:**
- Modify: `snippets/sql.json`

- [ ] **Step 1: 在 sql.json 末尾（`Comment Header` 条目之后）添加 5 个新 Snippet**

在 JSON 最后一个 `}` 之前添加（注意逗号分隔）：

```json
"TODO Comment": {
    "prefix": "todo",
    "body": [
        "-- TODO(${1:username}): ${2:description}"
    ],
    "description": "TODO 注释（带责任人）"
},
"FIXME Comment": {
    "prefix": "fixme",
    "body": [
        "-- FIXME: ${1:description}",
        "-- Reason: ${2:why this needs fixing}"
    ],
    "description": "FIXME 注释"
},
"HACK Comment": {
    "prefix": "hack",
    "body": [
        "-- HACK: ${1:description}",
        "-- TODO: ${2:proper solution}"
    ],
    "description": "HACK 临时方案注释"
},
"Query Description": {
    "prefix": "desc",
    "body": [
        "-- ============================================",
        "-- 查询说明：${1:功能描述}",
        "-- 涉及表：${2:table_list}",
        "-- 条件：${3:filter_conditions}",
        "-- 输出：${4:output_description}",
        "-- 作者：${5:author}",
        "-- 日期：$CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE",
        "-- ============================================"
    ],
    "description": "查询说明注释块"
},
"Section Comment": {
    "prefix": "section",
    "body": [
        "-- ============================================================",
        "-- ${1:section_title}",
        "-- ============================================================"
    ],
    "description": "分区标题注释"
}
```

- [ ] **Step 2: 验证 JSON 合法性**

Run: `cd /Users/hao/Downloads/sql-all-in-one && node -e "JSON.parse(require('fs').readFileSync('snippets/sql.json','utf8')); console.log('JSON valid')" 2>&1`
Expected: `JSON valid`

- [ ] **Step 3: Commit**

```bash
git add snippets/sql.json
git commit -m "feat: add static comment snippets (todo/fixme/hack/desc/section)"
```

---

### Task 5: 创建动态注释补全（header/col/tbl）

**Files:**
- Create: `src/completion/commentCompletion.ts`
- Modify: `src/completion/SqlCompletionProvider.ts`
- Modify: `src/completion/index.ts`

- [ ] **Step 1: 创建 commentCompletion.ts**

创建 `src/completion/commentCompletion.ts`：

```typescript
import * as vscode from 'vscode'

export function getCommentCompletionItems(
    doc: vscode.TextDocument,
    pos: vscode.Position
): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = []
    const line = doc.lineAt(pos.line).text
    const linePrefix = line.substring(0, pos.character).trimStart()

    items.push(createHeaderItem(doc, pos))
    items.push(createColItem(doc, pos))
    items.push(createTblItem(doc, pos))

    return items
}

function createHeaderItem(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem {
    const item = new vscode.CompletionItem('header - 文件头注释', vscode.CompletionItemKind.Snippet)
    item.filterText = 'header'
    item.sortText = '0_header'
    item.detail = '注释片段 (header)'

    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    const author = config.get<string>('headerAuthor', '')
    const modifier = config.get<string>('headerModifier', '') || author
    const fileName = doc.fileName.split('/').pop()?.replace(/\.\w+$/, '') || 'script_name'
    const today = new Date().toISOString().slice(0, 10)

    const existingHeader = doc.getText(new vscode.Range(0, 0, Math.min(doc.lineCount, 10), 0))
    const existingDateMatch = existingHeader.match(/创建时间[：:]\s*(\d{4}-\d{2}-\d{2})/)
    const createDate = existingDateMatch ? existingDateMatch[1] : today

    const { inputTables, outputTables } = extractTableDependencies(doc.getText())

    const inputTableLines = inputTables.length > 0
        ? inputTables.map(t => `--     - ${t}`).join('\n')
        : '--     （未检测到表依赖，请手动填写）'

    const outputTableLines = outputTables.length > 0
        ? outputTables.map(t => `--     - ${t}`).join('\n')
        : '--     （未检测到输出表，请手动填写）'

    const snippet = new vscode.SnippetString()
    const lines = [
        '-- ============================================================',
        `-- 脚本名称：\${1:${fileName}}`,
        '-- 功能描述：$2',
        `-- 作者：\${3:${author}}`,
        `-- 创建时间：\${4:${createDate}}`,
        '-- ============================================================',
        '-- 修改记录：',
        '--   日期         修改人       修改内容',
        `--   \${5:${today}}  \${6:${modifier}}     \${7:初始版本}`,
        '-- ============================================================',
        '-- 上游依赖：',
        '--   输入表：',
        inputTableLines,
        '--   输出表：',
        outputTableLines,
        '-- ============================================================',
    ]
    snippet.appendText(lines.join('\n') + '\n')
    snippet.appendTabstop(0)

    item.insertText = snippet
    return item
}

function createColItem(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem {
    const item = new vscode.CompletionItem('col - 列 COMMENT', vscode.CompletionItemKind.Snippet)
    item.filterText = 'col'
    item.sortText = '0_col'
    item.detail = '注释片段 (col)'

    const line = doc.lineAt(pos.line).text
    const trimmed = line.trimEnd()

    if (/COMMENT\s+'/.test(line)) {
        const snippet = new vscode.SnippetString()
        snippet.appendTabstop(0)
        item.insertText = snippet
        return item
    }

    const hasComma = trimmed.endsWith(',')
    const snippet = new vscode.SnippetString()

    if (hasComma) {
        snippet.appendText(" COMMENT '")
        snippet.appendPlaceholder('列说明', 1)
        snippet.appendText("',")
        const commaIndex = line.lastIndexOf(',')
        const deleteRange = new vscode.Range(
            pos.line, commaIndex,
            pos.line, commaIndex + 1
        )
        item.additionalTextEdits = [vscode.TextEdit.delete(deleteRange)]
    } else {
        snippet.appendText(" COMMENT '")
        snippet.appendPlaceholder('列说明', 1)
        snippet.appendText("'")
    }

    item.insertText = snippet
    return item
}

function createTblItem(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem {
    const item = new vscode.CompletionItem('tbl - 表 COMMENT', vscode.CompletionItemKind.Snippet)
    item.filterText = 'tbl'
    item.sortText = '0_tbl'
    item.detail = '注释片段 (tbl)'

    const snippet = new vscode.SnippetString()
    snippet.appendText("COMMENT '")
    snippet.appendPlaceholder('表说明', 1)
    snippet.appendText("'")
    item.insertText = snippet
    return item
}

function extractTableDependencies(text: string): { inputTables: string[]; outputTables: string[] } {
    const inputTables = new Set<string>()
    const outputTables = new Set<string>()

    const strippedText = removeCommentsAndStrings(text)

    const fromPattern = /(?:FROM|JOIN)\s+([\w.]+)/gi
    let match
    while ((match = fromPattern.exec(strippedText)) !== null) {
        const tableName = match[1]
        if (!isSqlKeyword(tableName)) {
            inputTables.add(tableName.toLowerCase())
        }
    }

    const insertPattern = /(?:INSERT\s+INTO|INSERT\s+OVERWRITE\s+TABLE)\s+([\w.]+)/gi
    while ((match = insertPattern.exec(strippedText)) !== null) {
        outputTables.add(match[1].toLowerCase())
    }

    const ctasPattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.]+)\s+AS\b/gi
    while ((match = ctasPattern.exec(strippedText)) !== null) {
        outputTables.add(match[1].toLowerCase())
    }

    const sortedInput = Array.from(inputTables).sort()
    const sortedOutput = Array.from(outputTables).sort()

    if (sortedInput.length > 20) {
        const truncated = sortedInput.slice(0, 20)
        truncated.push(`（共 ${sortedInput.length} 个表，此处仅展示前20个）`)
        return { inputTables: truncated, outputTables: sortedOutput }
    }

    return { inputTables: sortedInput, outputTables: sortedOutput }
}

function removeCommentsAndStrings(text: string): string {
    let result = text
    result = result.replace(/\/\*[\s\S]*?\*\//g, '')
    result = result.replace(/--[^\n]*/g, '')
    result = result.replace(/'[^']*'/g, "''")
    result = result.replace(/"[^"]*"/g, '""')
    return result
}

function isSqlKeyword(name: string): boolean {
    const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'AS', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INTO', 'VALUES', 'SET', 'WITH', 'OVER', 'PARTITION', 'BY']
    return keywords.includes(name.toUpperCase())
}
```

- [ ] **Step 2: 在 SqlCompletionProvider.ts 中集成动态注释补全**

在 `SqlCompletionProvider.ts` 顶部添加 import：

```typescript
import { getCommentCompletionItems } from './commentCompletion'
```

在 `loadConfig()` 方法中添加配置读取：

```typescript
commentSnippets: c.get('completion.commentSnippets', true),
```

在 `provideCompletionItems()` 方法中，`if (this.cfg.identifiers ...)` 之后添加：

```typescript
if (this.cfg.commentSnippets && doc.getText().trim()) items.push(...getCommentCompletionItems(doc, pos))
```

- [ ] **Step 3: 在 completion/index.ts 中导出**

在 `src/completion/index.ts` 中添加导出：

```typescript
export { getCommentCompletionItems } from './commentCompletion'
```

- [ ] **Step 4: 编译验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add src/completion/commentCompletion.ts src/completion/SqlCompletionProvider.ts src/completion/index.ts
git commit -m "feat: add dynamic comment completion (header/col/tbl snippets)"
```

---

### Task 6: 新增注释 Lint 规则（missing_query_comment）

**Files:**
- Modify: `src/providers/SqlLinter.ts`

- [ ] **Step 1: 在 builtInRules 数组中添加 4 条新规则**

在 `registerBuiltInRules()` 方法的 `builtInRules` 数组末尾（`duplicate_column_aliases` 规则之后）添加：

```typescript
{ id: "missing_query_comment", name: "复杂查询缺少说明注释", description: "复杂查询（多行/多JOIN/多子查询）建议添加说明注释", defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
{ id: "missing_column_comment", name: "DDL 列缺少 COMMENT", description: "CREATE TABLE 中的列定义建议添加 COMMENT 注释", defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
{ id: "commented_out_code", name: "注释掉的代码", description: "发现疑似注释掉的大段代码，建议确认后删除或取消注释", defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "code-style" },
{ id: "expired_todo", name: "过期的 TODO/FIXME", description: "TODO/FIXME 标记已过期，请确认是否仍需处理", defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "best-practices" },
```

- [ ] **Step 2: 在 lint() 方法中添加规则调用**

在 `lint()` 方法的 `if (this.isRuleEnabled('explicit_column_aliasing'))` 块之后添加：

```typescript
if (this.isRuleEnabled('missing_query_comment')) {
    this.checkMissingQueryComment(text, document, diagnostics)
}
if (this.isRuleEnabled('missing_column_comment')) {
    this.checkMissingColumnComment(text, document, diagnostics)
}
if (this.isRuleEnabled('commented_out_code')) {
    this.checkCommentedOutCode(text, document, diagnostics)
}
if (this.isRuleEnabled('expired_todo')) {
    this.checkExpiredTodo(text, document, diagnostics)
}
```

- [ ] **Step 3: 实现 checkMissingQueryComment 方法**

在 `SqlLinter` 类的末尾（`checkExplicitColumnAliasing` 方法之后）添加：

```typescript
private checkMissingQueryComment(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    const thresholdLines = config.get<number>('lint.missing_query_comment_threshold_line_count', 20)
    const thresholdJoins = config.get<number>('lint.missing_query_comment_threshold_join_count', 3)
    const thresholdSubqueries = config.get<number>('lint.missing_query_comment_threshold_subquery_count', 2)

    if (document.lineCount < 20) return

    const selectPattern = /\bSELECT\b/gi
    let match
    while ((match = selectPattern.exec(text)) !== null) {
        const selectStartLine = document.positionAt(match.index).line
        const statementEnd = this.findStatementEnd(text, match.index)
        const statementEndLine = document.positionAt(statementEnd).line
        const lineCount = statementEndLine - selectStartLine + 1

        const statementText = text.substring(match.index, statementEnd)
        const joinCount = (statementText.match(/\bJOIN\b/gi) || []).length
        const subqueryCount = (statementText.match(/\(\s*SELECT\b/gi) || []).length

        const isComplex = lineCount >= thresholdLines || joinCount >= thresholdJoins || subqueryCount >= thresholdSubqueries
        if (!isComplex) continue

        const hasCommentAbove = this.hasCommentAboveLine(text, document, selectStartLine)
        if (hasCommentAbove) continue

        const details: string[] = []
        if (lineCount >= thresholdLines) details.push(`${lineCount}行`)
        if (joinCount >= thresholdJoins) details.push(`${joinCount}个JOIN`)
        if (subqueryCount >= thresholdSubqueries) details.push(`${subqueryCount}个子查询`)

        this.addDiagnostic(
            text, document, diagnostics,
            match.index, 6,
            `复杂查询（${details.join('/')}）缺少说明注释，建议添加查询功能描述`,
            "missing_query_comment"
        )
    }
}

private findStatementEnd(text: string, startIndex: number): number {
    let depth = 0
    let i = startIndex
    while (i < text.length) {
        if (text[i] === '(') depth++
        else if (text[i] === ')') depth--
        else if (text[i] === ';' && depth === 0) return i + 1
        i++
    }
    return text.length
}

private hasCommentAboveLine(text: string, document: vscode.TextDocument, line: number): boolean {
    for (let i = Math.max(0, line - 3); i < line; i++) {
        const lineText = document.lineAt(i).text.trim()
        if (lineText.startsWith('--') || lineText.startsWith('/*')) return true
    }
    return false
}
```

- [ ] **Step 4: 编译验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add src/providers/SqlLinter.ts
git commit -m "feat: add missing_query_comment lint rule"
```

---

### Task 7: 新增注释 Lint 规则（missing_column_comment）

**Files:**
- Modify: `src/providers/SqlLinter.ts`

- [ ] **Step 1: 实现 checkMissingColumnComment 方法**

在 `SqlLinter` 类的 `hasCommentAboveLine` 方法之后添加：

```typescript
private checkMissingColumnComment(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    const aggregate = config.get<boolean>('lint.missing_column_comment_aggregate', true)
    const externalExempt = config.get<boolean>('lint.missing_column_comment_external_table_exempt', false)

    const createTablePattern = /\bCREATE\s+(?:EXTERNAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.]+\s*\(/gi
    let ctMatch
    while ((ctMatch = createTablePattern.exec(text)) !== null) {
        const isExternal = /\bEXTERNAL\b/i.test(ctMatch[0])
        if (externalExempt && isExternal) continue

        const openParenIndex = ctMatch.index + ctMatch[0].length - 1
        const closeParenIndex = this.findMatchingParen(text, openParenIndex)
        if (closeParenIndex === -1) continue

        const columnsText = text.substring(openParenIndex + 1, closeParenIndex)
        const missingColumns: { name: string; index: number }[] = []

        const lines = columnsText.split('\n')
        let globalOffset = openParenIndex + 1
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) { globalOffset += line.length + 1; continue }
            if (/^\s*(PRIMARY\s+KEY|CONSTRAINT|INDEX|KEY|UNIQUE|FOREIGN)/i.test(trimmed)) {
                globalOffset += line.length + 1
                continue
            }
            const colMatch = trimmed.match(/^(\w+)\s+\w+/)
            if (colMatch && !/COMMENT\s+'/.test(trimmed)) {
                const colName = colMatch[1]
                const colStartInLine = line.indexOf(colName)
                missingColumns.push({
                    name: colName,
                    index: globalOffset + colStartInLine
                })
            }
            globalOffset += line.length + 1
        }

        if (missingColumns.length === 0) continue

        if (aggregate && missingColumns.length > 1) {
            this.addDiagnostic(
                text, document, diagnostics,
                ctMatch.index, ctMatch[0].indexOf('('),
                `CREATE TABLE 中有 ${missingColumns.length} 个列缺少 COMMENT 注释`,
                "missing_column_comment"
            )
        } else {
            for (const col of missingColumns) {
                this.addDiagnostic(
                    text, document, diagnostics,
                    col.index, col.name.length,
                    `列 '${col.name}' 缺少 COMMENT 注释`,
                    "missing_column_comment"
                )
            }
        }
    }
}

private findMatchingParen(text: string, openIndex: number): number {
    let depth = 0
    for (let i = openIndex; i < text.length; i++) {
        if (text[i] === '(') depth++
        else if (text[i] === ')') {
            depth--
            if (depth === 0) return i
        }
    }
    return -1
}
```

- [ ] **Step 2: 编译验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add src/providers/SqlLinter.ts
git commit -m "feat: add missing_column_comment lint rule"
```

---

### Task 8: 新增注释 Lint 规则（commented_out_code 和 expired_todo）

**Files:**
- Modify: `src/providers/SqlLinter.ts`

- [ ] **Step 1: 实现 checkCommentedOutCode 方法**

在 `SqlLinter` 类的 `findMatchingParen` 方法之后添加：

```typescript
private checkCommentedOutCode(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    const thresholdLines = config.get<number>('lint.commented_out_code_threshold_lines', 3)

    const blockCommentPattern = /\/\*([\s\S]*?)\*\//g
    let match
    while ((match = blockCommentPattern.exec(text)) !== null) {
        const content = match[1]
        if (/sql-formatter-disable|sql-formatter-enable/i.test(content)) continue
        if (/^(?:\s*--\s*)?(?:示例|Example|说明|Description|Note|注意)/im.test(content)) continue

        const lines = content.split('\n').filter(l => l.trim().length > 0)
        if (lines.length < thresholdLines) continue

        const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION']
        let keywordCount = 0
        for (const kw of sqlKeywords) {
            if (new RegExp(`\\b${kw}\\b`, 'i').test(content)) keywordCount++
        }
        if (keywordCount < 3) continue

        this.addDiagnostic(
            text, document, diagnostics,
            match.index, 2,
            `发现注释掉的代码（${lines.length}行），建议确认后删除或取消注释`,
            "commented_out_code"
        )
    }

    const lineCommentGroups = this.findConsecutiveLineComments(text, document)
    for (const group of lineCommentGroups) {
        if (group.lineCount < thresholdLines) continue
        const content = group.text
        if (/sql-formatter-disable|sql-formatter-enable/i.test(content)) continue

        const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION']
        let keywordCount = 0
        for (const kw of sqlKeywords) {
            if (new RegExp(`\\b${kw}\\b`, 'i').test(content)) keywordCount++
        }
        if (keywordCount < 3) continue

        this.addDiagnostic(
            text, document, diagnostics,
            group.startIndex, 2,
            `发现注释掉的代码（${group.lineCount}行），建议确认后删除或取消注释`,
            "commented_out_code"
        )
    }
}

private findConsecutiveLineComments(text: string, document: vscode.TextDocument): { startIndex: number; lineCount: number; text: string }[] {
    const groups: { startIndex: number; lineCount: number; text: string }[] = []
    const lines = text.split('\n')
    let groupStart = -1
    let groupText = ''
    let groupStartIndex = 0

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim()
        if (trimmed.startsWith('--')) {
            if (groupStart === -1) {
                groupStart = i
                groupStartIndex = text.indexOf(lines[i])
                groupText = trimmed
            } else {
                groupText += '\n' + trimmed
            }
        } else if (trimmed.length > 0) {
            if (groupStart !== -1) {
                groups.push({ startIndex: groupStartIndex, lineCount: i - groupStart, text: groupText })
                groupStart = -1
                groupText = ''
            }
        }
    }
    if (groupStart !== -1) {
        groups.push({ startIndex: groupStartIndex, lineCount: lines.length - groupStart, text: groupText })
    }
    return groups
}
```

- [ ] **Step 2: 实现 checkExpiredTodo 方法**

在 `findConsecutiveLineComments` 方法之后添加：

```typescript
private checkExpiredTodo(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    const config = vscode.workspace.getConfiguration('SQL-All-in-One')
    const gracePeriod = config.get<number>('lint.expired_todo_grace_period_days', 7)

    const todoPattern = /--\s*(TODO|FIXME)\s*[\(（]([^)\)）,，]*?[,，]?\s*(\d{4}[-/]\d{2}[-/]\d{2})\s*[\)）]:?\s*.*/gi
    let match
    while ((match = todoPattern.exec(text)) !== null) {
        const dateStr = match[3].replace(/\//g, '-')
        const todoDate = new Date(dateStr)
        const now = new Date()
        now.setHours(0, 0, 0, 0)

        if (isNaN(todoDate.getTime())) continue

        const diffMs = now.getTime() - todoDate.getTime()
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

        if (diffDays <= gracePeriod) continue

        this.addDiagnostic(
            text, document, diagnostics,
            match.index, match[0].length,
            `TODO 标记已过期（${dateStr}），已超期 ${diffDays} 天，请确认是否仍需处理`,
            "expired_todo"
        )
    }

    const deadlinePattern = /--\s*(TODO|FIXME)[^\n]*@deadline\s+(\d{4}[-/]\d{2}[-/]\d{2})/gi
    while ((match = deadlinePattern.exec(text)) !== null) {
        const dateStr = match[2].replace(/\//g, '-')
        const todoDate = new Date(dateStr)
        const now = new Date()
        now.setHours(0, 0, 0, 0)

        if (isNaN(todoDate.getTime())) continue

        const diffMs = now.getTime() - todoDate.getTime()
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

        if (diffDays <= gracePeriod) continue

        this.addDiagnostic(
            text, document, diagnostics,
            match.index, match[0].length,
            `TODO 标记已过期（${dateStr}），已超期 ${diffDays} 天，请确认是否仍需处理`,
            "expired_todo"
        )
    }
}
```

- [ ] **Step 3: 编译验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add src/providers/SqlLinter.ts
git commit -m "feat: add commented_out_code and expired_todo lint rules"
```

---

### Task 9: 新增注释相关 Code Action

**Files:**
- Modify: `src/providers/SqlCodeActionProvider.ts`

- [ ] **Step 1: 改用 diagnostic.code 匹配并添加注释相关 Code Action**

重写 `tryCreateFix` 方法，添加基于 `diagnostic.code` 的匹配，以及新增注释相关的 Code Action 方法。替换整个 `SqlCodeActionProvider.ts`：

```typescript
import * as vscode from 'vscode'

export class SqlCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ]

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = []

        for (const diagnostic of context.diagnostics) {
            const fix = this.tryCreateFix(document, diagnostic)
            if (fix) {
                actions.push(...(Array.isArray(fix) ? fix : [fix]))
            }
        }

        return actions
    }

    private tryCreateFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction | vscode.CodeAction[] | null {
        const code = typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code
        const message = diagnostic.message

        if (code === 'missing_query_comment') {
            return this.createMissingQueryCommentFix(document, diagnostic)
        }
        if (code === 'missing_column_comment') {
            return this.createMissingColumnCommentFix(document, diagnostic)
        }
        if (code === 'commented_out_code') {
            return this.createCommentedOutCodeFixes(document, diagnostic)
        }
        if (code === 'expired_todo') {
            return this.createExpiredTodoFixes(document, diagnostic)
        }

        if (message.includes('= NULL') || message.includes('IS NULL')) {
            return this.createNullComparisonFix(document, diagnostic)
        }
        if (message.includes('HAVING') && message.includes('GROUP BY')) {
            return this.createHavingFix(document, diagnostic)
        }
        if (message.includes('保留字')) {
            return this.createReservedWordFix(document, diagnostic)
        }
        if (message.includes('子查询') && message.includes('别名')) {
            return this.createSubqueryAliasFix(document, diagnostic)
        }
        if (message.includes('INSERT') && message.includes('列名')) {
            return this.createInsertColumnsFix(document, diagnostic)
        }

        return null
    }

    private createMissingQueryCommentFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '添加查询说明注释',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const insertPos = diagnostic.range.start
        const linePrefix = document.lineAt(insertPos.line).text.match(/^(\s*)/)?.[1] || ''
        const today = new Date().toISOString().slice(0, 10)
        const snippet = `${linePrefix}-- ============================================\n${linePrefix}-- 查询说明：\n${linePrefix}-- 涉及表：\n${linePrefix}-- 条件：\n${linePrefix}-- 输出：\n${linePrefix}-- 日期：${today}\n${linePrefix}-- ============================================\n`

        action.edit = new vscode.WorkspaceEdit()
        action.edit.insert(document.uri, insertPos, snippet)

        return action
    }

    private createMissingColumnCommentFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '添加 COMMENT 占位符',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const line = document.lineAt(diagnostic.range.start.line).text
        const trimmed = line.trimEnd()
        const hasComma = trimmed.endsWith(',')

        if (hasComma) {
            const commaPos = line.lastIndexOf(',')
            const insertPos = new vscode.Position(diagnostic.range.start.line, commaPos)
            action.edit = new vscode.WorkspaceEdit()
            action.edit.insert(document.uri, insertPos, " COMMENT ''")
        } else {
            const insertPos = new vscode.Position(diagnostic.range.start.line, trimmed.length)
            action.edit = new vscode.WorkspaceEdit()
            action.edit.insert(document.uri, insertPos, " COMMENT ''")
        }

        return action
    }

    private createCommentedOutCodeFixes(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = []

        const uncommentAction = new vscode.CodeAction(
            '取消注释',
            vscode.CodeActionKind.QuickFix
        )
        uncommentAction.diagnostics = [diagnostic]
        uncommentAction.command = {
            command: 'sql-all-in-one.toggleComment',
            title: '取消注释'
        }
        actions.push(uncommentAction)

        const deleteAction = new vscode.CodeAction(
            '删除注释代码',
            vscode.CodeActionKind.QuickFix
        )
        deleteAction.diagnostics = [diagnostic]
        deleteAction.edit = new vscode.WorkspaceEdit()
        deleteAction.edit.delete(document.uri, diagnostic.range)
        actions.push(deleteAction)

        return actions
    }

    private createExpiredTodoFixes(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = []
        const line = document.lineAt(diagnostic.range.start.line).text

        const doneAction = new vscode.CodeAction(
            '标记为已完成',
            vscode.CodeActionKind.QuickFix
        )
        doneAction.diagnostics = [diagnostic]
        doneAction.isPreferred = true
        const doneText = line.replace(/--\s*(TODO|FIXME)/i, '-- DONE')
        doneAction.edit = new vscode.WorkspaceEdit()
        doneAction.edit.replace(document.uri, diagnostic.range, doneText)
        actions.push(doneAction)

        const today = new Date().toISOString().slice(0, 10)
        const updateDateAction = new vscode.CodeAction(
            '更新日期为今天',
            vscode.CodeActionKind.QuickFix
        )
        updateDateAction.diagnostics = [diagnostic]
        const updatedText = line.replace(/\d{4}[-/]\d{2}[-/]\d{2}/, today)
        updateDateAction.edit = new vscode.WorkspaceEdit()
        updateDateAction.edit.replace(document.uri, diagnostic.range, updatedText)
        actions.push(updateDateAction)

        const removeAction = new vscode.CodeAction(
            '移除标记',
            vscode.CodeActionKind.QuickFix
        )
        removeAction.diagnostics = [diagnostic]
        removeAction.edit = new vscode.WorkspaceEdit()
        removeAction.edit.delete(document.uri, document.lineAt(diagnostic.range.start.line).rangeIncludingLineBreak)
        actions.push(removeAction)

        return actions
    }

    private createNullComparisonFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '将 = NULL 改为 IS NULL',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const text = document.getText(diagnostic.range)
        let newText = text

        if (text.includes('= NULL')) {
            newText = text.replace('= NULL', 'IS NULL')
        } else if (text.includes('= null')) {
            newText = text.replace('= null', 'IS NULL')
        } else if (text.includes('!= NULL')) {
            newText = text.replace('!= NULL', 'IS NOT NULL')
        } else if (text.includes('!= null')) {
            newText = text.replace('!= null', 'IS NOT NULL')
        } else if (text.includes('<> NULL')) {
            newText = text.replace('<> NULL', 'IS NOT NULL')
        } else if (text.includes('<> null')) {
            newText = text.replace('<> null', 'IS NOT NULL')
        }

        action.edit = new vscode.WorkspaceEdit()
        action.edit.replace(document.uri, diagnostic.range, newText)

        return action
    }

    private createHavingFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '添加 GROUP BY 子句',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]

        const text = document.getText()
        const havingMatch = text.match(/HAVING/i)

        if (havingMatch && havingMatch.index !== undefined) {
            const beforeHaving = text.substring(0, havingMatch.index)
            const fromMatch = beforeHaving.match(/FROM\s+(\w+)/i)

            if (fromMatch) {
                const tableName = fromMatch[1]
                const insertPos = document.positionAt(havingMatch.index)

                action.edit = new vscode.WorkspaceEdit()
                action.edit.insert(
                    document.uri,
                    insertPos,
                    `\nGROUP BY ${tableName}.id `
                )
            }
        }

        return action
    }

    private createReservedWordFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '用反引号包裹标识符',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const text = document.getText(diagnostic.range)
        const newText = `\`${text}\``

        action.edit = new vscode.WorkspaceEdit()
        action.edit.replace(document.uri, diagnostic.range, newText)

        return action
    }

    private createSubqueryAliasFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '为子查询添加别名',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const text = document.getText(diagnostic.range)
        const newText = `${text} AS subquery`

        action.edit = new vscode.WorkspaceEdit()
        action.edit.replace(document.uri, diagnostic.range, newText)

        return action
    }

    private createInsertColumnsFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '添加列名占位符',
            vscode.CodeActionKind.QuickFix
        )
        action.diagnostics = [diagnostic]
        action.isPreferred = true

        const text = document.getText(diagnostic.range)
        const insertMatch = text.match(/INSERT\s+INTO\s+(\w+)/i)

        if (insertMatch) {
            const insertPos = diagnostic.range.end

            action.edit = new vscode.WorkspaceEdit()
            action.edit.insert(
                document.uri,
                document.positionAt(insertPos.character),
                ' (col1, col2, col3)'
            )
        }

        return action
    }
}
```

- [ ] **Step 2: 编译验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add src/providers/SqlCodeActionProvider.ts
git commit -m "feat: add comment-related Code Actions and use diagnostic.code matching"
```

---

### Task 10: 更新可视化配置编辑器

**Files:**
- Modify: `src/commands/configEditorCommand.ts`

- [ ] **Step 1: 在功能开关组中添加 enableSmartCommentToggle 开关**

在 `configEditorCommand.ts` 的 HTML 中，功能开关组（`🔌 功能开关`）的最后一个 `toggle-row`（`启用快速修复`）之后添加：

```html
<div class="toggle-row"><span class="toggle-label">启用智能注释切换</span><label class="toggle"><input type="checkbox" id="enableSmartCommentToggle"><span class="toggle-slider"></span></label></div>
```

- [ ] **Step 2: 更新功能开关的 badge 计数**

将功能开关组的 `<span class="cg-badge">11</span>` 改为 `<span class="cg-badge">12</span>`

- [ ] **Step 3: 在 Lint 规则组中添加 4 条新规则**

在 Lint 规则组（`🔍 Lint 规则`）的最后一个 `lint-rule`（`长查询行检测`）之后添加：

```html
<div class="lint-rule">
    <span class="lint-rule-name">复杂查询缺注释</span>
    <select class="config-select lint-rule-severity" id="missingQueryCommentSeverity">
        <option value="error">Error</option>
        <option value="warning">Warning</option>
        <option value="information">Info</option>
    </select>
    <label class="toggle lint-rule-toggle"><input type="checkbox" id="missingQueryCommentEnabled"><span class="toggle-slider"></span></label>
</div>
<div class="lint-rule">
    <span class="lint-rule-name">DDL 列缺 COMMENT</span>
    <select class="config-select lint-rule-severity" id="missingColumnCommentSeverity">
        <option value="error">Error</option>
        <option value="warning">Warning</option>
        <option value="information">Info</option>
    </select>
    <label class="toggle lint-rule-toggle"><input type="checkbox" id="missingColumnCommentEnabled"><span class="toggle-slider"></span></label>
</div>
<div class="lint-rule">
    <span class="lint-rule-name">注释掉的代码</span>
    <select class="config-select lint-rule-severity" id="commentedOutCodeSeverity">
        <option value="error">Error</option>
        <option value="warning">Warning</option>
        <option value="information">Info</option>
    </select>
    <label class="toggle lint-rule-toggle"><input type="checkbox" id="commentedOutCodeEnabled"><span class="toggle-slider"></span></label>
</div>
<div class="lint-rule">
    <span class="lint-rule-name">过期 TODO/FIXME</span>
    <select class="config-select lint-rule-severity" id="expiredTodoSeverity">
        <option value="error">Error</option>
        <option value="warning">Warning</option>
        <option value="information">Info</option>
    </select>
    <label class="toggle lint-rule-toggle"><input type="checkbox" id="expiredTodoEnabled"><span class="toggle-slider"></span></label>
</div>
```

- [ ] **Step 4: 更新 Lint 规则的 badge 计数**

将 Lint 规则组的 `<span class="cg-badge">14</span>` 改为 `<span class="cg-badge">18</span>`

- [ ] **Step 5: 在 JS 的 currentConfig 和 presets 中添加新配置项**

在 `configEditorCommand.ts` 的 JavaScript 部分中：

1. 在 `currentConfig` 对象中添加新属性：

```javascript
enableSmartCommentToggle: true,
```

2. 在 `default` preset 中添加：

```javascript
enableSmartCommentToggle: true,
```

3. 在 `loadConfig` 函数中添加新字段的加载：

```javascript
enableSmartCommentToggle: config.enableSmartCommentToggle,
```

4. 在 `applyConfig` 函数中添加新字段的应用：

```javascript
'enableSmartCommentToggle': config.enableSmartCommentToggle,
```

5. 添加 Lint 规则的配置加载/应用（遵循现有 lint 规则的模式）

- [ ] **Step 6: 编译验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -5`
Expected: 编译成功

- [ ] **Step 7: Commit**

```bash
git add src/commands/configEditorCommand.ts
git commit -m "feat: update config editor with comment enhancement settings"
```

---

### Task 11: 最终集成编译和验证

**Files:**
- All modified files

- [ ] **Step 1: 完整编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1`
Expected: 编译成功，无错误

- [ ] **Step 2: 运行 lint 检查**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run lint 2>&1`
Expected: 无 lint 错误

- [ ] **Step 3: 打包 VSIX 验证**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx vsce package 2>&1`
Expected: 成功生成 `.vsix` 文件

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete PRD 001 - comment enhancement (smart toggle, snippets, lint rules)"
```
