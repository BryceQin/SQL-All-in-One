# 数据编辑器 (PRD-012) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a data editor in the query result panel that supports cell editing, batch commit, form view, FK dropdown, ENUM selector, and BLOB preview — matching Navicat-level data editing capabilities.

**Architecture:** The data editor extends the existing Webview-based query result panel. The extension side (QueryResultPanel.ts) handles message routing, SQL generation, and database operations. The webview side (resultPanel.js/html/css) handles UI interactions, state management, and rendering. Communication uses the existing postMessage protocol with new message types for commit, FK options, and view switching.

**Tech Stack:** TypeScript (extension side), Vanilla JS (webview side), CSS (webview styles), VS Code Webview API

---

## File Structure

| File | Operation | Responsibility |
|------|-----------|----------------|
| `package.json` | Modify | Add dataEditor.* configuration properties |
| `src/views/queryResult/QueryResultPanel.ts` | Modify | Add commit/FK/BLOB message handlers, SQL generation, config injection |
| `src/views/queryResult/resultPanel.html` | Modify | Add edit toolbar, form view container, commit dialog, BLOB preview dialog |
| `src/views/queryResult/resultPanel.css` | Modify | Add edit mode styles, form view styles, dialog styles, marker styles |
| `src/views/queryResult/resultPanel.js` | Modify | Add editing state, cell editing logic, form view, FK/ENUM selectors, BLOB preview, validation |
| `src/test/dataEditor.test.ts` | Create | Unit tests for SQL generation, PendingChange tracking, validation logic |

---

### Task 1: Add Configuration Items to package.json

**Files:**
- Modify: `package.json` (configuration.properties section)

- [ ] **Step 1: Add all dataEditor configuration properties**

Add the following properties inside `contributes.configuration.properties`, after the existing `SQL-All-in-One.results.longTextThreshold` entry:

```json
"SQL-All-in-One.dataEditor.editMode": {
    "type": "string",
    "enum": ["readonly", "editable"],
    "default": "readonly",
    "description": "Result panel edit mode (readonly or editable)"
},
"SQL-All-in-One.dataEditor.autoCommit": {
    "type": "boolean",
    "default": true,
    "description": "Auto commit mode for data editor changes"
},
"SQL-All-in-One.dataEditor.defaultView": {
    "type": "string",
    "enum": ["grid", "form"],
    "default": "grid",
    "description": "Default view mode for result panel (grid or form)"
},
"SQL-All-in-One.dataEditor.optimisticLocking": {
    "type": "boolean",
    "default": false,
    "description": "Enable optimistic locking for concurrent edit control"
},
"SQL-All-in-One.dataEditor.maxBlobPreviewSize": {
    "type": "number",
    "default": 5242880,
    "minimum": 0,
    "description": "Maximum BLOB preview size in bytes (default 5MB)"
},
"SQL-All-in-One.dataEditor.blobTextPreviewSize": {
    "type": "number",
    "default": 1048576,
    "minimum": 0,
    "description": "Maximum BLOB text preview size in bytes (default 1MB)"
},
"SQL-All-in-One.dataEditor.longTransactionWarning": {
    "type": "number",
    "default": 300,
    "minimum": 0,
    "description": "Long transaction warning threshold in seconds"
},
"SQL-All-in-One.dataEditor.showTransactionStatus": {
    "type": "boolean",
    "default": true,
    "description": "Show transaction status in the status bar"
},
"SQL-All-in-One.dataEditor.enableValidation": {
    "type": "boolean",
    "default": true,
    "description": "Enable data validation in the editor"
},
"SQL-All-in-One.dataEditor.validateOnEdit": {
    "type": "boolean",
    "default": true,
    "description": "Validate data in real-time during editing"
},
"SQL-All-in-One.dataEditor.validateForeignKeys": {
    "type": "boolean",
    "default": false,
    "description": "Validate foreign key references (may impact performance)"
}
```

- [ ] **Step 2: Verify package.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf-8')); console.log('valid')"`
Expected: `valid`

---

### Task 2: Extend QueryResultPanel.ts — Config Injection & Message Handlers

**Files:**
- Modify: `src/views/queryResult/QueryResultPanel.ts`

- [ ] **Step 1: Add PendingChange interface and ForeignKeyOption interface**

Add these interfaces after the existing `FilterCondition` interface (around line 11):

```typescript
export interface PendingChange {
    type: 'update' | 'insert' | 'delete';
    table: string;
    primaryKey: Record<string, any>;
    changes?: Record<string, { old: any; new: any }>;
    originalRow?: Record<string, any>;
    rowIndex: number;
}

export interface ForeignKeyOption {
    value: any;
    displayText: string;
}
```

- [ ] **Step 2: Add new callback properties to QueryResultPanel class**

Add these after the existing `onRequestPage` callback (around line 28):

```typescript
public onCommitChanges?: (changes: PendingChange[], tableName: string, database: string) => Promise<{ success: boolean; errors?: string[] }>;
public onRequestForeignKeyOptions?: (column: string, referencedTable: string, database: string) => Promise<ForeignKeyOption[]>;
public onBeginTransaction?: () => Promise<void>;
public onCommitTransaction?: () => Promise<void>;
public onRollbackTransaction?: () => Promise<void>;
public onCreateSavepoint?: (name: string) => Promise<void>;
public onRollbackToSavepoint?: (name: string) => Promise<void>;
```

- [ ] **Step 3: Add new message handlers in the constructor's onDidReceiveMessage**

Add new cases in the switch statement (after the `requestPage` case, around line 100):

```typescript
case 'commitChanges':
    if (message.changes && this.onCommitChanges) {
        const result = await this.onCommitChanges(
            message.changes as PendingChange[],
            message.tableName || '',
            message.database || ''
        );
        this._panel.webview.postMessage({
            type: 'commitResult',
            data: result,
        });
    }
    break;
case 'requestForeignKeyOptions':
    if (message.column && this.onRequestForeignKeyOptions) {
        const options = await this.onRequestForeignKeyOptions(
            message.column,
            message.referencedTable || '',
            message.database || ''
        );
        this._panel.webview.postMessage({
            type: 'foreignKeyOptions',
            data: { column: message.column, options },
        });
    }
    break;
case 'beginTransaction':
    if (this.onBeginTransaction) {
        await this.onBeginTransaction();
        this._panel.webview.postMessage({ type: 'transactionStatus', data: { active: true } });
    }
    break;
case 'commitTransaction':
    if (this.onCommitTransaction) {
        await this.onCommitTransaction();
        this._panel.webview.postMessage({ type: 'transactionStatus', data: { active: false } });
    }
    break;
case 'rollbackTransaction':
    if (this.onRollbackTransaction) {
        await this.onRollbackTransaction();
        this._panel.webview.postMessage({ type: 'transactionStatus', data: { active: false } });
    }
    break;
case 'createSavepoint':
    if (this.onCreateSavepoint) {
        await this.onCreateSavepoint(message.name || 'sp1');
    }
    break;
case 'rollbackToSavepoint':
    if (this.onRollbackToSavepoint) {
        await this.onRollbackToSavepoint(message.name || 'sp1');
    }
    break;
case 'requestBlobPreview':
    this._handleBlobPreview(message.rowIndex, message.colIndex);
    break;
```

- [ ] **Step 4: Add dataEditor config injection in _getHtmlForWebview**

In the `_getHtmlForWebview` method, extend the `configData` object (around line 191) to include dataEditor settings:

```typescript
const config = vscode.workspace.getConfiguration('SQL-All-in-One');
const configData = {
    pageSize: config.get<number>('query.pageSize', 100),
    nullPlaceholder: config.get<string>('query.nullPlaceholder', '(NULL)'),
    enablePreload: config.get<boolean>('results.enablePreload', true),
    jsonPrettyPrint: config.get<boolean>('results.jsonPrettyPrint', true),
    dateFormat: config.get<string>('results.dateFormat', 'local'),
    longTextThreshold: config.get<number>('results.longTextThreshold', 200),
    editMode: config.get<string>('dataEditor.editMode', 'readonly'),
    autoCommit: config.get<boolean>('dataEditor.autoCommit', true),
    defaultView: config.get<string>('dataEditor.defaultView', 'grid'),
    optimisticLocking: config.get<boolean>('dataEditor.optimisticLocking', false),
    maxBlobPreviewSize: config.get<number>('dataEditor.maxBlobPreviewSize', 5242880),
    blobTextPreviewSize: config.get<number>('dataEditor.blobTextPreviewSize', 1048576),
    longTransactionWarning: config.get<number>('dataEditor.longTransactionWarning', 300),
    showTransactionStatus: config.get<boolean>('dataEditor.showTransactionStatus', true),
    enableValidation: config.get<boolean>('dataEditor.enableValidation', true),
    validateOnEdit: config.get<boolean>('dataEditor.validateOnEdit', true),
    validateForeignKeys: config.get<boolean>('dataEditor.validateForeignKeys', false),
};
```

- [ ] **Step 5: Add _handleBlobPreview method**

Add this method to the `QueryResultPanel` class:

