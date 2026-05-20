import * as vscode from 'vscode'
import { format, type SqlLanguage } from '../formatter/sqlFormatter'
import type { KeywordCase, DataTypeCase, FunctionCase, IndentStyle, LogicalOperatorNewline } from '../formatter/FormatOptions'

export class ConfigEditorPanel {
    public static currentPanel: ConfigEditorPanel | undefined
    public static readonly viewType = 'hiveFormatterConfig'

    private readonly _panel: vscode.WebviewPanel
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
            'Hive Formatter - 配置编辑器',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
            }
        )

        ConfigEditorPanel.currentPanel = new ConfigEditorPanel(panel)
    }

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel

        this._update()

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'updateConfig':
                        await this._updateConfig(message.data)
                        break
                    case 'resetConfig':
                        await this._resetConfig()
                        break
                    case 'previewFormat':
                        await this._previewFormat(message.sql)
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
        this._panel.webview.html = await this._getHtmlForWebview()
        await this._sendCurrentConfig()
    }

    private async _getHtmlForWebview() {
        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hive Formatter - 配置编辑器</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
            --accent: #4a9eff;
            --accent-dim: rgba(74, 158, 255, 0.10);
            --accent-glow: rgba(74, 158, 255, 0.25);
            --bg: var(--vscode-editor-background, #1e1e2e);
            --surface: var(--vscode-sideBar-background, #252536);
            --surface2: var(--vscode-editorWidget-background, #2a2a3c);
            --text: var(--vscode-editor-foreground, #cdd6f4);
            --text-secondary: var(--vscode-descriptionForeground, #7c7f93);
            --border: var(--vscode-panel-border, rgba(255,255,255,0.06));
            --input-bg: var(--vscode-input-background, #313145);
            --input-border: var(--vscode-input-border, rgba(255,255,255,0.08));
            --btn-bg: var(--vscode-button-background, #4a9eff);
            --btn-hover: var(--vscode-button-hoverBackground, #5caeff);
            --btn-secondary-bg: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.06));
            --btn-secondary-hover: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.10));
            --error-color: #f44747;
            --warning-color: #e2b714;
            --info-color: #4a9eff;
            --success-color: #4ec9b0;
            --radius-sm: 6px;
            --radius: 8px;
            --radius-lg: 12px;
            --shadow: 0 1px 8px rgba(0,0,0,0.12);
            --shadow-lg: 0 8px 32px rgba(0,0,0,0.20);
            --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
            font-size: 13px;
            color: var(--text);
            background: var(--bg);
            line-height: 1.6;
            padding: 20px 24px;
            -webkit-font-smoothing: antialiased;
        }

        .container { max-width: 1400px; margin: 0 auto; }

        /* ── Header ── */
        .header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
        }
        .header-logo {
            width: 36px; height: 36px;
            border-radius: var(--radius);
            background: linear-gradient(135deg, var(--accent), #7c3aed);
            display: flex; align-items: center; justify-content: center;
            font-size: 18px;
            box-shadow: 0 4px 16px var(--accent-glow);
            flex-shrink: 0;
        }
        .header-info { flex: 1; }
        .header h1 {
            font-size: 20px; font-weight: 700;
            background: linear-gradient(135deg, var(--text), var(--accent));
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .header-sub { font-size: 12px; color: var(--text-secondary); margin-top: 1px; }
        .header-actions { display: flex; gap: 8px; flex-shrink: 0; }

        /* ── Buttons ── */
        .btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 8px 16px; border: none; border-radius: var(--radius-sm);
            cursor: pointer; font-size: 13px; font-weight: 600;
            transition: all var(--transition); white-space: nowrap;
            font-family: inherit;
        }
        .btn-primary {
            background: var(--btn-bg); color: #fff;
            box-shadow: 0 2px 8px var(--accent-glow);
        }
        .btn-primary:hover { background: var(--btn-hover); transform: translateY(-1px); box-shadow: 0 4px 16px var(--accent-glow); }
        .btn-secondary { background: var(--btn-secondary-bg); color: var(--text); }
        .btn-secondary:hover { background: var(--btn-secondary-hover); }
        .btn-ghost { background: transparent; color: var(--text-secondary); padding: 8px 14px; }
        .btn-ghost:hover { background: rgba(255,255,255,0.04); color: var(--text); }

        /* ── Presets Row ── */
        .presets-bar {
            display: flex; align-items: center; gap: 10px;
            margin-bottom: 16px; padding: 10px 16px;
            background: var(--surface); border: 1px solid var(--border);
            border-radius: var(--radius);
        }
        .presets-bar-label { font-size: 11px; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; flex-shrink: 0; }
        .presets-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .preset-chip {
            padding: 5px 14px; border-radius: 20px; border: 1px solid var(--border);
            background: transparent; color: var(--text-secondary); cursor: pointer;
            font-size: 12px; font-weight: 500; transition: all var(--transition);
            font-family: inherit;
        }
        .preset-chip:hover { border-color: var(--accent); color: var(--text); background: var(--accent-dim); }
        .preset-chip.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); font-weight: 600; }

        /* ── Main Layout: Top-Bottom ── */
        .main-content {
            display: flex;
            flex-direction: column;
            gap: 0;
        }

        /* ── Preview Panel (Top) ── */
        .preview-panel {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg) var(--radius-lg) 0 0;
            overflow: hidden;
        }
        .preview-body {
            padding: 16px 20px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            min-height: 200px;
            max-height: 420px;
        }
        .preview-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .preview-col-label {
            font-size: 11px; font-weight: 700; color: var(--text-secondary);
            text-transform: uppercase; letter-spacing: 0.6px;
        }
        .preview-editor {
            flex: 1; width: 100%; min-height: 100px; padding: 12px;
            background: var(--input-bg); border: 1px solid var(--input-border);
            border-radius: var(--radius); color: var(--text);
            font-family: var(--vscode-editor-font-family, 'SF Mono', 'Fira Code', monospace);
            font-size: 12.5px; line-height: 1.5; resize: none;
            transition: border-color var(--transition);
        }
        .preview-editor:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
        .preview-actions { display: flex; gap: 8px; }
        .preview-result {
            flex: 1; padding: 12px; min-height: 100px;
            background: var(--bg); border: 1px solid var(--border);
            border-radius: var(--radius); font-family: var(--vscode-editor-font-family, 'SF Mono', 'Fira Code', monospace);
            font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; overflow-x: auto;
            transition: all var(--transition);
        }
        .preview-result.empty {
            display: flex; align-items: center; justify-content: center;
            color: var(--text-secondary); font-family: var(--vscode-font-family);
            font-size: 13px;
        }
        .preview-result.success { border-color: rgba(78,201,176,0.3); }

        /* ── Resize Handle ── */
        .resize-handle {
            height: 6px;
            background: var(--surface2);
            border-left: 1px solid var(--border);
            border-right: 1px solid var(--border);
            cursor: ns-resize;
            display: flex; align-items: center; justify-content: center;
            transition: background var(--transition);
        }
        .resize-handle:hover { background: var(--accent-dim); }
        .resize-handle::after {
            content: '';
            width: 40px; height: 3px;
            border-radius: 2px;
            background: rgba(255,255,255,0.15);
        }
        .resize-handle:hover::after { background: var(--accent); }

        /* ── Config Panel (Bottom) ── */
        .config-section {
            background: var(--surface); border: 1px solid var(--border);
            border-top: none;
            border-radius: 0 0 var(--radius-lg) var(--radius-lg);
            overflow: hidden;
        }
        .section-header {
            display: flex; align-items: center; gap: 10px;
            padding: 14px 20px; border-bottom: 1px solid var(--border);
            background: var(--surface2);
        }
        .section-header-icon { font-size: 16px; }
        .section-header h2 { font-size: 14px; font-weight: 700; color: var(--text); }
        .section-body {
            padding: 16px 20px;
            column-width: 340px;
            column-gap: 12px;
            orphans: 1;
            widows: 1;
        }

        /* ── Collapsible Config Group ── */
        .config-group {
            border: 1px solid var(--border);
            border-radius: var(--radius);
            overflow: hidden;
            background: var(--surface2);
            break-inside: avoid;
            margin-bottom: 12px;
        }
        .cg-header {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 14px; cursor: pointer;
            transition: background var(--transition);
            user-select: none;
        }
        .cg-header:hover { background: rgba(255,255,255,0.02); }
        .cg-arrow {
            width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
            transition: transform var(--transition); font-size: 9px; color: var(--text-secondary);
        }
        .cg-arrow.open { transform: rotate(90deg); }
        .cg-icon { font-size: 14px; flex-shrink: 0; }
        .cg-title { font-size: 12.5px; font-weight: 600; color: var(--text); flex: 1; }
        .cg-badge { font-size: 10px; padding: 1px 7px; border-radius: 10px; background: var(--accent-dim); color: var(--accent); font-weight: 600; }
        .cg-body { padding: 0 14px 12px; display: none; }
        .cg-body.open { display: block; }

        /* ── Config Items ── */
        .config-item { margin-bottom: 10px; }
        .config-item:last-child { margin-bottom: 0; }
        .ci-label {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 4px;
        }
        .ci-label-text { font-size: 12px; font-weight: 600; color: var(--text); }
        .ci-label-hint { font-size: 11px; color: var(--text-secondary); }

        /* ── Select & Input ── */
        .config-select, .config-input {
            width: 100%; padding: 7px 10px;
            background: var(--input-bg); border: 1px solid var(--input-border);
            border-radius: var(--radius-sm); color: var(--text);
            font-size: 12.5px; font-family: inherit;
            transition: border-color var(--transition);
            -webkit-appearance: none; appearance: none;
        }
        .config-select {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237c7f93' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
            background-repeat: no-repeat; background-position: right 10px center;
            padding-right: 28px; cursor: pointer;
        }
        .config-input:focus, .config-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
        .config-input:hover, .config-select:hover { border-color: rgba(255,255,255,0.15); }
        .ci-input-row { display: flex; gap: 8px; }
        .ci-input-row .config-select { flex: 1; }

        /* ── Toggle Switch ── */
        .toggle-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 6px 0;
        }
        .toggle-label { font-size: 12px; font-weight: 500; }
        .toggle {
            position: relative; width: 36px; height: 20px; flex-shrink: 0;
        }
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
        .toggle input:checked + .toggle-slider { background: var(--accent); }
        .toggle input:checked + .toggle-slider::before { transform: translateX(16px); }
        .toggle input:focus-visible + .toggle-slider { box-shadow: 0 0 0 2px var(--accent-glow); }

        /* ── Severity Badge ── */
        .severity-badge {
            display: inline-flex; align-items: center; gap: 4px;
            padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.5px;
        }
        .severity-badge.error { background: rgba(244,71,71,0.12); color: var(--error-color); }
        .severity-badge.warning { background: rgba(226,183,20,0.12); color: var(--warning-color); }
        .severity-badge.information { background: rgba(74,158,255,0.12); color: var(--info-color); }
        .severity-dot { width: 5px; height: 5px; border-radius: 50%; }
        .severity-dot.error { background: var(--error-color); }
        .severity-dot.warning { background: var(--warning-color); }
        .severity-dot.information { background: var(--info-color); }

        /* ── Lint Rule Row ── */
        .lint-rule {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .lint-rule:last-child { border-bottom: none; }
        .lint-rule-name { font-size: 12px; font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lint-rule-severity { width: 88px; flex-shrink: 0; }
        .lint-rule-toggle { flex-shrink: 0; }

        /* ── Toast / Status ── */
        .toast {
            position: fixed; top: 20px; right: 20px; z-index: 999;
            padding: 10px 18px; border-radius: var(--radius);
            font-size: 13px; font-weight: 600; pointer-events: none;
            opacity: 0; transform: translateY(-10px); transition: all 0.3s;
            box-shadow: var(--shadow-lg);
        }
        .toast.show { opacity: 1; transform: translateY(0); }
        .toast.success { background: var(--success-color); color: #000; }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

        /* ── Empty State ── */
        .empty-state { text-align: center; padding: 40px 20px; color: var(--text-secondary); }
        .empty-state-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-logo">⚡</div>
            <div class="header-info">
                <h1>Hive Formatter 配置编辑器</h1>
                <div class="header-sub">可视化调整 SQL 格式化选项，实时预览效果</div>
            </div>
            <div class="header-actions">
                <button class="btn btn-ghost" onclick="resetConfig()">↺ 重置默认</button>
                <button class="btn btn-primary" onclick="saveConfig()">✓ 保存配置</button>
            </div>
        </div>
        
        <div class="presets-bar">
            <span class="presets-bar-label">快速预设</span>
            <div class="presets-row">
                <button class="preset-chip active" onclick="applyPreset('default')">默认</button>
                <button class="preset-chip" onclick="applyPreset('hive')">Hive</button>
                <button class="preset-chip" onclick="applyPreset('mysql')">MySQL</button>
                <button class="preset-chip" onclick="applyPreset('compact')">紧凑</button>
            </div>
        </div>
        
        <div class="main-content">
            <div class="preview-panel">
                <div class="section-header">
                    <span class="section-header-icon">👁️</span>
                    <h2>实时预览</h2>
                </div>
                <div class="preview-body">
                    <div class="preview-col">
                        <div class="preview-col-label">输入 SQL</div>
                        <textarea class="preview-editor" id="previewInput" placeholder="输入 SQL 进行预览...">select id,name,email from users where age>18 and status='active' order by created_at desc limit 10;</textarea>
                        <div class="preview-actions">
                            <button class="btn btn-primary" style="flex:1;" onclick="previewFormat()">▶ 格式化预览</button>
                        </div>
                    </div>
                    <div class="preview-col">
                        <div class="preview-col-label">格式化结果</div>
                        <div class="preview-result empty" id="previewResult">点击「格式化预览」查看效果</div>
                    </div>
                </div>
            </div>
            <div class="resize-handle" id="resizeHandle"></div>
            <div class="config-section">
                <div class="section-header">
                    <span class="section-header-icon">⚙️</span>
                    <h2>格式化配置</h2>
                </div>
                <div class="section-body">
                    <!-- 基础设置 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow open">▶</span>
                            <span class="cg-icon">📐</span>
                            <span class="cg-title">基础设置</span>
                        </div>
                        <div class="cg-body open">
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">SQL 方言</span></div>
                                <select class="config-select" id="dialect">
                                    <option value="hive">Apache Hive</option>
                                    <option value="mysql">MySQL</option>
                                    <option value="spark">Spark</option>
                                    <option value="sql">通用 SQL</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 功能开关 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow open">▶</span>
                            <span class="cg-icon">🔌</span>
                            <span class="cg-title">功能开关</span>
                            <span class="cg-badge">12</span>
                        </div>
                        <div class="cg-body open">
                            <div class="toggle-row"><span class="toggle-label">启用增强语法检查</span><label class="toggle"><input type="checkbox" id="enableEnhancedChecks"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">启用 SQL Lint 功能</span><label class="toggle"><input type="checkbox" id="enableLinter"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">显示错误级别诊断</span><label class="toggle"><input type="checkbox" id="showErrorLevel"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">显示警告级别诊断</span><label class="toggle"><input type="checkbox" id="showWarningLevel"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">显示信息级别提示</span><label class="toggle"><input type="checkbox" id="showInfoLevel"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">启用代码折叠</span><label class="toggle"><input type="checkbox" id="enableCodeFolding"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">启用大纲视图</span><label class="toggle"><input type="checkbox" id="enableOutlineView"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">启用状态栏</span><label class="toggle"><input type="checkbox" id="enableStatusBar"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">启用参数高亮</span><label class="toggle"><input type="checkbox" id="enableParameterHighlight"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">启用代码片段</span><label class="toggle"><input type="checkbox" id="enableSnippets"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">启用快速修复</span><label class="toggle"><input type="checkbox" id="enableQuickFix"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">启用智能注释切换</span><label class="toggle"><input type="checkbox" id="enableSmartCommentToggle"><span class="toggle-slider"></span></label></div>
                        </div>
                    </div>

                    <!-- 注释设置 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow open">▶</span>
                            <span class="cg-icon">💬</span>
                            <span class="cg-title">注释设置</span>
                            <span class="cg-badge">3</span>
                        </div>
                        <div class="cg-body open">
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">注释模板作者</span><span class="ci-label-hint">header Snippet 使用</span></div>
                                <input type="text" class="config-input" id="headerAuthor" placeholder="留空则插入时手动输入">
                            </div>
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">注释模板修改人</span><span class="ci-label-hint">为空时回退取作者</span></div>
                                <input type="text" class="config-input" id="headerModifier" placeholder="留空则使用作者名">
                            </div>
                            <div class="toggle-row"><span class="toggle-label">注释模板补全</span><label class="toggle"><input type="checkbox" id="completionCommentSnippets"><span class="toggle-slider"></span></label></div>
                        </div>
                    </div>

                    <!-- Lint 规则 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow open">▶</span>
                            <span class="cg-icon">🔍</span>
                            <span class="cg-title">Lint 规则</span>
                            <span class="cg-badge">18</span>
                        </div>
                        <div class="cg-body open">
                            <div class="lint-rule">
                                <span class="lint-rule-name">避免 SELECT *</span>
                                <select class="config-select lint-rule-severity" id="avoidSelectStarSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="avoidSelectStarEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">显式 JOIN 类型</span>
                                <select class="config-select lint-rule-severity" id="explicitJoinTypeSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="explicitJoinTypeEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">LIMIT 配合 ORDER BY</span>
                                <select class="config-select lint-rule-severity" id="limitWithOrderBySeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="limitWithOrderByEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">列数不匹配检测</span>
                                <select class="config-select lint-rule-severity" id="avoidColumnCountMismatchSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="avoidColumnCountMismatchEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">缺失主键检测</span>
                                <select class="config-select lint-rule-severity" id="missingPrimaryKeySeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="missingPrimaryKeyEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">使用 CURRENT_TIMESTAMP</span>
                                <select class="config-select lint-rule-severity" id="useCurrentTimestampSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="useCurrentTimestampEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">避免 INSERT 中的 SELECT</span>
                                <select class="config-select lint-rule-severity" id="avoidSelectInInsertSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="avoidSelectInInsertEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">重复列别名检测</span>
                                <select class="config-select lint-rule-severity" id="duplicateColumnAliasesSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="duplicateColumnAliasesEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">关键字大写</span>
                                <select class="config-select lint-rule-severity" id="uppercaseKeywordsSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="uppercaseKeywordsEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">一致的别名</span>
                                <select class="config-select lint-rule-severity" id="consistentAliasingSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="consistentAliasingEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">使用 COALESCE 而非 ISNULL</span>
                                <select class="config-select lint-rule-severity" id="useCoalesceOverIsnullSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="useCoalesceOverIsnullEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">显式列别名</span>
                                <select class="config-select lint-rule-severity" id="explicitColumnAliasingSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="explicitColumnAliasingEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">避免关联子查询</span>
                                <select class="config-select lint-rule-severity" id="avoidCorrelatedSubqueriesSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="avoidCorrelatedSubqueriesEnabled"><span class="toggle-slider"></span></label>
                            </div>
                            <div class="lint-rule">
                                <span class="lint-rule-name">长查询行检测</span>
                                <select class="config-select lint-rule-severity" id="longQueryLineSeverity">
                                    <option value="error">Error</option>
                                    <option value="warning">Warning</option>
                                    <option value="information">Info</option>
                                </select>
                                <label class="toggle lint-rule-toggle"><input type="checkbox" id="longQueryLineEnabled"><span class="toggle-slider"></span></label>
                            </div>
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
                        </div>
                    </div>
                    
                    <!-- 大小写设置 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow open">▶</span>
                            <span class="cg-icon">🔤</span>
                            <span class="cg-title">大小写设置</span>
                        </div>
                        <div class="cg-body open">
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">关键字大小写</span></div>
                                <select class="config-select" id="keywordCase">
                                    <option value="preserve">保持原样</option>
                                    <option value="upper">大写</option>
                                    <option value="lower">小写</option>
                                </select>
                            </div>
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">数据类型大小写</span></div>
                                <select class="config-select" id="dataTypeCase">
                                    <option value="preserve">保持原样</option>
                                    <option value="upper">大写</option>
                                    <option value="lower">小写</option>
                                </select>
                            </div>
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">函数名大小写</span></div>
                                <select class="config-select" id="functionCase">
                                    <option value="preserve">保持原样</option>
                                    <option value="upper">大写</option>
                                    <option value="lower">小写</option>
                                </select>
                            </div>
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">标识符大小写</span></div>
                                <select class="config-select" id="identifierCase">
                                    <option value="preserve">保持原样</option>
                                    <option value="upper">大写</option>
                                    <option value="lower">小写</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 缩进与格式 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow open">▶</span>
                            <span class="cg-icon">↹</span>
                            <span class="cg-title">缩进与格式</span>
                        </div>
                        <div class="cg-body open">
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">缩进风格</span></div>
                                <select class="config-select" id="indentStyle">
                                    <option value="standard">标准缩进</option>
                                    <option value="tabularLeft">表格左对齐</option>
                                    <option value="tabularRight">表格右对齐</option>
                                </select>
                            </div>
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">逻辑运算符换行</span></div>
                                <select class="config-select" id="logicalOperatorNewline">
                                    <option value="before">AND/OR 之前换行</option>
                                    <option value="after">AND/OR 之后换行</option>
                                </select>
                            </div>
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">表达式宽度</span><span class="ci-label-hint">多行阈值</span></div>
                                <input type="number" class="config-input" id="expressionWidth" min="0" max="200">
                            </div>
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">查询间隔行数</span><span class="ci-label-hint">空行数</span></div>
                                <input type="number" class="config-input" id="linesBetweenQueries" min="0" max="10">
                            </div>
                        </div>
                    </div>
                    
                    <!-- 逗号和对齐 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow open">▶</span>
                            <span class="cg-icon">⫶</span>
                            <span class="cg-title">逗号和对齐</span>
                        </div>
                        <div class="cg-body open">
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">逗号位置</span></div>
                                <select class="config-select" id="commaPosition">
                                    <option value="after">行尾</option>
                                    <option value="before">行首</option>
                                </select>
                            </div>
                            <div class="toggle-row"><span class="toggle-label">对齐列定义</span><label class="toggle"><input type="checkbox" id="alignColumnDefinitions"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">对齐表别名</span><label class="toggle"><input type="checkbox" id="tabulateAlias"><span class="toggle-slider"></span></label></div>
                        </div>
                    </div>
                    
                    <!-- 换行设置 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow open">▶</span>
                            <span class="cg-icon">↵</span>
                            <span class="cg-title">换行设置</span>
                        </div>
                        <div class="cg-body open">
                            <div class="toggle-row"><span class="toggle-label">SELECT 后换行</span><label class="toggle"><input type="checkbox" id="newlineAfterSelect"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">FROM 后换行</span><label class="toggle"><input type="checkbox" id="newlineAfterFrom"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">WHERE 前换行</span><label class="toggle"><input type="checkbox" id="newlineBeforeWhere"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">WHERE 后换行</span><label class="toggle"><input type="checkbox" id="newlineAfterWhere"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">ORDER BY 前换行</span><label class="toggle"><input type="checkbox" id="newlineBeforeOrderBy"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">GROUP BY 前换行</span><label class="toggle"><input type="checkbox" id="newlineBeforeGroupBy"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">HAVING 前换行</span><label class="toggle"><input type="checkbox" id="newlineBeforeHaving"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">LIMIT 前换行</span><label class="toggle"><input type="checkbox" id="newlineBeforeLimit"><span class="toggle-slider"></span></label></div>
                        </div>
                    </div>
                    
                    <!-- 高级选项 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow">▶</span>
                            <span class="cg-icon">⚡</span>
                            <span class="cg-title">高级选项</span>
                        </div>
                        <div class="cg-body">
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">保留关键字大小写</span></div>
                                <select class="config-select" id="reservedKeywordCase">
                                    <option value="preserve">保持原样</option>
                                    <option value="upper">大写</option>
                                    <option value="lower">小写</option>
                                </select>
                            </div>
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">内置函数大小写</span></div>
                                <select class="config-select" id="builtinFunctionCase">
                                    <option value="preserve">保持原样</option>
                                    <option value="upper">大写</option>
                                    <option value="lower">小写</option>
                                </select>
                            </div>
                            <div class="toggle-row"><span class="toggle-label">JOIN 前换行</span><label class="toggle"><input type="checkbox" id="newlineBeforeJoin"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">逗号后换行</span><label class="toggle"><input type="checkbox" id="newlineAfterComma"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">每个 SELECT 项后换行</span><label class="toggle"><input type="checkbox" id="breakAfterSelectItem"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">每个 FROM 项后换行</span><label class="toggle"><input type="checkbox" id="breakAfterFromItem"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">对齐 WHERE 子句</span><label class="toggle"><input type="checkbox" id="alignWhereClauses"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">对齐 CASE 语句</span><label class="toggle"><input type="checkbox" id="alignCaseStatements"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">逗号前加空格</span><label class="toggle"><input type="checkbox" id="spaceBeforeComma"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">括号内加空格</span><label class="toggle"><input type="checkbox" id="spaceInsideParentheses"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">修剪尾部空格</span><label class="toggle"><input type="checkbox" id="trimTrailingSpaces"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">语句结尾添加分号</span><label class="toggle"><input type="checkbox" id="semicolonAtEnd"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">紧凑运算符</span><label class="toggle"><input type="checkbox" id="denseOperators"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">分号另起一行</span><label class="toggle"><input type="checkbox" id="newlineBeforeSemicolon"><span class="toggle-slider"></span></label></div>
                            <div class="toggle-row"><span class="toggle-label">忽略编辑器 Tab 设置</span><label class="toggle"><input type="checkbox" id="ignoreTabSettings"><span class="toggle-slider"></span></label></div>
                            <div class="config-item" id="tabOverrideGroup" style="display:none;">
                                <div class="ci-label"><span class="ci-label-text">Tab 宽度覆盖</span></div>
                                <input type="number" class="config-input" id="tabSizeOverride" min="1" max="8">
                            </div>
                        </div>
                    </div>
                    
                    <!-- 其他 -->
                    <div class="config-group">
                        <div class="cg-header" onclick="toggleGroup(this)">
                            <span class="cg-arrow">▶</span>
                            <span class="cg-icon">📏</span>
                            <span class="cg-title">其他选项</span>
                        </div>
                        <div class="cg-body">
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">最大行长度</span></div>
                                <input type="number" class="config-input" id="maxLineLength" min="40" max="500">
                            </div>
                            <div class="config-item">
                                <div class="ci-label"><span class="ci-label-text">单行查询最大长度</span></div>
                                <input type="number" class="config-input" id="singleLineMaxLength" min="40" max="500">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="toast" id="toast"></div>
    
    <script>
        let currentConfig = {
            enableSmartCommentToggle: true,
            headerAuthor: '',
            headerModifier: '',
            completionCommentSnippets: true,
        };
        
        const presets = {
            default: {
                dialect: 'hive',
                keywordCase: 'preserve',
                dataTypeCase: 'preserve',
                functionCase: 'preserve',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                expressionWidth: 50,
                linesBetweenQueries: 1,
                denseOperators: false,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: false,
                newlineAfterSelect: true,
                newlineAfterFrom: true,
                newlineBeforeWhere: true,
                newlineAfterWhere: true,
                newlineBeforeOrderBy: true,
                newlineBeforeGroupBy: true,
                newlineBeforeHaving: true,
                newlineBeforeLimit: true,
                maxLineLength: 120,
                tabulateAlias: false,
                reservedKeywordCase: 'preserve',
                builtinFunctionCase: 'preserve',
                newlineBeforeJoin: true,
                newlineAfterComma: true,
                alignWhereClauses: false,
                alignCaseStatements: false,
                breakAfterSelectItem: true,
                breakAfterFromItem: true,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 80,
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true,
                enableEnhancedChecks: true,
                enableLinter: true,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: true,
                enableOutlineView: true,
                enableStatusBar: true,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: true,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: true,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: true,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: true,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: true,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: true,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: true,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: true,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: false,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning'
            },
            hive: {
                dialect: 'hive',
                keywordCase: 'upper',
                dataTypeCase: 'upper',
                functionCase: 'lower',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                expressionWidth: 60,
                linesBetweenQueries: 2,
                denseOperators: false,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: true,
                newlineAfterSelect: true,
                newlineAfterFrom: true,
                newlineBeforeWhere: true,
                newlineAfterWhere: true,
                newlineBeforeOrderBy: true,
                newlineBeforeGroupBy: true,
                newlineBeforeHaving: true,
                newlineBeforeLimit: true,
                maxLineLength: 100,
                tabulateAlias: true,
                reservedKeywordCase: 'upper',
                builtinFunctionCase: 'lower',
                newlineBeforeJoin: true,
                newlineAfterComma: true,
                alignWhereClauses: false,
                alignCaseStatements: false,
                breakAfterSelectItem: true,
                breakAfterFromItem: true,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 80,
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true,
                enableEnhancedChecks: true,
                enableLinter: true,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: true,
                enableOutlineView: true,
                enableStatusBar: true,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: true,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: true,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: true,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: true,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: true,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: true,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: true,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: true,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: true,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning'
            },
            mysql: {
                dialect: 'mysql',
                keywordCase: 'upper',
                dataTypeCase: 'upper',
                functionCase: 'preserve',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'after',
                expressionWidth: 50,
                linesBetweenQueries: 1,
                denseOperators: false,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: false,
                newlineAfterSelect: true,
                newlineAfterFrom: true,
                newlineBeforeWhere: true,
                newlineAfterWhere: true,
                newlineBeforeOrderBy: true,
                newlineBeforeGroupBy: true,
                newlineBeforeHaving: true,
                newlineBeforeLimit: true,
                maxLineLength: 120,
                tabulateAlias: false,
                reservedKeywordCase: 'upper',
                builtinFunctionCase: 'preserve',
                newlineBeforeJoin: true,
                newlineAfterComma: true,
                alignWhereClauses: false,
                alignCaseStatements: false,
                breakAfterSelectItem: true,
                breakAfterFromItem: true,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 80,
                ignoreTabSettings: false,
                tabSizeOverride: 4,
                insertSpacesOverride: true,
                enableEnhancedChecks: true,
                enableLinter: true,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: true,
                enableOutlineView: true,
                enableStatusBar: true,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: true,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: true,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: true,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: true,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: true,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: true,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: true,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: true,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: true,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning'
            },
            compact: {
                dialect: 'hive',
                keywordCase: 'preserve',
                dataTypeCase: 'preserve',
                functionCase: 'preserve',
                identifierCase: 'preserve',
                indentStyle: 'standard',
                logicalOperatorNewline: 'before',
                expressionWidth: 80,
                linesBetweenQueries: 0,
                denseOperators: true,
                newlineBeforeSemicolon: false,
                commaPosition: 'after',
                alignColumnDefinitions: false,
                newlineAfterSelect: false,
                newlineAfterFrom: false,
                newlineBeforeWhere: false,
                newlineAfterWhere: false,
                newlineBeforeOrderBy: false,
                newlineBeforeGroupBy: false,
                newlineBeforeHaving: false,
                newlineBeforeLimit: false,
                maxLineLength: 150,
                tabulateAlias: false,
                reservedKeywordCase: 'preserve',
                builtinFunctionCase: 'preserve',
                newlineBeforeJoin: false,
                newlineAfterComma: false,
                alignWhereClauses: false,
                alignCaseStatements: false,
                breakAfterSelectItem: false,
                breakAfterFromItem: false,
                spaceBeforeComma: false,
                spaceInsideParentheses: false,
                trimTrailingSpaces: true,
                semicolonAtEnd: true,
                singleLineMaxLength: 100,
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true,
                enableEnhancedChecks: false,
                enableLinter: false,
                showErrorLevel: true,
                showWarningLevel: true,
                showInfoLevel: true,
                enableCodeFolding: false,
                enableOutlineView: false,
                enableStatusBar: false,
                enableParameterHighlight: true,
                enableSnippets: true,
                enableQuickFix: true,
                enableSmartCommentToggle: true,
                headerAuthor: '',
                headerModifier: '',
                completionCommentSnippets: true,
                lintAvoidSelectStarEnabled: false,
                lintAvoidSelectStarSeverity: 'warning',
                lintExplicitJoinTypeEnabled: false,
                lintExplicitJoinTypeSeverity: 'information',
                lintLimitWithOrderByEnabled: false,
                lintLimitWithOrderBySeverity: 'warning',
                lintAvoidColumnCountMismatchEnabled: false,
                lintAvoidColumnCountMismatchSeverity: 'error',
                lintMissingPrimaryKeyEnabled: false,
                lintMissingPrimaryKeySeverity: 'warning',
                lintUseCurrentTimestampEnabled: false,
                lintUseCurrentTimestampSeverity: 'information',
                lintAvoidSelectInInsertEnabled: false,
                lintAvoidSelectInInsertSeverity: 'warning',
                lintDuplicateColumnAliasesEnabled: false,
                lintDuplicateColumnAliasesSeverity: 'warning',
                lintUppercaseKeywordsEnabled: false,
                lintUppercaseKeywordsSeverity: 'information',
                lintConsistentAliasingEnabled: false,
                lintConsistentAliasingSeverity: 'information',
                lintUseCoalesceOverIsnullEnabled: false,
                lintUseCoalesceOverIsnullSeverity: 'information',
                lintExplicitColumnAliasingEnabled: false,
                lintExplicitColumnAliasingSeverity: 'information',
                lintAvoidCorrelatedSubqueriesEnabled: false,
                lintAvoidCorrelatedSubqueriesSeverity: 'warning',
                lintLongQueryLineEnabled: false,
                lintLongQueryLineSeverity: 'information',
                lintMissingQueryCommentEnabled: false,
                lintMissingQueryCommentSeverity: 'warning',
                lintMissingColumnCommentEnabled: false,
                lintMissingColumnCommentSeverity: 'warning',
                lintCommentedOutCodeEnabled: false,
                lintCommentedOutCodeSeverity: 'information',
                lintExpiredTodoEnabled: false,
                lintExpiredTodoSeverity: 'warning'
            }
        };
        
        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'loadConfig':
                    loadConfig(message.data);
                    break;
                case 'previewResult':
                    showPreviewResult(message.data);
                    break;
            }
        });
        
        function loadConfig(config) {
            currentConfig = { ...config };
            Object.keys(config).forEach(key => {
                const el = document.getElementById(key);
                if (el) {
                    if (el.type === 'checkbox') {
                        el.checked = config[key];
                    } else if (el.type === 'number') {
                        el.value = config[key];
                    } else {
                        el.value = config[key];
                    }
                }
            });
            updateTabOverrideGroup();
        }
        
        function collectConfig() {
            return {
                dialect: document.getElementById('dialect').value,
                keywordCase: document.getElementById('keywordCase').value,
                dataTypeCase: document.getElementById('dataTypeCase').value,
                functionCase: document.getElementById('functionCase').value,
                identifierCase: document.getElementById('identifierCase').value,
                indentStyle: document.getElementById('indentStyle').value,
                logicalOperatorNewline: document.getElementById('logicalOperatorNewline').value,
                expressionWidth: parseInt(document.getElementById('expressionWidth').value),
                linesBetweenQueries: parseInt(document.getElementById('linesBetweenQueries').value),
                denseOperators: document.getElementById('denseOperators').checked,
                newlineBeforeSemicolon: document.getElementById('newlineBeforeSemicolon').checked,
                commaPosition: document.getElementById('commaPosition').value,
                alignColumnDefinitions: document.getElementById('alignColumnDefinitions').checked,
                newlineAfterSelect: document.getElementById('newlineAfterSelect').checked,
                newlineAfterFrom: document.getElementById('newlineAfterFrom').checked,
                newlineBeforeWhere: document.getElementById('newlineBeforeWhere').checked,
                newlineAfterWhere: document.getElementById('newlineAfterWhere').checked,
                newlineBeforeOrderBy: document.getElementById('newlineBeforeOrderBy').checked,
                newlineBeforeGroupBy: document.getElementById('newlineBeforeGroupBy').checked,
                newlineBeforeHaving: document.getElementById('newlineBeforeHaving').checked,
                newlineBeforeLimit: document.getElementById('newlineBeforeLimit').checked,
                maxLineLength: parseInt(document.getElementById('maxLineLength').value),
                tabulateAlias: document.getElementById('tabulateAlias').checked,
                reservedKeywordCase: document.getElementById('reservedKeywordCase').value,
                builtinFunctionCase: document.getElementById('builtinFunctionCase').value,
                newlineBeforeJoin: document.getElementById('newlineBeforeJoin').checked,
                newlineAfterComma: document.getElementById('newlineAfterComma').checked,
                alignWhereClauses: document.getElementById('alignWhereClauses').checked,
                alignCaseStatements: document.getElementById('alignCaseStatements').checked,
                breakAfterSelectItem: document.getElementById('breakAfterSelectItem').checked,
                breakAfterFromItem: document.getElementById('breakAfterFromItem').checked,
                spaceBeforeComma: document.getElementById('spaceBeforeComma').checked,
                spaceInsideParentheses: document.getElementById('spaceInsideParentheses').checked,
                trimTrailingSpaces: document.getElementById('trimTrailingSpaces').checked,
                semicolonAtEnd: document.getElementById('semicolonAtEnd').checked,
                singleLineMaxLength: parseInt(document.getElementById('singleLineMaxLength').value),
                ignoreTabSettings: document.getElementById('ignoreTabSettings').checked,
                tabSizeOverride: parseInt(document.getElementById('tabSizeOverride').value),
                insertSpacesOverride: true,
                enableEnhancedChecks: document.getElementById('enableEnhancedChecks').checked,
                enableLinter: document.getElementById('enableLinter').checked,
                showErrorLevel: document.getElementById('showErrorLevel').checked,
                showWarningLevel: document.getElementById('showWarningLevel').checked,
                showInfoLevel: document.getElementById('showInfoLevel').checked,
                enableCodeFolding: document.getElementById('enableCodeFolding').checked,
                enableOutlineView: document.getElementById('enableOutlineView').checked,
                enableStatusBar: document.getElementById('enableStatusBar').checked,
                enableParameterHighlight: document.getElementById('enableParameterHighlight').checked,
                enableSnippets: document.getElementById('enableSnippets').checked,
                enableQuickFix: document.getElementById('enableQuickFix').checked,
                enableSmartCommentToggle: document.getElementById('enableSmartCommentToggle').checked,
                headerAuthor: document.getElementById('headerAuthor').value,
                headerModifier: document.getElementById('headerModifier').value,
                completionCommentSnippets: document.getElementById('completionCommentSnippets').checked,
                lintAvoidSelectStarEnabled: document.getElementById('avoidSelectStarEnabled').checked,
                lintAvoidSelectStarSeverity: document.getElementById('avoidSelectStarSeverity').value,
                lintExplicitJoinTypeEnabled: document.getElementById('explicitJoinTypeEnabled').checked,
                lintExplicitJoinTypeSeverity: document.getElementById('explicitJoinTypeSeverity').value,
                lintLimitWithOrderByEnabled: document.getElementById('limitWithOrderByEnabled').checked,
                lintLimitWithOrderBySeverity: document.getElementById('limitWithOrderBySeverity').value,
                lintAvoidColumnCountMismatchEnabled: document.getElementById('avoidColumnCountMismatchEnabled').checked,
                lintAvoidColumnCountMismatchSeverity: document.getElementById('avoidColumnCountMismatchSeverity').value,
                lintMissingPrimaryKeyEnabled: document.getElementById('missingPrimaryKeyEnabled').checked,
                lintMissingPrimaryKeySeverity: document.getElementById('missingPrimaryKeySeverity').value,
                lintUseCurrentTimestampEnabled: document.getElementById('useCurrentTimestampEnabled').checked,
                lintUseCurrentTimestampSeverity: document.getElementById('useCurrentTimestampSeverity').value,
                lintAvoidSelectInInsertEnabled: document.getElementById('avoidSelectInInsertEnabled').checked,
                lintAvoidSelectInInsertSeverity: document.getElementById('avoidSelectInInsertSeverity').value,
                lintDuplicateColumnAliasesEnabled: document.getElementById('duplicateColumnAliasesEnabled').checked,
                lintDuplicateColumnAliasesSeverity: document.getElementById('duplicateColumnAliasesSeverity').value,
                lintUppercaseKeywordsEnabled: document.getElementById('uppercaseKeywordsEnabled').checked,
                lintUppercaseKeywordsSeverity: document.getElementById('uppercaseKeywordsSeverity').value,
                lintConsistentAliasingEnabled: document.getElementById('consistentAliasingEnabled').checked,
                lintConsistentAliasingSeverity: document.getElementById('consistentAliasingSeverity').value,
                lintUseCoalesceOverIsnullEnabled: document.getElementById('useCoalesceOverIsnullEnabled').checked,
                lintUseCoalesceOverIsnullSeverity: document.getElementById('useCoalesceOverIsnullSeverity').value,
                lintExplicitColumnAliasingEnabled: document.getElementById('explicitColumnAliasingEnabled').checked,
                lintExplicitColumnAliasingSeverity: document.getElementById('explicitColumnAliasingSeverity').value,
                lintAvoidCorrelatedSubqueriesEnabled: document.getElementById('avoidCorrelatedSubqueriesEnabled').checked,
                lintAvoidCorrelatedSubqueriesSeverity: document.getElementById('avoidCorrelatedSubqueriesSeverity').value,
                lintLongQueryLineEnabled: document.getElementById('longQueryLineEnabled').checked,
                lintLongQueryLineSeverity: document.getElementById('longQueryLineSeverity').value,
                lintMissingQueryCommentEnabled: document.getElementById('missingQueryCommentEnabled').checked,
                lintMissingQueryCommentSeverity: document.getElementById('missingQueryCommentSeverity').value,
                lintMissingColumnCommentEnabled: document.getElementById('missingColumnCommentEnabled').checked,
                lintMissingColumnCommentSeverity: document.getElementById('missingColumnCommentSeverity').value,
                lintCommentedOutCodeEnabled: document.getElementById('commentedOutCodeEnabled').checked,
                lintCommentedOutCodeSeverity: document.getElementById('commentedOutCodeSeverity').value,
                lintExpiredTodoEnabled: document.getElementById('expiredTodoEnabled').checked,
                lintExpiredTodoSeverity: document.getElementById('expiredTodoSeverity').value
            };
        }
        
        function saveConfig() {
            const config = collectConfig();
            vscode.postMessage({ command: 'updateConfig', data: config });
            showToast('配置已保存', 'success');
        }
        
        function showToast(message, type) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast ' + type + ' show';
            setTimeout(() => { toast.classList.remove('show'); }, 2000);
        }
        
        function toggleGroup(header) {
            const arrow = header.querySelector('.cg-arrow');
            const body = header.nextElementSibling;
            const isOpen = body.classList.contains('open');
            if (isOpen) {
                arrow.classList.remove('open');
                body.classList.remove('open');
            } else {
                arrow.classList.add('open');
                body.classList.add('open');
            }
        }
        
        function resetConfig() {
            applyPreset('default');
            saveConfig();
        }
        
        function applyPreset(presetName) {
            const preset = presets[presetName];
            loadConfig(preset);
        }
        
        function previewFormat() {
            const sql = document.getElementById('previewInput').value;
            const config = collectConfig();
            vscode.postMessage({ command: 'previewFormat', sql, config });
        }
        
        function showPreviewResult(result) {
            const resultEl = document.getElementById('previewResult');
            resultEl.classList.remove('empty');
            resultEl.classList.add('success');
            resultEl.textContent = result;
            setTimeout(() => { resultEl.classList.remove('success'); }, 1000);
        }
        
        function updateTabOverrideGroup() {
            const group = document.getElementById('tabOverrideGroup');
            const checkbox = document.getElementById('ignoreTabSettings');
            group.style.display = checkbox.checked ? 'block' : 'none';
        }
        
        document.getElementById('ignoreTabSettings').addEventListener('change', updateTabOverrideGroup);

        const resizeHandle = document.getElementById('resizeHandle');
        const previewBody = document.querySelector('.preview-body');
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = previewBody.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const delta = e.clientY - startY;
            const newHeight = Math.max(160, Math.min(600, startHeight + delta));
            previewBody.style.maxHeight = newHeight + 'px';
            previewBody.style.minHeight = newHeight + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });

        const vscode = acquireVsCodeApi();
        vscode.postMessage({ command: 'getCurrentConfig' });
    </script>
