# UI/UX 优化设计文档 — 现代玻璃拟态风格

## 背景

当前 SQL All-in-One 扩展的 Query Result 和 Table Designer 界面存在以下问题：

1. **Webview 面板未正确显示**：`viewTableData` 命令虽然代码中创建了 QueryResultPanel，但用户实际看到的是 OutputChannel 控制台纯文本输出（黑底白字，对齐混乱）
2. **样式粗糙**：Webview 面板边框生硬、无圆角、无动画、按钮拥挤、层次感差
3. **两套面板样式不统一**：Query Result 用 `--radius: 3px`、`--transition: none`，Table Designer 用 `--radius: 8px`、`--transition: 0.2s`

## 设计方向

**现代玻璃拟态（Glassmorphism）**：以毛玻璃层叠为核心，通过半透明背景 + 模糊效果 + 微妙光影，创造深度感和空间感。数据密集场景保持可读性，同时大幅提升视觉品质。

## 架构优化

### 1. Webview 面板为主展示

- QueryResultPanel 作为查询结果的**主要展示方式**，确保正确渲染和聚焦
- OutputChannel 降级为**辅助日志**，仅记录执行状态信息（成功/失败/耗时），不再输出表格数据
- 查询执行后自动聚焦 Webview 面板而非 OutputChannel

### 2. 统一 CSS 变量体系

合并两套面板的 CSS 变量，建立统一的设计系统：

```css
:root {
  /* 容器 & 背景 */
  --bg: var(--vscode-editor-background, #1e1e2e);
  --surface: rgba(255,255,255,0.035);
  --surface2: rgba(255,255,255,0.055);
  --glass-blur: blur(24px);
  --glass-border: rgba(255,255,255,0.07);
  --glass-shadow: 0 8px 32px rgba(0,0,0,0.4);
  --glass-inset: inset 0 1px 0 rgba(255,255,255,0.05);

  /* 圆角 & 动画 */
  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.25);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.20);

  /* 颜色 */
  --accent: var(--vscode-button-background, #4a9eff);
  --accent-dim: rgba(74,158,255,0.10);
  --accent-glow: rgba(74,158,255,0.25);
  --text: var(--vscode-editor-foreground, #cdd6f4);
  --text-secondary: rgba(255,255,255,0.45);
  --border: rgba(255,255,255,0.06);
  --border-hover: rgba(255,255,255,0.12);
  --input-bg: var(--vscode-input-background, #313145);
  --input-border: var(--vscode-input-border, rgba(255,255,255,0.08));
  --input-fg: var(--vscode-input-foreground, #cdd6f4);
  --focus-border: var(--vscode-focusBorder, #4a9eff);
  --hover-bg: rgba(255,255,255,0.04);

  /* 语义色 */
  --error-color: var(--vscode-errorForeground, #f44747);
  --warning-color: #e2b714;
  --success-color: #4ec9b0;

  /* 类型颜色 */
  --type-int: #7cb8ff;
  --type-str: #4ec9b0;
  --type-enum: #ce9178;
  --type-date: #dcdcaa;
}
```

## Query Result 面板优化

### 毛玻璃容器

整个面板包裹在毛玻璃容器中：

```css
.result-panel {
  background: var(--surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow), var(--glass-inset);
}
```

### Header Bar

- 连接名 + 数据库名 + 状态指示灯（带发光）+ 执行时间 pill 标签 + 行数 pill 标签
- 连接图标用渐变背景圆角方块

### Toolbar

- 主操作按钮（Run）：accent 色半透明背景 + 微妙边框
- 次要按钮：半透明 + 微妙边框
- 视图切换（Grid/Form）：分段控件样式，active 项高亮
- 分隔符用半透明竖线

### 数据网格

- 表头：显示列名 + 类型标签（INT 蓝色、VARCHAR 绿色、ENUM 橙色）+ 主键🔑标记
- 斑马纹：`rgba(255,255,255,0.015)` 极微妙
- 行 hover：`rgba(255,255,255,0.04)` 过渡动画
- 选中行：accent 色半透明背景
- ENUM 值用彩色标签（active 绿色、inactive 红色、pending 黄色）
- NULL 值斜体 + 极淡色

### Bottom Bar

- Tab 切换用分段控件包裹（圆角背景 + active 高亮）
- 分页按钮圆角 5px + 微妙边框

## Table Designer 面板优化

### Header

- 图标用渐变背景圆角方块
- 模式标签（CREATE/ALTER）用彩色 pill
- Save 按钮：渐变背景 + 投影发光
- 关闭按钮：半透明

### Fields 表格

- 整体用圆角 10px 容器包裹 + 微妙边框 + 阴影
- 表头：大写字母 + letter-spacing + 极淡色
- 类型列：用彩色标签（INT 蓝色、VARCHAR 绿色）
- 约束按钮：激活状态彩色高亮+边框，未激活灰色淡化
- 主键列名旁加🔑标记
- Add Field 按钮：虚线边框

### SQL Preview

- 语法高亮保持（keyword 蓝、type 绿、string 橙）
- 背景用半透明深色

## 交互系统

### 按钮系统

| 类型 | 默认 | hover | active |
|------|------|-------|--------|
| 主操作 | 渐变背景 + 投影 | 背景变亮 | scale(0.96) + 投影收缩 |
| 次要操作 | 半透明 + 微妙边框 | 背景浮现 + 边框变亮 | scale(0.96) |
| 图标按钮 | 透明 | 背景浮现 | scale(0.96) |

### 输入框

- 默认：透明边框，融入背景
- hover：显示边框 + 背景浮现
- focus：蓝色边框 + `box-shadow: 0 0 0 2px var(--accent-dim)` 发光环
- error：红色边框

### 数据网格

- 行 hover：`transition: background 0.15s ease`
- 单元格编辑：蓝色轮廓 + 内嵌 input
- 排序列：表头显示方向箭头 + accent 色

## OutputChannel 优化

- 保留执行状态日志（成功/失败/耗时/SQL）
- 不再输出表格数据行
- 添加提示："查看 Query Result 面板获取完整结果"

## 实施步骤

1. **修复 Webview 面板显示** — 确保 QueryResultPanel 在 viewTableData 时正确渲染和聚焦
2. **统一 CSS 变量体系** — 合并两套面板的 CSS 变量，建立玻璃拟态设计系统
3. **Query Result 面板美化** — 毛玻璃容器、智能数据标签、精致工具栏、微交互动画
4. **Table Designer 面板美化** — 类型彩色标签、约束按钮优化、Save 按钮渐变发光、SQL 预览美化
5. **OutputChannel 输出优化** — 保留执行日志但不再输出表格数据

## 涉及文件

- `media/query-result.css` — Query Result 样式重写
- `media/query-result.html` — HTML 结构微调（类型标签等）
- `media/query-result.js` — JS 逻辑调整（类型标签渲染等）
- `media/table-designer.css` — Table Designer 样式重写
- `media/table-designer.html` — HTML 结构微调
- `media/table-designer.js` — JS 逻辑调整
- `src/database/commands/QueryCommands.ts` — OutputChannel 输出优化
- `src/database/commands/SchemaCommands.ts` — OutputChannel 输出优化 + Webview 聚焦修复
