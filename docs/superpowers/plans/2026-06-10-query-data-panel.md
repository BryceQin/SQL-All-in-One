# Query Data Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the "Preview Data" feature to a "Query Data" panel with embedded SQL editor (Monaco) on top and query results on bottom, triggered by double-click or right-click on table/view nodes.

**Architecture:** Modify the existing QueryResultPanel Webview to include a top SQL editor section (Monaco) and a bottom result section, separated by a draggable splitter. The backend sends SQL to the panel via `setEditorSql` message; the panel sends SQL back via `executePanelSql` message. Existing result grid code is preserved and moved into the bottom section.

**Tech Stack:** TypeScript, Monaco Editor (bundled locally), VS Code Webview API, CSS Flexbox

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `media/monaco/` | Create | Monaco Editor local resources (loader, core, SQL language) |
| `media/query-result.html` | Modify | Add SQL editor section + splitter, restructure layout |
| `media/query-result.css` | Modify | Split layout, splitter, Monaco container, fallback textarea styles |
| `media/query-result.js` | Modify | Monaco init, SQL execution, splitter drag, theme sync, shortcuts |
| `src/views/queryResult/QueryResultPanel.ts` | Modify | New messages, `setSqlAndExecute`/`setSql` methods, `onExecutePanelSql` callback, Monaco URIs |
| `src/database/commands/SchemaCommands.ts` | Modify | `viewTableData` calls `setSqlAndExecute` |
| `src/database/commands/QueryCommands.ts` | Modify | Register `onExecutePanelSql` callback |
| `src/views/databaseExplorer/DatabaseTreeProvider.ts` | Modify | Add default click command for TableTreeNode |
| `package.json` | Modify | Rename command title, add Monaco resource whitelist |
| `src/i18n/messages.zh.json` | Modify | Add i18n keys for new UI elements |
| `src/i18n/messages.en.json` | Modify | Add i18n keys for new UI elements |

---

### Task 1: Bundle Monaco Editor into media/monaco/

**Files:**
- Create: `media/monaco/vs/loader.js`
- Create: `media/monaco/vs/editor/editor.main.js`
- Create: `media/monaco/vs/editor/editor.main.css`
- Create: `media/monaco/vs/editor/editor.main.nls.js`
- Create: `media/monaco/vs/base/worker/workerMain.js`
- Create: `media/monaco/vs/language/sql/sql.js`

- [ ] **Step 1: Install monaco-editor as dev dependency and extract files**

Run:
```bash
cd /Users/hao/Downloads/sql-all-in-one
npm install --save-dev monaco-editor@0.45.0
```

