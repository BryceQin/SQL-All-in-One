# 015-执行计划与高级功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现可视化执行计划、SSH 隧道、数据导入三大高级功能，完善 Navicat 级别的数据库开发体验。

**Architecture:** 三个功能相对独立，按 P1-1（执行计划）→ P1-2（SSH 隧道）→ P1-3（数据导入）顺序开发。执行计划基于已有的 `IDatabaseAdapter.getExplainPlan` 接口构建解析器和 Webview 面板；SSH 隧道基于 `ssh2` 库修改 `ConnectionManager` 连接流程；数据导入基于 Webview 向导实现 CSV/JSON/SQL 导入。

**Tech Stack:** TypeScript, VSCode Extension API, Webview (HTML/CSS/JS), ssh2, jschardet

---

## File Structure

| File | Operation | Responsibility |
|------|-----------|---------------|
| `src/database/query/ExplainPlan.ts` | Create | EXPLAIN 结果解析，优化建议生成 |
| `src/views/explainPlan/ExplainPlanPanel.ts` | Create | 执行计划 Webview 面板 |
| `src/views/explainPlan/explainPanel.html` | Create | 执行计划面板 HTML 模板 |
| `src/views/explainPlan/explainPanel.css` | Create | 执行计划面板样式 |
| `src/views/explainPlan/explainPanel.js` | Create | 执行计划面板交互逻辑 |
| `src/database/connection/SshTunnel.ts` | Create | SSH 隧道建立与管理 |
| `src/database/connection/ConnectionManager.ts` | Modify | 集成 SSH 隧道到连接流程 |
| `src/database/connection/ConnectionStore.ts` | Modify | 添加 SSH 密码/私钥密码的 SecretStorage 支持 |
| `src/database/transfer/DataImporter.ts` | Create | CSV/JSON/SQL 数据导入引擎 |
| `src/views/dataTransfer/DataTransferDialog.ts` | Create | 数据导入向导 Webview 面板 |
| `src/views/dataTransfer/transferDialog.html` | Create | 导入向导 HTML 模板 |
| `src/views/dataTransfer/transferDialog.css` | Create | 导入向导样式 |
| `src/views/dataTransfer/transferDialog.js` | Create | 导入向导交互逻辑 |
| `src/database/DatabaseModule.ts` | Modify | 注册新命令 |
| `package.json` | Modify | 新增命令、ssh2 依赖 |

---

### Task 1: ExplainPlan 解析器

**Files:**
- Create: `src/database/query/ExplainPlan.ts`

- [ ] **Step 1: 创建 ExplainPlan.ts**

```typescript
import type { ExplainResult, ExplainNode } from '../adapters/IDatabaseAdapter';

export interface OptimizationSuggestion {
    severity: 'info' | 'warning' | 'critical';
    message: string;
    table?: string;
}

export class ExplainPlan {
    static parseMysqlExplain(raw: any): ExplainResult {
        if (typeof raw === 'string') {
            try {
                raw = JSON.parse(raw);
            } catch {
                return { format: 'text', raw: String(raw), nodes: [] };
            }
        }

        if (Array.isArray(raw)) {
            return {
                format: 'table',
                raw: JSON.stringify(raw),
                nodes: raw.map((row: any, idx: number) => ({
                    id: String(row.id ?? idx),
                    operation: row.select_type || row.type || 'UNKNOWN',
                    table: row.table_name || row.table || undefined,
                    rows: row.rows ? Number(row.rows) : undefined,
                    cost: undefined,
                    key: row.key || undefined,
                    extra: row.Extra || row.extra || undefined,
                    children: [],
                })),
            };
        }

        if (raw.query_block) {
            const nodes = this.parseQueryBlock(raw.query_block);
            return { format: 'json', raw: JSON.stringify(raw, null, 2), nodes };
        }

        return { format: 'json', raw: JSON.stringify(raw, null, 2), nodes: [] };
    }

    private static parseQueryBlock(block: any, parentId?: string): ExplainNode[] {
        const nodes: ExplainNode[] = [];

        if (block.select_id !== undefined || block.table) {
            const node: ExplainNode = {
                id: String(block.select_id ?? `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`),
                operation: this.detectOperation(block),
                table: block.table_name || block.table?.table_name || undefined,
                rows: block.cost_info?.rows_examined_per_scan
                    ? Number(block.cost_info.rows_examined_per_scan)
                    : block.rows_examined ? Number(block.rows_examined) : undefined,
                cost: block.cost_info?.read_cost
                    ? parseFloat(block.cost_info.read_cost)
                    : undefined,
                key: block.key || block.table?.key || undefined,
                extra: block.cost_info?.prefix_cost || undefined,
                children: [],
            };
            nodes.push(node);
        }

        if (block.nested_loop) {
            for (const loop of block.nested_loop) {
                const childNodes = this.parseQueryBlock(loop, parentId);
                if (nodes.length > 0 && childNodes.length > 0) {
                    nodes[0].children.push(...childNodes);
                } else {
                    nodes.push(...childNodes);
                }
            }
        }

        if (block.ordering_operation) {
            const orderNodes = this.parseQueryBlock(block.ordering_operation);
            nodes.push(...orderNodes);
        }

        if (block.grouping_operation) {
            const groupNodes = this.parseQueryBlock(block.grouping_operation);
            nodes.push(...groupNodes);
        }

        if (block.duplicates_removal) {
            const dupNodes = this.parseQueryBlock(block.duplicates_removal);
            nodes.push(...dupNodes);
        }

        return nodes;
    }

    private static detectOperation(block: any): string {
        const accessType = block.access_type || block.type || '';
        const extra = block.Extra || block.extra || '';

        if (accessType === 'ALL') return 'TABLE SCAN';
        if (accessType === 'index') return 'INDEX SCAN';
        if (accessType === 'range') return 'INDEX SCAN';
        if (accessType === 'ref' || accessType === 'eq_ref') return 'INDEX SEEK';
        if (accessType === 'const') return 'INDEX SEEK';
        if (extra.includes('Using temporary')) return 'TEMPORARY';
        if (extra.includes('Using filesort')) return 'SORT';
        if (accessType === 'ALL') return 'TABLE SCAN';

        if (block.nested_loop) return 'NESTED LOOP';
        if (block.join) return 'NESTED LOOP';

        return accessType.toUpperCase() || 'UNKNOWN';
    }

    static generateSuggestions(result: ExplainResult): OptimizationSuggestion[] {
        const suggestions: OptimizationSuggestion[] = [];

        const traverse = (nodes: ExplainNode[]) => {
            for (const node of nodes) {
                const operation = node.operation.toUpperCase();
                const extra = (node.extra || '').toUpperCase();

                if (operation === 'TABLE SCAN') {
                    suggestions.push({
                        severity: 'critical',
                        message: `表 \`${node.table || '?'}\` 全表扫描，考虑为 WHERE 条件添加索引`,
                        table: node.table,
                    });
                }

                if (extra.includes('USING FILESORT')) {
                    suggestions.push({
                        severity: 'warning',
                        message: `表 \`${node.table || '?'}\` 使用了文件排序，考虑为 ORDER BY 列添加索引`,
                        table: node.table,
                    });
                }

                if (extra.includes('USING TEMPORARY')) {
                    suggestions.push({
                        severity: 'warning',
                        message: `表 \`${node.table || '?'}\` 使用了临时表，考虑优化 GROUP BY 或 DISTINCT`,
                        table: node.table,
                    });
                }

                if (!node.key && node.table) {
                    suggestions.push({
                        severity: 'warning',
                        message: `表 \`${node.table}\` 未使用索引，考虑添加`,
                        table: node.table,
                    });
                }

                if (node.rows && node.rows > 10000 && node.key) {
                    suggestions.push({
                        severity: 'info',
                        message: `表 \`${node.table || '?'}\` 索引选择性低（扫描 ${node.rows} 行），考虑复合索引`,
                        table: node.table,
                    });
                }

                if (node.children && node.children.length > 0) {
                    traverse(node.children);
                }
            }
        };

        traverse(result.nodes);
        return suggestions;
    }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit src/database/query/ExplainPlan.ts 2>&1 | head -20`

---

### Task 2: 执行计划 Webview 面板

**Files:**
- Create: `src/views/explainPlan/ExplainPlanPanel.ts`
- Create: `src/views/explainPlan/explainPanel.html`
- Create: `src/views/explainPlan/explainPanel.css`
- Create: `src/views/explainPlan/explainPanel.js`

- [ ] **Step 1: 创建 ExplainPlanPanel.ts**

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConnectionManager } from '../../database/connection/ConnectionManager';
import { ExplainPlan, OptimizationSuggestion } from '../../database/query/ExplainPlan';
import type { ExplainResult, ExplainNode } from '../../database/adapters/IDatabaseAdapter';

export class ExplainPlanPanel {
    public static currentPanel: ExplainPlanPanel | undefined;
    public static readonly viewType = 'sqlAllInOneExplainPlan';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): ExplainPlanPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ExplainPlanPanel.currentPanel) {
            ExplainPlanPanel.currentPanel._panel.reveal(column || vscode.ViewColumn.Two);
            return ExplainPlanPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            ExplainPlanPanel.viewType,
            'Execution Plan',
            column ? column + 1 : vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'src', 'views', 'explainPlan'),
                ],
                retainContextWhenHidden: true,
            }
        );

        ExplainPlanPanel.currentPanel = new ExplainPlanPanel(panel, extensionUri, context);
        return ExplainPlanPanel.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        context: vscode.ExtensionContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'switchView':
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public async showExplainPlan(sql: string, useAnalyze: boolean = false): Promise<void> {
        const connectionManager = ConnectionManager.getInstance();
        const activeConn = connectionManager.getActiveConnection();
        if (!activeConn) {
            vscode.window.showWarningMessage('No active connection');
            return;
        }

        const adapter = connectionManager.getAdapter(activeConn.id);
        if (!adapter) {
            vscode.window.showWarningMessage('No active database adapter');
            return;
        }

        const capabilities = adapter.getDialectCapabilities();
        if (!capabilities.supportsExplain) {
            vscode.window.showWarningMessage('Current database does not support EXPLAIN');
            return;
        }

        this._panel.title = useAnalyze ? 'EXPLAIN ANALYZE (Actual)' : 'EXPLAIN (Estimated)';
        this._panel.webview.postMessage({ command: 'loading', sql });

        try {
            let explainSql: string;
            if (useAnalyze && capabilities.supportsExplainAnalyze) {
                explainSql = `EXPLAIN ANALYZE ${sql}`;
            } else {
                explainSql = `EXPLAIN FORMAT=JSON ${sql}`;
            }

            const result = await adapter.getExplainPlan(activeConn.database || '', explainSql);
            const parsed = ExplainPlan.parseMysqlExplain(result.raw);
            const suggestions = ExplainPlan.generateSuggestions(parsed);

            this._panel.webview.postMessage({
                command: 'explainResult',
                data: {
                    sql,
                    format: parsed.format,
                    nodes: parsed.nodes,
                    raw: parsed.raw,
                    suggestions,
                    useAnalyze,
                },
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'explainError',
                error: (error as Error).message,
            });
        }
    }

    public dispose(): void {
        ExplainPlanPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(): void {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        try {
            const htmlPath = path.join(
                this._extensionUri.fsPath,
                'src',
                'views',
                'explainPlan',
                'explainPanel.html'
            );
            let html = fs.readFileSync(htmlPath, 'utf-8');

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'explainPlan', 'explainPanel.css')
            );
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'explainPlan', 'explainPanel.js')
            );

            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{JS_URI}}', jsUri.toString());

            return html;
        } catch {
            return '<html><body><h2>Failed to load Execution Plan panel</h2></body></html>';
        }
    }
}
```