</body>
</html>`
        return html
    }

    private async _sendCurrentConfig() {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        this._panel.webview.postMessage({
            command: 'loadConfig',
            data: {
                dialect: config.get('dialect', 'hive'),
                keywordCase: config.get('keywordCase', 'preserve'),
                dataTypeCase: config.get('dataTypeCase', 'preserve'),
                functionCase: config.get('functionCase', 'preserve'),
                identifierCase: config.get('identifierCase', 'preserve'),
                indentStyle: config.get('indentStyle', 'standard'),
                logicalOperatorNewline: config.get('logicalOperatorNewline', 'before'),
                expressionWidth: config.get('expressionWidth', 50),
                linesBetweenQueries: config.get('linesBetweenQueries', 1),
                denseOperators: config.get('denseOperators', false),
                newlineBeforeSemicolon: config.get('newlineBeforeSemicolon', false),
                commaPosition: config.get('commaPosition', 'after'),
                alignColumnDefinitions: config.get('alignColumnDefinitions', false),
                newlineAfterSelect: config.get('newlineAfterSelect', true),
                newlineAfterFrom: config.get('newlineAfterFrom', true),
                newlineBeforeWhere: config.get('newlineBeforeWhere', true),
                newlineAfterWhere: config.get('newlineAfterWhere', true),
                newlineBeforeOrderBy: config.get('newlineBeforeOrderBy', true),
                newlineBeforeGroupBy: config.get('newlineBeforeGroupBy', true),
                newlineBeforeHaving: config.get('newlineBeforeHaving', true),
                newlineBeforeLimit: config.get('newlineBeforeLimit', true),
                maxLineLength: config.get('maxLineLength', 120),
                tabulateAlias: config.get('tabulateAlias', false),
                reservedKeywordCase: config.get('reservedKeywordCase', 'preserve'),
                builtinFunctionCase: config.get('builtinFunctionCase', 'preserve'),
                newlineBeforeJoin: config.get('newlineBeforeJoin', true),
                newlineAfterComma: config.get('newlineAfterComma', true),
                alignWhereClauses: config.get('alignWhereClauses', false),
                alignCaseStatements: config.get('alignCaseStatements', false),
                breakAfterSelectItem: config.get('breakAfterSelectItem', true),
                breakAfterFromItem: config.get('breakAfterFromItem', true),
                spaceBeforeComma: config.get('spaceBeforeComma', false),
                spaceInsideParentheses: config.get('spaceInsideParentheses', false),
                trimTrailingSpaces: config.get('trimTrailingSpaces', true),
                semicolonAtEnd: config.get('semicolonAtEnd', true),
                singleLineMaxLength: config.get('singleLineMaxLength', 80),
                ignoreTabSettings: config.get('ignoreTabSettings', false),
                tabSizeOverride: config.get('tabSizeOverride', 2),
                insertSpacesOverride: config.get('insertSpacesOverride', true),
                enableEnhancedChecks: config.get('enableEnhancedChecks', true),
                enableLinter: config.get('enableLinter', true),
                showErrorLevel: config.get('showErrorLevel', true),
                showWarningLevel: config.get('showWarningLevel', true),
                showInfoLevel: config.get('showInfoLevel', true),
                enableCodeFolding: config.get('enableCodeFolding', true),
                enableOutlineView: config.get('enableOutlineView', true),
                enableStatusBar: config.get('enableStatusBar', true),
                enableParameterHighlight: config.get('enableParameterHighlight', true),
                enableSnippets: config.get('enableSnippets', true),
                enableQuickFix: config.get('enableQuickFix', true),
                enableSmartCommentToggle: config.get('enableSmartCommentToggle', true),
                headerAuthor: config.get('headerAuthor', ''),
                headerModifier: config.get('headerModifier', ''),
                completionCommentSnippets: config.get('completion.commentSnippets', true),
                lintAvoidSelectStarEnabled: config.get('lint.avoid_select_star', { enabled: true, severity: 'warning' }).enabled,
                lintAvoidSelectStarSeverity: config.get('lint.avoid_select_star', { enabled: true, severity: 'warning' }).severity,
                lintExplicitJoinTypeEnabled: config.get('lint.explicit_join_type', { enabled: true, severity: 'information' }).enabled,
                lintExplicitJoinTypeSeverity: config.get('lint.explicit_join_type', { enabled: true, severity: 'information' }).severity,
                lintLimitWithOrderByEnabled: config.get('lint.limit_with_order_by', { enabled: true, severity: 'warning' }).enabled,
                lintLimitWithOrderBySeverity: config.get('lint.limit_with_order_by', { enabled: true, severity: 'warning' }).severity,
                lintAvoidColumnCountMismatchEnabled: config.get('lint.avoid_column_count_mismatch', { enabled: true, severity: 'error' }).enabled,
                lintAvoidColumnCountMismatchSeverity: config.get('lint.avoid_column_count_mismatch', { enabled: true, severity: 'error' }).severity,
                lintMissingPrimaryKeyEnabled: config.get('lint.missing_primary_key', { enabled: true, severity: 'warning' }).enabled,
                lintMissingPrimaryKeySeverity: config.get('lint.missing_primary_key', { enabled: true, severity: 'warning' }).severity,
                lintUseCurrentTimestampEnabled: config.get('lint.use_current_timestamp', { enabled: true, severity: 'information' }).enabled,
                lintUseCurrentTimestampSeverity: config.get('lint.use_current_timestamp', { enabled: true, severity: 'information' }).severity,
                lintAvoidSelectInInsertEnabled: config.get('lint.avoid_select_in_insert', { enabled: true, severity: 'warning' }).enabled,
                lintAvoidSelectInInsertSeverity: config.get('lint.avoid_select_in_insert', { enabled: true, severity: 'warning' }).severity,
                lintDuplicateColumnAliasesEnabled: config.get('lint.duplicate_column_aliases', { enabled: true, severity: 'warning' }).enabled,
                lintDuplicateColumnAliasesSeverity: config.get('lint.duplicate_column_aliases', { enabled: true, severity: 'warning' }).severity,
                lintUppercaseKeywordsEnabled: config.get('lint.uppercase_keywords', { enabled: false, severity: 'information' }).enabled,
                lintUppercaseKeywordsSeverity: config.get('lint.uppercase_keywords', { enabled: false, severity: 'information' }).severity,
                lintConsistentAliasingEnabled: config.get('lint.consistent_aliasing', { enabled: false, severity: 'information' }).enabled,
                lintConsistentAliasingSeverity: config.get('lint.consistent_aliasing', { enabled: false, severity: 'information' }).severity,
                lintUseCoalesceOverIsnullEnabled: config.get('lint.use_coalesce_over_isnull', { enabled: false, severity: 'information' }).enabled,
                lintUseCoalesceOverIsnullSeverity: config.get('lint.use_coalesce_over_isnull', { enabled: false, severity: 'information' }).severity,
                lintExplicitColumnAliasingEnabled: config.get('lint.explicit_column_aliasing', { enabled: false, severity: 'information' }).enabled,
                lintExplicitColumnAliasingSeverity: config.get('lint.explicit_column_aliasing', { enabled: false, severity: 'information' }).severity,
                lintAvoidCorrelatedSubqueriesEnabled: config.get('lint.avoid_correlated_subqueries', { enabled: false, severity: 'warning' }).enabled,
                lintAvoidCorrelatedSubqueriesSeverity: config.get('lint.avoid_correlated_subqueries', { enabled: false, severity: 'warning' }).severity,
                lintLongQueryLineEnabled: config.get('lint.long_query_line', { enabled: false, severity: 'information' }).enabled,
                lintLongQueryLineSeverity: config.get('lint.long_query_line', { enabled: false, severity: 'information' }).severity,
                lintMissingQueryCommentEnabled: config.get('lint.missing_query_comment', { enabled: false, severity: 'warning' }).enabled,
                lintMissingQueryCommentSeverity: config.get('lint.missing_query_comment', { enabled: false, severity: 'warning' }).severity,
                lintMissingColumnCommentEnabled: config.get('lint.missing_column_comment', { enabled: false, severity: 'warning' }).enabled,
                lintMissingColumnCommentSeverity: config.get('lint.missing_column_comment', { enabled: false, severity: 'warning' }).severity,
                lintCommentedOutCodeEnabled: config.get('lint.commented_out_code', { enabled: false, severity: 'information' }).enabled,
                lintCommentedOutCodeSeverity: config.get('lint.commented_out_code', { enabled: false, severity: 'information' }).severity,
                lintExpiredTodoEnabled: config.get('lint.expired_todo', { enabled: false, severity: 'warning' }).enabled,
                lintExpiredTodoSeverity: config.get('lint.expired_todo', { enabled: false, severity: 'warning' }).severity
            }
        })
    }

    private async _updateConfig(data: Record<string, unknown>) {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        await config.update('dialect', data.dialect, vscode.ConfigurationTarget.Global)
        await config.update('keywordCase', data.keywordCase, vscode.ConfigurationTarget.Global)
        await config.update('dataTypeCase', data.dataTypeCase, vscode.ConfigurationTarget.Global)
        await config.update('functionCase', data.functionCase, vscode.ConfigurationTarget.Global)
        await config.update('identifierCase', data.identifierCase, vscode.ConfigurationTarget.Global)
        await config.update('indentStyle', data.indentStyle, vscode.ConfigurationTarget.Global)
        await config.update('logicalOperatorNewline', data.logicalOperatorNewline, vscode.ConfigurationTarget.Global)
        await config.update('expressionWidth', data.expressionWidth, vscode.ConfigurationTarget.Global)
        await config.update('linesBetweenQueries', data.linesBetweenQueries, vscode.ConfigurationTarget.Global)
        await config.update('denseOperators', data.denseOperators, vscode.ConfigurationTarget.Global)
        await config.update('newlineBeforeSemicolon', data.newlineBeforeSemicolon, vscode.ConfigurationTarget.Global)
        await config.update('commaPosition', data.commaPosition, vscode.ConfigurationTarget.Global)
        await config.update('alignColumnDefinitions', data.alignColumnDefinitions, vscode.ConfigurationTarget.Global)
        await config.update('newlineAfterSelect', data.newlineAfterSelect, vscode.ConfigurationTarget.Global)
        await config.update('newlineAfterFrom', data.newlineAfterFrom, vscode.ConfigurationTarget.Global)
        await config.update('newlineBeforeWhere', data.newlineBeforeWhere, vscode.ConfigurationTarget.Global)
        await config.update('newlineAfterWhere', data.newlineAfterWhere, vscode.ConfigurationTarget.Global)
        await config.update('newlineBeforeOrderBy', data.newlineBeforeOrderBy, vscode.ConfigurationTarget.Global)
        await config.update('newlineBeforeGroupBy', data.newlineBeforeGroupBy, vscode.ConfigurationTarget.Global)
        await config.update('newlineBeforeHaving', data.newlineBeforeHaving, vscode.ConfigurationTarget.Global)
        await config.update('newlineBeforeLimit', data.newlineBeforeLimit, vscode.ConfigurationTarget.Global)
        await config.update('maxLineLength', data.maxLineLength, vscode.ConfigurationTarget.Global)
        await config.update('tabulateAlias', data.tabulateAlias, vscode.ConfigurationTarget.Global)
        await config.update('reservedKeywordCase', data.reservedKeywordCase, vscode.ConfigurationTarget.Global)
        await config.update('builtinFunctionCase', data.builtinFunctionCase, vscode.ConfigurationTarget.Global)
        await config.update('newlineBeforeJoin', data.newlineBeforeJoin, vscode.ConfigurationTarget.Global)
        await config.update('newlineAfterComma', data.newlineAfterComma, vscode.ConfigurationTarget.Global)
        await config.update('alignWhereClauses', data.alignWhereClauses, vscode.ConfigurationTarget.Global)
        await config.update('alignCaseStatements', data.alignCaseStatements, vscode.ConfigurationTarget.Global)
        await config.update('breakAfterSelectItem', data.breakAfterSelectItem, vscode.ConfigurationTarget.Global)
        await config.update('breakAfterFromItem', data.breakAfterFromItem, vscode.ConfigurationTarget.Global)
        await config.update('spaceBeforeComma', data.spaceBeforeComma, vscode.ConfigurationTarget.Global)
        await config.update('spaceInsideParentheses', data.spaceInsideParentheses, vscode.ConfigurationTarget.Global)
        await config.update('trimTrailingSpaces', data.trimTrailingSpaces, vscode.ConfigurationTarget.Global)
        await config.update('semicolonAtEnd', data.semicolonAtEnd, vscode.ConfigurationTarget.Global)
        await config.update('singleLineMaxLength', data.singleLineMaxLength, vscode.ConfigurationTarget.Global)
        await config.update('ignoreTabSettings', data.ignoreTabSettings, vscode.ConfigurationTarget.Global)
        await config.update('tabSizeOverride', data.tabSizeOverride, vscode.ConfigurationTarget.Global)
        await config.update('insertSpacesOverride', data.insertSpacesOverride, vscode.ConfigurationTarget.Global)
        await config.update('enableEnhancedChecks', data.enableEnhancedChecks, vscode.ConfigurationTarget.Global)
        await config.update('enableLinter', data.enableLinter, vscode.ConfigurationTarget.Global)
        await config.update('showErrorLevel', data.showErrorLevel, vscode.ConfigurationTarget.Global)
        await config.update('showWarningLevel', data.showWarningLevel, vscode.ConfigurationTarget.Global)
        await config.update('showInfoLevel', data.showInfoLevel, vscode.ConfigurationTarget.Global)
        await config.update('enableCodeFolding', data.enableCodeFolding, vscode.ConfigurationTarget.Global)
        await config.update('enableOutlineView', data.enableOutlineView, vscode.ConfigurationTarget.Global)
        await config.update('enableStatusBar', data.enableStatusBar, vscode.ConfigurationTarget.Global)
        await config.update('enableParameterHighlight', data.enableParameterHighlight, vscode.ConfigurationTarget.Global)
        await config.update('enableSnippets', data.enableSnippets, vscode.ConfigurationTarget.Global)
        await config.update('enableQuickFix', data.enableQuickFix, vscode.ConfigurationTarget.Global)
        await config.update('enableSmartCommentToggle', data.enableSmartCommentToggle, vscode.ConfigurationTarget.Global)
        await config.update('headerAuthor', data.headerAuthor, vscode.ConfigurationTarget.Global)
        await config.update('headerModifier', data.headerModifier, vscode.ConfigurationTarget.Global)
        await config.update('completion.commentSnippets', data.completionCommentSnippets, vscode.ConfigurationTarget.Global)
        await config.update('lint.avoid_select_star', { enabled: data.lintAvoidSelectStarEnabled, severity: data.lintAvoidSelectStarSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.explicit_join_type', { enabled: data.lintExplicitJoinTypeEnabled, severity: data.lintExplicitJoinTypeSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.limit_with_order_by', { enabled: data.lintLimitWithOrderByEnabled, severity: data.lintLimitWithOrderBySeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.avoid_column_count_mismatch', { enabled: data.lintAvoidColumnCountMismatchEnabled, severity: data.lintAvoidColumnCountMismatchSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.missing_primary_key', { enabled: data.lintMissingPrimaryKeyEnabled, severity: data.lintMissingPrimaryKeySeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.use_current_timestamp', { enabled: data.lintUseCurrentTimestampEnabled, severity: data.lintUseCurrentTimestampSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.avoid_select_in_insert', { enabled: data.lintAvoidSelectInInsertEnabled, severity: data.lintAvoidSelectInInsertSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.duplicate_column_aliases', { enabled: data.lintDuplicateColumnAliasesEnabled, severity: data.lintDuplicateColumnAliasesSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.uppercase_keywords', { enabled: data.lintUppercaseKeywordsEnabled, severity: data.lintUppercaseKeywordsSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.consistent_aliasing', { enabled: data.lintConsistentAliasingEnabled, severity: data.lintConsistentAliasingSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.use_coalesce_over_isnull', { enabled: data.lintUseCoalesceOverIsnullEnabled, severity: data.lintUseCoalesceOverIsnullSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.explicit_column_aliasing', { enabled: data.lintExplicitColumnAliasingEnabled, severity: data.lintExplicitColumnAliasingSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.avoid_correlated_subqueries', { enabled: data.lintAvoidCorrelatedSubqueriesEnabled, severity: data.lintAvoidCorrelatedSubqueriesSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.long_query_line', { enabled: data.lintLongQueryLineEnabled, severity: data.lintLongQueryLineSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.missing_query_comment', { enabled: data.lintMissingQueryCommentEnabled, severity: data.lintMissingQueryCommentSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.missing_column_comment', { enabled: data.lintMissingColumnCommentEnabled, severity: data.lintMissingColumnCommentSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.commented_out_code', { enabled: data.lintCommentedOutCodeEnabled, severity: data.lintCommentedOutCodeSeverity }, vscode.ConfigurationTarget.Global)
        await config.update('lint.expired_todo', { enabled: data.lintExpiredTodoEnabled, severity: data.lintExpiredTodoSeverity }, vscode.ConfigurationTarget.Global)
        
        vscode.window.showInformationMessage('配置已保存！')
    }

    private async _resetConfig() {
        const defaults = {
            dialect: 'hive',
            keywordCase: 'preserve',
            dataTypeCase: 'preserve',
            functionCase: 'preserve',
            identifierCase: 'preserve',
            indentStyle: 'standard',
            logicalOperatorNewline: 'before',
            expressionWidth: 50,
            linesBetweenQueries: 1,
            denseOperators: false,
            newlineBeforeSemicolon: false,
            commaPosition: 'after',
            alignColumnDefinitions: false,
            newlineAfterSelect: true,
            newlineAfterFrom: true,
            newlineBeforeWhere: true,
            newlineAfterWhere: true,
            newlineBeforeOrderBy: true,
            newlineBeforeGroupBy: true,
            newlineBeforeHaving: true,
            newlineBeforeLimit: true,
            maxLineLength: 120,
            tabulateAlias: false,
            reservedKeywordCase: 'preserve',
            builtinFunctionCase: 'preserve',
            newlineBeforeJoin: true,
            newlineAfterComma: true,
            alignWhereClauses: false,
            alignCaseStatements: false,
            breakAfterSelectItem: true,
            breakAfterFromItem: true,
            spaceBeforeComma: false,
            spaceInsideParentheses: false,
            trimTrailingSpaces: true,
            semicolonAtEnd: true,
            singleLineMaxLength: 80,
            ignoreTabSettings: false,
            tabSizeOverride: 2,
            insertSpacesOverride: true,
            enableEnhancedChecks: true,
            enableLinter: true,
            showErrorLevel: true,
            showWarningLevel: true,
            showInfoLevel: true,
            enableCodeFolding: true,
            enableOutlineView: true,
            enableStatusBar: true,
            enableParameterHighlight: true,
            enableSnippets: true,
            enableQuickFix: true,
            enableSmartCommentToggle: true,
            headerAuthor: '',
            headerModifier: '',
            completionCommentSnippets: true,
            lintAvoidSelectStarEnabled: true,
            lintAvoidSelectStarSeverity: 'warning',
            lintExplicitJoinTypeEnabled: true,
            lintExplicitJoinTypeSeverity: 'information',
            lintLimitWithOrderByEnabled: true,
            lintLimitWithOrderBySeverity: 'warning',
            lintAvoidColumnCountMismatchEnabled: true,
            lintAvoidColumnCountMismatchSeverity: 'error',
            lintMissingPrimaryKeyEnabled: true,
            lintMissingPrimaryKeySeverity: 'warning',
            lintUseCurrentTimestampEnabled: true,
            lintUseCurrentTimestampSeverity: 'information',
            lintAvoidSelectInInsertEnabled: true,
            lintAvoidSelectInInsertSeverity: 'warning',
            lintDuplicateColumnAliasesEnabled: true,
            lintDuplicateColumnAliasesSeverity: 'warning',
            lintUppercaseKeywordsEnabled: false,
            lintUppercaseKeywordsSeverity: 'information',
            lintConsistentAliasingEnabled: false,
            lintConsistentAliasingSeverity: 'information',
            lintUseCoalesceOverIsnullEnabled: false,
            lintUseCoalesceOverIsnullSeverity: 'information',
            lintExplicitColumnAliasingEnabled: false,
            lintExplicitColumnAliasingSeverity: 'information',
            lintAvoidCorrelatedSubqueriesEnabled: false,
            lintAvoidCorrelatedSubqueriesSeverity: 'warning',
            lintLongQueryLineEnabled: false,
            lintLongQueryLineSeverity: 'information',
            lintMissingQueryCommentEnabled: false,
            lintMissingQueryCommentSeverity: 'warning',
            lintMissingColumnCommentEnabled: false,
            lintMissingColumnCommentSeverity: 'warning',
            lintCommentedOutCodeEnabled: false,
            lintCommentedOutCodeSeverity: 'information',
            lintExpiredTodoEnabled: false,
            lintExpiredTodoSeverity: 'warning'
        }

        await this._updateConfig(defaults)
        await this._sendCurrentConfig()
    }

    private async _previewFormat(sql: string) {
        try {
            const config = vscode.workspace.getConfiguration('Hive-Formatter')
            const result = format(sql, {
                language: config.get('dialect', 'hive') as SqlLanguage,
                keywordCase: config.get('keywordCase', 'preserve') as KeywordCase,
                dataTypeCase: config.get('dataTypeCase', 'preserve') as DataTypeCase,
                functionCase: config.get('functionCase', 'preserve') as FunctionCase,
                identifierCase: config.get('identifierCase', 'preserve') as KeywordCase,
                indentStyle: config.get('indentStyle', 'standard') as IndentStyle,
                logicalOperatorNewline: config.get('logicalOperatorNewline', 'before') as LogicalOperatorNewline,
                expressionWidth: config.get('expressionWidth', 50),
                linesBetweenQueries: config.get('linesBetweenQueries', 1),
                denseOperators: config.get('denseOperators', false),
                newlineBeforeSemicolon: config.get('newlineBeforeSemicolon', false)
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
