# UI/UE 全面统一升级设计规范 — 轻量玻璃拟态 + Navicat 风格

## 设计方向

**轻量玻璃拟态**：保留半透明+模糊的深度感，但降低强度（更克制的透明度、更轻的阴影），对标 Navicat 的专业克制感。所有 6 个面板统一应用。

## 统一 CSS 变量体系

所有面板共享以下变量定义（替换各自独立的 `:root`）：

```css
:root {
  --accent: var(--vscode-button-background, #4a9eff);
  --accent-dim: rgba(74, 158, 255, 0.10);
  --accent-glow: rgba(74, 158, 255, 0.20);
  --bg: var(--vscode-editor-background, #1e1e2e);
  --surface: rgba(255,255,255,0.03);
  --surface2: rgba(255,255,255,0.05);
  --surface3: rgba(255,255,255,0.07);
  --text: var(--vscode-editor-foreground, #cdd6f4);
  --text-secondary: var(--vscode-descriptionForeground, rgba(255,255,255,0.45));
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
  --error-dim: rgba(244, 71, 71, 0.12);
  --warning-color: #e2b714;
  --warning-dim: rgba(226, 183, 20, 0.12);
  --success-color: #4ec9b0;
  --success-dim: rgba(78, 201, 176, 0.12);
  --info-color: #4a9eff;
  --info-dim: rgba(74, 158, 255, 0.12);
  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.15);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.20);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.25);
  --glass-blur: blur(16px);
  --glass-border: rgba(255,255,255,0.06);
  --glass-shadow: 0 4px 16px rgba(0,0,0,0.25);
  --glass-inset: inset 0 1px 0 rgba(255,255,255,0.04);
}
```

### 与当前 glassmorphism 的差异

| 属性 | 当前（强玻璃） | 统一后（轻量玻璃） |
|------|--------------|-------------------|
| --surface | 0.035 | 0.03 |
| --surface2 | 0.055 | 0.05 |
| --glass-blur | blur(24px) | blur(16px) |
| --glass-shadow | 0 8px 32px 0.4 | 0 4px 16px 0.25 |
| --accent-glow | 0.25 | 0.20 |

## 统一 body 样式

```css
body {
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: 13px;
  color: var(--text);
  background: var(--bg);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
```

全屏面板（query-result, table-designer, explain-panel, data-transfer）：
```css
body { overflow: hidden; height: 100vh; }
```

滚动面板（connection-dialog, config-editor）：
```css
body { overflow: auto; }
```

## 统一面板容器

所有面板主容器统一应用轻量玻璃效果：

```css
.xxx-panel {
  display: flex;
  flex-direction: column;
  height: 100vh; /* 或 min-height: 100vh */
  background: var(--surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow), var(--glass-inset);
  margin: 4px;
  overflow: hidden;
}
```

## 统一 Header Bar

```css
.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  height: 36px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
```

## 统一按钮系统

### 工具栏按钮（.tb-btn）
用于紧凑工具栏中的操作按钮：

```css
.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
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
.tb-btn:hover { background: var(--btn-secondary-hover); color: var(--text); border-color: var(--border-hover); }
.tb-btn:active { transform: scale(0.96); }
.tb-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
.tb-btn.active { background: var(--accent-dim); color: var(--accent); border-color: rgba(74,158,255,0.2); }
```

### 通用按钮（.btn）
用于表单和对话框中的操作按钮：

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all var(--transition);
  white-space: nowrap;
  font-family: inherit;
}
.btn-primary { background: var(--btn-bg); color: var(--btn-fg); box-shadow: 0 1px 4px rgba(74,158,255,0.2); }
.btn-primary:hover { background: var(--btn-hover); box-shadow: 0 2px 8px rgba(74,158,255,0.3); }
.btn-primary:active { transform: scale(0.96); }
.btn-secondary { background: var(--btn-secondary-bg); color: var(--text); border: 1px solid var(--input-border); }
.btn-secondary:hover { background: var(--btn-secondary-hover); border-color: var(--border-hover); }
.btn-secondary:active { transform: scale(0.96); }
.btn-ghost { background: transparent; color: var(--text-secondary); }
.btn-ghost:hover { background: rgba(255,255,255,0.04); color: var(--text); }
```

## 统一 Tab 系统

### 底部线条式 Tab（用于面板内导航）
```css
.tab-bar {
  display: flex;
  gap: 0;
  padding: 0 12px;
  background: rgba(255,255,255,0.01);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tab-btn {
  padding: 8px 16px;
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
.tab-btn:hover { color: var(--text); background: var(--hover-bg); }
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
```

## 统一对话框

```css
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog {
  background: var(--surface3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow), var(--glass-inset);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.dialog-header { padding: 10px 14px; font-size: 13px; font-weight: 600; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.dialog-body { padding: 12px 14px; overflow: auto; flex: 1; }
.dialog-footer { padding: 10px 14px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 6px; flex-shrink: 0; }
```

## 统一输入框

```css
.config-select, .config-input, .form-input, .form-select {
  width: 100%;
  padding: 6px 10px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  transition: all var(--transition);
  -webkit-appearance: none;
  appearance: none;
}
.config-select:focus, .config-input:focus, .form-input:focus, .form-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-dim);
}
```

## 统一滚动条

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
::-webkit-scrollbar-corner { background: transparent; }
```

## 统一 Toggle 开关

```css
.toggle { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; inset: 0; border-radius: 20px;
  background: rgba(255,255,255,0.10); cursor: pointer;
  transition: all var(--transition);
}
.toggle-slider::before {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #fff; transition: all var(--transition);
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.toggle input:checked + .toggle-slider { background: var(--accent); box-shadow: 0 0 6px var(--accent-glow); }
.toggle input:checked + .toggle-slider::before { transform: translateX(16px); }
.toggle input:focus-visible + .toggle-slider { box-shadow: 0 0 0 2px var(--accent-glow); }
```

## 各面板特殊保留

### Query Result
- 保留数据网格系统（grid-table, row-num, zebra, cell-editing）
- 保留 SQL 编辑器分割面板
- 保留分页系统
- body font-size 统一为 13px（当前 12px 太小）

### Table Designer
- 保留字段表格系统（design-table, cell-input, constraint-btn）
- 保留 SQL 预览栏
- 保留拖拽排序

### Connection Dialog
- 保留方言选择器网格
- 保留颜色选择器
- 添加玻璃容器包裹

### Config Editor
- 保留搜索框 + 预设条
- 保留配置组折叠系统
- 保留 Lint 规则列表
- Tab 改为底部线条式（统一）

### Explain Panel
- 保留树形视图 + 表格视图 + JSON 视图
- 保留节点类型彩色标签
- 保留优化建议区

### Data Transfer
- 保留步骤指示器
- 保留列映射区
- 保留进度条
- 添加玻璃容器包裹

## 涉及文件

- `media/query-result.css` — 变量统一 + 微调
- `media/connection-dialog.css` — 完全重写为统一风格
- `media/table-designer.css` — 变量统一 + 微调
- `media/config-editor.css` — 完全重写为统一风格
- `media/explain-panel.css` — 完全重写为统一风格
- `media/data-transfer.css` — 完全重写为统一风格
- `src/views/queryResult/resultPanel.css` — 同步 media/query-result.css
- `src/views/tableDesigner/designerPanel.css` — 同步 media/table-designer.css