- [ ] **Step 2: Copy Monaco files to media/monaco/**

Run:
```bash
mkdir -p media/monaco
cp -r node_modules/monaco-editor/min/vs media/monaco/
```

- [ ] **Step 3: Verify Monaco files exist**

Run:
```bash
ls media/monaco/vs/loader.js media/monaco/vs/editor/editor.main.js
```
Expected: Both files listed

- [ ] **Step 4: Commit**

```bash
git add media/monaco/
git commit -m "feat: bundle Monaco Editor for query data panel"
```

---

### Task 2: Update package.json — command title, context menu, Monaco resource whitelist

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Rename viewTableData command title**

In `package.json`, find the command definition:
```json
{
    "command": "sql-all-in-one.viewTableData",
    "title": "View Data"
}
```

Change to:
```json
{
    "command": "sql-all-in-one.viewTableData",
    "title": "Query Data"
}
```

- [ ] **Step 2: Add Monaco resource whitelist to webview panel**

In `package.json`, find the `viewTableData` command registration in `menus/view/item/context` for `viewItem == table` (around line 1773). No change needed to menus — the existing `viewTableData` entries already cover both table and view nodes.

The Monaco resource whitelist is handled in `QueryResultPanel.ts` (Task 5), not in package.json.

- [ ] **Step 3: Run compile to verify no errors**

Run:
```bash
cd /Users/hao/Downloads/sql-all-in-one && npm run compile
```
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: rename View Data to Query Data"
```

---

### Task 3: Update i18n messages

**Files:**
- Modify: `src/i18n/messages.zh.json`
- Modify: `src/i18n/messages.en.json`

- [ ] **Step 1: Add new i18n keys to zh.json**

Add these keys to `src/i18n/messages.zh.json`:
```json
"resultPanel.queryData": "查询数据",
"resultPanel.sqlEditor": "SQL 编辑器",
"resultPanel.executePanel": "执行",
"resultPanel.stopPanel": "停止"
```

- [ ] **Step 2: Add new i18n keys to en.json**

Add these keys to `src/i18n/messages.en.json`:
```json
"resultPanel.queryData": "Query Data",
"resultPanel.sqlEditor": "SQL Editor",
"resultPanel.executePanel": "Execute",
"resultPanel.stopPanel": "Stop"
```

- [ ] **Step 3: Run compile to verify**

Run:
```bash
cd /Users/hao/Downloads/sql-all-in-one && npm run compile
```
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages.zh.json src/i18n/messages.en.json
git commit -m "feat: add i18n keys for query data panel"
```

---

### Task 4: Restructure HTML layout — SQL editor section + splitter

**Files:**
- Modify: `media/query-result.html`

- [ ] **Step 1: Add Monaco loader script and CSP update**

Replace the CSP meta tag (line 4):
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' {{CSP_SOURCE}}; script-src 'unsafe-inline' {{CSP_SOURCE}}; img-src data: {{CSP_SOURCE}}; worker-src blob: {{CSP_SOURCE}};">
```

Add before `</head>` closing tag (after `{{CONFIG_INJECT}}`):
```html
<script src="{{MONACO_LOADER_URI}}"></script>
```

- [ ] **Step 2: Restructure the body — add SQL editor section and splitter**

Replace the content inside `<div class="result-panel">` (lines 13-168) with the new structure. The key change is wrapping the existing content in a `panel-split` container with SQL editor on top and result section on bottom:

```html
<div class="result-panel">
    <div class="header-bar">
      <div class="header-title" id="headerTitle">
        <span data-i18n="resultPanel.queryResult">查询结果</span>
        <span class="header-conn" id="headerConn"></span>
        <span class="header-dot" id="headerDot"></span>
        <span class="header-time" id="headerTime"></span>
      </div>
      <div class="toolbar">
        <button class="tb-btn" id="btnExecute" data-action="handleExecute" data-i18n="resultPanel.execute" title="Execute (Cmd+Shift+E)">▶ Run</button>
        <button class="tb-btn" id="btnCancel" data-action="handleCancel" data-i18n="resultPanel.cancel" title="Cancel">■ Stop</button>
        <button class="tb-btn" id="btnRefresh" data-action="handleRefresh" data-i18n="resultPanel.refresh" title="Refresh">↻</button>
        <div class="tb-dropdown" id="exportDropdown">
          <button class="tb-btn" data-action="toggleExportMenu" data-i18n="resultPanel.export" title="Export">Export ▼</button>
          <div class="tb-dropdown-menu" id="exportMenu">
            <div class="tb-dropdown-item" data-action="handleExport" data-action-arg="csv">CSV</div>
            <div class="tb-dropdown-item" data-action="handleExport" data-action-arg="json">JSON</div>
            <div class="tb-dropdown-item" data-action="handleExport" data-action-arg="sql_insert">SQL INSERT</div>
            <div class="tb-dropdown-item" data-action="handleExport" data-action-arg="ddl">DDL</div>
          </div>
        </div>
        <button class="tb-btn" id="btnFilter" data-action="toggleFilterBar" data-i18n="resultPanel.filter" title="Filter">Filter</button>
        <span class="tb-separator"></span>
        <button class="tb-btn" id="btnEditMode" data-action="toggleEditMode" title="Toggle Edit Mode">Edit</button>
        <button class="tb-btn" id="btnAddRow" data-action="addRow" title="Add Row" disabled>+</button>
        <button class="tb-btn" id="btnDeleteRow" data-action="deleteRow" title="Delete Row" disabled>−</button>
        <button class="tb-btn" id="btnCommit" data-action="commitChanges" title="Commit Changes" disabled>✓</button>
        <button class="tb-btn" id="btnRollback" data-action="rollbackChanges" title="Rollback Changes" disabled>←</button>
        <span class="tb-separator"></span>
        <button class="tb-btn" id="btnBeginTx" data-action="beginTransaction" title="Begin Transaction" disabled>Tx</button>
        <button class="tb-btn" id="btnSavepoint" data-action="createSavepoint" title="Create Savepoint" disabled>SP</button>
        <button class="tb-btn" id="btnRollbackToSp" data-action="rollbackToSavepoint" title="Rollback to Savepoint" disabled>←SP</button>
        <span class="tb-separator"></span>
        <button class="tb-btn" id="btnGridView" data-action="switchView" data-action-arg="grid" title="Grid View">Grid</button>
        <button class="tb-btn" id="btnFormView" data-action="switchView" data-action-arg="form" title="Form View">Form</button>
      </div>
    </div>

    <div class="filter-bar" id="filterBar">
      <div class="filter-conditions" id="filterConditions">
        <div class="filter-row" data-index="0">
          <select class="filter-col" data-action="onFilterColChange" data-action-arg="0"></select>
          <select class="filter-op" data-action="onFilterOpChange" data-action-arg="0">
            <option value="=">=</option>
            <option value="!=">!=</option>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&gt;=</option>
            <option value="<=">&lt;=</option>
            <option value="LIKE">LIKE</option>
            <option value="NOT LIKE">NOT LIKE</option>
            <option value="IN">IN</option>
            <option value="NOT IN">NOT IN</option>
            <option value="IS NULL">IS NULL</option>
            <option value="IS NOT NULL">IS NOT NULL</option>
            <option value="BETWEEN">BETWEEN</option>
          </select>
          <input type="text" class="filter-val" placeholder="Value">
          <button class="filter-remove-btn" data-action="removeFilterCondition" data-action-arg="0">×</button>
        </div>
      </div>
      <div class="filter-actions">
        <button class="btn btn-secondary" data-action="addFilterCondition" data-i18n="resultPanel.addCondition">+ Add Condition</button>
        <button class="btn btn-primary" data-action="applyFilter" data-i18n="resultPanel.applyFilter">Apply</button>
      </div>
    </div>

    <div class="panel-split" id="panelSplit">
      <div class="sql-editor-section" id="sqlEditorSection">
        <div class="sql-editor-toolbar">
          <span class="sql-label">SQL</span>
        </div>
        <div class="sql-editor-container" id="sqlEditorContainer"></div>
      </div>
      <div class="splitter" id="splitter">
        <div class="splitter-handle"></div>
      </div>
      <div class="result-section" id="resultSection">
        <div class="tab-content" id="tabContent">
          <div class="tab-page active" id="pageResult">
            <div class="grid-container" id="gridContainer">
              <div class="grid-header-wrapper" id="gridHeaderWrapper">
                <table class="grid-table grid-header-table" id="gridHeaderTable">
                  <thead>
                    <tr id="gridHeaderRow"></tr>
                  </thead>
                </table>
              </div>
              <div class="grid-body-wrapper" id="gridBodyWrapper">
                <div class="grid-spacer" id="gridSpacer"></div>
                <table class="grid-table grid-body-table" id="gridBodyTable">
                  <tbody id="gridBody"></tbody>
                </table>
              </div>
            </div>
            <div class="form-container" id="formContainer" style="display:none;">
                <div class="form-nav">
                    <button class="form-nav-btn" id="btnPrevRecord" data-action="navigateRecord" data-action-arg="-1">‹</button>
                    <span class="form-record-info" id="formRecordInfo">0/0</span>
                    <button class="form-nav-btn" id="btnNextRecord" data-action="navigateRecord" data-action-arg="1">›</button>
                </div>
                <div class="form-fields" id="formFields"></div>
            </div>
            <div class="empty-state" id="emptyState">
              <div class="empty-state-icon">—</div>
              <div data-i18n="resultPanel.noData">No query results</div>
            </div>
          </div>
          <div class="tab-page" id="pageMessages">
            <div class="messages-container" id="messagesContainer"></div>
          </div>
          <div class="tab-page" id="pageHistory">
            <div class="history-container" id="historyContainer"></div>
          </div>
        </div>
        <div class="bottom-bar">
          <div class="tab-bar">
            <button class="tab-btn active" data-tab="pageResult" data-action="switchTab" data-action-arg="pageResult" data-i18n="resultPanel.resultSet">结果集</button>
            <button class="tab-btn" data-tab="pageMessages" data-action="switchTab" data-action-arg="pageMessages" data-i18n="resultPanel.messages">消息</button>
            <button class="tab-btn" data-tab="pageHistory" data-action="switchTab" data-action-arg="pageHistory" data-i18n="resultPanel.history">历史</button>
          </div>
          <div class="status-bar">
            <span class="status-info" id="statusInfo"></span>
            <span class="edit-status" id="editStatus"></span>
            <span class="transaction-status" id="transactionStatus"></span>
            <div class="pagination" id="pagination">
              <button class="page-btn" id="btnPrevPage" data-action="changePage" data-action-arg="-1">‹</button>
              <span class="page-info" id="pageInfo"></span>
              <button class="page-btn" id="btnNextPage" data-action="changePage" data-action-arg="1">›</button>
              <input type="number" class="page-jump" id="pageJump" min="1" data-action="jumpToPage">
              <button class="page-btn" data-action="jumpToPage" data-i18n="resultPanel.go">Go</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" id="commitDialog" style="display:none;">
        <div class="dialog">
            <div class="dialog-header">提交更改确认</div>
            <div class="dialog-body">
                <div class="dialog-label">即将执行以下 SQL:</div>
                <pre class="dialog-sql" id="commitSqlPreview"></pre>
                <div class="dialog-summary" id="commitSummary"></div>
            </div>
            <div class="dialog-footer">
                <button class="btn btn-primary" data-action="confirmCommit">执行</button>
                <button class="btn btn-secondary" data-action="cancelCommit">取消</button>
            </div>
        </div>
    </div>
    <div class="dialog-overlay" id="blobDialog" style="display:none;">
        <div class="dialog dialog-wide">
            <div class="dialog-header">BLOB 预览</div>
            <div class="dialog-body">
                <div class="blob-tabs">
                    <button class="blob-tab active" data-action="switchBlobTab" data-action-arg="text">文本</button>
                    <button class="blob-tab" data-action="switchBlobTab" data-action-arg="hex">十六进制</button>
                    <button class="blob-tab" data-action="switchBlobTab" data-action-arg="image">图片</button>
                </div>
                <div class="blob-content" id="blobContent"></div>
            </div>
            <div class="dialog-footer">
                <button class="btn btn-secondary" data-action="closeBlobDialog">关闭</button>
            </div>
        </div>
    </div>
  </div>
  <script src="{{JS_URI}}"></script>
```

Key changes:
- Added `worker-src blob: {{CSP_SOURCE}};` to CSP for Monaco web workers
- Added `{{MONACO_LOADER_URI}}` script tag
- Wrapped `tab-content` + `bottom-bar` inside `result-section` within `panel-split`
- Added `sql-editor-section` with `sql-editor-toolbar` and `sql-editor-container`
- Added `splitter` between SQL editor and result section

- [ ] **Step 3: Commit**

```bash
git add media/query-result.html
git commit -m "feat: restructure HTML for SQL editor + result split layout"
```

---

### Task 5: Add CSS for split layout, splitter, Monaco container

**Files:**
- Modify: `media/query-result.css`

- [ ] **Step 1: Add split layout styles**

Append to `media/query-result.css`:

```css
.panel-split {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
}

.sql-editor-section {
    display: flex;
    flex-direction: column;
    height: 30%;
    min-height: 60px;
    overflow: hidden;
    border-bottom: none;
}

.sql-editor-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    height: 26px;
}

.sql-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.sql-editor-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.sql-editor-fallback {
    width: 100%;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    border: none;
    padding: 8px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: none;
    outline: none;
    tab-size: 4;
}

.splitter {
    height: 6px;
    cursor: row-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--border);
    flex-shrink: 0;
    transition: background var(--transition);
}

.splitter:hover {
    background: var(--border-hover);
}

.splitter-handle {
    width: 40px;
    height: 3px;
    border-radius: 2px;
    background: var(--text-secondary);
    opacity: 0.4;
    transition: opacity var(--transition), background var(--transition);
}

.splitter:hover .splitter-handle {
    opacity: 1;
    background: var(--focus-border);
}

.result-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 60px;
}

.result-section .tab-content {
    flex: 1;
    overflow: hidden;
    position: relative;
}

.result-section .bottom-bar {
    flex-shrink: 0;
}
```

- [ ] **Step 2: Adjust existing CSS — remove flex:1 from .tab-content at top level**

Find the existing `.tab-content` rule that has `flex: 1` and change it to not set flex at the top level (since it's now inside `.result-section`):

The existing rule:
```css
.tab-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}
```

Change to:
```css
.tab-content {
  overflow: hidden;
  position: relative;
}
```

The `flex: 1` is now set by `.result-section .tab-content` in the new styles above.

- [ ] **Step 3: Commit**

```bash
git add media/query-result.css
git commit -m "feat: add CSS for SQL editor + result split layout"
```

---

### Task 6: Add JavaScript — Monaco init, splitter drag, SQL execution, theme sync

**Files:**
- Modify: `media/query-result.js`

- [ ] **Step 1: Add Monaco editor state and initialization**

After the `state` object definition (around line 189), add:

```javascript
var monacoEditor = null;
var monacoLoaded = false;
```

After the `init()` function (around line 221), add:

```javascript
function initMonacoEditor(sql) {
    var container = document.getElementById('sqlEditorContainer');
    if (!container) return;

    if (typeof require === 'function' && !monacoLoaded) {
        require.config({ paths: { 'vs': state.monacoBasePath } });
        require(['vs/editor/editor.main'], function(monaco) {
            monacoLoaded = true;
            createMonacoInstance(monaco, container, sql);
        }, function() {
            createFallbackEditor(container, sql);
        });
    } else if (monacoLoaded && typeof monaco !== 'undefined') {
        createMonacoInstance(monaco, container, sql);
    } else {
        createFallbackEditor(container, sql);
    }
}

function createMonacoInstance(monaco, container, sql) {
    if (monacoEditor) {
        monacoEditor.setValue(sql || '');
        return;
    }
    var isDark = document.body.classList.contains('vscode-dark') ||
                 document.querySelector('[data-vscode-theme-kind="vscode-dark"]') ||
                 (window.__CONFIG__ && window.__CONFIG__.themeKind === 2);
    monacoEditor = monaco.editor.create(container, {
        value: sql || '',
        language: 'sql',
        theme: isDark ? 'vs-dark' : 'vs',
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
        scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
        },
        padding: { top: 4, bottom: 4 },
    });

    monacoEditor.addCommand(monaco.KeyMod.Cmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE, function() {
        executePanelSql();
    });
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE, function() {
        executePanelSql();
    });

    monacoEditor.focus();
}

function createFallbackEditor(container, sql) {
    var textarea = document.createElement('textarea');
    textarea.className = 'sql-editor-fallback';
    textarea.value = sql || '';
    container.appendChild(textarea);
}

function getEditorSql() {
    if (monacoEditor) {
        return monacoEditor.getValue();
    }
    var fallback = document.querySelector('.sql-editor-fallback');
    if (fallback) {
        return fallback.value;
    }
    return state.currentSql || '';
}

function setEditorSql(sql) {
    if (monacoEditor) {
        var fullRange = monacoEditor.getModel().getFullModelRange();
        monacoEditor.executeEdits('setSql', [{
            range: fullRange,
            text: sql || '',
        }]);
        monacoEditor.pushUndoStop();
    } else {
        var fallback = document.querySelector('.sql-editor-fallback');
        if (fallback) fallback.value = sql || '';
    }
    state.currentSql = sql || '';
}
```

- [ ] **Step 2: Add splitter drag logic**

After `setEditorSql` function, add:

```javascript
function initSplitter() {
    var splitter = document.getElementById('splitter');
    var sqlSection = document.getElementById('sqlEditorSection');
    var resultSection = document.getElementById('resultSection');
    var panelSplit = document.getElementById('panelSplit');
    var isDragging = false;

    if (!splitter || !sqlSection || !resultSection || !panelSplit) return;

    splitter.addEventListener('mousedown', function(e) {
        isDragging = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        var panelRect = panelSplit.getBoundingClientRect();
        var ratio = (e.clientY - panelRect.top) / panelRect.height;
        ratio = Math.max(0.1, Math.min(0.8, ratio));
        sqlSection.style.height = (ratio * 100) + '%';
        sqlSection.style.flex = 'none';
        resultSection.style.flex = '1';
    });

    document.addEventListener('mouseup', function() {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}
```

- [ ] **Step 3: Add executePanelSql function and handleSetEditorSql**

After `initSplitter` function, add:

```javascript
function executePanelSql() {
    var sql = getEditorSql().trim();
    if (!sql) return;
    state.currentSql = sql;
    vscode.postMessage({ command: 'executePanelSql', sql: sql });
}

function handleSetEditorSql(data) {
    var sql = data.sql || '';
    if (monacoEditor || document.querySelector('.sql-editor-fallback')) {
        setEditorSql(sql);
    } else {
        initMonacoEditor(sql);
    }
    if (data.autoExecute) {
        setTimeout(function() {
            executePanelSql();
        }, 100);
    }
}

function handleThemeChange(data) {
    if (!monacoEditor || typeof monaco === 'undefined') return;
    var theme = data.kind === 2 || data.kind === 3 ? 'vs-dark' : 'vs';
    monaco.editor.setTheme(theme);
}
```

- [ ] **Step 4: Update handleMessage to add new message types**

In the `handleMessage` function's switch statement, add new cases after the `blobPreview` case:

```javascript
        case 'setEditorSql':
            handleSetEditorSql(message.data);
            break;
        case 'themeChange':
            handleThemeChange(message.data);
            break;
```

- [ ] **Step 5: Update handleConfig to store monacoBasePath**

In the `handleConfig` function, add:

```javascript
    if (data.monacoBasePath !== undefined) state.monacoBasePath = data.monacoBasePath;
```

- [ ] **Step 6: Update init() to initialize splitter and Monaco**

In the `init()` function, add at the end:

```javascript
    initSplitter();
```

- [ ] **Step 7: Update handleExecute to use panel SQL**

Find the existing `handleExecute` function or the click handler for `btnExecute`. Change it to call `executePanelSql()` instead of sending `executeQuery` with `state.currentSql`. The existing code likely does:

```javascript
vscode.postMessage({ command: 'executeQuery', sql: state.currentSql });
```

Change to:

```javascript
executePanelSql();
```

- [ ] **Step 8: Update handleRefresh similarly**

Find the refresh handler and change it to also call `executePanelSql()`.

- [ ] **Step 9: Update handleQueryResult to also update currentSql**

In `handleQueryResult`, after setting `state.currentSql` (if it does), make sure it doesn't overwrite the editor content. The `currentSql` should reflect what was executed, but the editor content should only change via `setEditorSql` messages.

Find in `handleQueryResult`:
```javascript
state.currentSql = data.sql || state.currentSql;
```

If it exists, keep it — it's fine for tracking what was last executed.

- [ ] **Step 10: Commit**

```bash
git add media/query-result.js
git commit -m "feat: add Monaco editor init, splitter drag, SQL execution, theme sync"
```

---

### Task 7: Update QueryResultPanel.ts — new messages, methods, Monaco URIs

**Files:**
- Modify: `src/views/queryResult/QueryResultPanel.ts`

- [ ] **Step 1: Add new WebviewMessage type**

Find the `WebviewMessage` type union and add:

```typescript
    | { command: 'executePanelSql'; sql: string }
```

- [ ] **Step 2: Add onExecutePanelSql callback**

After the existing `onRollbackToSavepoint` callback, add:

```typescript
    public onExecutePanelSql?: (sql: string) => Promise<void>;
```

- [ ] **Step 3: Handle executePanelSql message**

In the `onDidReceiveMessage` switch statement, add a new case before the closing `}`:

```typescript
                    case 'executePanelSql':
                        if (message.sql && this.onExecutePanelSql) {
                            await this.onExecutePanelSql(message.sql);
                        }
                        break;
```

- [ ] **Step 4: Add setSqlAndExecute and setSql methods**

After the `showError` method, add:

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

- [ ] **Step 5: Update _getHtmlForWebview to add Monaco loader URI and config**

In `_getHtmlForWebview`, after the existing URI creation (cssUri, jsUri), add:

```typescript
            const monacoLoaderUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs', 'loader.js')
            );
            const monacoBaseUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'monaco', 'vs')
            );
```

Add to the `configData` object:

```typescript
                monacoBasePath: monacoBaseUri.toString(),
                themeKind: vscode.window.activeColorTheme.kind,
```

Add the Monaco loader URI replacement:

```typescript
            html = html.replace('{{MONACO_LOADER_URI}}', monacoLoaderUri.toString());
```

- [ ] **Step 6: Add theme change listener**

In the constructor, after `this._update();`, add:

```typescript
        this._disposables.push(
            vscode.window.onDidChangeActiveColorTheme((theme) => {
                this._panel.webview.postMessage({
                    type: 'themeChange',
                    data: { kind: theme.kind },
                });
            })
        );
```

- [ ] **Step 7: Update localResourceRoots to include monaco directory**

Find the `localResourceRoots` in `createOrShow` and ensure it includes the media directory (it already should since it lists `vscode.Uri.joinPath(extensionUri, 'media')`). No change needed if it's already there.

- [ ] **Step 8: Run compile to verify**

Run:
```bash
cd /Users/hao/Downloads/sql-all-in-one && npm run compile
```
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/views/queryResult/QueryResultPanel.ts
git commit -m "feat: add setSqlAndExecute, onExecutePanelSql, Monaco URIs to QueryResultPanel"
```

---

### Task 8: Update SchemaCommands.ts — viewTableData uses setSqlAndExecute

**Files:**
- Modify: `src/database/commands/SchemaCommands.ts`

- [ ] **Step 1: Replace direct execution with setSqlAndExecute**

Find the `viewTableData` command handler (around line 44-182). The key section to change is around lines 60-176 where it currently does:

```typescript
const sql = `SELECT * FROM ${quotedName} LIMIT 100;`;

if (!queryResultPanel) {
    queryResultPanel = QueryResultPanel.createOrShow(context.extensionUri, context);
    // ... callback registrations ...
} else {
    queryResultPanel.showLoading(sql);
}

const result = await queryExecutor.execute(adapter, sql, ...);
if (result.status === 'error') {
    queryResultPanel.showError(result.error as QueryError);
} else {
    queryResultPanel.showResult(result, ...);
}
```

Replace the entire execution block with:

```typescript
const sql = `SELECT * FROM ${quotedName} LIMIT 100;`;

if (!queryResultPanel) {
    queryResultPanel = QueryResultPanel.createOrShow(context.extensionUri, context);
    registerQueryResultCallbacks(queryResultPanel, queryExecutor, outputChannel);
} else {
    queryResultPanel.showLoading(sql);
}

queryResultPanel.setSqlAndExecute(sql);
```

Extract the callback registrations into a helper function `registerQueryResultCallbacks` that both `SchemaCommands.ts` and `QueryCommands.ts` can use. This function will be defined in Task 9.

- [ ] **Step 2: Commit**

```bash
git add src/database/commands/SchemaCommands.ts
git commit -m "feat: viewTableData uses setSqlAndExecute for panel SQL execution"
```

---

### Task 9: Update QueryCommands.ts — register onExecutePanelSql callback

**Files:**
- Modify: `src/database/commands/QueryCommands.ts`

- [ ] **Step 1: Add onExecutePanelSql callback registration**

In the `executeQuery` command handler, after the existing callback registrations (around line 138), add:

```typescript
            queryResultPanel.onExecutePanelSql = async (sql: string): Promise<void> => {
                try {
                    const connectionManager = getConnectionManager();
                    const activeConn = connectionManager.getActiveConnection();
                    const adapter = activeConn
                        ? connectionManager.getAdapter(activeConn.id)
                        : undefined;

                    if (!adapter) {
                        queryResultPanel.showError({
                            code: 'NO_CONNECTION',
                            message: 'No active database connection',
                            sql,
                        });
                        return;
                    }

                    queryResultPanel.showLoading(sql);
                    const result = await queryExecutor.execute(
                        adapter,
                        sql,
                        { database: activeConn?.database },
                        activeConn?.id
                    );

                    if (result.status === 'error') {
                        outputChannel.appendLine(`❌ Error: ${result.error?.message || 'Unknown error'}`);
                        outputChannel.appendLine(`   SQL: ${sql}`);
                        queryResultPanel.showError(result.error as QueryError);
                    } else {
                        outputChannel.appendLine(`✅ Query executed successfully (${result.executionTime}ms, ${result.rowCount} rows)`);
                        outputChannel.appendLine(`   SQL: ${sql}`);
                        queryResultPanel.showResult(result, activeConn?.name, activeConfig?.color);
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    queryResultPanel.showError({
                        code: 'EXEC_ERROR',
                        message: msg,
                        sql,
                    });
                }
            };
```

Note: `activeConfig` is already defined in the outer scope (line 228 in the original code as `activeConfig`). Make sure this reference is valid.

- [ ] **Step 2: Also register the same callback in SchemaCommands.ts**

In `SchemaCommands.ts`, add the same `onExecutePanelSql` callback after `registerQueryResultCallbacks` is called. The simplest approach: add it inline in the `viewTableData` handler after `setSqlAndExecute`:

```typescript
queryResultPanel.onExecutePanelSql = async (sql: string): Promise<void> => {
    try {
        const conn = getConnectionManager().getAllConnections().find(c => c.id === node.connectionId);
        const adapter = getConnectionManager().getAdapter(node.connectionId);
        if (!adapter) {
            queryResultPanel.showError({ code: 'NO_CONNECTION', message: 'No active connection', sql });
            return;
        }
        queryResultPanel.showLoading(sql);
        const result = await queryExecutor.execute(adapter, sql, { database: node.databaseName }, node.connectionId);
        if (result.status === 'error') {
            queryResultPanel.showError(result.error as QueryError);
        } else {
            queryResultPanel.showResult(result, conn?.name, conn?.color, name);
        }
    } catch (error) {
        queryResultPanel.showError({ code: 'EXEC_ERROR', message: String(error), sql });
    }
};
queryResultPanel.setSqlAndExecute(sql);
```

- [ ] **Step 3: Run compile to verify**

Run:
```bash
cd /Users/hao/Downloads/sql-all-in-one && npm run compile
```
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/database/commands/QueryCommands.ts src/database/commands/SchemaCommands.ts
git commit -m "feat: register onExecutePanelSql callback for panel SQL execution"
```

---

### Task 10: Update DatabaseTreeProvider.ts — TableTreeNode default click command

**Files:**
- Modify: `src/views/databaseExplorer/DatabaseTreeProvider.ts`

- [ ] **Step 1: Add default click command for TableTreeNode**

In the `getCommandForNode` method (around line 150), add a case for `TableTreeNode` after the `ViewTreeNode` case:

```typescript
        if (element instanceof TableTreeNode) {
            return {
                command: 'sql-all-in-one.viewTableData',
                title: 'Query Data',
                arguments: [element]
            };
        }
```

This goes after the `ViewTreeNode` case (line 161-167) and before the `ColumnTreeNode` case (line 168).

- [ ] **Step 2: Run compile to verify**

Run:
```bash
cd /Users/hao/Downloads/sql-all-in-one && npm run compile
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/views/databaseExplorer/DatabaseTreeProvider.ts
git commit -m "feat: add default click command for TableTreeNode to query data"
```

---

### Task 11: Sync changes to src/views/queryResult/ files

**Files:**
- Modify: `src/views/queryResult/resultPanel.html`
- Modify: `src/views/queryResult/resultPanel.css`
- Modify: `src/views/queryResult/resultPanel.js`

- [ ] **Step 1: Copy changes from media/ to src/views/queryResult/**

The project has two sets of resource files. The actual runtime uses `media/` files (loaded by `QueryResultPanel.ts`). The `src/views/queryResult/` files are the source copies. Sync them:

```bash
cp media/query-result.html src/views/queryResult/resultPanel.html
cp media/query-result.css src/views/queryResult/resultPanel.css
cp media/query-result.js src/views/queryResult/resultPanel.js
```

- [ ] **Step 2: Commit**

```bash
git add src/views/queryResult/
git commit -m "feat: sync query data panel changes to src/views/queryResult"
```

---

### Task 12: Integration test — manual verification

**Files:** None (manual testing)

- [ ] **Step 1: Build and package the extension**

Run:
```bash
cd /Users/hao/Downloads/sql-all-in-one && npm run compile
```

- [ ] **Step 2: Launch extension in development mode**

Press F5 in VS Code to launch Extension Development Host.

- [ ] **Step 3: Test double-click table node**

1. Open SQL All in One database explorer
2. Connect to a MySQL database
3. Double-click a table node
4. Verify: Query Data panel opens with SQL editor showing `SELECT * FROM \`db\`.\`table\` LIMIT 100;`
5. Verify: Query auto-executes and results show in bottom section

- [ ] **Step 4: Test right-click "Query Data"**

1. Right-click a table node
2. Select "Query Data"
3. Verify: Same behavior as double-click

- [ ] **Step 5: Test SQL editing and re-execution**

1. Modify the SQL in the editor (e.g., add WHERE clause)
2. Click ▶ Run button
3. Verify: New query executes and results update

- [ ] **Step 6: Test Cmd+Shift+E shortcut**

1. Click inside the SQL editor
2. Press Cmd+Shift+E
3. Verify: Query executes

- [ ] **Step 7: Test splitter drag**

1. Drag the splitter up and down
2. Verify: SQL editor and result section resize smoothly
3. Verify: Cannot drag beyond 10%-80% bounds

- [ ] **Step 8: Test result features**

1. Verify grid view works
2. Verify form view works
3. Verify sorting by clicking column headers
4. Verify filter bar
5. Verify export dropdown
6. Verify edit mode toggle

- [ ] **Step 9: Test view node**

1. Double-click or right-click a view node
2. Verify: Same behavior as table — SQL editor opens with SELECT * and auto-executes

- [ ] **Step 10: Test theme change**

1. Switch VS Code theme from dark to light
2. Verify: Monaco editor theme updates accordingly

- [ ] **Step 11: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration test fixes for query data panel"
```