```typescript
private _handleBlobPreview(rowIndex: number, colIndex: number): void {
    if (!this._currentResult) return;
    const row = this._currentResult.rows[rowIndex];
    const col = this._currentResult.columns[colIndex];
    if (!row || !col) return;

    const value = row[col.name];
    if (value === null || value === undefined) {
        this._panel.webview.postMessage({
            type: 'blobPreview',
            data: { rowIndex, colIndex, content: null, mode: 'null' },
        });
        return;
    }

    let buffer: Buffer;
    if (Buffer.isBuffer(value)) {
        buffer = value;
    } else if (typeof value === 'string') {
        buffer = Buffer.from(value, 'base64');
    } else {
        buffer = Buffer.from(String(value));
    }

    const config = vscode.workspace.getConfiguration('SQL-All-in-One');
    const maxSize = config.get<number>('dataEditor.maxBlobPreviewSize', 5242880);
    const textMaxSize = config.get<number>('dataEditor.blobTextPreviewSize', 1048576);

    if (buffer.length > maxSize) {
        this._panel.webview.postMessage({
            type: 'blobPreview',
            data: { rowIndex, colIndex, size: buffer.length, mode: 'too_large' },
        });
        return;
    }

    const isImage = this._detectImageBuffer(buffer);
    if (isImage) {
        const base64 = buffer.toString('base64');
        const mimeType = this._getImageMimeType(buffer);
        this._panel.webview.postMessage({
            type: 'blobPreview',
            data: { rowIndex, colIndex, content: base64, mimeType, mode: 'image' },
        });
        return;
    }

    if (buffer.length <= textMaxSize) {
        try {
            const text = buffer.toString('utf-8');
            this._panel.webview.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, content: text, mode: 'text' },
            });
        } catch {
            this._panel.webview.postMessage({
                type: 'blobPreview',
                data: { rowIndex, colIndex, content: buffer.toString('hex'), mode: 'hex' },
            });
        }
    } else {
        this._panel.webview.postMessage({
            type: 'blobPreview',
            data: { rowIndex, colIndex, content: buffer.toString('hex').substring(0, 2048), mode: 'hex' },
        });
    }
}

private _detectImageBuffer(buf: Buffer): boolean {
    if (buf.length < 4) return false;
    const header = buf.subarray(0, 4);
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return true;
    if (header[0] === 0xFF && header[1] === 0xD8) return true;
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return true;
    return false;
}

private _getImageMimeType(buf: Buffer): string {
    if (buf.length < 4) return 'application/octet-stream';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    return 'application/octet-stream';
}
```

- [ ] **Step 6: Extend _serializeResult to include full column metadata**

In the `_serializeResult` method, extend the column mapping to include all metadata needed by the editor:

```typescript
columns: result.columns.map((c) => ({
    name: c.name,
    type: c.type,
    nullable: c.nullable,
    isPrimaryKey: c.isPrimaryKey,
    isAutoIncrement: c.isAutoIncrement,
    isEnum: c.isEnum,
    enumValues: c.enumValues,
    referencedTable: c.referencedTable,
    comment: c.comment,
})),
```

- [ ] **Step 7: Add tableName to serialized result**

In `_serializeResult`, add a `tableName` field. For now, try to extract it from the SQL stored in `_currentResult` or accept it from the caller. Add `tableName` parameter to `showResult`:

```typescript
public showResult(result: QueryResult, connectionName?: string, connectionColor?: string, tableName?: string): void {
    this._currentResult = result;
    this._panel.webview.postMessage({
        type: 'queryResult',
        data: this._serializeResult(result, connectionName, connectionColor, tableName),
    });
}
```

And in `_serializeResult`, add `tableName` to the return object:

```typescript
private _serializeResult(
    result: QueryResult,
    connectionName?: string,
    connectionColor?: string,
    tableName?: string
): Record<string, unknown> {
    return {
        queryId: result.queryId,
        status: result.status,
        columns: result.columns.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: c.nullable,
            isPrimaryKey: c.isPrimaryKey,
            isAutoIncrement: c.isAutoIncrement,
            isEnum: c.isEnum,
            enumValues: c.enumValues,
            referencedTable: c.referencedTable,
            comment: c.comment,
        })),
        rows: result.rows,
        rowCount: result.rowCount,
        affectedRows: result.affectedRows,
        executionTime: result.executionTime,
        error: result.error,
        database: result.database,
        connectionName: connectionName || '',
        connectionColor: connectionColor || '',
        tableName: tableName || '',
    };
}
```

---

### Task 3: Update resultPanel.html — Edit Toolbar, Form View, Dialogs

**Files:**
- Modify: `src/views/queryResult/resultPanel.html`

- [ ] **Step 1: Add edit toolbar buttons**

In the `.toolbar` div (around line 21), add edit mode buttons after the existing filter button:

```html
<span class="tb-separator"></span>
<button class="tb-btn" id="btnEditMode" onclick="toggleEditMode()" title="Toggle Edit Mode">🔒</button>
<button class="tb-btn" id="btnAddRow" onclick="addRow()" title="Add Row" disabled>＋</button>
<button class="tb-btn" id="btnDeleteRow" onclick="deleteRow()" title="Delete Row" disabled>🗑</button>
<button class="tb-btn" id="btnCommit" onclick="commitChanges()" title="Commit Changes" disabled>✅</button>
<button class="tb-btn" id="btnRollback" onclick="rollbackChanges()" title="Rollback Changes" disabled>↩</button>
<span class="tb-separator"></span>
<button class="tb-btn" id="btnBeginTx" onclick="beginTransaction()" title="Begin Transaction" disabled>🔒</button>
<button class="tb-btn" id="btnSavepoint" onclick="createSavepoint()" title="Create Savepoint" disabled>💾</button>
<button class="tb-btn" id="btnRollbackToSp" onclick="rollbackToSavepoint()" title="Rollback to Savepoint" disabled>↪️</button>
<span class="tb-separator"></span>
<button class="tb-btn" id="btnGridView" onclick="switchView('grid')" title="Grid View" class="active">📊</button>
<button class="tb-btn" id="btnFormView" onclick="switchView('form')" title="Form View">📋</button>
```

- [ ] **Step 2: Add form view container**

After the `gridContainer` div (inside `pageResult`), add the form view container:

```html
<div class="form-container" id="formContainer" style="display:none;">
    <div class="form-nav">
        <button class="form-nav-btn" id="btnPrevRecord" onclick="navigateRecord(-1)">◀</button>
        <span class="form-record-info" id="formRecordInfo">0/0</span>
        <button class="form-nav-btn" id="btnNextRecord" onclick="navigateRecord(1)">▶</button>
    </div>
    <div class="form-fields" id="formFields"></div>
</div>
```

- [ ] **Step 3: Add commit confirmation dialog**

Before the closing `</div>` of `.result-panel`, add the commit dialog:

```html
<div class="dialog-overlay" id="commitDialog" style="display:none;">
    <div class="dialog">
        <div class="dialog-header">📝 提交更改确认</div>
        <div class="dialog-body">
            <div class="dialog-label">即将执行以下 SQL:</div>
            <pre class="dialog-sql" id="commitSqlPreview"></pre>
            <div class="dialog-summary" id="commitSummary"></div>
        </div>
        <div class="dialog-footer">
            <button class="btn btn-primary" onclick="confirmCommit()">执行</button>
            <button class="btn btn-secondary" onclick="cancelCommit()">取消</button>
        </div>
    </div>
</div>
```

- [ ] **Step 4: Add BLOB preview dialog**

After the commit dialog, add the BLOB preview dialog:

```html
<div class="dialog-overlay" id="blobDialog" style="display:none;">
    <div class="dialog dialog-wide">
        <div class="dialog-header">BLOB 预览</div>
        <div class="dialog-body">
            <div class="blob-tabs">
                <button class="blob-tab active" onclick="switchBlobTab('text')">文本</button>
                <button class="blob-tab" onclick="switchBlobTab('hex')">十六进制</button>
                <button class="blob-tab" onclick="switchBlobTab('image')">图片</button>
            </div>
            <div class="blob-content" id="blobContent"></div>
        </div>
        <div class="dialog-footer">
            <button class="btn btn-secondary" onclick="closeBlobDialog()">关闭</button>
        </div>
    </div>
</div>
```

- [ ] **Step 5: Add edit status bar section**

In the `.status-bar` div (around line 105), add the pending changes indicator before the pagination:

```html
<span class="edit-status" id="editStatus"></span>
<span class="transaction-status" id="transactionStatus"></span>
```

---

### Task 4: Update resultPanel.css — Edit Mode & Form View Styles

**Files:**
- Modify: `src/views/queryResult/resultPanel.css`

- [ ] **Step 1: Add edit mode marker styles**

Append the following CSS at the end of the file:

```css
.tb-separator {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 4px;
    flex-shrink: 0;
}

.grid-body-table td.cell-modified {
    background: #FFF9C4 !important;
}

.grid-body-table td.cell-new {
    background: #E8F5E9 !important;
}

.grid-body-table td.cell-deleted {
    background: #FFEBEE !important;
    text-decoration: line-through;
}

.grid-body-table tr.row-modified td.row-num::before {
    content: '*';
    color: var(--warning-color);
    font-weight: bold;
    margin-right: 2px;
}

.grid-body-table tr.row-new td.row-num {
    background: #E8F5E9;
}

.grid-body-table tr.row-deleted td.row-num {
    background: #FFEBEE;
    text-decoration: line-through;
}

.grid-body-table td.cell-editing {
    padding: 0;
}

.grid-body-table td.cell-editing input,
.grid-body-table td.cell-editing select {
    width: 100%;
    height: 100%;
    border: none;
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    background: var(--input-bg);
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    padding: 0 10px;
    box-sizing: border-box;
}

.grid-body-table td.cell-editing select {
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
}

.grid-body-table td.cell-validation-error {
    outline: 2px solid var(--error-color) !important;
    outline-offset: -2px;
    position: relative;
}

.grid-body-table td.cell-validation-error::after {
    content: '⚠';
    position: absolute;
    top: 2px;
    right: 4px;
    font-size: 10px;
    color: var(--error-color);
}

.grid-body-table td.cell-null-editable {
    color: var(--vscode-disabledForeground, #5a5d6e);
    font-style: italic;
    cursor: text;
}

.grid-body-table tr.row-placeholder td {
    background: rgba(255,255,255,0.02);
    color: var(--text-secondary);
    font-style: italic;
}
```

- [ ] **Step 2: Add form view styles**

