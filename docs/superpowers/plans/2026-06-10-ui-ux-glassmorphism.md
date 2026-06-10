# UI/UX 玻璃拟态优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Query Result 和 Table Designer 面板升级为现代玻璃拟态风格，修复 Webview 显示问题，统一设计系统。

**Architecture:** 纯 CSS + 轻量 JS 调整。CSS 变量体系统一为玻璃拟态风格（半透明背景 + backdrop-filter + 微妙边框/阴影），HTML 结构微调添加类型标签等元素，JS 调整列头渲染逻辑。TypeScript 层修复 Webview 聚焦和 OutputChannel 输出优化。

**Tech Stack:** CSS3 (backdrop-filter, CSS variables), vanilla JS, TypeScript, VSCode Webview API

---

### Task 1: 统一 CSS 变量体系 — Query Result

**Files:**
- Modify: `media/query-result.css`

- [ ] **Step 1: 替换 `:root` CSS 变量为玻璃拟态体系**

将 `media/query-result.css` 的 `:root` 变量块（第7-35行）替换为：

```css
:root {
  --accent: var(--vscode-button-background, #4a9eff);
  --accent-dim: rgba(74, 158, 255, 0.10);
  --accent-glow: rgba(74, 158, 255, 0.25);
  --bg: var(--vscode-editor-background, #1e1e2e);
  --surface: rgba(255,255,255,0.035);
  --surface2: rgba(255,255,255,0.055);
  --text: var(--vscode-editor-foreground, #cdd6f4);
  --text-secondary: rgba(255,255,255,0.45);
  --border: rgba(255,255,255,0.06);
  --border-hover: rgba(255,255,255,0.12);
  --input-bg: var(--vscode-input-background, #313145);
  --input-border: var(--vscode-input-border, rgba(255,255,255,0.08));
  --input-fg: var(--vscode-input-foreground, #cdd6f4);
  --btn-bg: var(--vscode-button-background, #4a9eff);
  --btn-fg: var(--vscode-button-foreground, #fff);
  --btn-hover: var(--vscode-button-hoverBackground, #5caeff);
  --btn-secondary-bg: rgba(255,255,255,0.04);
  --btn-secondary-hover: rgba(255,255,255,0.08);
  --focus-border: var(--vscode-focusBorder, #4a9eff);
  --hover-bg: rgba(255,255,255,0.04);
  --error-color: var(--vscode-errorForeground, #f44747);
  --warning-color: #e2b714;
  --success-color: #4ec9b0;
  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.25);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.20);
  --glass-blur: blur(24px);
  --glass-border: rgba(255,255,255,0.07);
  --glass-shadow: 0 8px 32px rgba(0,0,0,0.4);
  --glass-inset: inset 0 1px 0 rgba(255,255,255,0.05);
  --type-int: #7cb8ff;
  --type-str: #4ec9b0;
  --type-enum: #ce9178;
  --type-date: #dcdcaa;
  --row-height: 24px;
  --row-num-width: 44px;
  --header-height: 28px;
  --zebra-bg: rgba(255,255,255,0.015);
  --row-selected-bg: rgba(74, 158, 255, 0.12);
  --row-hover-bg: rgba(255,255,255,0.04);
}
```

- [ ] **Step 2: 更新 body 样式**

将 body 样式（第37-46行）的 `background` 改为渐变：

```css
body {
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: 12px;
  color: var(--text);
  background: linear-gradient(145deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 95%, #1a1b35) 50%, var(--bg) 100%);
  line-height: 1.4;
  overflow: hidden;
  height: 100vh;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 3: 更新 .result-panel 为毛玻璃容器**

```css
.result-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow), var(--glass-inset);
  margin: 6px;
  overflow: hidden;
}
```

- [ ] **Step 4: 更新 .header-bar 样式**

```css
.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  height: 36px;
}
```

- [ ] **Step 5: 更新 .header-dot 添加发光效果**

```css
.header-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success-color);
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(78,201,176,0.5);
}
```

- [ ] **Step 6: 更新 .toolbar 按钮样式**

```css
.toolbar {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.03);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  transition: all var(--transition);
  font-family: inherit;
  white-space: nowrap;
}