- [ ] **Step 2: 创建 explainPanel.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Execution Plan</title>
  <link rel="stylesheet" href="{{CSS_URI}}">
</head>
<body>
  <div class="explain-panel">
    <div class="header-bar">
      <div class="header-title">
        <span class="header-icon">🔍</span>
        <span id="headerLabel">Execution Plan</span>
        <span class="header-sql" id="headerSql"></span>
      </div>
      <div class="toolbar">
        <button class="tb-btn active" id="btnVisual" onclick="switchView('visual')" title="Visual">🌳</button>
        <button class="tb-btn" id="btnTable" onclick="switchView('table')" title="Table">📋</button>
        <button class="tb-btn" id="btnJson" onclick="switchView('json')" title="JSON">{ }</button>
        <span class="tb-separator"></span>
        <button class="tb-btn" id="btnAnalyze" onclick="runAnalyze()" title="EXPLAIN ANALYZE">⚡</button>
      </div>
    </div>

    <div class="content-area">
      <div class="loading" id="loadingArea" style="display:none;">
        <div class="spinner"></div>
        <span>Analyzing execution plan...</span>
      </div>

      <div class="error-area" id="errorArea" style="display:none;">
        <span class="error-icon">❌</span>
        <span id="errorMessage"></span>
      </div>

      <div class="view-container" id="visualView">
        <div class="tree-container" id="treeContainer"></div>
      </div>

      <div class="view-container" id="tableView" style="display:none;">
        <div class="table-wrapper">
          <table id="explainTable">
            <thead>
              <tr>
                <th>id</th>
                <th>select_type</th>
                <th>table</th>
                <th>type</th>
                <th>key</th>
                <th>rows</th>
                <th>Extra</th>
              </tr>
            </thead>
            <tbody id="explainTableBody"></tbody>
          </table>
        </div>
      </div>

      <div class="view-container" id="jsonView" style="display:none;">
        <pre class="json-content" id="jsonContent"></pre>
      </div>
    </div>

    <div class="suggestions-area" id="suggestionsArea" style="display:none;">
      <div class="suggestions-header">
        <span class="suggestions-icon">💡</span>
        <span>Optimization Suggestions</span>
      </div>
      <div class="suggestions-list" id="suggestionsList"></div>
    </div>
  </div>

  <script src="{{JS_URI}}"></script>
</body>
</html>
```

- [ ] **Step 3: 创建 explainPanel.css**

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --accent: var(--vscode-button-background, #4a9eff);
  --bg: var(--vscode-editor-background, #1e1e2e);
  --surface: var(--vscode-panel-background, #252536);
  --text: var(--vscode-editor-foreground, #cdd6f4);
  --text-secondary: var(--vscode-descriptionForeground, #7c7f93);
  --border: var(--vscode-panel-border, rgba(255,255,255,0.06));
  --btn-bg: var(--vscode-button-background, #4a9eff);
  --btn-hover: var(--vscode-button-hoverBackground, #5caeff);
  --btn-secondary-bg: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.06));
  --btn-secondary-hover: var(--vscode-button-secondarySecondaryHoverBackground, rgba(255,255,255,0.10));
  --radius: 8px;
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  --color-table-scan: #f44747;
  --color-index-scan: #e2b714;
  --color-index-seek: #4ec9b0;
  --color-nested-loop: #4a9eff;
  --color-sort: #e8912d;
  --color-temporary: #c586c0;
}

body {
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: 13px;
  color: var(--text);
  background: var(--bg);
  line-height: 1.5;
  overflow: hidden;
  height: 100vh;
}

.explain-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-icon { font-size: 16px; }

.header-sql {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tb-btn {
  background: var(--btn-secondary-bg);
  border: none;
  color: var(--text);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background var(--transition);
}

.tb-btn:hover { background: var(--btn-secondary-hover); }
.tb-btn.active { background: var(--accent); color: #fff; }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.tb-separator {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}

.content-area {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-secondary);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.error-area {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: rgba(244, 71, 71, 0.1);
  border-radius: var(--radius);
  color: var(--color-table-scan);
}

.error-icon { font-size: 18px; }

.view-container { display: none; }
.view-container.active { display: block; }

.tree-container { padding: 8px; }

.tree-node {
  margin: 4px 0;
  padding-left: 24px;
  position: relative;
}

.tree-node::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}

.tree-node:last-child::before {
  height: 12px;
}

.node-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 14px;
  position: relative;
  margin-bottom: 4px;
}

.node-card::before {
  content: '';
  position: absolute;
  left: -17px;
  top: 50%;
  width: 16px;
  height: 1px;
  background: var(--border);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.node-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}

.node-badge.table-scan { background: var(--color-table-scan); }
.node-badge.index-scan { background: var(--color-index-scan); }
.node-badge.index-seek { background: var(--color-index-seek); }
.node-badge.nested-loop { background: var(--color-nested-loop); }
.node-badge.sort { background: var(--color-sort); }
.node-badge.temporary { background: var(--color-temporary); }
.node-badge.default { background: var(--text-secondary); }

.node-table {
  font-weight: 600;
  color: var(--text);
}

.node-details {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.node-detail-item { display: flex; align-items: center; gap: 4px; }

.table-wrapper { overflow-x: auto; }

#explainTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

#explainTable th,
#explainTable td {
  padding: 6px 10px;
  border: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}

#explainTable th {
  background: var(--surface);
  font-weight: 600;
  position: sticky;
  top: 0;
}

#explainTable tr:hover td {
  background: rgba(74, 158, 255, 0.05);
}

.json-content {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', monospace);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  max-height: calc(100vh - 200px);
}

.suggestions-area {
  border-top: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
}

.suggestions-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.suggestions-icon { font-size: 16px; }

.suggestions-list { padding: 8px 12px; }

.suggestion-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 12px;
}

.suggestion-item.critical { background: rgba(244, 71, 71, 0.1); color: var(--color-table-scan); }
.suggestion-item.warning { background: rgba(226, 183, 20, 0.1); color: var(--color-index-scan); }
.suggestion-item.info { background: rgba(78, 201, 176, 0.1); color: var(--color-index-seek); }

.suggestion-severity {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 10px;
  flex-shrink: 0;
  min-width: 50px;
}
```

