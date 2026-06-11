# Query Data Panel Design

## Overview

Upgrade the "Preview Data" feature to a "Query Data" panel with a Notebook-style layout: SQL editor on top, query results on bottom. Triggered by double-clicking or right-clicking a table/view node in the database explorer.

## Architecture

### Layout

```
┌─────────────────────────────────────────────┐
│  Toolbar: [▶Execute] [■Stop] [↻Refresh]     │  ← Fixed top
│  Connection: mydb@localhost  ●Connected      │
├─────────────────────────────────────────────┤
│  ┌─ SQL Editor (Monaco) ─────────────────┐  │  ← Resizable, default 30%
│  │ 1  SELECT * FROM `mydb`.`users`        │  │
│  │ 2  WHERE age > 18                      │  │
│  └────────────────────────────────────────┘  │
│  ══════════ Draggable Splitter ═════════════ │
│  ┌─ Query Result ────────────────────────┐  │  ← Remaining space
│  │  [Grid/Form] [Sort] [Filter] [Edit]   │  │
│  │  ┌────┬──────┬─────┬──────┐          │  │
│  │  │ #  │ id   │ name│ age  │          │  │
│  │  ├────┼──────┼─────┼──────┤          │  │
│  │  │ 1  │ 1    │ 张三│ 25   │          │  │
│  │  └────┴──────┴─────┴──────┘          │  │
│  │  Showing 1-100 / 500 rows  [◀] [▶]   │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Approach: Webview Panel + Embedded Monaco Editor

Chosen over VS Code Notebook API and native editor + WebviewView because:

- Full control over layout (exact Navicat-style top/bottom split)
- Monaco provides syntax highlighting, line numbers, basic autocomplete
- Existing result grid code can be reused directly
- VS Code environment has Monaco built-in, no external CDN dependency needed

## Interaction Flow

### Trigger

```
Double-click table/view node OR Right-click → "Query Data"
       │
       ▼
  Open/focus QueryResultPanel
       │
       ├── 1. Set Monaco editor content to SELECT * FROM `db`.`table`
       ├── 2. Auto-execute the SQL
       └── 3. Display results in bottom section
```

### Panel Execution

```
User clicks "Execute" button or presses Cmd+Shift+E
       │
       ▼
  Read current SQL from Monaco editor
       │
       ▼
  Send executePanelSql message to backend
       │
       ▼
  Backend executes SQL → returns result
       │
       ▼
  Frontend updates result section
```

## Command Changes

| Command | Before | After |
|---------|--------|-------|
| `viewTableData` | Generate SQL → create panel → execute → show result | Generate SQL → create panel → set editor content → execute → show result |
| `executeQuery` | Detect SQL from VS Code editor → execute → show in panel | Unchanged |
| New `queryDataInPanel` | — | Right-click menu item, same logic as `viewTableData` |

### Double-click Trigger

- **TableTreeNode**: Add default click command `sql-all-in-one.viewTableData` (double-click triggers)
- **ViewTreeNode**: Keep existing behavior (single-click triggers `viewTableData`)

## Webview Messages

| Direction | Type | Description |
|-----------|------|-------------|
| Frontend → Backend | `executePanelSql` | SQL text from Monaco editor |
| Backend → Frontend | `setEditorSql` | Set Monaco editor content (with autoExecute flag) |
| Backend → Frontend | `queryResult` | Query result (reuse existing) |
| Backend → Frontend | `queryStart` | Query started (reuse existing) |
| Backend → Frontend | `queryError` | Query error (reuse existing) |
| Backend → Frontend | `connectionInfo` | Current connection details |
| Backend → Frontend | `themeChange` | VS Code theme change event |

## Monaco Editor Integration

### Loading

Package Monaco Editor into `media/monaco/` as local resources loaded via `asWebviewUri`:

```html
<script src="{monacoLoaderUri}"></script>
<script>
  require.config({ paths: { 'vs': '{monacoBaseUri}' } });
  require(['vs/editor/editor.main'], function(monaco) {
    // Initialize editor
  });
</script>
```

### Configuration

```javascript
const editor = monaco.editor.create(container, {
  value: sql,
  language: 'sql',
  theme: 'vs-dark',
  minimap: { enabled: false },
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  fontSize: 13,
  wordWrap: 'on',
  automaticLayout: true,
  overviewRulerLanes: 0,
  folding: true,
  renderLineHighlight: 'gutter',
  contextmenu: true,
  suggestOnTriggerCharacters: true,
});
```

### Theme Sync

Listen for VS Code theme changes and sync Monaco theme:

```typescript
vscode.window.onDidChangeActiveColorTheme((theme) => {
  panel.webview.postMessage({
    type: 'themeChange',
    data: { kind: theme.kind }
  });
});
```

### SQL Completion

Initial: Monaco built-in SQL keyword completion.
Future enhancement: Schema-aware completion via backend provider.

### Keyboard Shortcuts

```javascript
editor.addCommand(monaco.KeyMod.Cmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE, function() {
  executePanelSql();
});
```

## Splitter

### HTML

```html
<div class="panel-split">
  <div class="sql-editor-section" id="sqlEditorSection" style="height: 30%;">
    <div class="sql-editor-toolbar">
      <span class="sql-label">SQL</span>
      <button class="btn-icon" id="btnExecute">▶</button>
      <button class="btn-icon" id="btnStop">■</button>
    </div>
    <div class="sql-editor-container" id="sqlEditorContainer"></div>
  </div>
  <div class="splitter" id="splitter">
    <div class="splitter-handle"></div>
  </div>
  <div class="result-section" id="resultSection">
    <!-- Reuse existing result HTML -->
  </div>