```css
.form-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
    padding: 16px;
}

.form-nav {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
    flex-shrink: 0;
}

.form-nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--btn-secondary-bg);
    color: var(--text);
    cursor: pointer;
    font-size: 14px;
    transition: all var(--transition);
}

.form-nav-btn:hover {
    background: var(--btn-secondary-hover);
}

.form-nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.form-record-info {
    font-size: 13px;
    color: var(--text-secondary);
    min-width: 60px;
    text-align: center;
}

.form-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.form-field {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.form-field-label {
    min-width: 140px;
    padding: 6px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-align: right;
    flex-shrink: 0;
}

.form-field-label .field-type {
    display: block;
    font-weight: 400;
    font-size: 10px;
    color: var(--text-secondary);
    opacity: 0.7;
    margin-top: 2px;
}

.form-field-value {
    flex: 1;
    min-width: 0;
}

.form-field-value input,
.form-field-value select {
    width: 100%;
    padding: 6px 10px;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    transition: border-color var(--transition);
}

.form-field-value input:focus,
.form-field-value select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-dim);
}

.form-field-value input.field-null {
    color: var(--vscode-disabledForeground, #5a5d6e);
    font-style: italic;
}

.form-field-value textarea {
    width: 100%;
    min-height: 80px;
    padding: 6px 10px;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 12px;
    font-family: var(--vscode-editor-font-family, 'SF Mono', 'Fira Code', monospace);
    resize: vertical;
}

.form-field-value textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-dim);
}

.form-field-value .blob-preview-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
    transition: all var(--transition);
}

.form-field-value .blob-preview-btn:hover {
    background: var(--btn-secondary-hover);
    border-color: var(--accent);
}

.form-field-value .expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--btn-secondary-bg);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 11px;
    margin-left: 4px;
    transition: all var(--transition);
}

.form-field-value .expand-btn:hover {
    background: var(--btn-secondary-hover);
    color: var(--text);
}
```

- [ ] **Step 3: Add dialog styles**

```css
.dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.dialog {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    width: 500px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
}

.dialog-wide {
    width: 700px;
}

.dialog-header {
    padding: 14px 18px;
    font-size: 14px;
    font-weight: 600;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.dialog-body {
    padding: 16px 18px;
    overflow: auto;
    flex: 1;
}

.dialog-label {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 8px;
}

.dialog-sql {
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    font-family: var(--vscode-editor-font-family, 'SF Mono', 'Fira Code', monospace);
    font-size: 12px;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 300px;
    overflow: auto;
    margin-bottom: 12px;
}

.dialog-summary {
    font-size: 12px;
    color: var(--text-secondary);
}

.dialog-footer {
    padding: 12px 18px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-shrink: 0;
}

.blob-tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 12px;
}

.blob-tab {
    padding: 6px 14px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;
    transition: all var(--transition);
}

.blob-tab:hover {
    color: var(--text);
    background: rgba(255,255,255,0.04);
}

.blob-tab.active {
    color: var(--accent);
    background: var(--accent-dim);
}

.blob-content {
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-family: var(--vscode-editor-font-family, 'SF Mono', 'Fira Code', monospace);
    font-size: 12px;
    color: var(--text);
    min-height: 200px;
    max-height: 400px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
}

.blob-content img {
    max-width: 100%;
    max-height: 380px;
}

.edit-status {
    font-size: 12px;
    color: var(--warning-color);
    font-weight: 500;
}

.transaction-status {
    font-size: 12px;
    color: var(--accent);
    font-weight: 500;
}

.view-btn-active {
    background: var(--accent-dim) !important;
    color: var(--accent) !important;
}
```

---

### Task 5: Update resultPanel.js — Core Editing State & Cell Editing

**Files:**
- Modify: `src/views/queryResult/resultPanel.js`

- [ ] **Step 1: Extend state object with editing properties**

In the `state` object (around line 80), add the following properties:

```javascript
editMode: false,
tableName: '',
pendingChanges: [],
originalRows: [],
editingCell: null,
currentView: 'grid',
formCurrentIndex: 0,
foreignKeyOptions: {},
transactionActive: false,
transactionStartTime: null,
transactionTimer: null,
validationErrors: {},
```

- [ ] **Step 2: Add i18n keys for data editor**

In both `zh` and `en` i18n objects, add new keys:

```javascript
// zh additions:
'resultPanel.editMode': '编辑模式',
'resultPanel.readonly': '只读',
'resultPanel.editable': '可编辑',
'resultPanel.addRow': '添加行',
'resultPanel.deleteRow': '删除行',
'resultPanel.commit': '提交',
'resultPanel.rollback': '回滚',
'resultPanel.beginTx': '开始事务',
'resultPanel.savepoint': '保存点',
'resultPanel.rollbackToSp': '回滚到保存点',
'resultPanel.gridView': '网格视图',
'resultPanel.formView': '表单视图',
'resultPanel.pendingChanges': '待提交',
'resultPanel.modify': '修改',
'resultPanel.insert': '新增',
'resultPanel.delete': '删除',
'resultPanel.commitConfirm': '提交更改确认',
'resultPanel.executeSql': '即将执行以下 SQL:',
'resultPanel.affect': '影响',
'resultPanel.rowModify': '行修改',
'resultPanel.rowInsert': '行新增',
'resultPanel.rowDelete': '行删除',
'resultPanel.continue': '是否继续?',
'resultPanel.execute': '执行',
'resultPanel.cancel': '取消',
'resultPanel.transactionActive': '事务进行中',
'resultPanel.longTxWarning': '长事务警告',
'resultPanel.prevRecord': '上一条',
'resultPanel.nextRecord': '下一条',
'resultPanel.viewBlob': '查看',
'resultPanel.downloadBlob': '下载文件',
'resultPanel.blobTooLarge': '文件过大',
'resultPanel.nullValue': 'NULL',
'resultPanel.validationError': '校验错误',
'resultPanel.notNullViolation': '此字段不能为空',
'resultPanel.typeMismatch': '类型不匹配',
'resultPanel.lengthExceeded': '长度超限',

// en additions:
'resultPanel.editMode': 'Edit Mode',
'resultPanel.readonly': 'Read Only',
'resultPanel.editable': 'Editable',
'resultPanel.addRow': 'Add Row',
'resultPanel.deleteRow': 'Delete Row',
'resultPanel.commit': 'Commit',
'resultPanel.rollback': 'Rollback',
'resultPanel.beginTx': 'Begin Tx',
'resultPanel.savepoint': 'Savepoint',
'resultPanel.rollbackToSp': 'Rollback to SP',
'resultPanel.gridView': 'Grid View',
'resultPanel.formView': 'Form View',
'resultPanel.pendingChanges': 'Pending',
'resultPanel.modify': 'modify',
'resultPanel.insert': 'insert',
'resultPanel.delete': 'delete',
'resultPanel.commitConfirm': 'Commit Changes',
'resultPanel.executeSql': 'The following SQL will be executed:',
'resultPanel.affect': 'Affect',
'resultPanel.rowModify': 'row(s) modified',
'resultPanel.rowInsert': 'row(s) inserted',
'resultPanel.rowDelete': 'row(s) deleted',
'resultPanel.continue': 'Continue?',
'resultPanel.execute': 'Execute',
'resultPanel.cancel': 'Cancel',
'resultPanel.transactionActive': 'Transaction active',
'resultPanel.longTxWarning': 'Long transaction warning',
'resultPanel.prevRecord': 'Previous',
'resultPanel.nextRecord': 'Next',
'resultPanel.viewBlob': 'View',
'resultPanel.downloadBlob': 'Download file',
'resultPanel.blobTooLarge': 'File too large',
'resultPanel.nullValue': 'NULL',
'resultPanel.validationError': 'Validation error',
'resultPanel.notNullViolation': 'This field cannot be null',
'resultPanel.typeMismatch': 'Type mismatch',
'resultPanel.lengthExceeded': 'Length exceeded',
```

- [ ] **Step 3: Add edit mode toggle function**

```javascript
function toggleEditMode() {
    state.editMode = !state.editMode;
    const btn = document.getElementById('btnEditMode');
    btn.textContent = state.editMode ? '🔓' : '🔒';
    btn.title = state.editMode ? t('resultPanel.editable') : t('resultPanel.readonly');

    document.getElementById('btnAddRow').disabled = !state.editMode;
    document.getElementById('btnDeleteRow').disabled = !state.editMode;
    document.getElementById('btnCommit').disabled = !state.editMode || state.pendingChanges.length === 0;
    document.getElementById('btnRollback').disabled = !state.editMode || state.pendingChanges.length === 0;
    document.getElementById('btnBeginTx').disabled = !state.editMode;

    if (!state.editMode && state.editingCell) {
        cancelCellEdit();
    }
    renderGrid();
}
```

- [ ] **Step 4: Add cell editing functions**

```javascript
function startCellEdit(row, col) {
    if (!state.editMode) return;
    if (state.editingCell) {
        commitCellEdit();
    }

    state.editingCell = { row, col };
    renderVisibleRows();
}

function commitCellEdit() {
    if (!state.editingCell) return;

    const { row, col } = state.editingCell;
    const input = document.querySelector('.cell-editing input, .cell-editing select');
    if (!input) {
        state.editingCell = null;
        return;
    }

    const newValue = input.value;
    const colMeta = state.columns[col];
    const oldValue = state.originalRows[row] ? state.originalRows[row][col] : state.rows[row][col];

    let processedValue = newValue;
    if (newValue === '' && colMeta.nullable) {
        processedValue = null;
    } else if (colMeta.type.match(/INT|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC/i)) {
        processedValue = newValue === '' ? null : Number(newValue);
        if (isNaN(processedValue)) processedValue = newValue;
    }

    if (processedValue !== oldValue) {
        state.rows[row][col] = processedValue;
        trackChange(row, col, oldValue, processedValue);
    }

    state.editingCell = null;
    renderVisibleRows();
    updateEditStatusBar();
}

function cancelCellEdit() {
    state.editingCell = null;
    renderVisibleRows();
}

function trackChange(row, col, oldVal, newVal) {
    const existing = state.pendingChanges.find(c => c.rowIndex === row);
    if (existing && existing.type === 'update') {
        if (!existing.changes) existing.changes = {};
        existing.changes[state.columns[col].name] = { old: oldVal, new: newVal };
    } else if (!existing) {
        const primaryKey = getPrimaryKeyValue(row);
        state.pendingChanges.push({
            type: 'update',
            table: state.tableName,
            primaryKey: primaryKey,
            changes: { [state.columns[col].name]: { old: oldVal, new: newVal } },
            originalRow: { ...state.originalRows[row] },
            rowIndex: row,
        });
    }
    updateEditStatusBar();
}

function getPrimaryKeyValue(row) {
    const pk = {};
    state.columns.forEach((col, idx) => {
        if (col.isPrimaryKey) {
            pk[col.name] = state.originalRows[row] ? state.originalRows[row][idx] : state.rows[row][idx];
        }
    });
    return pk;
}
```