- [ ] **Step 4: 创建 explainPanel.js**

```javascript
const vscode = acquireVsCodeApi();

let currentData = null;
let currentView = 'visual';

window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.command) {
        case 'loading':
            showLoading(message.sql);
            break;
        case 'explainResult':
            currentData = message.data;
            renderResult(message.data);
            break;
        case 'explainError':
            showError(message.error);
            break;
    }
});

function showLoading(sql) {
    document.getElementById('loadingArea').style.display = 'flex';
    document.getElementById('errorArea').style.display = 'none';
    document.getElementById('visualView').classList.remove('active');
    document.getElementById('tableView').classList.remove('active');
    document.getElementById('jsonView').classList.remove('active');
    document.getElementById('suggestionsArea').style.display = 'none';
    document.getElementById('headerSql').textContent = sql ? sql.substring(0, 80) : '';
}

function showError(error) {
    document.getElementById('loadingArea').style.display = 'none';
    document.getElementById('errorArea').style.display = 'flex';
    document.getElementById('errorMessage').textContent = error;
}

function renderResult(data) {
    document.getElementById('loadingArea').style.display = 'none';
    document.getElementById('errorArea').style.display = 'none';

    document.getElementById('headerLabel').textContent = data.useAnalyze
        ? 'EXPLAIN ANALYZE (Actual)'
        : 'EXPLAIN (Estimated)';
    document.getElementById('headerSql').textContent = data.sql
        ? data.sql.substring(0, 80)
        : '';

    renderVisualView(data.nodes);
    renderTableView(data.nodes);
    renderJsonView(data.raw);
    renderSuggestions(data.suggestions);

    switchView(currentView);
}

function renderVisualView(nodes) {
    const container = document.getElementById('treeContainer');
    container.innerHTML = '';
    if (!nodes || nodes.length === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary);padding:20px;">No execution plan data available</div>';
        return;
    }
    for (const node of nodes) {
        container.appendChild(createNodeElement(node, 0));
    }
}

function createNodeElement(node, depth) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';

    const card = document.createElement('div');
    card.className = 'node-card';

    const badgeClass = getBadgeClass(node.operation);
    const header = document.createElement('div');
    header.className = 'node-header';
    header.innerHTML = `
        <span class="node-badge ${badgeClass}">${escapeHtml(node.operation)}</span>
        ${node.table ? `<span class="node-table">${escapeHtml(node.table)}</span>` : ''}
    `;
    card.appendChild(header);

    const details = document.createElement('div');
    details.className = 'node-details';
    const detailParts = [];
    if (node.rows !== undefined && node.rows !== null) {
        detailParts.push(`<span class="node-detail-item">Rows: ${node.rows.toLocaleString()}</span>`);
    }
    if (node.cost !== undefined && node.cost !== null) {
        detailParts.push(`<span class="node-detail-item">Cost: ${node.cost}</span>`);
    }
    if (node.key) {
        detailParts.push(`<span class="node-detail-item">Key: ${escapeHtml(node.key)}</span>`);
    }
    details.innerHTML = detailParts.join('');
    card.appendChild(details);

    if (node.extra) {
        const extra = document.createElement('div');
        extra.className = 'node-details';
        extra.style.marginTop = '4px';
        extra.innerHTML = `<span class="node-detail-item" style="color:var(--text-secondary);font-size:11px;">${escapeHtml(node.extra)}</span>`;
        card.appendChild(extra);
    }

    wrapper.appendChild(card);

    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            wrapper.appendChild(createNodeElement(child, depth + 1));
        }
    }

    return wrapper;
}

function getBadgeClass(operation) {
    const op = (operation || '').toUpperCase();
    if (op === 'TABLE SCAN') return 'table-scan';
    if (op === 'INDEX SCAN') return 'index-scan';
    if (op === 'INDEX SEEK') return 'index-seek';
    if (op.includes('NESTED LOOP') || op.includes('JOIN')) return 'nested-loop';
    if (op === 'SORT') return 'sort';
    if (op === 'TEMPORARY') return 'temporary';
    return 'default';
}

function renderTableView(nodes) {
    const tbody = document.getElementById('explainTableBody');
    tbody.innerHTML = '';
    const flatNodes = flattenNodes(nodes);
    for (const node of flatNodes) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(node.id)}</td>
            <td>${escapeHtml(node.operation)}</td>
            <td>${escapeHtml(node.table || '')}</td>
            <td><span class="node-badge ${getBadgeClass(node.operation)}" style="font-size:10px;padding:1px 6px;">${escapeHtml(node.operation)}</span></td>
            <td>${escapeHtml(node.key || '')}</td>
            <td>${node.rows !== undefined ? node.rows.toLocaleString() : ''}</td>
            <td>${escapeHtml(node.extra || '')}</td>
        `;
        tbody.appendChild(tr);
    }
}

function flattenNodes(nodes) {
    const result = [];
    const traverse = (nodeList) => {
        for (const node of nodeList) {
            result.push(node);
            if (node.children && node.children.length > 0) {
                traverse(node.children);
            }
        }
    };
    traverse(nodes);
    return result;
}

function renderJsonView(raw) {
    const el = document.getElementById('jsonContent');
    try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        el.textContent = JSON.stringify(obj, null, 2);
    } catch {
        el.textContent = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    }
}

function renderSuggestions(suggestions) {
    const area = document.getElementById('suggestionsArea');
    const list = document.getElementById('suggestionsList');
    if (!suggestions || suggestions.length === 0) {
        area.style.display = 'none';
        return;
    }
    area.style.display = 'block';
    list.innerHTML = '';
    for (const s of suggestions) {
        const item = document.createElement('div');
        item.className = `suggestion-item ${s.severity}`;
        item.innerHTML = `
            <span class="suggestion-severity">${s.severity}</span>
            <span>${escapeHtml(s.message)}</span>
        `;
        list.appendChild(item);
    }
}

function switchView(view) {
    currentView = view;
    document.getElementById('visualView').classList.remove('active');
    document.getElementById('tableView').classList.remove('active');
    document.getElementById('jsonView').classList.remove('active');

    document.getElementById('btnVisual').classList.remove('active');
    document.getElementById('btnTable').classList.remove('active');
    document.getElementById('btnJson').classList.remove('active');

    if (view === 'visual') {
        document.getElementById('visualView').classList.add('active');
        document.getElementById('btnVisual').classList.add('active');
    } else if (view === 'table') {
        document.getElementById('tableView').classList.add('active');
        document.getElementById('btnTable').classList.add('active');
    } else if (view === 'json') {
        document.getElementById('jsonView').classList.add('active');
        document.getElementById('btnJson').classList.add('active');
    }
}

