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
        * {
            box-sizing: border-box;
        }
        
        :root {
            --primary-color: #007acc;
            --primary-hover: #1a8ad6;
            --bg-color: var(--vscode-editor-background);
            --text-color: var(--vscode-editor-foreground);
            --border-color: var(--vscode-panel-border);
            --card-bg: var(--vscode-sideBar-background);
            --input-bg: var(--vscode-input-background);
            --input-border: var(--vscode-input-border);
            --button-bg: var(--vscode-button-background);
            --button-hover: var(--vscode-button-hoverBackground);
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--text-color);
            background: var(--bg-color);
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border-color);
        }
        
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        
        .header-actions {
            display: flex;
            gap: 12px;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }
        
        .btn-primary {
            background: var(--button-bg);
            color: white;
        }
        
        .btn-primary:hover {
            background: var(--button-hover);
        }
        
        .btn-secondary {
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-color);
        }
        
        .btn-secondary:hover {
            background: var(--card-bg);
        }
        
        .main-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }
        
        .config-section {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
        }
        
        .config-section h2 {
            margin-top: 0;
            margin-bottom: 20px;
            font-size: 18px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border-color);
        }
        
        .config-group {
            margin-bottom: 20px;
        }
        
        .config-group-title {
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--primary-color);
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .config-item {
            margin-bottom: 16px;
        }
        
        .config-label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
        }
        
        .config-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        
        .config-input,
        .config-select {
            width: 100%;
            padding: 8px 12px;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 4px;
            color: var(--text-color);
            font-size: 14px;
        }
        
        .config-input:focus,
        .config-select:focus {
            outline: none;
            border-color: var(--primary-color);
        }
        
        .config-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .config-checkbox input {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
        
        .preview-section {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
        }
        
        .preview-section h2 {
            margin-top: 0;
            margin-bottom: 20px;
            font-size: 18px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border-color);
        }
        
        .preview-editor {
            width: 100%;
            min-height: 150px;
            padding: 12px;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 4px;
            color: var(--text-color);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            resize: vertical;
            margin-bottom: 12px;
        }
        
        .preview-result {
            background: var(--vscode-editor-background);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 12px;
            min-height: 150px;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            white-space: pre-wrap;
            overflow-x: auto;
        }
        
        .preview-result.empty {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vscode-descriptionForeground);
        }
        
        .presets-section {
            margin-top: 24px;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
        }
        
        .presets-section h2 {
            margin-top: 0;
            margin-bottom: 16px;
            font-size: 18px;
        }
        
        .preset-buttons {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }
        
        .preset-btn {
            padding: 10px 20px;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            cursor: pointer;
            color: var(--text-color);
            transition: all 0.2s;
        }
        
        .preset-btn:hover {
            border-color: var(--primary-color);
            background: rgba(0, 122, 204, 0.1);
        }
        
        .preset-btn.active {
            border-color: var(--primary-color);
            background: rgba(0, 122, 204, 0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎨 Hive Formatter 配置编辑器</h1>
            <div class="header-actions">
                <button class="btn btn-secondary" onclick="resetConfig()">🔄 重置默认</button>
                <button class="btn btn-primary" onclick="saveConfig()">💾 保存配置</button>
            </div>
        </div>
        
        <div class="presets-section">
            <h2>快速预设</h2>
            <div class="preset-buttons">
                <button class="preset-btn" onclick="applyPreset('default')">默认</button>
                <button class="preset-btn" onclick="applyPreset('hive')">Hive 风格</button>
                <button class="preset-btn" onclick="applyPreset('mysql')">MySQL 风格</button>
                <button class="preset-btn" onclick="applyPreset('compact')">紧凑风格</button>
            </div>
        </div>
        
        <div class="main-content">
            <div class="config-section">
                <h2>⚙️ 格式化配置</h2>
                
                <div class="config-group">
                    <div class="config-group-title">基础设置</div>
                    
                    <div class="config-item">
                        <label class="config-label">SQL 方言</label>
                        <select class="config-select" id="dialect">
                            <option value="hive">Apache Hive</option>
                            <option value="mysql">MySQL</option>
                            <option value="spark">Spark</option>
                            <option value="sql">通用 SQL</option>
                        </select>
                    </div>
                </div>
                
                <div class="config-group">
                    <div class="config-group-title">大小写设置</div>
                    
                    <div class="config-item">
                        <label class="config-label">关键字大小写</label>
                        <select class="config-select" id="keywordCase">
                            <option value="preserve">保持原样</option>
                            <option value="upper">大写</option>
                            <option value="lower">小写</option>
                        </select>
                    </div>
                    
                    <div class="config-item">
                        <label class="config-label">数据类型大小写</label>
                        <select class="config-select" id="dataTypeCase">
                            <option value="preserve">保持原样</option>
                            <option value="upper">大写</option>
                            <option value="lower">小写</option>
                        </select>
                    </div>
                    
                    <div class="config-item">
                        <label class="config-label">函数名大小写</label>
                        <select class="config-select" id="functionCase">
                            <option value="preserve">保持原样</option>
                            <option value="upper">大写</option>
                            <option value="lower">小写</option>
                        </select>
                    </div>
                    
                    <div class="config-item">
                        <label class="config-label">标识符大小写</label>
                        <select class="config-select" id="identifierCase">
                            <option value="preserve">保持原样</option>
                            <option value="upper">大写</option>
                            <option value="lower">小写</option>
                        </select>
                    </div>
                </div>
                
                <div class="config-group">
                    <div class="config-group-title">缩进与格式</div>
                    
                    <div class="config-item">
                        <label class="config-label">缩进风格</label>
                        <select class="config-select" id="indentStyle">
                            <option value="standard">标准缩进</option>
                            <option value="tabularLeft">表格左对齐</option>
                            <option value="tabularRight">表格右对齐</option>
                        </select>
                    </div>
                    
                    <div class="config-item">
                        <label class="config-label">逻辑运算符换行</label>
                        <select class="config-select" id="logicalOperatorNewline">
                            <option value="before">在 AND/OR 之前换行</option>
                            <option value="after">在 AND/OR 之后换行</option>
                        </select>
                    </div>
                    
                    <div class="config-item">
                        <label class="config-label">表达式宽度</label>
                        <div class="config-description">表达式字符数达到此值时拆分为多行</div>
                        <input type="number" class="config-input" id="expressionWidth" min="0" max="200">
                    </div>
                    
                    <div class="config-item">
                        <label class="config-label">查询间隔行数</label>
                        <div class="config-description">查询语句之间的空行数</div>
                        <input type="number" class="config-input" id="linesBetweenQueries" min="0" max="10">
                    </div>
                </div>
                
                <div class="config-group">
                    <div class="config-group-title">逗号和对齐</div>
                    
                    <div class="config-item">
                        <label class="config-label">逗号位置</label>
                        <select class="config-select" id="commaPosition">
                            <option value="after">行尾</option>
                            <option value="before">行首</option>
                        </select>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="alignColumnDefinitions">
                        <label class="config-label">对齐列定义</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="tabulateAlias">
                        <label class="config-label">对齐表别名</label>
                    </div>
                </div>
                
                <div class="config-group">
                    <div class="config-group-title">换行设置</div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="newlineAfterSelect">
                        <label class="config-label">SELECT 后换行</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="newlineAfterFrom">
                        <label class="config-label">FROM 后换行</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="newlineBeforeWhere">
                        <label class="config-label">WHERE 前换行</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="newlineAfterWhere">
                        <label class="config-label">WHERE 后换行</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="newlineBeforeOrderBy">
                        <label class="config-label">ORDER BY 前换行</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="newlineBeforeGroupBy">
                        <label class="config-label">GROUP BY 前换行</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="newlineBeforeHaving">
                        <label class="config-label">HAVING 前换行</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="newlineBeforeLimit">
                        <label class="config-label">LIMIT 前换行</label>
                    </div>
                </div>
                
                <div class="config-group">
                    <div class="config-group-title">其他选项</div>
                    
                    <div class="config-item">
                        <label class="config-label">最大行长度</label>
                        <input type="number" class="config-input" id="maxLineLength" min="40" max="500">
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="denseOperators">
                        <label class="config-label">紧凑运算符（去除运算符周围空格）</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="newlineBeforeSemicolon">
                        <label class="config-label">分号另起一行</label>
                    </div>
                    
                    <div class="config-item config-checkbox">
                        <input type="checkbox" id="ignoreTabSettings">
                        <label class="config-label">忽略编辑器 Tab 设置</label>
                    </div>
                    
                    <div class="config-item" id="tabOverrideGroup" style="display: none;">
                        <label class="config-label">Tab 宽度覆盖</label>
                        <input type="number" class="config-input" id="tabSizeOverride" min="1" max="8">
                    </div>
                </div>
            </div>
            
            <div class="preview-section">
                <h2>👁️ 实时预览</h2>
                <textarea class="preview-editor" id="previewInput" placeholder="输入 SQL 进行预览...">select id,name,email from users where age>18 and status='active' order by created_at desc limit 10;</textarea>
                <button class="btn btn-primary" style="width: 100%; margin-bottom: 12px;" onclick="previewFormat()">格式化预览</button>
                <div class="preview-result empty" id="previewResult">点击"格式化预览"查看效果</div>
            </div>
        </div>
    </div>
    
    <script>
        let currentConfig = {};
        
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
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true
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
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true
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
                ignoreTabSettings: false,
                tabSizeOverride: 4,
                insertSpacesOverride: true
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
                ignoreTabSettings: false,
                tabSizeOverride: 2,
                insertSpacesOverride: true
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
                ignoreTabSettings: document.getElementById('ignoreTabSettings').checked,
                tabSizeOverride: parseInt(document.getElementById('tabSizeOverride').value),
                insertSpacesOverride: true
            };
        }
        
        function saveConfig() {
            const config = collectConfig();
            vscode.postMessage({ command: 'updateConfig', data: config });
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
            resultEl.textContent = result;
        }
        
        function updateTabOverrideGroup() {
            const group = document.getElementById('tabOverrideGroup');
            const checkbox = document.getElementById('ignoreTabSettings');
            group.style.display = checkbox.checked ? 'block' : 'none';
        }
        
        document.getElementById('ignoreTabSettings').addEventListener('change', updateTabOverrideGroup);
        
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
                ignoreTabSettings: config.get('ignoreTabSettings', false),
                tabSizeOverride: config.get('tabSizeOverride', 2),
                insertSpacesOverride: config.get('insertSpacesOverride', true)
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
        await config.update('ignoreTabSettings', data.ignoreTabSettings, vscode.ConfigurationTarget.Global)
        await config.update('tabSizeOverride', data.tabSizeOverride, vscode.ConfigurationTarget.Global)
        await config.update('insertSpacesOverride', data.insertSpacesOverride, vscode.ConfigurationTarget.Global)
        
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
            ignoreTabSettings: false,
            tabSizeOverride: 2,
            insertSpacesOverride: true
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