.tb-btn:hover {
  background: var(--btn-secondary-hover);
  border-color: var(--border-hover);
  color: var(--text);
}

.tb-btn:active {
  transform: scale(0.96);
  background: var(--btn-secondary-bg);
}

.tb-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}
```

- [ ] **Step 7: 更新 .tb-separator 样式**

```css
.tb-separator {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 4px;
  flex-shrink: 0;
}
```

- [ ] **Step 8: 更新 .btn 按钮样式**

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all var(--transition);
  white-space: nowrap;
  font-family: inherit;
}

.btn-primary {
  background: var(--btn-bg);
  color: var(--btn-fg);
  box-shadow: 0 2px 8px rgba(74,158,255,0.2);
}

.btn-primary:hover {
  background: var(--btn-hover);
  box-shadow: 0 2px 12px rgba(74,158,255,0.3);
}

.btn-primary:active {
  transform: scale(0.96);
}

.btn-secondary {
  background: var(--btn-secondary-bg);
  color: var(--text);
  border: 1px solid var(--input-border);
}

.btn-secondary:hover {
  background: var(--btn-secondary-hover);
  border-color: var(--border-hover);
}

.btn-secondary:active {
  transform: scale(0.96);
}
```

- [ ] **Step 9: 更新 .grid-header-table th 样式**

```css
.grid-header-table th {
  padding: 0 8px;
  height: var(--header-height);
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  border-right: 1px solid rgba(255,255,255,0.03);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  position: relative;
  vertical-align: middle;
  letter-spacing: 0.3px;
}

.grid-header-table th:hover {
  background: var(--hover-bg);
}
```

- [ ] **Step 10: 显示 .col-type 类型标签**

```css
.col-type {
  display: inline-block;
  margin-left: 4px;
  font-size: 9px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 3px;
  vertical-align: middle;
  opacity: 0.6;
}
```

- [ ] **Step 11: 更新 .grid-body-table 行样式**

```css
.grid-body-table td {
  padding: 0 8px;
  height: var(--row-height);
  font-size: 12px;
  border-right: 1px solid rgba(255,255,255,0.025);
  border-bottom: 1px solid rgba(255,255,255,0.025);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
  transition: background 0.15s ease;
}

.grid-body-table tr:nth-child(even) td {
  background: var(--zebra-bg);
}

.grid-body-table tr:hover td {
  background: var(--row-hover-bg);
}
```

- [ ] **Step 12: 更新 .row-num 样式**

```css
.grid-body-table td.row-num {
  width: var(--row-num-width);
  min-width: var(--row-num-width);
  max-width: var(--row-num-width);
  text-align: center;
  color: rgba(255,255,255,0.2);
  font-size: 10px;
  background: rgba(255,255,255,0.02);
  border-right: 1px solid var(--border);
}

.grid-body-table tr:nth-child(even) td.row-num {
  background: rgba(255,255,255,0.02);
}

.grid-body-table tr:hover td.row-num {
  background: rgba(255,255,255,0.04);
}
```

- [ ] **Step 13: 更新 .bottom-bar 样式**

```css
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255,255,255,0.02);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  padding: 0 14px;
  height: 32px;
}
```

- [ ] **Step 14: 更新 .tab-bar 和 .tab-btn 样式**

```css
.tab-bar {
  display: flex;
  gap: 0;
  background: rgba(255,255,255,0.02);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.tab-btn {
  padding: 4px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all var(--transition);
  font-family: inherit;
}

.tab-btn:hover {
  color: var(--text);
  background: rgba(255,255,255,0.03);
}

.tab-btn.active {
  color: var(--accent);
  background: rgba(74,158,255,0.08);
  font-weight: 600;
  border-bottom: 2px solid var(--accent);
}
```