function runAnalyze() {
    vscode.postMessage({ command: 'runAnalyze' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 5: 验证编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -20`

---

### Task 3: 注册执行计划命令

**Files:**
- Modify: `src/database/DatabaseModule.ts`
- Modify: `package.json`

- [ ] **Step 1: 在 DatabaseModule.ts 中添加 explainQuery 命令**

在 `DatabaseModule.ts` 的 `registerCommands()` 方法末尾（`for (const disposable of disposables)` 之前）添加：

```typescript
        disposables.push(
            vscode.commands.registerCommand('sql-all-in-one.explainQuery', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No active editor');
                    return;
                }

                const connectionManager = ConnectionManager.getInstance();
                const activeConn = connectionManager.getActiveConnection();
                if (!activeConn) {
                    vscode.window.showWarningMessage('No active connection. Please connect to a database first.');
                    return;
                }

                const adapter = connectionManager.getAdapter(activeConn.id);
                if (!adapter) {
                    vscode.window.showWarningMessage('No active database adapter');
                    return;
                }

                const capabilities = adapter.getDialectCapabilities();
                if (!capabilities.supportsExplain) {
                    vscode.window.showWarningMessage('Current database does not support EXPLAIN');
                    return;
                }

                const statement = this.statementDetector.detectSelectionOrCurrent(
                    editor.document,
                    editor.selection
                );

                if (!statement.sql) {
                    vscode.window.showWarningMessage('No SQL statement found');
                    return;
                }

                const { ExplainPlanPanel } = await import('../views/explainPlan/ExplainPlanPanel');
                const panel = ExplainPlanPanel.createOrShow(this.context.extensionUri, this.context);
                await panel.showExplainPlan(statement.sql, false);
            })
        );
```

- [ ] **Step 2: 在 package.json 的 commands 数组中添加命令**

在 `package.json` 的 `contributes.commands` 数组中添加：

```json
            {
                "command": "sql-all-in-one.explainQuery",
                "title": "Explain Query Execution Plan"
            },
            {
                "command": "sql-all-in-one.importData",
                "title": "Import Data"
            }
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -20`

---

### Task 4: SSH 隧道实现

**Files:**
- Create: `src/database/connection/SshTunnel.ts`
- Modify: `src/database/connection/ConnectionManager.ts`
- Modify: `src/database/connection/ConnectionStore.ts`

- [ ] **Step 1: 安装 ssh2 依赖**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm install ssh2 && npm install -D @types/ssh2`

- [ ] **Step 2: 创建 SshTunnel.ts**

```typescript
import * as net from 'net';
import * as fs from 'fs';
import { Client, ClientChannel } from 'ssh2';
import type { SshConfig } from './ConnectionConfig';

export interface TunnelResult {
    localHost: string;
    localPort: number;
}

export class SshTunnel {
    private client: Client | null = null;
    private server: net.Server | null = null;
    private _localPort: number = 0;
    private _isOpen = false;

    async open(
        sshConfig: SshConfig,
        targetHost: string,
        targetPort: number
    ): Promise<TunnelResult> {
        if (this._isOpen) {
            return { localHost: '127.0.0.1', localPort: this._localPort };
        }

        const client = new Client();

        const connectOptions: any = {
            host: sshConfig.host,
            port: sshConfig.port || 22,
            username: sshConfig.username,
            readyTimeout: 10000,
        };

        if (sshConfig.authentication === 'privateKey' && sshConfig.privateKey) {
            connectOptions.privateKey = fs.readFileSync(sshConfig.privateKey);
            if (sshConfig.passphrase) {
                connectOptions.passphrase = sshConfig.passphrase;
            }
        } else if (sshConfig.password) {
            connectOptions.password = sshConfig.password;
        }

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('SSH connection timeout. Check SSH server address and port.'));
            }, 15000);

            client.on('ready', () => {
                clearTimeout(timeout);
                resolve();
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                if (err.message.includes('ECONNREFUSED')) {
                    reject(new Error('SSH connection refused. Check SSH server address and port.'));
                } else if (
                    err.message.includes('All configured authentication methods failed') ||
                    err.message.includes('Authentication failed')
                ) {
                    reject(new Error('SSH authentication failed. Check username and password/key.'));
                } else if (err.message.includes('Cannot parse privateKey')) {
                    reject(new Error('SSH private key format error. Check the key file format.'));
                } else {
                    reject(new Error(`SSH connection error: ${err.message}`));
                }
            });

            client.connect(connectOptions);
        });

        this.client = client;

        const server = net.createServer((socket) => {
            client.forwardOut(
                socket.remoteAddress || '127.0.0.1',
                socket.remotePort || 0,
                targetHost,
                targetPort,
                (err, channel: ClientChannel) => {
                    if (err) {
                        socket.destroy();
                        return;
                    }
                    socket.pipe(channel);
                    channel.pipe(socket);
                    socket.on('close', () => channel.close());
                    channel.on('close', () => socket.destroy());
                    socket.on('error', () => channel.close());
                    channel.on('error', () => socket.destroy());
                }
            );
        });

        await new Promise<void>((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                resolve();
            });
            server.on('error', (err) => {
                reject(new Error(`Port forwarding failed: ${err.message}. Check target database address and port.`));
            });
        });

        const addr = server.address() as net.AddressInfo;
        this._localPort = addr.port;
        this.server = server;
        this._isOpen = true;

        return { localHost: '127.0.0.1', localPort: this._localPort };
    }

    async close(): Promise<void> {
        if (this.server) {
            await new Promise<void>((resolve) => {
                if (this.server) {
                    this.server.close(() => resolve());
                } else {
                    resolve();
                }
            });
            this.server = null;
        }

        if (this.client) {
            this.client.end();
            this.client = null;
        }

        this._isOpen = false;
        this._localPort = 0;
    }

    getLocalPort(): number {
        return this._localPort;
    }

    isOpen(): boolean {
        return this._isOpen;
    }
}
```

- [ ] **Step 3: 修改 ConnectionManager.ts 集成 SSH 隧道**

在 `ConnectionManager.ts` 中：
1. 添加 import: `import { SshTunnel } from './SshTunnel';`
2. 添加私有字段: `private sshTunnels = new Map<string, SshTunnel>();`
3. 修改 `connect()` 方法，替换 SSH 占位代码
4. 修改 `disconnect()` 方法，关闭 SSH 隧道
5. 修改 `testConnection()` 方法，替换 SSH 占位代码

修改 `connect()` 方法中 `if (config.ssh?.enabled)` 块：

```typescript
        if (config.ssh?.enabled) {
            const tunnel = new SshTunnel();
            try {
                const sshConfig = { ...config.ssh };
                const sshPassword = await this.connectionStore.getSshPassword(id);
                const sshPassphrase = await this.connectionStore.getSshPassphrase(id);
                if (sshPassword) sshConfig.password = sshPassword;
                if (sshPassphrase) sshConfig.passphrase = sshPassphrase;

                const tunnelResult = await tunnel.open(
                    sshConfig,
                    config.host,
                    config.port
                );

                this.sshTunnels.set(id, tunnel);
                fullConfig.host = tunnelResult.localHost;
                fullConfig.port = tunnelResult.localPort;
            } catch (error: any) {
                this.updateConnectionState(id, 'error');
                throw new Error(`SSH tunnel failed: ${error.message}`);
            }
        }
```

修改 `disconnect()` 方法，在 `this.adapters.delete(id)` 之后添加：

```typescript
        const tunnel = this.sshTunnels.get(id);
        if (tunnel) {
            try {
                await tunnel.close();
            } catch (e) {
                console.error('Error closing SSH tunnel:', e);
            }
            this.sshTunnels.delete(id);
        }
```

修改 `testConnection()` 方法中 `if (config.ssh?.enabled)` 块：

```typescript
        if (config.ssh?.enabled) {
            const tunnel = new SshTunnel();
            try {
                const sshConfig = { ...config.ssh };
                if (pass) sshConfig.password = pass;
                const tunnelResult = await tunnel.open(sshConfig, config.host, config.port);
                fullConfig = { ...fullConfig, host: tunnelResult.localHost, port: tunnelResult.localPort };
                try {
                    const adapter = AdapterFactory.create(config.dialect, fullConfig);
                    const result = await adapter.testConnection(fullConfig);
                    return result;
                } finally {
                    await tunnel.close();
                }
            } catch (error: any) {
                return { success: false, error: `SSH tunnel failed: ${error.message}` };
            }
        }
```

- [ ] **Step 4: 修改 ConnectionStore.ts 添加 SSH 密码存储**

在 `ConnectionStore` 类中添加两个方法：

```typescript
    async getSshPassword(id: string): Promise<string | undefined> {
        if (this.secretStorage) {
            return await this.secretStorage.get(`sql-all-in-one.ssh.password.${id}`);
        }
        return undefined;
    }

    async getSshPassphrase(id: string): Promise<string | undefined> {
        if (this.secretStorage) {
            return await this.secretStorage.get(`sql-all-in-one.ssh.passphrase.${id}`);
        }
        return undefined;
    }
```

同时在 `addConnection` 方法中添加 SSH 密码存储（在现有 `if (password && this.secretStorage)` 块之后）：

```typescript
        if (config.ssh?.password && this.secretStorage) {
            await this.secretStorage.store(`sql-all-in-one.ssh.password.${config.id}`, config.ssh.password);
        }
        if (config.ssh?.passphrase && this.secretStorage) {
            await this.secretStorage.store(`sql-all-in-one.ssh.passphrase.${config.id}`, config.ssh.passphrase);
        }
```

在 `removeConnection` 方法中添加 SSH 密码清理（在现有 `await this.secretStorage.delete` 之后）：

```typescript
            await this.secretStorage.delete(`sql-all-in-one.ssh.password.${id}`);
            await this.secretStorage.delete(`sql-all-in-one.ssh.passphrase.${id}`);
```

在 `updateConnection` 方法中添加 SSH 密码更新（在现有密码更新逻辑之后）：

```typescript
        if (config.ssh?.password !== undefined && this.secretStorage) {
            if (config.ssh.password) {
                await this.secretStorage.store(`sql-all-in-one.ssh.password.${id}`, config.ssh.password);
            } else {
                await this.secretStorage.delete(`sql-all-in-one.ssh.password.${id}`);
            }
        }
        if (config.ssh?.passphrase !== undefined && this.secretStorage) {
            if (config.ssh.passphrase) {
                await this.secretStorage.store(`sql-all-in-one.ssh.passphrase.${id}`, config.ssh.passphrase);
            } else {
                await this.secretStorage.delete(`sql-all-in-one.ssh.passphrase.${id}`);
            }
        }
```

- [ ] **Step 5: 验证编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -20`

---

### Task 5: DataImporter 数据导入引擎

**Files:**
- Create: `src/database/transfer/DataImporter.ts`

- [ ] **Step 1: 创建 DataImporter.ts**

```typescript
import * as fs from 'fs';
import * as readline from 'readline';
import * as vscode from 'vscode';
import type { IDatabaseAdapter } from '../adapters/IDatabaseAdapter';

export interface ImportError {
    row: number;
    message: string;
    data: string;
}

export interface ImportResult {
    success: boolean;
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    errors: ImportError[];
}

export interface CsvImportOptions {
    delimiter?: string;
    encoding?: string;
    hasHeaders?: boolean;
    batchSize?: number;
    onError: 'skip' | 'abort';
    dedupStrategy: 'ignore' | 'skip' | 'update';
    mapping?: Record<string, string>;
}

export interface JsonImportOptions {
    batchSize?: number;
    onError: 'skip' | 'abort';
    dedupStrategy: 'ignore' | 'skip' | 'update';
}

export async function importFromCsv(
    adapter: IDatabaseAdapter,
    filePath: string,
    tableName: string,
    options: CsvImportOptions
): Promise<ImportResult> {
    const delimiter = options.delimiter || detectCsvDelimiter(filePath);
    const encoding = options.encoding || 'utf-8';
    const batchSize = options.batchSize || 100;

    const stream = fs.createReadStream(filePath, { encoding: encoding as BufferEncoding });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const result: ImportResult = {
        success: true,
        totalRows: 0,
        importedRows: 0,
        skippedRows: 0,
        errors: [],
    };

    let headers: string[] = [];
    let isFirstLine = true;
    let batch: any[][] = [];
    let currentRow = 0;

    for await (const line of rl) {
        currentRow++;
        if (isFirstLine) {
            headers = parseCsvLine(line, delimiter);
            isFirstLine = false;
            continue;
        }

        result.totalRows++;
        const values = parseCsvLine(line, delimiter);

        if (options.mapping) {
            const mappedValues: any[] = [];
            for (const header of headers) {
                const targetCol = options.mapping[header];
                if (targetCol && targetCol !== '__skip__') {
                    const idx = headers.indexOf(header);
                    mappedValues.push(idx >= 0 && idx < values.length ? values[idx] : null);
                }
            }
            if (mappedValues.length > 0) {
                batch.push(mappedValues);
            }
        } else {
            batch.push(values);
        }

        if (batch.length >= batchSize) {
            const batchResult = await executeBatchInsert(
                adapter,
                tableName,
                options.mapping
                    ? Object.values(options.mapping).filter(v => v && v !== '__skip__')
                    : headers,
                batch,
                options.onError,
                currentRow - batch.length
            );
            result.importedRows += batchResult.imported;
            result.skippedRows += batchResult.skipped;
            result.errors.push(...batchResult.errors);
            if (batchResult.aborted) {
                result.success = false;
                break;
            }
            batch = [];
        }
    }

    if (batch.length > 0) {
        const batchResult = await executeBatchInsert(
            adapter,
            tableName,
            options.mapping
                ? Object.values(options.mapping).filter(v => v && v !== '__skip__')
                : headers,
            batch,
            options.onError,
            currentRow - batch.length
        );
        result.importedRows += batchResult.imported;
        result.skippedRows += batchResult.skipped;
        result.errors.push(...batchResult.errors);
        if (batchResult.aborted) {
            result.success = false;
        }
    }

    return result;
}

export async function importFromJson(
    adapter: IDatabaseAdapter,
    filePath: string,
    tableName: string,
    options: JsonImportOptions
): Promise<ImportResult> {
    const batchSize = options.batchSize || 100;
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    if (!Array.isArray(data)) {
        return {
            success: false,
            totalRows: 0,
            importedRows: 0,
            skippedRows: 0,
            errors: [{ row: 0, message: 'JSON must be an array of objects', data: '' }],
        };
    }

    const result: ImportResult = {
        success: true,
        totalRows: data.length,
        importedRows: 0,
        skippedRows: 0,
        errors: [],
    };

    if (data.length === 0) return result;

    const columns = Object.keys(data[0]);
    let batch: any[][] = [];

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const values = columns.map((col) => row[col] !== undefined ? row[col] : null);
        batch.push(values);

        if (batch.length >= batchSize) {
            const batchResult = await executeBatchInsert(
                adapter,
                tableName,
                columns,
                batch,
                options.onError,
                i - batch.length + 1
            );
            result.importedRows += batchResult.imported;
            result.skippedRows += batchResult.skipped;
            result.errors.push(...batchResult.errors);
            if (batchResult.aborted) {
                result.success = false;
                break;
            }
            batch = [];
        }
    }

    if (batch.length > 0) {
        const batchResult = await executeBatchInsert(
            adapter,
            tableName,
            columns,
            batch,
            options.onError,
            data.length - batch.length + 1
        );
        result.importedRows += batchResult.imported;
        result.skippedRows += batchResult.skipped;
        result.errors.push(...batchResult.errors);
        if (batchResult.aborted) {
            result.success = false;
        }
    }

    return result;
}