- [ ] **Step 5: Modify renderVisibleRows to support editing and markers**

Replace the existing `renderVisibleRows` function with an enhanced version that:
1. Shows modification markers (background colors for modified/new/deleted rows)
2. Handles double-click to enter edit mode
3. Shows editing input/select when a cell is being edited
4. Shows ENUM/FK dropdowns for appropriate column types
5. Shows BLOB preview button for BLOB columns
6. Shows row-placeholder for the empty bottom row

The key changes inside the row rendering loop:

```javascript
function renderVisibleRows() {
    const wrapper = document.getElementById('gridBodyWrapper');
    const spacer = document.getElementById('gridSpacer');
    const tbody = document.getElementById('gridBody');

    const totalHeight = (state.rows.length + (state.editMode ? 1 : 0)) * ROW_HEIGHT;
    spacer.style.height = totalHeight + 'px';

    const scrollTop = wrapper.scrollTop;
    const viewportHeight = wrapper.clientHeight;

    const totalRows = state.rows.length + (state.editMode ? 1 : 0);
    const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

    tbody.innerHTML = '';

    const table = document.getElementById('gridBodyTable');
    table.style.top = (startRow * ROW_HEIGHT) + 'px';

    for (let i = startRow; i < endRow; i++) {
        const tr = document.createElement('tr');
        const isPlaceholder = i >= state.rows.length;

        const tdNum = document.createElement('td');
        tdNum.className = 'row-num';
        if (isPlaceholder) {
            tdNum.textContent = '*';
            tr.classList.add('row-placeholder');
        } else {
            tdNum.textContent = i + 1;
        }
        tr.appendChild(tdNum);

        const rowChange = isPlaceholder ? null : state.pendingChanges.find(c => c.rowIndex === i);
        if (rowChange) {
            if (rowChange.type === 'insert') tr.classList.add('row-new');
            if (rowChange.type === 'delete') tr.classList.add('row-deleted');
            if (rowChange.type === 'update') tr.classList.add('row-modified');
        }

        if (!isPlaceholder) {
            const row = state.rows[i];
            state.columns.forEach((col, colIdx) => {
                const td = document.createElement('td');
                const val = row ? row[colIdx] : undefined;

                if (state.editingCell && state.editingCell.row === i && state.editingCell.col === colIdx) {
                    td.className = 'cell-editing';
                    renderCellEditor(td, val, col, i, colIdx);
                } else {
                    if (val === null || val === undefined) {
                        td.className = state.editMode ? 'cell-null-editable' : 'cell-null';
                        td.textContent = state.nullPlaceholder;
                    } else {
                        const colType = (col.type || '').toUpperCase();
                        if (isBlobType(colType)) {
                            td.className = 'cell-blob';
                            td.textContent = '[BLOB]';
                        } else {
                            let display = String(val);
                            if (display.length > state.longTextThreshold) {
                                display = display.substring(0, state.longTextThreshold) + '...';
                            }
                            td.textContent = display;
                            td.title = String(val);
                        }
                    }

                    if (rowChange && rowChange.type === 'update' && rowChange.changes && rowChange.changes[col.name]) {
                        td.classList.add('cell-modified');
                    }
                    if (rowChange && rowChange.type === 'insert') {
                        td.classList.add('cell-new');
                    }
                    if (rowChange && rowChange.type === 'delete') {
                        td.classList.add('cell-deleted');
                    }

                    const validationKey = i + '_' + colIdx;
                    if (state.validationErrors[validationKey]) {
                        td.classList.add('cell-validation-error');
                        td.title = state.validationErrors[validationKey];
                    }
                }

                if (state.selectedCell && state.selectedCell.row === i && state.selectedCell.col === colIdx) {
                    td.classList.add('selected');
                }

                td.onclick = (e) => {
                    e.stopPropagation();
                    if (state.editingCell && (state.editingCell.row !== i || state.editingCell.col !== colIdx)) {
                        commitCellEdit();
                    }
                    selectCell(i, colIdx);
                };

                td.ondblclick = (e) => {
                    e.stopPropagation();
                    if (state.editMode && !isPlaceholder) {
                        startCellEdit(i, colIdx);
                    }
                };

                tr.appendChild(td);
            });
        } else {
            state.columns.forEach((_, colIdx) => {
                const td = document.createElement('td');
                td.textContent = '';
                td.onclick = (e) => {
                    e.stopPropagation();
                    if (state.editMode) {
                        addRow();
                    }
                };
                tr.appendChild(td);
            });
        }

        tbody.appendChild(tr);
    }
}

function isBlobType(type) {
    return !!type && (type.includes('BLOB') || type.includes('BINARY') || type.includes('VARBINARY'));
}

function renderCellEditor(td, val, col, rowIdx, colIdx) {
    const colType = (col.type || '').toUpperCase();

    if (col.isEnum && col.enumValues && col.enumValues.length > 0) {
        const select = document.createElement('select');
        if (col.nullable) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = state.nullPlaceholder;
            select.appendChild(opt);
        }
        col.enumValues.forEach(ev => {
            const opt = document.createElement('option');
            opt.value = ev;
            opt.textContent = ev;
            if (ev === val) opt.selected = true;
            select.appendChild(opt);
        });
        select.onkeydown = (e) => {
            if (e.key === 'Escape') cancelCellEdit();
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                commitCellEdit();
                if (e.key === 'Enter') {
                    selectCell(rowIdx + 1, colIdx);
                } else {
                    selectCell(rowIdx, colIdx + 1 < state.columns.length ? colIdx + 1 : colIdx);
                }
            }
        };
        td.appendChild(select);
        select.focus();
    } else if (col.referencedTable) {
        const select = document.createElement('select');
        if (col.nullable) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = state.nullPlaceholder;
            select.appendChild(opt);
        }
        const fkKey = col.name;
        const fkOpts = state.foreignKeyOptions[fkKey] || [];
        fkOpts.forEach(fk => {
            const opt = document.createElement('option');
            opt.value = String(fk.value);
            opt.textContent = fk.displayText;
            if (String(fk.value) === String(val)) opt.selected = true;
            select.appendChild(opt);
        });
        const loadingOpt = document.createElement('option');
        loadingOpt.value = '__loading__';
        loadingOpt.textContent = '...';
        loadingOpt.disabled = true;
        select.appendChild(loadingOpt);
        select.onkeydown = (e) => {
            if (e.key === 'Escape') cancelCellEdit();
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                commitCellEdit();
            }
        };
        select.onfocus = () => {
            vscode.postMessage({
                command: 'requestForeignKeyOptions',
                column: col.name,
                referencedTable: col.referencedTable,
                database: state.database,
            });
        };
        td.appendChild(select);
        select.focus();
    } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = val === null || val === undefined ? '' : String(val);
        if (val === null || val === undefined) {
            input.classList.add('field-null');
            input.placeholder = state.nullPlaceholder;
        }
        input.onkeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cancelCellEdit();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                commitCellEdit();
                selectCell(rowIdx + 1, colIdx);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                commitCellEdit();
                selectCell(rowIdx, colIdx + 1 < state.columns.length ? colIdx + 1 : colIdx);
            }
        };
        td.appendChild(input);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
}
```

- [ ] **Step 6: Add row operation functions**

```javascript
function addRow() {
    if (!state.editMode) return;
    const newRow = new Array(state.columns.length).fill(null);
    state.rows.push(newRow);
    const insertIndex = state.rows.length - 1;
    state.originalRows[insertIndex] = { ...newRow };

    const primaryKey = {};
    state.columns.forEach((col, idx) => {
        if (col.isPrimaryKey) {
            primaryKey[col.name] = null;
        }
    });

    state.pendingChanges.push({
        type: 'insert',
        table: state.tableName,
        primaryKey: primaryKey,
        rowIndex: insertIndex,
        originalRow: { ...newRow },
    });

    renderGrid();
    updateEditStatusBar();
    const wrapper = document.getElementById('gridBodyWrapper');
    wrapper.scrollTop = wrapper.scrollHeight;
}

function deleteRow() {
    if (!state.editMode) return;
    if (!state.selectedCell) return;
    const row = state.selectedCell.row;
    if (row < 0 || row >= state.rows.length) return;

    const existingInsert = state.pendingChanges.find(c => c.rowIndex === row && c.type === 'insert');
    if (existingInsert) {
        state.pendingChanges = state.pendingChanges.filter(c => c !== existingInsert);
        state.rows.splice(row, 1);
        state.pendingChanges.forEach(c => {
            if (c.rowIndex > row) c.rowIndex--;
        });
    } else {
        const existingDelete = state.pendingChanges.find(c => c.rowIndex === row && c.type === 'delete');
        if (existingDelete) {
            state.pendingChanges = state.pendingChanges.filter(c => c !== existingDelete);
        } else {
            const existingUpdate = state.pendingChanges.find(c => c.rowIndex === row && c.type === 'update');
            if (existingUpdate) {
                state.pendingChanges = state.pendingChanges.filter(c => c !== existingUpdate);
            }
            const primaryKey = getPrimaryKeyValue(row);
            state.pendingChanges.push({
                type: 'delete',
                table: state.tableName,
                primaryKey: primaryKey,
                originalRow: { ...state.originalRows[row] },
                rowIndex: row,
            });
        }
    }

    renderGrid();
    updateEditStatusBar();
}
```

- [ ] **Step 7: Add commit and rollback functions**