</div>
```

### Drag Logic

- Mousedown on splitter starts drag
- Mousemove calculates ratio relative to panel height
- Ratio clamped to 10%~80%
- SQL section and result section heights updated
- Monaco `automaticLayout: true` auto-adapts

### Splitter Style

```css
.splitter {
  height: 6px;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-border);
  flex-shrink: 0;
}
.splitter-handle {
  width: 40px;
  height: 3px;
  border-radius: 2px;
  background: var(--foreground-muted);
  opacity: 0.5;
}
.splitter:hover .splitter-handle {
  opacity: 1;
  background: var(--focus-border);
}
```

## Result Section Reuse

Existing result HTML structure (grid view, form view, filter bar, status bar) moves into `result-section` container. Key adjustments:

- Remove tab page switching (Result Set/Messages/History), use compact tab bar below result area
- Messages and History become collapsible side panels or popups to save vertical space
- Preserve all existing features: grid/form view, sort, filter, edit, export, BLOB preview

## Toolbar Reorganization

| Location | Buttons |
|----------|---------|
| SQL editor toolbar | ▶Execute, ■Stop |
| Result toolbar | ↻Refresh, Export▼, Filter, Edit mode, Grid/Form toggle, Add row, Delete row, Commit, Rollback |

SQL operations and data operations are visually separated.

## Backend Changes

### QueryResultPanel.ts

New methods:

```typescript
public setSqlAndExecute(sql: string): void {
    this._panel.webview.postMessage({
        type: 'setEditorSql',
        data: { sql, autoExecute: true },
    });
}

public setSql(sql: string): void {
    this._panel.webview.postMessage({
        type: 'setEditorSql',
        data: { sql, autoExecute: false },
    });
}
```

New callback:

```typescript
public onExecutePanelSql?: (sql: string) => Promise<void>;
```

New WebviewMessage type:

```typescript
| { command: 'executePanelSql'; sql: string }
```

### SchemaCommands.ts

`viewTableData` command change:

```typescript
// Before
const sql = `SELECT * FROM ${quotedName} LIMIT 100;`;
queryResultPanel.showLoading(sql);
const result = await queryExecutor.execute(adapter, sql, ...);
queryResultPanel.showResult(result, ...);

// After
const sql = `SELECT * FROM ${quotedName} LIMIT 100;`;
queryResultPanel.setSqlAndExecute(sql);
```

### QueryCommands.ts

Register `onExecutePanelSql` callback that executes SQL via QueryExecutor and returns results to the panel.

## Error Handling

| Scenario | Handling |
|----------|----------|
| No active connection | Show error in result section, preserve SQL editor content |
| SQL syntax error | Show error message in result section (with line number) |
| Query timeout | Show timeout message with retry button |
| Connection lost | Show connection lost message, preserve SQL editor content |
| Monaco load failure | Fallback to textarea for basic functionality |
| Empty table query | Show column headers with no data rows, status bar shows "0 rows" |
| Non-SELECT statements | Show affected row count in result section, no grid |

## Monaco Fallback

```javascript
function initEditor(container, sql) {
    if (typeof monaco !== 'undefined') {
        createMonacoEditor(container, sql);
    } else {
        var textarea = document.createElement('textarea');
        textarea.className = 'sql-editor-fallback';
        textarea.value = sql;
        container.appendChild(textarea);
    }
}
```

## File Changes

| File | Type | Description |
|------|------|-------------|
| `media/query-result.html` | Modify | Add SQL editor container + splitter, adjust layout |
| `media/query-result.css` | Modify | Split layout styles, splitter styles, Monaco container styles, fallback textarea styles |
| `media/query-result.js` | Modify | Monaco init, SQL execution, splitter drag, theme sync, keyboard shortcuts |
| `src/views/queryResult/QueryResultPanel.ts` | Modify | Add `setSqlAndExecute`/`setSql` methods, `onExecutePanelSql` callback, new message types, Monaco resource URIs |
| `src/database/commands/SchemaCommands.ts` | Modify | `viewTableData` calls `setSqlAndExecute` instead of direct execution |
| `src/database/commands/QueryCommands.ts` | Modify | Register `onExecutePanelSql` callback |
| `src/views/databaseExplorer/DatabaseTreeProvider.ts` | Modify | Add default click command for TableTreeNode |
| `package.json` | Modify | Add "Query Data" context menu, Monaco resource whitelist |
| `media/monaco/` | New | Monaco Editor local resource files |

### Unchanged Files

- `src/database/adapters/MysqlAdapter.ts` — Execution logic unchanged
- `src/database/query/QueryExecutor.ts` — Execution logic unchanged
- `src/database/query/DataEditService.ts` — Edit logic unchanged
- `src/views/databaseExplorer/treeNodes.ts` — Node definitions unchanged