export async function importFromSql(
    adapter: IDatabaseAdapter,
    filePath: string
): Promise<ImportResult> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const statements = content
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const result: ImportResult = {
        success: true,
        totalRows: statements.length,
        importedRows: 0,
        skippedRows: 0,
        errors: [],
    };

    for (let i = 0; i < statements.length; i++) {
        try {
            await adapter.execute(statements[i]);
            result.importedRows++;
        } catch (error: any) {
            result.errors.push({
                row: i + 1,
                message: error.message,
                data: statements[i].substring(0, 200),
            });
            result.skippedRows++;
        }
    }

    if (result.errors.length > 0 && result.importedRows === 0) {
        result.success = false;
    }

    return result;
}

export function detectCsvDelimiter(filePath: string): string {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const firstLine = content.split('\n')[0] || '';
        const tabCount = (firstLine.match(/\t/g) || []).length;
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semicolonCount = (firstLine.match(/;/g) || []).length;

        if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
        if (semicolonCount > commaCount) return ';';
        return ',';
    } catch {
        return ',';
    }
}

export function detectFileFormat(filePath: string): 'csv' | 'json' | 'sql' {
    const ext = filePath.toLowerCase().split('.').pop() || '';
    if (ext === 'json') return 'json';
    if (ext === 'sql') return 'sql';
    return 'csv';
}

function parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === delimiter) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
    }
    result.push(current);
    return result;
}

async function executeBatchInsert(
    adapter: IDatabaseAdapter,
    tableName: string,
    columns: string[],
    batch: any[][],
    onError: 'skip' | 'abort',
    startRow: number
): Promise<{ imported: number; skipped: number; errors: ImportError[]; aborted: boolean }> {
    const result = { imported: 0, skipped: 0, errors: [] as ImportError[], aborted: false };

    const columnNames = columns.map((c) => `\`${c}\``).join(', ');
    const valueGroups = batch.map((row) => {
        const values = row.map((v) => formatSqlValue(v));
        return `(${values.join(', ')})`;
    });

    const sql = `INSERT INTO \`${tableName}\` (${columnNames}) VALUES ${valueGroups.join(', ')}`;

    try {
        await adapter.execute(sql);
        result.imported = batch.length;
    } catch (error: any) {
        if (onError === 'abort') {
            result.errors.push({
                row: startRow,
                message: error.message,
                data: sql.substring(0, 200),
            });
            result.aborted = true;
            result.skipped = batch.length;
            return result;
        }

        for (let i = 0; i < batch.length; i++) {
            const singleSql = `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${batch[i].map((v) => formatSqlValue(v)).join(', ')})`;
            try {
                await adapter.execute(singleSql);
                result.imported++;
            } catch (singleError: any) {
                result.skipped++;
                result.errors.push({
                    row: startRow + i,
                    message: singleError.message,
                    data: batch[i].join(','),
                });
            }
        }
    }

    return result;
}