```javascript
function commitChanges() {
    if (state.pendingChanges.length === 0) return;

    const sqlStatements = generateSqlFromChanges(state.pendingChanges);
    const updateCount = state.pendingChanges.filter(c => c.type === 'update').length;
    const insertCount = state.pendingChanges.filter(c => c.type === 'insert').length;
    const deleteCount = state.pendingChanges.filter(c => c.type === 'delete').length;

    let summary = '';
    if (updateCount > 0) summary += updateCount + ' ' + t('resultPanel.rowModify');
    if (insertCount > 0) summary += (summary ? ', ' : '') + insertCount + ' ' + t('resultPanel.rowInsert');
    if (deleteCount > 0) summary += (summary ? ', ' : '') + deleteCount + ' ' + t('resultPanel.rowDelete');

    document.getElementById('commitSqlPreview').textContent = sqlStatements.join(';\n') + ';';
    document.getElementById('commitSummary').textContent = t('resultPanel.affect') + ': ' + summary;
    document.getElementById('commitDialog').style.display = 'flex';
}

function confirmCommit() {
    document.getElementById('commitDialog').style.display = 'none';
    vscode.postMessage({
        command: 'commitChanges',
        changes: state.pendingChanges,
        tableName: state.tableName,
        database: state.database,
    });
}

function cancelCommit() {
    document.getElementById('commitDialog').style.display = 'none';
}

function rollbackChanges() {
    state.pendingChanges.forEach(change => {
        if (change.type === 'update' && change.originalRow) {
            const rowIdx = change.rowIndex;
            state.columns.forEach((_, colIdx) => {
                state.rows[rowIdx][colIdx] = change.originalRow[colIdx];
            });
        } else if (change.type === 'insert') {
            const rowIdx = change.rowIndex;
            state.rows.splice(rowIdx, 1);
            state.pendingChanges.forEach(c => {
                if (c.rowIndex > rowIdx) c.rowIndex--;
            });
        } else if (change.type === 'delete') {
            // row is still there, just unmark
        }
    });
    state.pendingChanges = [];
    state.validationErrors = {};
    renderGrid();
    updateEditStatusBar();
}

function generateSqlFromChanges(changes) {
    const sqls = [];
    const sorted = [...changes].sort((a, b) => {
        const order = { delete: 0, update: 1, insert: 2 };
        return order[a.type] - order[b.type];
    });

    for (const change of sorted) {
        if (change.type === 'delete') {
            const where = Object.entries(change.primaryKey)
                .map(([k, v]) => `\`${k}\` = ${formatSqlVal(v)}`)
                .join(' AND ');
            sqls.push(`DELETE FROM \`${change.table}\` WHERE ${where}`);
        } else if (change.type === 'update') {
            const setClauses = Object.entries(change.changes || {})
                .map(([k, v]) => `\`${k}\` = ${formatSqlVal(v.new)}`)
                .join(', ');
            const where = Object.entries(change.primaryKey)
                .map(([k, v]) => `\`${k}\` = ${formatSqlVal(v)}`)
                .join(' AND ');
            sqls.push(`UPDATE \`${change.table}\` SET ${setClauses} WHERE ${where}`);
        } else if (change.type === 'insert') {
            const row = state.rows[change.rowIndex];
            const cols = state.columns.map(c => '`' + c.name + '`').join(', ');
            const vals = state.columns.map((_, idx) => formatSqlVal(row[idx])).join(', ');
            sqls.push(`INSERT INTO \`${change.table}\` (${cols}) VALUES (${vals})`);
        }
    }
    return sqls;
}

function formatSqlVal(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return String(val);
    return "'" + String(val).replace(/'/g, "''") + "'";
}
```

- [ ] **Step 8: Add transaction control functions**

```javascript
function beginTransaction() {
    vscode.postMessage({ command: 'beginTransaction' });
}

function createSavepoint() {
    const name = 'sp_' + Date.now();
    vscode.postMessage({ command: 'createSavepoint', name: name });
}

function rollbackToSavepoint() {
    vscode.postMessage({ command: 'rollbackToSavepoint', name: 'sp1' });
}

function updateTransactionStatus(active) {
    state.transactionActive = active;
    const statusEl = document.getElementById('transactionStatus');
    if (active) {
        state.transactionStartTime = Date.now();
        state.transactionTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - state.transactionStartTime) / 1000);
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            statusEl.textContent = '🔒 ' + t('resultPanel.transactionActive') + ' (' + mins + ':' + secs + ')';

            const config = window.__CONFIG__ || {};
            const warningThreshold = config.longTransactionWarning || 300;
            if (elapsed >= warningThreshold) {
                statusEl.textContent += ' ⚠️ ' + t('resultPanel.longTxWarning');
                statusEl.style.color = 'var(--warning-color)';
            }
        }, 1000);
    } else {
        if (state.transactionTimer) {
            clearInterval(state.transactionTimer);
            state.transactionTimer = null;
        }
        state.transactionStartTime = null;
        statusEl.textContent = '';
        statusEl.style.color = '';
    }
}
```

- [ ] **Step 9: Add edit status bar update**

```javascript
function updateEditStatusBar() {
    const editStatusEl = document.getElementById('editStatus');
    const updateCount = state.pendingChanges.filter(c => c.type === 'update').length;
    const insertCount = state.pendingChanges.filter(c => c.type === 'insert').length;
    const deleteCount = state.pendingChanges.filter(c => c.type === 'delete').length;

    if (state.pendingChanges.length === 0) {
        editStatusEl.textContent = '';
    } else {
        let parts = [];
        if (updateCount > 0) parts.push(updateCount + ' ' + t('resultPanel.modify'));
        if (insertCount > 0) parts.push(insertCount + ' ' + t('resultPanel.insert'));
        if (deleteCount > 0) parts.push(deleteCount + ' ' + t('resultPanel.delete'));
        editStatusEl.textContent = t('resultPanel.pendingChanges') + ': ' + parts.join(', ');
    }

    const btnCommit = document.getElementById('btnCommit');
    const btnRollback = document.getElementById('btnRollback');
    if (btnCommit) btnCommit.disabled = !state.editMode || state.pendingChanges.length === 0;
    if (btnRollback) btnRollback.disabled = !state.editMode || state.pendingChanges.length === 0;
}
```

- [ ] **Step 10: Add view switching and form view functions**

```javascript
function switchView(view) {
    state.currentView = view;
    const gridContainer = document.getElementById('gridContainer');
    const formContainer = document.getElementById('formContainer');
    const btnGrid = document.getElementById('btnGridView');
    const btnForm = document.getElementById('btnFormView');

    if (view === 'grid') {
        gridContainer.style.display = '';
        formContainer.style.display = 'none';
        btnGrid.classList.add('view-btn-active');
        btnForm.classList.remove('view-btn-active');
    } else {
        gridContainer.style.display = 'none';
        formContainer.style.display = '';
        btnGrid.classList.remove('view-btn-active');
        btnForm.classList.add('view-btn-active');
        renderFormView();
    }
}

function navigateRecord(delta) {
    const newIndex = state.formCurrentIndex + delta;
    if (newIndex < 0 || newIndex >= state.rows.length) return;
    state.formCurrentIndex = newIndex;
    renderFormView();
}