- [ ] **Step 15: 更新 .page-btn 和分页样式**

```css
.page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--btn-secondary-bg);
  color: var(--text);
  cursor: pointer;
  font-size: 11px;
  transition: all var(--transition);
}

.page-btn:hover {
  background: var(--btn-secondary-hover);
  border-color: var(--border-hover);
}

.page-btn:active {
  transform: scale(0.96);
}
```

- [ ] **Step 16: 更新输入框 focus 样式**

将所有 `box-shadow: none` 的 focus 状态改为发光环：

```css
.filter-val:focus,
.filter-col:focus,
.filter-op:focus {
  outline: none;
  border-color: var(--focus-border);
  box-shadow: 0 0 0 2px var(--accent-dim);
}
```

同样更新 `.form-field-value input:focus`、`.form-field-value select:focus`、`.form-field-value textarea:focus`、`.page-jump:focus`。

- [ ] **Step 17: 更新滚动条样式**

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.15);
}

::-webkit-scrollbar-corner {
  background: transparent;
}
```

- [ ] **Step 18: 更新 .dialog 样式**

```css
.dialog {
  background: var(--surface2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow), var(--glass-inset);
  width: 500px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
```

- [ ] **Step 19: 更新 .filter-bar 和筛选输入框样式**

```css
.filter-bar {
  display: none;
  padding: 8px 14px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.filter-col,
.filter-op {
  padding: 4px 8px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
  transition: border-color var(--transition);
}

.filter-val {
  flex: 1;
  min-width: 100px;
  padding: 4px 8px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  transition: border-color var(--transition);
}
```

- [ ] **Step 20: 更新 .view-btn-active 样式**

```css
.view-btn-active {
  background: rgba(74,158,255,0.12) !important;
  color: var(--accent) !important;
  border-color: rgba(74,158,255,0.2) !important;
}
```

- [ ] **Step 21: 更新 .history-item 样式**

```css
.history-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
  cursor: pointer;
  transition: all var(--transition);
  background: rgba(255,255,255,0.02);
}

.history-item:hover {
  border-color: rgba(74,158,255,0.3);
  background: rgba(74,158,255,0.06);
}
```

---

### Task 2: 统一 CSS 变量体系 — Table Designer

**Files:**
- Modify: `media/table-designer.css`

- [ ] **Step 1: 替换 `:root` CSS 变量为与 Query Result 一致的体系**

将 `media/table-designer.css` 的 `:root` 变量块（第7-38行）替换为与 Task 1 完全一致的变量体系（包括 --glass-blur, --glass-border, --glass-shadow, --glass-inset, --type-int, --type-str, --type-enum, --type-date）。

- [ ] **Step 2: 更新 body 背景**

```css
body {
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: 13px;
  color: var(--text);
  background: linear-gradient(145deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 95%, #1a1b35) 50%, var(--bg) 100%);
  line-height: 1.5;
  overflow: hidden;
  height: 100vh;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 3: 更新 .designer-panel 为毛玻璃容器**

```css
.designer-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow), var(--glass-inset);
  margin: 6px;
  overflow: hidden;
}
```

- [ ] **Step 4: 更新 .header-bar 样式**

```css
.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
```

- [ ] **Step 5: 更新 .btn-primary Save 按钮样式**

```css
.btn-primary {
  background: linear-gradient(135deg, var(--btn-bg), color-mix(in srgb, var(--btn-bg) 85%, #000));
  color: var(--btn-fg);
  box-shadow: 0 2px 8px rgba(74,158,255,0.3);
}

.btn-primary:hover {
  box-shadow: 0 4px 16px rgba(74,158,255,0.4);
}

.btn-primary:active {
  transform: scale(0.96);
  box-shadow: 0 1px 4px rgba(74,158,255,0.2);
}
```

- [ ] **Step 6: 更新 .tab-bar 和 .tab-btn 样式**

```css
.tab-bar {
  display: flex;
  gap: 2px;
  padding: 0 18px;
  background: rgba(255,255,255,0.01);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tab-btn {
  padding: 10px 18px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all var(--transition);
  font-family: inherit;
}

.tab-btn:hover {
  color: var(--text);
  background: var(--hover-bg);
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
```

- [ ] **Step 7: 更新 .design-table 样式**

```css
.design-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.design-table th {
  padding: 8px 10px;
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.design-table td {
  padding: 4px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.025);
  vertical-align: middle;
}

.design-table tr:hover td {
  background: var(--hover-bg);
}
```

- [ ] **Step 8: 更新 .constraint-btn 样式**

```css
.constraint-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 22px;
  padding: 0 4px;
  border: 1px solid var(--input-border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}

.constraint-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.constraint-btn.active {
  background: var(--accent-dim);
  border-color: rgba(74,158,255,0.25);
  color: var(--accent);
}
```

- [ ] **Step 9: 更新 .cell-input / .cell-select focus 样式**

确保所有 focus 状态使用发光环：

```css
.cell-input:focus,
.cell-select:focus {
  outline: none;
  border-color: var(--focus-border);
  background: var(--input-bg);
  box-shadow: 0 0 0 2px var(--accent-dim);
}
```

- [ ] **Step 10: 更新 .sql-preview-bar 样式**

```css
.sql-preview-bar {
  flex-shrink: 0;
  height: 200px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.02);
}
```

- [ ] **Step 11: 更新 .dialog 样式**

```css
.dialog {
  background: var(--surface2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow), var(--glass-inset);
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
```

- [ ] **Step 12: 更新滚动条样式**

与 Task 1 Step 17 一致的滚动条样式。

---

### Task 3: Query Result JS — 列类型标签渲染

**Files:**
- Modify: `media/query-result.js`

- [ ] **Step 1: 添加类型颜色映射函数**

在 `query-result.js` 的 `state` 定义之后（约第189行后），添加：

```javascript
function getTypeColor(type) {
    if (!type) return '';
    var t = type.toUpperCase();
    if (t.match(/INT|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|BIT|BOOL/)) return 'var(--type-int)';
    if (t.match(/CHAR|TEXT|CLOB|ENUM|SET|JSON/)) return 'var(--type-str)';
    if (t.match(/DATE|TIME|TIMESTAMP|YEAR/)) return 'var(--type-date)';
    if (t.match(/BLOB|BINARY|VARBINARY/)) return 'var(--type-enum)';
    return 'var(--type-str)';
}
```

- [ ] **Step 2: 更新 renderHeader 函数中的类型标签**

在 `renderHeader` 函数中（约第407-409行），将 `typeSpan` 的渲染改为带颜色标签：

将：
```javascript
        const typeSpan = document.createElement('span');
        typeSpan.className = 'col-type';
        typeSpan.textContent = col.type || '';
```

替换为：
```javascript
        const typeSpan = document.createElement('span');
        typeSpan.className = 'col-type';
        typeSpan.textContent = col.type || '';
        var typeColor = getTypeColor(col.type);
        if (typeColor) {
            typeSpan.style.color = typeColor;
            typeSpan.style.background = typeColor.replace(')', ',0.08)').replace('var(', 'rgba(').replace('--type-int', '74,158,255').replace('--type-str', '78,201,176').replace('--type-enum', '206,145,120').replace('--type-date', '220,220,170');
        }
```

注意：由于 CSS 变量不能直接用于 JS 计算，改用内联样式直接设置颜色：

```javascript
        const typeSpan = document.createElement('span');
        typeSpan.className = 'col-type';
        typeSpan.textContent = col.type || '';
        var typeColorInfo = getTypeColorInfo(col.type);
        if (typeColorInfo) {
            typeSpan.style.color = typeColorInfo.color;
            typeSpan.style.background = typeColorInfo.bg;
            typeSpan.style.border = '1px solid ' + typeColorInfo.border;
        }
```

并更新 `getTypeColor` 为 `getTypeColorInfo`：

```javascript
function getTypeColorInfo(type) {
    if (!type) return null;
    var t = type.toUpperCase();
    if (t.match(/INT|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|BIT|BOOL/)) {
        return { color: '#7cb8ff', bg: 'rgba(74,158,255,0.08)', border: 'rgba(74,158,255,0.12)' };
    }
    if (t.match(/CHAR|TEXT|CLOB|ENUM|SET|JSON/)) {
        return { color: '#4ec9b0', bg: 'rgba(78,201,176,0.08)', border: 'rgba(78,201,176,0.12)' };
    }
    if (t.match(/DATE|TIME|TIMESTAMP|YEAR/)) {
        return { color: '#dcdcaa', bg: 'rgba(220,220,170,0.08)', border: 'rgba(220,220,170,0.12)' };
    }
    if (t.match(/BLOB|BINARY|VARBINARY/)) {
        return { color: '#ce9178', bg: 'rgba(206,145,120,0.08)', border: 'rgba(206,145,120,0.12)' };
    }
    return { color: '#4ec9b0', bg: 'rgba(78,201,176,0.08)', border: 'rgba(78,201,176,0.12)' };
}
```

- [ ] **Step 3: 更新表单视图中的类型标签**

在 `query-result.js` 中搜索 `typeSpan.textContent = col.type` （约第1466行），同样应用 `getTypeColorInfo`。

---

### Task 4: 修复 Webview 面板显示 + OutputChannel 优化

**Files:**
- Modify: `src/database/commands/QueryCommands.ts`
- Modify: `src/database/commands/SchemaCommands.ts`

- [ ] **Step 1: QueryCommands.ts — 移除 outputChannel.show() 和表格数据输出**

在 `QueryCommands.ts` 中（约第236-264行），将：

```typescript
            outputChannel.show(true);
            outputChannel.clear();

            if (result.status === 'error') {
                outputChannel.appendLine(`❌ Error: ${result.error?.message || 'Unknown error'}`);
                outputChannel.appendLine(`   SQL: ${statement.sql}`);
                queryResultPanel.showError(result.error as QueryError);
            } else {
                outputChannel.appendLine(`✅ Query executed successfully (${result.executionTime}ms, ${result.rowCount} rows)`);
                outputChannel.appendLine(`   SQL: ${statement.sql}`);
                outputChannel.appendLine('');

                if (result.columns.length > 0) {
                    const header = result.columns.map((c) => c.name).join('\t');
                    outputChannel.appendLine(header);
                    const separator = result.columns.map(() => '---').join('\t');
                    outputChannel.appendLine(separator);

                    for (const row of result.rows) {
                        const line = result.columns
                            .map((c) => String(row[c.name] ?? 'NULL'))
                            .join('\t');
                        outputChannel.appendLine(line);
                    }

                    if (result.affectedRows !== undefined && result.affectedRows > 0) {
                        outputChannel.appendLine(`\nAffected rows: ${result.affectedRows}`);
                    }
                }

                queryResultPanel.showResult(result, activeConfig?.name, activeConfig?.color);
            }
```

替换为：

```typescript
            if (result.status === 'error') {
                outputChannel.appendLine(`❌ Error: ${result.error?.message || 'Unknown error'}`);
                outputChannel.appendLine(`   SQL: ${statement.sql}`);
                queryResultPanel.showError(result.error as QueryError);
            } else {
                outputChannel.appendLine(`✅ Query executed successfully (${result.executionTime}ms, ${result.rowCount} rows)`);
                outputChannel.appendLine(`   SQL: ${statement.sql}`);

                if (result.affectedRows !== undefined && result.affectedRows > 0) {
                    outputChannel.appendLine(`   Affected rows: ${result.affectedRows}`);
                }

                queryResultPanel.showResult(result, activeConfig?.name, activeConfig?.color);
            }
```

- [ ] **Step 2: SchemaCommands.ts — 同样优化 OutputChannel 输出**

在 `SchemaCommands.ts` 中（约第167-193行），将 `outputChannel.show(true)` 和表格数据输出移除，仅保留执行状态日志：

```typescript
                if (result.status === 'error') {
                    outputChannel.appendLine(`❌ Error: ${result.error?.message || 'Unknown error'}`);
                    outputChannel.appendLine(`   SQL: ${sql}`);
                    queryResultPanel.showError(result.error as QueryError);
                } else {
                    outputChannel.appendLine(`✅ Query executed successfully (${result.executionTime}ms, ${result.rowCount} rows)`);
                    outputChannel.appendLine(`   SQL: ${sql}`);

                    queryResultPanel.showResult(result, conn?.name, conn?.color, name);
                }
```

- [ ] **Step 3: SchemaCommands.ts — 确保 Webview 面板正确聚焦**

在 `viewTableData` 命令中，`queryResultPanel.showResult()` 调用后，面板应自动获得焦点。检查 `QueryResultPanel.createOrShow` 方法，确认 `panel.reveal()` 被正确调用。当前代码在 `createOrShow` 中使用 `vscode.ViewColumn.Two`，这应该是正确的。无需额外修改，但移除 `outputChannel.show(true)` 后焦点自然回到 Webview。

---

### Task 5: 更新测试文件

**Files:**
- Modify: `src/test/queryResult.test.ts`

- [ ] **Step 1: 更新 CSS 测试中的文件路径**

测试文件引用 `src/views/queryResult/resultPanel.css`（第1520行），但实际 CSS 文件在 `media/query-result.css`。更新路径：

```typescript
    const cssPath = path.join(__dirname, '..', '..', 'media', 'query-result.css');
```

- [ ] **Step 2: 更新 CSS 测试断言**

确保 CSS 测试仍然通过。关键断言检查：
- `--vscode-` 变量存在 ✓（新变量体系仍使用）
- `cell-null` 样式存在 ✓
- `selected` 样式存在 ✓
- `sort-indicator` 样式存在 ✓
- `grid-body-wrapper` 样式存在 ✓

新增断言验证玻璃拟态变量：

```typescript
    test('CSS should include glassmorphism variables', () => {
        const css = fs.readFileSync(cssPath, 'utf-8');
        assert.ok(css.includes('backdrop-filter'), 'CSS should use backdrop-filter');
        assert.ok(css.includes('--glass-blur'), 'CSS should define --glass-blur');
        assert.ok(css.includes('--type-int'), 'CSS should define type color variables');
    });
```

- [ ] **Step 3: 更新 JS 测试中的文件路径**

测试文件引用 `src/views/queryResult/resultPanel.js`（第1553行），但实际 JS 文件在 `media/query-result.js`。更新路径：

```typescript
    const jsPath = path.join(__dirname, '..', '..', 'media', 'query-result.js');
```

- [ ] **Step 4: 运行测试验证**

Run: `npm run compile && npm test`
Expected: 所有测试通过

---

### Task 6: 最终验证和清理

**Files:**
- All modified files

- [ ] **Step 1: 编译项目**

Run: `npm run compile`
Expected: 无编译错误

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无 lint 错误

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 4: 手动验证**

在 VSCode 中按 F5 启动扩展开发宿主，验证：
1. 执行 SQL 查询 → Query Result 面板正确显示，毛玻璃效果生效
2. 右键表 → View Table Data → Webview 面板显示（非 OutputChannel）
3. 右键 → Design Table → Table Designer 面板毛玻璃效果生效
4. 切换浅色/深色主题 → 样式自动适配
5. 列头类型标签正确显示颜色
6. 按钮 hover/active 动画流畅
7. 对话框毛玻璃效果