function formatSqlValue(value: any): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    return `'${String(value).replace(/'/g, "''")}'`;
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -20`

---

### Task 6: 数据导入向导 Webview

**Files:**
- Create: `src/views/dataTransfer/DataTransferDialog.ts`
- Create: `src/views/dataTransfer/transferDialog.html`
- Create: `src/views/dataTransfer/transferDialog.css`
- Create: `src/views/dataTransfer/transferDialog.js`

- [ ] **Step 1: 创建 DataTransferDialog.ts**

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConnectionManager } from '../../database/connection/ConnectionManager';
import {
    importFromCsv,
    importFromJson,
    importFromSql,
    detectFileFormat,
    detectCsvDelimiter,
    type ImportResult,
    type CsvImportOptions,
    type JsonImportOptions,
} from '../../database/transfer/DataImporter';

export class DataTransferDialog {
    public static currentPanel: DataTransferDialog | undefined;
    public static readonly viewType = 'sqlAllInOneDataTransfer';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): DataTransferDialog {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DataTransferDialog.currentPanel) {
            DataTransferDialog.currentPanel._panel.reveal(column || vscode.ViewColumn.Two);
            return DataTransferDialog.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            DataTransferDialog.viewType,
            'Import Data',
            column ? column + 1 : vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'src', 'views', 'dataTransfer'),
                ],
                retainContextWhenHidden: true,
            }
        );

        DataTransferDialog.currentPanel = new DataTransferDialog(panel, extensionUri, context);
        return DataTransferDialog.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        context: vscode.ExtensionContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'selectFile':
                        await this._handleSelectFile();
                        break;
                    case 'requestTables':
                        await this._handleRequestTables();
                        break;
                    case 'requestColumns':
                        await this._handleRequestColumns(message.table);
                        break;
                    case 'requestPreview':
                        await this._handleRequestPreview(message.filePath, message.format, message.rowCount);
                        break;
                    case 'startImport':
                        await this._handleStartImport(message.config);
                        break;
                    case 'close':
                        this.dispose();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleSelectFile(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            filters: {
                'Data Files': ['csv', 'json', 'sql', 'tsv'],
                'All Files': ['*'],
            },
            canSelectMany: false,
        });

        if (uris && uris.length > 0) {
            const filePath = uris[0].fsPath;
            const format = detectFileFormat(filePath);
            this._panel.webview.postMessage({
                command: 'fileSelected',
                filePath,
                format,
            });
        }
    }

    private async _handleRequestTables(): Promise<void> {
        const connectionManager = ConnectionManager.getInstance();
        const activeConn = connectionManager.getActiveConnection();
        if (!activeConn) {
            this._panel.webview.postMessage({ command: 'tables', tables: [] });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConn.id);
        if (!adapter) {
            this._panel.webview.postMessage({ command: 'tables', tables: [] });
            return;
        }

        try {
            const tables = await adapter.listTables(activeConn.database);
            this._panel.webview.postMessage({
                command: 'tables',
                tables: tables.map((t) => t.name),
            });
        } catch {
            this._panel.webview.postMessage({ command: 'tables', tables: [] });
        }
    }

    private async _handleRequestColumns(table: string): Promise<void> {
        const connectionManager = ConnectionManager.getInstance();
        const activeConn = connectionManager.getActiveConnection();
        if (!activeConn) {
            this._panel.webview.postMessage({ command: 'columns', table, columns: [] });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConn.id);
        if (!adapter) {
            this._panel.webview.postMessage({ command: 'columns', table, columns: [] });
            return;
        }

        try {
            const structure = await adapter.describeTable(activeConn.database || '', table);
            this._panel.webview.postMessage({
                command: 'columns',
                table,
                columns: structure.columns.map((c) => c.name),
            });
        } catch {
            this._panel.webview.postMessage({ command: 'columns', table, columns: [] });
        }
    }

    private async _handleRequestPreview(filePath: string, format: string, rowCount: number): Promise<void> {
        try {
            const limit = rowCount || 10;
            if (format === 'csv') {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const delimiter = detectCsvDelimiter(filePath);
                const headers = lines[0] ? lines[0].split(delimiter) : [];
                const rows = lines.slice(1, limit + 1).filter((l) => l.trim()).map((l) => l.split(delimiter));
                this._panel.webview.postMessage({
                    command: 'preview',
                    headers,
                    rows,
                    format,
                });
            } else if (format === 'json') {
                const content = fs.readFileSync(filePath, 'utf-8');
                const data = JSON.parse(content);
                if (Array.isArray(data) && data.length > 0) {
                    const headers = Object.keys(data[0]);
                    const rows = data.slice(0, limit).map((row) => headers.map((h) => row[h]));
                    this._panel.webview.postMessage({
                        command: 'preview',
                        headers,
                        rows,
                        format,
                    });
                }
            } else if (format === 'sql') {
                const content = fs.readFileSync(filePath, 'utf-8');
                const statements = content.split(';').filter((s) => s.trim()).slice(0, limit);
                this._panel.webview.postMessage({
                    command: 'preview',
                    headers: ['Statement'],
                    rows: statements.map((s) => [s.trim().substring(0, 200)]),
                    format,
                });
            }
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'previewError',
                error: error.message,
            });
        }
    }

    private async _handleStartImport(config: any): Promise<void> {
        const connectionManager = ConnectionManager.getInstance();
        const activeConn = connectionManager.getActiveConnection();
        if (!activeConn) {
            this._panel.webview.postMessage({
                command: 'importResult',
                result: { success: false, totalRows: 0, importedRows: 0, skippedRows: 0, errors: [{ row: 0, message: 'No active connection', data: '' }] },
            });
            return;
        }

        const adapter = connectionManager.getAdapter(activeConn.id);
        if (!adapter) {
            this._panel.webview.postMessage({
                command: 'importResult',
                result: { success: false, totalRows: 0, importedRows: 0, skippedRows: 0, errors: [{ row: 0, message: 'No database adapter', data: '' }] },
            });
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Importing data...',
                cancellable: true,
            },
            async (progress) => {
                try {
                    let result: ImportResult;

                    if (config.format === 'csv') {
                        const options: CsvImportOptions = {
                            delimiter: config.delimiter,
                            encoding: config.encoding,
                            hasHeaders: true,
                            batchSize: config.batchSize || 100,
                            onError: config.onError || 'skip',
                            dedupStrategy: config.dedupStrategy || 'ignore',
                            mapping: config.mapping,
                        };
                        result = await importFromCsv(adapter, config.filePath, config.tableName, options);
                    } else if (config.format === 'json') {
                        const options: JsonImportOptions = {
                            batchSize: config.batchSize || 100,
                            onError: config.onError || 'skip',
                            dedupStrategy: config.dedupStrategy || 'ignore',
                        };
                        result = await importFromJson(adapter, config.filePath, config.tableName, options);
                    } else {
                        result = await importFromSql(adapter, config.filePath);
                    }

                    this._panel.webview.postMessage({
                        command: 'importResult',
                        result,
                    });

                    if (result.success) {
                        vscode.window.showInformationMessage(
                            `Import completed: ${result.importedRows} rows imported` +
                            (result.skippedRows > 0 ? `, ${result.skippedRows} skipped` : '')
                        );
                    } else {
                        vscode.window.showWarningMessage(
                            `Import completed with errors: ${result.importedRows} imported, ${result.errors.length} errors`
                        );
                    }
                } catch (error: any) {
                    this._panel.webview.postMessage({
                        command: 'importResult',
                        result: {
                            success: false,
                            totalRows: 0,
                            importedRows: 0,
                            skippedRows: 0,
                            errors: [{ row: 0, message: error.message, data: '' }],
                        },
                    });
                    vscode.window.showErrorMessage(`Import failed: ${error.message}`);
                }
            }
        );
    }

    public dispose(): void {
        DataTransferDialog.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(): void {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        try {
            const htmlPath = path.join(
                this._extensionUri.fsPath,
                'src',
                'views',
                'dataTransfer',
                'transferDialog.html'
            );
            let html = fs.readFileSync(htmlPath, 'utf-8');

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'dataTransfer', 'transferDialog.css')
            );
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'dataTransfer', 'transferDialog.js')
            );

            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{JS_URI}}', jsUri.toString());

            return html;
        } catch {
            return '<html><body><h2>Failed to load Import Data dialog</h2></body></html>';
        }
    }
}
```