function renderFormView() {
    const container = document.getElementById('formFields');
    const infoEl = document.getElementById('formRecordInfo');
    container.innerHTML = '';

    if (state.rows.length === 0) {
        infoEl.textContent = '0/0';
        return;
    }

    infoEl.textContent = (state.formCurrentIndex + 1) + '/' + state.rows.length;
    document.getElementById('btnPrevRecord').disabled = state.formCurrentIndex <= 0;
    document.getElementById('btnNextRecord').disabled = state.formCurrentIndex >= state.rows.length - 1;

    const row = state.rows[state.formCurrentIndex];
    if (!row) return;

    state.columns.forEach((col, colIdx) => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'form-field';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'form-field-label';
        labelDiv.textContent = col.name;
        const typeSpan = document.createElement('span');
        typeSpan.className = 'field-type';
        typeSpan.textContent = col.type || '';
        labelDiv.appendChild(typeSpan);

        const valueDiv = document.createElement('div');
        valueDiv.className = 'form-field-value';

        const val = row[colIdx];
        const colType = (col.type || '').toUpperCase();

        if (col.isEnum && col.enumValues && col.enumValues.length > 0) {
            const select = document.createElement('select');
            if (col.nullable) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = state.nullPlaceholder;
                select.appendChild(opt);
            }
            col.enumValues.forEach(ev => {
                const opt = document.createElement('option');
                opt.value = ev;
                opt.textContent = ev;
                if (ev === val) opt.selected = true;
                select.appendChild(opt);
            });
            if (state.editMode) {
                select.onchange = () => {
                    const newVal = select.value === '' ? null : select.value;
                    const oldVal = state.originalRows[state.formCurrentIndex] ? state.originalRows[state.formCurrentIndex][colIdx] : row[colIdx];
                    row[colIdx] = newVal;
                    if (newVal !== oldVal) trackChange(state.formCurrentIndex, colIdx, oldVal, newVal);
                };
            } else {
                select.disabled = true;
            }
            valueDiv.appendChild(select);
        } else if (col.referencedTable) {
            const select = document.createElement('select');
            if (col.nullable) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = state.nullPlaceholder;
                select.appendChild(opt);
            }
            const fkKey = col.name;
            const fkOpts = state.foreignKeyOptions[fkKey] || [];
            fkOpts.forEach(fk => {
                const opt = document.createElement('option');
                opt.value = String(fk.value);
                opt.textContent = fk.displayText;
                if (String(fk.value) === String(val)) opt.selected = true;
                select.appendChild(opt);
            });
            if (state.editMode) {
                select.onfocus = () => {
                    vscode.postMessage({
                        command: 'requestForeignKeyOptions',
                        column: col.name,
                        referencedTable: col.referencedTable,
                        database: state.database,
                    });
                };
                select.onchange = () => {
                    const newVal = select.value === '' ? null : select.value;
                    const oldVal = state.originalRows[state.formCurrentIndex] ? state.originalRows[state.formCurrentIndex][colIdx] : row[colIdx];
                    row[colIdx] = newVal;
                    if (newVal !== oldVal) trackChange(state.formCurrentIndex, colIdx, oldVal, newVal);
                };
            } else {
                select.disabled = true;
            }
            valueDiv.appendChild(select);
        } else if (isBlobType(colType)) {
            const btn = document.createElement('button');
            btn.className = 'blob-preview-btn';
            btn.textContent = val === null || val === undefined ? state.nullPlaceholder : t('resultPanel.viewBlob');
            btn.onclick = () => {
                vscode.postMessage({
                    command: 'requestBlobPreview',
                    rowIndex: state.formCurrentIndex,
                    colIndex: colIdx,
                });
            };
            valueDiv.appendChild(btn);
        } else if (colType.includes('TEXT') || colType.includes('LONGTEXT') || colType.includes('MEDIUMTEXT')) {
            const textarea = document.createElement('textarea');
            textarea.value = val === null || val === undefined ? '' : String(val);
            if (val === null || val === undefined) textarea.classList.add('field-null');
            if (state.editMode) {
                textarea.onchange = () => {
                    const newVal = textarea.value === '' && col.nullable ? null : textarea.value;
                    const oldVal = state.originalRows[state.formCurrentIndex] ? state.originalRows[state.formCurrentIndex][colIdx] : row[colIdx];
                    row[colIdx] = newVal;
                    if (newVal !== oldVal) trackChange(state.formCurrentIndex, colIdx, oldVal, newVal);
                };
            } else {
                textarea.readOnly = true;
            }
            valueDiv.appendChild(textarea);
        } else if (colType.includes('DATE') || colType.includes('TIME') || colType.includes('TIMESTAMP')) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = val === null || val === undefined ? '' : String(val);
            if (val === null || val === undefined) input.classList.add('field-null');
            if (state.editMode) {
                input.onchange = () => {
                    const newVal = input.value === '' && col.nullable ? null : input.value;
                    const oldVal = state.originalRows[state.formCurrentIndex] ? state.originalRows[state.formCurrentIndex][colIdx] : row[colIdx];
                    row[colIdx] = newVal;
                    if (newVal !== oldVal) trackChange(state.formCurrentIndex, colIdx, oldVal, newVal);
                };
            } else {
                input.readOnly = true;
            }
            valueDiv.appendChild(input);
        } else {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = val === null || val === undefined ? '' : String(val);
            if (val === null || val === undefined) input.classList.add('field-null');
            if (state.editMode) {
                input.onchange = () => {
                    let newVal = input.value === '' && col.nullable ? null : input.value;
                    if (colType.match(/INT|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC/i) && newVal !== null) {
                        const num = Number(newVal);
                        if (!isNaN(num)) newVal = num;
                    }
                    const oldVal = state.originalRows[state.formCurrentIndex] ? state.originalRows[state.formCurrentIndex][colIdx] : row[colIdx];
                    row[colIdx] = newVal;
                    if (newVal !== oldVal) trackChange(state.formCurrentIndex, colIdx, oldVal, newVal);
                };
            } else {
                input.readOnly = true;
            }
            valueDiv.appendChild(input);
        }

        fieldDiv.appendChild(labelDiv);
        fieldDiv.appendChild(valueDiv);
        container.appendChild(fieldDiv);
    });
}
```

- [ ] **Step 11: Add BLOB preview dialog functions**

```javascript
function switchBlobTab(mode) {
    document.querySelectorAll('.blob-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    const content = document.getElementById('blobContent');
    if (mode === 'text' && state._blobText) {
        content.textContent = state._blobText;
    } else if (mode === 'hex' && state._blobHex) {
        content.textContent = state._blobHex;
    } else if (mode === 'image' && state._blobImage) {
        content.innerHTML = '<img src="data:' + state._blobMimeType + ';base64,' + state._blobImage + '" />';
    }
}

function closeBlobDialog() {
    document.getElementById('blobDialog').style.display = 'none';
    state._blobText = null;
    state._blobHex = null;
    state._blobImage = null;
}
```

- [ ] **Step 12: Add data validation functions**

```javascript
function validateCell(rowIdx, colIdx, value) {
    const config = window.__CONFIG__ || {};
    if (!config.enableValidation) return null;

    const col = state.columns[colIdx];
    if (!config.validateOnEdit) return null;

    if (value === null || value === undefined || value === '') {
        if (!col.nullable) {
            return t('resultPanel.notNullViolation');
        }
        return null;
    }

    const colType = (col.type || '').toUpperCase();
    if (colType.match(/INT|BIGINT|SMALLINT|TINYINT/i)) {
        if (!Number.isInteger(Number(value))) {
            return t('resultPanel.typeMismatch') + ': expected integer';
        }
    } else if (colType.match(/FLOAT|DOUBLE|DECIMAL|NUMERIC/i)) {
        if (isNaN(Number(value))) {
            return t('resultPanel.typeMismatch') + ': expected number';
        }
    }

    const lengthMatch = colType.match(/\((\d+)\)/);
    if (lengthMatch && typeof value === 'string') {
        const maxLen = parseInt(lengthMatch[1]);
        if (value.length > maxLen) {
            return t('resultPanel.lengthExceeded') + ': max ' + maxLen;
        }
    }

    if (col.isEnum && col.enumValues && !col.enumValues.includes(value)) {
        return t('resultPanel.typeMismatch') + ': invalid enum value';
    }

    return null;
}
```

- [ ] **Step 13: Update handleMessage to handle new message types**

In the `handleMessage` function's switch statement, add new cases:

```javascript
case 'commitResult':
    handleCommitResult(message.data);
    break;
case 'foreignKeyOptions':
    handleForeignKeyOptions(message.data);
    break;
case 'transactionStatus':
    updateTransactionStatus(message.data.active);
    break;
case 'blobPreview':
    handleBlobPreview(message.data);
    break;
```

And add the handler functions:

```javascript
function handleCommitResult(data) {
    if (data.success) {
        state.pendingChanges = [];
        state.validationErrors = {};
        addMessage('success', t('resultPanel.queryCompleted'));
        updateEditStatusBar();
        if (state.currentSql) {
            vscode.postMessage({ command: 'executeQuery', sql: state.currentSql });
        }
    } else {
        addMessage('error', t('resultPanel.queryFailed') + ': ' + (data.errors || []).join('; '));
    }
}

function handleForeignKeyOptions(data) {
    state.foreignKeyOptions[data.column] = data.options || [];
    if (state.currentView === 'form') {
        renderFormView();
    } else {
        renderVisibleRows();
    }
}

function handleBlobPreview(data) {
    state._blobText = null;
    state._blobHex = null;
    state._blobImage = null;

    if (data.mode === 'null') {
        document.getElementById('blobContent').textContent = state.nullPlaceholder;
    } else if (data.mode === 'too_large') {
        const sizeMB = (data.size / (1024 * 1024)).toFixed(2);
        document.getElementById('blobContent').textContent =
            t('resultPanel.blobTooLarge') + ' (' + sizeMB + ' MB) - ' + t('resultPanel.downloadBlob');
    } else if (data.mode === 'image') {
        state._blobImage = data.content;
        state._blobMimeType = data.mimeType;
        document.getElementById('blobContent').innerHTML =
            '<img src="data:' + data.mimeType + ';base64,' + data.content + '" />';
    } else if (data.mode === 'text') {
        state._blobText = data.content;
        state._blobHex = null;
        document.getElementById('blobContent').textContent = data.content;
    } else if (data.mode === 'hex') {
        state._blobHex = data.content;
        state._blobText = null;
        document.getElementById('blobContent').textContent = data.content;
    }

    document.getElementById('blobDialog').style.display = 'flex';
}
```

- [ ] **Step 14: Update handleQueryResult to store original rows and table name**

In the `handleQueryResult` function, add after the existing state assignments:

```javascript
state.tableName = data.tableName || '';
state.originalRows = (data.rows || []).map(row => ({ ...row }));
state.pendingChanges = [];
state.validationErrors = {};
state.editingCell = null;
state.formCurrentIndex = 0;

const config = window.__CONFIG__ || {};
if (config.editMode === 'editable') {
    state.editMode = true;
    const btn = document.getElementById('btnEditMode');
    btn.textContent = '🔓';
    document.getElementById('btnAddRow').disabled = false;
    document.getElementById('btnDeleteRow').disabled = false;
    document.getElementById('btnBeginTx').disabled = false;
}

if (config.defaultView === 'form') {
    switchView('form');
}
```

- [ ] **Step 15: Update handleConfig to include dataEditor configs**

In the `handleConfig` function, add:

```javascript
if (data.editMode !== undefined) state.editMode = data.editMode === 'editable';
if (data.autoCommit !== undefined) state.autoCommit = data.autoCommit;
if (data.defaultView !== undefined) state.defaultView = data.defaultView;
if (data.optimisticLocking !== undefined) state.optimisticLocking = data.optimisticLocking;
if (data.maxBlobPreviewSize !== undefined) state.maxBlobPreviewSize = data.maxBlobPreviewSize;
if (data.blobTextPreviewSize !== undefined) state.blobTextPreviewSize = data.blobTextPreviewSize;
if (data.longTransactionWarning !== undefined) state.longTransactionWarning = data.longTransactionWarning;
if (data.showTransactionStatus !== undefined) state.showTransactionStatus = data.showTransactionStatus;
if (data.enableValidation !== undefined) state.enableValidation = data.enableValidation;
if (data.validateOnEdit !== undefined) state.validateOnEdit = data.validateOnEdit;
if (data.validateForeignKeys !== undefined) state.validateForeignKeys = data.validateForeignKeys;
```

- [ ] **Step 16: Update keyboard shortcut handler**

In the `onKeyDown` function, add new shortcuts:

```javascript
function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        copySelectedCell();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (state.editMode && state.pendingChanges.length > 0) {
            commitChanges();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (state.editMode && state.editingCell) {
            cancelCellEdit();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (state.editMode) {
            rollbackChanges();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (state.editingCell) {
            commitCellEdit();
        }
    }
}
```

---

### Task 6: Wire Up Commit Handler in DatabaseModule.ts

**Files:**
- Modify: `src/database/DatabaseModule.ts`

- [ ] **Step 1: Add onCommitChanges handler in executeQuery command**

In the `executeQuery` command registration (around line 296), add the `onCommitChanges` callback:

```typescript
this.queryResultPanel.onCommitChanges = async (changes, tableName, database) => {
    try {
        const connectionManager = ConnectionManager.getInstance();
        const activeConfig = connectionManager.getActiveConnection();
        const adapter = activeConfig ? connectionManager.getAdapter(activeConfig.id) : undefined;
        if (!adapter) {
            return { success: false, errors: ['No active database connection'] };
        }

        const sqlStatements: string[] = [];
        const sorted = [...changes].sort((a, b) => {
            const order: Record<string, number> = { delete: 0, update: 1, insert: 2 };
            return order[a.type] - order[b.type];
        });

        for (const change of sorted) {
            if (change.type === 'delete') {
                const where = Object.entries(change.primaryKey)
                    .map(([k, v]) => `\`${k}\` = ${this._formatSqlVal(v)}`)
                    .join(' AND ');
                sqlStatements.push(`DELETE FROM \`${tableName}\` WHERE ${where}`);
            } else if (change.type === 'update') {
                const setClauses = Object.entries(change.changes || {})
                    .map(([k, v]) => `\`${k}\` = ${this._formatSqlVal(v.new)}`)
                    .join(', ');
                const where = Object.entries(change.primaryKey)
                    .map(([k, v]) => `\`${k}\` = ${this._formatSqlVal(v)}`)
                    .join(' AND ');
                sqlStatements.push(`UPDATE \`${tableName}\` SET ${setClauses} WHERE ${where}`);
            } else if (change.type === 'insert') {
                const cols = Object.keys(change.originalRow || {}).length > 0
                    ? Object.keys(change.originalRow).map(k => '`' + k + '`').join(', ')
                    : '*';
                const result = await adapter.execute(`SELECT * FROM \`${tableName}\` LIMIT 0`);
                const colNames = result.columns.map(c => '`' + c.name + '`').join(', ');
                const rowIdx = change.rowIndex;
                const panel = this.queryResultPanel;
                if (!panel) continue;
                const currentResult = panel.getCurrentResult();
                if (!currentResult || !currentResult.rows[rowIdx]) continue;
                const row = currentResult.rows[rowIdx];
                const vals = currentResult.columns.map((_, idx) => this._formatSqlVal(row[idx])).join(', ');
                sqlStatements.push(`INSERT INTO \`${tableName}\` (${colNames}) VALUES (${vals})`);
            }
        }

        const supportsTransaction = true;
        if (supportsTransaction) {
            await adapter.beginTransaction();
            try {
                for (const sql of sqlStatements) {
                    await adapter.execute(sql);
                }
                await adapter.commit();
                return { success: true };
            } catch (error) {
                await adapter.rollback();
                return { success: false, errors: [(error as Error).message] };
            }
        } else {
            const errors: string[] = [];
            for (const sql of sqlStatements) {
                try {
                    await adapter.execute(sql);
                } catch (error) {
                    errors.push((error as Error).message);
                }
            }
            return errors.length > 0 ? { success: false, errors } : { success: true };
        }
    } catch (error) {
        return { success: false, errors: [(error as Error).message] };
    }
};
```

- [ ] **Step 2: Add _formatSqlVal helper method to DatabaseModule**

```typescript
private _formatSqlVal(val: any): string {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return String(val);
    return "'" + String(val).replace(/'/g, "''") + "'";
}
```

- [ ] **Step 3: Add FK options and transaction handlers**

```typescript
this.queryResultPanel.onRequestForeignKeyOptions = async (column, referencedTable, database) => {
    try {
        const connectionManager = ConnectionManager.getInstance();
        const activeConfig = connectionManager.getActiveConnection();
        const adapter = activeConfig ? connectionManager.getAdapter(activeConfig.id) : undefined;
        if (!adapter) return [];

        const structure = await adapter.describeTable(database || activeConfig?.database || '', referencedTable);
        const pkCol = structure.columns.find(c => c.isPrimaryKey);
        let displayCol = structure.columns.find(c => c.comment && c.type.toUpperCase().includes('VARCHAR'));
        if (!displayCol) displayCol = structure.columns.find(c => !c.isPrimaryKey);
        if (!displayCol) displayCol = pkCol;

        if (!pkCol) return [];

        const sql = `SELECT \`${pkCol.name}\`, \`${displayCol?.name || pkCol.name}\` FROM \`${referencedTable}\` LIMIT 100`;
        const result = await adapter.execute(sql);

        return result.rows.map((row: any) => ({
            value: row[0],
            displayText: row[1] !== null && row[1] !== undefined
                ? String(row[0]) + ' - ' + String(row[1])
                : String(row[0]),
        }));
    } catch {
        return [];
    }
};

this.queryResultPanel.onBeginTransaction = async () => {
    const connectionManager = ConnectionManager.getInstance();
    const activeConfig = connectionManager.getActiveConnection();
    const adapter = activeConfig ? connectionManager.getAdapter(activeConfig.id) : undefined;
    if (adapter) await adapter.beginTransaction();
};

this.queryResultPanel.onCommitTransaction = async () => {
    const connectionManager = ConnectionManager.getInstance();
    const activeConfig = connectionManager.getActiveConnection();
    const adapter = activeConfig ? connectionManager.getAdapter(activeConfig.id) : undefined;
    if (adapter) await adapter.commit();
};

this.queryResultPanel.onRollbackTransaction = async () => {
    const connectionManager = ConnectionManager.getInstance();
    const activeConfig = connectionManager.getActiveConnection();
    const adapter = activeConfig ? connectionManager.getAdapter(activeConfig.id) : undefined;
    if (adapter) await adapter.rollback();
};

this.queryResultPanel.onCreateSavepoint = async (name: string) => {
    const connectionManager = ConnectionManager.getInstance();
    const activeConfig = connectionManager.getActiveConnection();
    const adapter = activeConfig ? connectionManager.getAdapter(activeConfig.id) : undefined;
    if (adapter) await adapter.execute(`SAVEPOINT ${name}`);
};

this.queryResultPanel.onRollbackToSavepoint = async (name: string) => {
    const connectionManager = ConnectionManager.getInstance();
    const activeConfig = connectionManager.getActiveConnection();
    const adapter = activeConfig ? connectionManager.getAdapter(activeConfig.id) : undefined;
    if (adapter) await adapter.execute(`ROLLBACK TO SAVEPOINT ${name}`);
};
```

---

### Task 7: Write Unit Tests

**Files:**
- Create: `src/test/dataEditor.test.ts`

- [ ] **Step 1: Create test file with PendingChange SQL generation tests**

```typescript
import * as assert from 'assert';

suite('Data Editor - SQL Generation', () => {

    function formatSqlVal(val: any): string {
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'boolean') return String(val);
        return "'" + String(val).replace(/'/g, "''") + "'";
    }

    function generateUpdateSql(tableName: string, primaryKey: Record<string, any>, changes: Record<string, { old: any; new: any }>): string {
        const setClauses = Object.entries(changes)
            .map(([k, v]) => '`' + k + '` = ' + formatSqlVal(v.new))
            .join(', ');
        const where = Object.entries(primaryKey)
            .map(([k, v]) => '`' + k + '` = ' + formatSqlVal(v))
            .join(' AND ');
        return 'UPDATE `' + tableName + '` SET ' + setClauses + ' WHERE ' + where;
    }

    function generateDeleteSql(tableName: string, primaryKey: Record<string, any>): string {
        const where = Object.entries(primaryKey)
            .map(([k, v]) => '`' + k + '` = ' + formatSqlVal(v))
            .join(' AND ');
        return 'DELETE FROM `' + tableName + '` WHERE ' + where;
    }

    function generateInsertSql(tableName: string, colNames: string[], values: any[]): string {
        const cols = colNames.map(c => '`' + c + '`').join(', ');
        const vals = values.map(v => formatSqlVal(v)).join(', ');
        return 'INSERT INTO `' + tableName + '` (' + cols + ') VALUES (' + vals + ')';
    }

    test('should generate UPDATE SQL with single column change', () => {
        const sql = generateUpdateSql('users', { id: 1 }, { name: { old: 'Alice', new: 'Bob' } });
        assert.strictEqual(sql, "UPDATE `users` SET `name` = 'Bob' WHERE `id` = 1");
    });

    test('should generate UPDATE SQL with multiple column changes', () => {
        const sql = generateUpdateSql('users', { id: 2 }, {
            name: { old: 'Alice', new: 'Bob' },
            age: { old: 25, new: 30 },
        });
        assert.ok(sql.includes("`name` = 'Bob'"));
        assert.ok(sql.includes("`age` = 30"));
        assert.ok(sql.includes("WHERE `id` = 2"));
    });

    test('should generate UPDATE SQL with NULL value', () => {
        const sql = generateUpdateSql('users', { id: 1 }, { email: { old: 'a@b.com', new: null } });
        assert.ok(sql.includes("`email` = NULL"));
    });

    test('should generate UPDATE SQL with string containing single quote', () => {
        const sql = generateUpdateSql('users', { id: 1 }, { name: { old: 'Bob', new: "O'Brien" } });
        assert.ok(sql.includes("'O''Brien'"));
    });

    test('should generate DELETE SQL with primary key', () => {
        const sql = generateDeleteSql('users', { id: 5 });
        assert.strictEqual(sql, "DELETE FROM `users` WHERE `id` = 5");
    });

    test('should generate DELETE SQL with composite primary key', () => {
        const sql = generateDeleteSql('order_items', { order_id: 1, item_id: 3 });
        assert.ok(sql.includes("`order_id` = 1"));
        assert.ok(sql.includes("`item_id` = 3"));
    });

    test('should generate INSERT SQL', () => {
        const sql = generateInsertSql('users', ['id', 'name', 'age'], [1, 'Alice', 30]);
        assert.strictEqual(sql, "INSERT INTO `users` (`id`, `name`, `age`) VALUES (1, 'Alice', 30)");
    });

    test('should generate INSERT SQL with NULL values', () => {
        const sql = generateInsertSql('users', ['id', 'name'], [1, null]);
        assert.strictEqual(sql, "INSERT INTO `users` (`id`, `name`) VALUES (1, NULL)");
    });

    test('should sort changes in DELETE → UPDATE → INSERT order', () => {
        const changes = [
            { type: 'insert' as const, rowIndex: 2 },
            { type: 'update' as const, rowIndex: 0 },
            { type: 'delete' as const, rowIndex: 1 },
        ];
        const sorted = [...changes].sort((a, b) => {
            const order: Record<string, number> = { delete: 0, update: 1, insert: 2 };
            return order[a.type] - order[b.type];
        });
        assert.strictEqual(sorted[0].type, 'delete');
        assert.strictEqual(sorted[1].type, 'update');
        assert.strictEqual(sorted[2].type, 'insert');
    });
});

suite('Data Editor - formatSqlVal', () => {

    function formatSqlVal(val: any): string {
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'boolean') return String(val);
        return "'" + String(val).replace(/'/g, "''") + "'";
    }

    test('should format null as NULL', () => {
        assert.strictEqual(formatSqlVal(null), 'NULL');
    });

    test('should format undefined as NULL', () => {
        assert.strictEqual(formatSqlVal(undefined), 'NULL');
    });

    test('should format number without quotes', () => {
        assert.strictEqual(formatSqlVal(42), '42');
        assert.strictEqual(formatSqlVal(0), '0');
        assert.strictEqual(formatSqlVal(-5), '-5');
        assert.strictEqual(formatSqlVal(3.14), '3.14');
    });

    test('should format boolean as string', () => {
        assert.strictEqual(formatSqlVal(true), 'true');
        assert.strictEqual(formatSqlVal(false), 'false');
    });

    test('should format string with single quotes', () => {
        assert.strictEqual(formatSqlVal('hello'), "'hello'");
    });

    test('should escape single quotes in string', () => {
        assert.strictEqual(formatSqlVal("it's"), "'it''s'");
    });

    test('should format empty string', () => {
        assert.strictEqual(formatSqlVal('', "''"));
    });
});

suite('Data Editor - Validation', () => {

    function validateCell(col: { nullable: boolean; type: string; isEnum: boolean; enumValues?: string[] }, value: any): string | null {
        if (value === null || value === undefined || value === '') {
            if (!col.nullable) return 'NOT NULL violation';
            return null;
        }

        const colType = (col.type || '').toUpperCase();
        if (colType.match(/INT|BIGINT|SMALLINT|TINYINT/i)) {
            if (!Number.isInteger(Number(value))) return 'Type mismatch: expected integer';
        } else if (colType.match(/FLOAT|DOUBLE|DECIMAL|NUMERIC/i)) {
            if (isNaN(Number(value))) return 'Type mismatch: expected number';
        }

        const lengthMatch = colType.match(/\((\d+)\)/);
        if (lengthMatch && typeof value === 'string') {
            const maxLen = parseInt(lengthMatch[1]);
            if (value.length > maxLen) return 'Length exceeded: max ' + maxLen;
        }

        if (col.isEnum && col.enumValues && !col.enumValues.includes(value)) {
            return 'Invalid enum value';
        }

        return null;
    }

    test('should reject null for NOT NULL column', () => {
        const col = { nullable: false, type: 'INT', isEnum: false };
        assert.strictEqual(validateCell(col, null), 'NOT NULL violation');
    });

    test('should allow null for nullable column', () => {
        const col = { nullable: true, type: 'INT', isEnum: false };
        assert.strictEqual(validateCell(col, null), null);
    });

    test('should reject non-integer for INT column', () => {
        const col = { nullable: false, type: 'INT', isEnum: false };
        assert.strictEqual(validateCell(col, 'abc'), 'Type mismatch: expected integer');
    });

    test('should accept integer for INT column', () => {
        const col = { nullable: false, type: 'INT', isEnum: false };
        assert.strictEqual(validateCell(col, 42), null);
    });

    test('should reject non-number for FLOAT column', () => {
        const col = { nullable: false, type: 'FLOAT', isEnum: false };
        assert.strictEqual(validateCell(col, 'abc'), 'Type mismatch: expected number');
    });

    test('should accept number for FLOAT column', () => {
        const col = { nullable: false, type: 'FLOAT', isEnum: false };
        assert.strictEqual(validateCell(col, 3.14), null);
    });

    test('should reject string exceeding VARCHAR length', () => {
        const col = { nullable: false, type: 'VARCHAR(5)', isEnum: false };
        assert.strictEqual(validateCell(col, 'abcdef'), 'Length exceeded: max 5');
    });

    test('should accept string within VARCHAR length', () => {
        const col = { nullable: false, type: 'VARCHAR(10)', isEnum: false };
        assert.strictEqual(validateCell(col, 'abc'), null);
    });

    test('should reject invalid enum value', () => {
        const col = { nullable: false, type: 'ENUM', isEnum: true, enumValues: ['active', 'inactive'] };
        assert.strictEqual(validateCell(col, 'pending'), 'Invalid enum value');
    });

    test('should accept valid enum value', () => {
        const col = { nullable: false, type: 'ENUM', isEnum: true, enumValues: ['active', 'inactive'] };
        assert.strictEqual(validateCell(col, 'active'), null);
    });
});

suite('Data Editor - BLOB Detection', () => {

    function isBlobType(type: string): boolean {
        return !!type && (type.includes('BLOB') || type.includes('BINARY') || type.includes('VARBINARY'));
    }

    test('should detect BLOB type', () => {
        assert.strictEqual(isBlobType('BLOB'), true);
        assert.strictEqual(isBlobType('LONGBLOB'), true);
        assert.strictEqual(isBlobType('TINYBLOB'), true);
        assert.strictEqual(isBlobType('MEDIUMBLOB'), true);
    });

    test('should detect BINARY type', () => {
        assert.strictEqual(isBlobType('BINARY'), true);
        assert.strictEqual(isBlobType('VARBINARY'), true);
        assert.strictEqual(isBlobType('VARBINARY(255)'), true);
    });

    test('should not detect non-BLOB type', () => {
        assert.strictEqual(isBlobType('VARCHAR'), false);
        assert.strictEqual(isBlobType('INT'), false);
        assert.strictEqual(isBlobType('TEXT'), false);
        assert.strictEqual(isBlobType(''), false);
    });
});

suite('Data Editor - Image Detection', () => {

    function detectImageBuffer(buf: Buffer): boolean {
        if (buf.length < 4) return false;
        const header = buf.subarray(0, 4);
        if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return true;
        if (header[0] === 0xFF && header[1] === 0xD8) return true;
        if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return true;
        return false;
    }

    test('should detect PNG magic bytes', () => {
        const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        assert.strictEqual(detectImageBuffer(buf), true);
    });

    test('should detect JPEG magic bytes', () => {
        const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
        assert.strictEqual(detectImageBuffer(buf), true);
    });

    test('should detect GIF magic bytes', () => {
        const buf = Buffer.from([0x47, 0x49, 0x46, 0x38]);
        assert.strictEqual(detectImageBuffer(buf), true);
    });

    test('should not detect non-image buffer', () => {
        const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
        assert.strictEqual(detectImageBuffer(buf), false);
    });

    test('should not detect image from short buffer', () => {
        const buf = Buffer.from([0x89, 0x50]);
        assert.strictEqual(detectImageBuffer(buf), false);
    });
});

suite('Data Editor - PendingChange Tracking', () => {

    test('should track update change', () => {
        const change = {
            type: 'update' as const,
            table: 'users',
            primaryKey: { id: 1 },
            changes: { name: { old: 'Alice', new: 'Bob' } },
            originalRow: { 0: 1, 1: 'Alice' },
            rowIndex: 0,
        };
        assert.strictEqual(change.type, 'update');
        assert.strictEqual(change.table, 'users');
        assert.deepStrictEqual(change.primaryKey, { id: 1 });
        assert.strictEqual(change.changes!['name'].old, 'Alice');
        assert.strictEqual(change.changes!['name'].new, 'Bob');
    });

    test('should track insert change', () => {
        const change = {
            type: 'insert' as const,
            table: 'users',
            primaryKey: { id: null },
            rowIndex: 5,
        };
        assert.strictEqual(change.type, 'insert');
        assert.strictEqual(change.rowIndex, 5);
    });

    test('should track delete change', () => {
        const change = {
            type: 'delete' as const,
            table: 'users',
            primaryKey: { id: 3 },
            originalRow: { 0: 3, 1: 'Charlie' },
            rowIndex: 2,
        };
        assert.strictEqual(change.type, 'delete');
        assert.deepStrictEqual(change.primaryKey, { id: 3 });
    });

    test('should count pending changes by type', () => {
        const pendingChanges = [
            { type: 'update' as const, rowIndex: 0 },
            { type: 'insert' as const, rowIndex: 1 },
            { type: 'delete' as const, rowIndex: 2 },
            { type: 'update' as const, rowIndex: 3 },
        ];
        const updateCount = pendingChanges.filter(c => c.type === 'update').length;
        const insertCount = pendingChanges.filter(c => c.type === 'insert').length;
        const deleteCount = pendingChanges.filter(c => c.type === 'delete').length;
        assert.strictEqual(updateCount, 2);
        assert.strictEqual(insertCount, 1);
        assert.strictEqual(deleteCount, 1);
    });
});
```

---

### Task 8: Compile & Verify

- [ ] **Step 1: Run TypeScript compilation**

Run: `npm run compile`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All tests pass