- [ ] **Step 2: 创建 transferDialog.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Import Data</title>
  <link rel="stylesheet" href="{{CSS_URI}}">
</head>
<body>
  <div class="transfer-dialog">
    <div class="header-bar">
      <div class="header-title">
        <span class="header-icon">📥</span>
        <span>Import Data</span>
      </div>
      <div class="step-indicator">
        <span class="step active" id="step1Indicator">1. Source</span>
        <span class="step-arrow">→</span>
        <span class="step" id="step2Indicator">2. Target</span>
        <span class="step-arrow">→</span>
        <span class="step" id="step3Indicator">3. Mapping</span>
        <span class="step-arrow">→</span>
        <span class="step" id="step4Indicator">4. Options</span>
        <span class="step-arrow">→</span>
        <span class="step" id="step5Indicator">5. Preview</span>
      </div>
    </div>

    <div class="content-area">
      <div class="step-content" id="step1">
        <h3>Select Data Source</h3>
        <div class="form-group">
          <label>File Path</label>
          <div class="file-input-group">
            <input type="text" id="filePath" placeholder="Select a file..." readonly>
            <button class="btn-primary" onclick="selectFile()">Browse</button>
          </div>
        </div>
        <div class="form-group">
          <label>File Format</label>
          <select id="fileFormat">
            <option value="auto">Auto Detect</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="sql">SQL</option>
          </select>
        </div>
      </div>

      <div class="step-content" id="step2" style="display:none;">
        <h3>Select Target Table</h3>
        <div class="form-group">
          <label>Target Table</label>
          <select id="targetTable">
            <option value="">Loading...</option>
          </select>
        </div>
        <div class="form-group">
          <label>Or Create New Table</label>
          <input type="text" id="newTableName" placeholder="New table name...">
        </div>
      </div>

      <div class="step-content" id="step3" style="display:none;">
        <h3>Field Mapping</h3>
        <div class="mapping-container" id="mappingContainer">
          <p class="hint">Select a target table first to configure mapping.</p>
        </div>
      </div>

      <div class="step-content" id="step4" style="display:none;">
        <h3>Import Options</h3>
        <div class="form-group">
          <label>On Error</label>
          <select id="onError">
            <option value="skip">Skip</option>
            <option value="abort">Abort</option>
          </select>
        </div>
        <div class="form-group">
          <label>Dedup Strategy</label>
          <select id="dedupStrategy">
            <option value="ignore">Ignore</option>
            <option value="skip">Skip</option>
            <option value="update">Update</option>
          </select>
        </div>
        <div class="form-group">
          <label>Batch Size</label>
          <input type="number" id="batchSize" value="100" min="1" max="10000">
        </div>
        <div class="form-group">
          <label>Preview Rows</label>
          <input type="number" id="previewRows" value="10" min="1" max="100">
        </div>
        <div class="form-group csv-options" id="csvOptions">
          <label>CSV Delimiter</label>
          <select id="csvDelimiter">
            <option value="auto">Auto Detect</option>
            <option value=",">Comma (,)</option>
            <option value="\t">Tab</option>
            <option value=";">Semicolon (;)</option>
          </select>
        </div>
        <div class="form-group csv-options" id="csvEncoding">
          <label>Encoding</label>
          <select id="csvEncodingSelect">
            <option value="utf-8">UTF-8</option>
            <option value="gbk">GBK</option>
            <option value="gb2312">GB2312</option>
            <option value="latin1">Latin-1</option>
          </select>
        </div>
      </div>

      <div class="step-content" id="step5" style="display:none;">
        <h3>Preview & Execute</h3>
        <div class="preview-area" id="previewArea">
          <p class="hint">Loading preview...</p>
        </div>
        <div class="import-progress" id="importProgress" style="display:none;">
          <div class="progress-bar-container">
            <div class="progress-bar" id="progressBar"></div>
          </div>
          <div class="progress-stats" id="progressStats"></div>
        </div>
        <div class="import-result" id="importResult" style="display:none;"></div>
      </div>
    </div>

    <div class="footer-bar">
      <button class="btn-secondary" id="btnPrev" onclick="prevStep()" style="display:none;">← Previous</button>
      <button class="btn-primary" id="btnNext" onclick="nextStep()">Next →</button>
      <button class="btn-primary" id="btnImport" onclick="startImport()" style="display:none;">Start Import</button>
    </div>
  </div>

  <script src="{{JS_URI}}"></script>
</body>
</html>
```

- [ ] **Step 3: 创建 transferDialog.css**

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --accent: var(--vscode-button-background, #4a9eff);
  --accent-hover: var(--vscode-button-hoverBackground, #5caeff);
  --bg: var(--vscode-editor-background, #1e1e2e);
  --surface: var(--vscode-panel-background, #252536);
  --text: var(--vscode-editor-foreground, #cdd6f4);
  --text-secondary: var(--vscode-descriptionForeground, #7c7f93);
  --border: var(--vscode-panel-border, rgba(255,255,255,0.06));
  --input-bg: var(--vscode-input-background, #313145);
  --input-border: var(--vscode-input-border, rgba(255,255,255,0.08));
  --error-color: #f44747;
  --success-color: #4ec9b0;
  --radius: 8px;
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

body {
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: 13px;
  color: var(--text);
  background: var(--bg);
  line-height: 1.5;
  height: 100vh;
  overflow: hidden;
}

.transfer-dialog {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
}

.header-icon { font-size: 18px; }

.step-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.step {
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 4px;
}

.step.active {
  color: var(--accent);
  font-weight: 600;
}

.step-arrow {
  color: var(--text-secondary);
  font-size: 10px;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.step-content h3 {
  margin-bottom: 16px;
  font-size: 15px;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 6px 10px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 4px;
  color: var(--text);
  font-size: 13px;
  outline: none;
}

.form-group input:focus,
.form-group select:focus {
  border-color: var(--accent);
}

.file-input-group {
  display: flex;
  gap: 8px;
}

.file-input-group input {
  flex: 1;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background var(--transition);
  white-space: nowrap;
}

.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: rgba(255,255,255,0.06);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background var(--transition);
}

.btn-secondary:hover { background: rgba(255,255,255,0.10); }

.hint {
  color: var(--text-secondary);
  font-style: italic;
}

.mapping-container {
  max-height: 300px;
  overflow-y: auto;
}

.mapping-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.mapping-source {
  flex: 1;
  font-weight: 500;
  font-size: 12px;
}

.mapping-arrow { color: var(--text-secondary); }

.mapping-target {
  flex: 1;
}

.mapping-target select {
  width: 100%;
  padding: 4px 8px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
}

.preview-area {
  overflow: auto;
  max-height: 300px;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.preview-table th,
.preview-table td {
  padding: 4px 8px;
  border: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-table th {
  background: var(--surface);
  font-weight: 600;
}

.import-progress {
  margin-top: 16px;
}

.progress-bar-container {
  width: 100%;
  height: 8px;
  background: var(--surface);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 0.3s ease;
  width: 0%;
}

.progress-stats {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.import-result {
  margin-top: 16px;
  padding: 12px;
  border-radius: var(--radius);
  font-size: 13px;
}

.import-result.success {
  background: rgba(78, 201, 176, 0.1);
  color: var(--success-color);
}

.import-result.error {
  background: rgba(244, 71, 71, 0.1);
  color: var(--error-color);
}

.footer-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
```

- [ ] **Step 4: 创建 transferDialog.js**

```javascript
const vscode = acquireVsCodeApi();

let currentStep = 1;
let importConfig = {
    filePath: '',
    format: 'auto',
    tableName: '',
    newTableName: '',
    mapping: {},
    onError: 'skip',
    dedupStrategy: 'ignore',
    batchSize: 100,
    delimiter: 'auto',
    encoding: 'utf-8',
};

let sourceColumns = [];
let targetColumns = [];
let availableTables = [];

window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.command) {
        case 'fileSelected':
            document.getElementById('filePath').value = message.filePath;
            importConfig.filePath = message.filePath;
            if (message.format) {
                document.getElementById('fileFormat').value = message.format;
                importConfig.format = message.format;
            }
            updateCsvOptionsVisibility();
            break;
        case 'tables':
            availableTables = message.tables;
            const select = document.getElementById('targetTable');
            select.innerHTML = '<option value="">-- Select a table --</option>' +
                message.tables.map(t => `<option value="${t}">${t}</option>`).join('');
            break;
        case 'columns':
            targetColumns = message.columns;
            renderMapping();
            break;
        case 'preview':
            renderPreview(message.headers, message.rows, message.format);
            break;
        case 'previewError':
            document.getElementById('previewArea').innerHTML =
                `<div class="hint" style="color:var(--error-color);">Preview error: ${escapeHtml(message.error)}</div>`;
            break;
        case 'importResult':
            showImportResult(message.result);
            break;
    }
});

function selectFile() {
    vscode.postMessage({ command: 'selectFile' });
}

function updateCsvOptionsVisibility() {
    const format = document.getElementById('fileFormat').value;
    const isCsv = format === 'csv' || format === 'auto';
    document.querySelectorAll('.csv-options').forEach(el => {
        el.style.display = isCsv ? '' : 'none';
    });
}

document.getElementById('fileFormat').addEventListener('change', () => {
    importConfig.format = document.getElementById('fileFormat').value;
    updateCsvOptionsVisibility();
});

document.getElementById('targetTable').addEventListener('change', () => {
    const table = document.getElementById('targetTable').value;
    importConfig.tableName = table;
    if (table) {
        vscode.postMessage({ command: 'requestColumns', table });
    }
});

function renderMapping() {
    const container = document.getElementById('mappingContainer');
    if (sourceColumns.length === 0 || targetColumns.length === 0) {
        container.innerHTML = '<p class="hint">Load source file and select target table first.</p>';
        return;
    }

    let html = '';
    for (const srcCol of sourceColumns) {
        const autoMatch = targetColumns.find(tc => tc.toLowerCase() === srcCol.toLowerCase());
        html += `
            <div class="mapping-row">
                <span class="mapping-source">${escapeHtml(srcCol)}</span>
                <span class="mapping-arrow">→</span>
                <div class="mapping-target">
                    <select id="mapping_${srcCol}" data-source="${escapeHtml(srcCol)}">
                        <option value="__skip__">Skip</option>
                        ${targetColumns.map(tc =>
                            `<option value="${escapeHtml(tc)}" ${tc === autoMatch ? 'selected' : ''}>${escapeHtml(tc)}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function renderPreview(headers, rows, format) {
    sourceColumns = headers;
    const area = document.getElementById('previewArea');

    let html = '<table class="preview-table"><thead><tr>';
    for (const h of headers) {
        html += `<th>${escapeHtml(h)}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const row of rows) {
        html += '<tr>';
        for (const cell of row) {
            html += `<td>${escapeHtml(String(cell ?? ''))}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    area.innerHTML = html;
}

function showImportResult(result) {
    const el = document.getElementById('importResult');
    const progress = document.getElementById('importProgress');
    progress.style.display = 'none';

    if (result.success) {
        el.className = 'import-result success';
        el.innerHTML = `✅ Import completed: ${result.importedRows} rows imported` +
            (result.skippedRows > 0 ? `, ${result.skippedRows} skipped` : '');
    } else {
        el.className = 'import-result error';
        let html = `❌ Import completed with errors: ${result.importedRows} imported, ${result.errors.length} errors<br>`;
        for (const err of result.errors.slice(0, 10)) {
            html += `<div style="margin-top:4px;font-size:11px;">Row ${err.row}: ${escapeHtml(err.message)}</div>`;
        }
        if (result.errors.length > 10) {
            html += `<div style="margin-top:4px;font-size:11px;">... and ${result.errors.length - 10} more errors</div>`;
        }
        el.innerHTML = html;
    }
    el.style.display = 'block';
}

function nextStep() {
    if (currentStep === 1) {
        if (!importConfig.filePath) {
            return;
        }
        importConfig.format = document.getElementById('fileFormat').value;
        vscode.postMessage({ command: 'requestTables' });
    }

    if (currentStep === 2) {
        const table = document.getElementById('targetTable').value;
        const newTable = document.getElementById('newTableName').value;
        if (!table && !newTable) return;
        importConfig.tableName = table || newTable;
        importConfig.newTableName = newTable;
        if (table) {
            vscode.postMessage({ command: 'requestColumns', table });
        }
    }

    if (currentStep === 3) {
        importConfig.mapping = {};
        document.querySelectorAll('.mapping-target select').forEach(sel => {
            const srcCol = sel.dataset.source;
            const targetCol = sel.value;
            if (srcCol && targetCol !== '__skip__') {
                importConfig.mapping[srcCol] = targetCol;
            }
        });
    }

    if (currentStep === 4) {
        importConfig.onError = document.getElementById('onError').value;
        importConfig.dedupStrategy = document.getElementById('dedupStrategy').value;
        importConfig.batchSize = parseInt(document.getElementById('batchSize').value) || 100;
        importConfig.delimiter = document.getElementById('csvDelimiter').value;
        importConfig.encoding = document.getElementById('csvEncodingSelect').value;

        const previewRows = parseInt(document.getElementById('previewRows').value) || 10;
        const format = importConfig.format === 'auto' ? 'csv' : importConfig.format;
        vscode.postMessage({
            command: 'requestPreview',
            filePath: importConfig.filePath,
            format,
            rowCount: previewRows,
        });
    }

    currentStep++;
    updateStepDisplay();
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepDisplay();
    }
}

function updateStepDisplay() {
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`step${i}`).style.display = i === currentStep ? '' : 'none';
        const indicator = document.getElementById(`step${i}Indicator`);
        if (indicator) {
            indicator.className = 'step' + (i === currentStep ? ' active' : '');
        }
    }

    document.getElementById('btnPrev').style.display = currentStep > 1 ? '' : 'none';
    document.getElementById('btnNext').style.display = currentStep < 5 ? '' : 'none';
    document.getElementById('btnImport').style.display = currentStep === 5 ? '' : 'none';
}

function startImport() {
    const format = importConfig.format === 'auto' ? detectFormat(importConfig.filePath) : importConfig.format;

    const config = {
        filePath: importConfig.filePath,
        format,
        tableName: importConfig.tableName,
        mapping: importConfig.mapping,
        onError: importConfig.onError,
        dedupStrategy: importConfig.dedupStrategy,
        batchSize: importConfig.batchSize,
        delimiter: importConfig.delimiter === 'auto' ? undefined : importConfig.delimiter,
        encoding: importConfig.encoding,
    };

    document.getElementById('importProgress').style.display = 'block';
    document.getElementById('importResult').style.display = 'none';
    document.getElementById('btnImport').disabled = true;

    vscode.postMessage({ command: 'startImport', config });
}

function detectFormat(filePath) {
    const ext = filePath.toLowerCase().split('.').pop();
    if (ext === 'json') return 'json';
    if (ext === 'sql') return 'sql';
    return 'csv';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

updateCsvOptionsVisibility();
```

- [ ] **Step 5: 验证编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -20`

---

### Task 7: 注册导入命令并完成集成

**Files:**
- Modify: `src/database/DatabaseModule.ts`
- Modify: `package.json`

- [ ] **Step 1: 在 DatabaseModule.ts 中添加 importData 命令**

在 `DatabaseModule.ts` 的 `registerCommands()` 方法中（`explainQuery` 命令之后）添加：

```typescript
        disposables.push(
            vscode.commands.registerCommand('sql-all-in-one.importData', async () => {
                const connectionManager = ConnectionManager.getInstance();
                const activeConn = connectionManager.getActiveConnection();
                if (!activeConn) {
                    vscode.window.showWarningMessage('No active connection. Please connect to a database first.');
                    return;
                }

                const { DataTransferDialog } = await import('../views/dataTransfer/DataTransferDialog');
                DataTransferDialog.createOrShow(this.context.extensionUri, this.context);
            })
        );
```

- [ ] **Step 2: 在 package.json 的 dependencies 中添加 ssh2**

确认 `package.json` 的 `dependencies` 中已包含 `"ssh2"` (在 Task 4 的 npm install 后自动更新)。

- [ ] **Step 3: 验证编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npx tsc --noEmit 2>&1 | head -20`

---

### Task 8: 编译与测试验证

- [ ] **Step 1: 完整编译**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run compile 2>&1 | tail -20`

- [ ] **Step 2: 运行 lint 检查**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm run lint 2>&1 | tail -20`

- [ ] **Step 3: 运行测试**

Run: `cd /Users/hao/Downloads/sql-all-in-one && npm test 2>&1 | tail -30`
