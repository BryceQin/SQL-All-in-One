const vscode = acquireVsCodeApi();

const i18n = {
    zh: {
        'resultPanel.title': '查询结果',
        'resultPanel.queryResult': '查询结果',
        'resultPanel.execute': '执行',
        'resultPanel.cancel': '取消',
        'resultPanel.refresh': '刷新',
        'resultPanel.export': '导出',
        'resultPanel.filter': '筛选',
        'resultPanel.addCondition': '+ 添加条件',
        'resultPanel.applyFilter': '应用',
        'resultPanel.noData': '暂无查询结果',
        'resultPanel.resultSet': '结果集',
        'resultPanel.messages': '消息',
        'resultPanel.history': '历史',
        'resultPanel.go': '跳转',
        'resultPanel.rowCount': '记录数',
        'resultPanel.timeTaken': '耗时',
        'resultPanel.showing': '显示',
        'resultPanel.of': '/',
        'resultPanel.rows': '行',
        'resultPanel.page': '页',
        'resultPanel.executedAt': '执行于',
        'resultPanel.connection': '连接',
        'resultPanel.affectedRows': '影响行数',
        'resultPanel.error': '错误',
        'resultPanel.success': '成功',
        'resultPanel.running': '执行中...',
        'resultPanel.queryStarted': '查询开始执行',
        'resultPanel.queryCompleted': '查询执行完成',
        'resultPanel.queryFailed': '查询执行失败',
        'resultPanel.queryCancelled': '查询已取消',
        'resultPanel.ms': '毫秒',
        'resultPanel.seconds': '秒',
        'resultPanel.editMode': '编辑',
        'resultPanel.readonly': '只读',
        'resultPanel.editable': '可编辑',
        'resultPanel.addRow': '添加',
        'resultPanel.deleteRow': '删除',
        'resultPanel.commit': '提交',
        'resultPanel.rollback': '回滚',
        'resultPanel.beginTx': '事务',
        'resultPanel.savepoint': '保存点',
        'resultPanel.rollbackToSp': '回滚保存点',
        'resultPanel.gridView': '网格',
        'resultPanel.formView': '表单',
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
        'resultPanel.filterValue': '值',
        'resultPanel.addRowTitle': '添加行',
        'resultPanel.deleteRowTitle': '删除行',
        'resultPanel.beginTxTitle': '开始事务',
        'resultPanel.rollbackToSpTitle': '回滚到保存点',
        'resultPanel.gridViewTitle': '网格视图',
        'resultPanel.formViewTitle': '表单视图',
        'resultPanel.editModeTitle': '编辑模式'
    },
    en: {
        'resultPanel.title': 'Query Result',
        'resultPanel.queryResult': 'Query Result',
        'resultPanel.execute': 'Execute',
        'resultPanel.cancel': 'Cancel',
        'resultPanel.refresh': 'Refresh',
        'resultPanel.export': 'Export',
        'resultPanel.filter': 'Filter',
        'resultPanel.addCondition': '+ Add Condition',
        'resultPanel.applyFilter': 'Apply',
        'resultPanel.noData': 'No query results',
        'resultPanel.resultSet': 'Result Set',
        'resultPanel.messages': 'Messages',
        'resultPanel.history': 'History',
        'resultPanel.go': 'Go',
        'resultPanel.rowCount': 'Rows',
        'resultPanel.timeTaken': 'Time',
        'resultPanel.showing': 'Showing',
        'resultPanel.of': '/',
        'resultPanel.rows': 'rows',
        'resultPanel.page': 'Page',
        'resultPanel.executedAt': 'Executed at',
        'resultPanel.connection': 'Connection',
        'resultPanel.affectedRows': 'Affected rows',
        'resultPanel.error': 'Error',
        'resultPanel.success': 'Success',
        'resultPanel.running': 'Running...',
        'resultPanel.queryStarted': 'Query started',
        'resultPanel.queryCompleted': 'Query completed',
        'resultPanel.queryFailed': 'Query failed',
        'resultPanel.queryCancelled': 'Query cancelled',
        'resultPanel.ms': 'ms',
        'resultPanel.seconds': 's',
        'resultPanel.editMode': 'Edit',
        'resultPanel.readonly': 'Read Only',
        'resultPanel.editable': 'Editable',
        'resultPanel.addRow': 'Add',
        'resultPanel.deleteRow': 'Delete',
        'resultPanel.commit': 'Commit',
        'resultPanel.rollback': 'Rollback',
        'resultPanel.beginTx': 'Transaction',
        'resultPanel.savepoint': 'Savepoint',
        'resultPanel.rollbackToSp': 'Rollback SP',
        'resultPanel.gridView': 'Grid',
        'resultPanel.formView': 'Form',
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
        'resultPanel.filterValue': 'Value',
        'resultPanel.addRowTitle': 'Add Row',
        'resultPanel.deleteRowTitle': 'Delete Row',
        'resultPanel.beginTxTitle': 'Begin Transaction',
        'resultPanel.rollbackToSpTitle': 'Rollback to Savepoint',
        'resultPanel.gridViewTitle': 'Grid View',
        'resultPanel.formViewTitle': 'Form View',
        'resultPanel.editModeTitle': 'Edit Mode'
    }
};

let lang = 'zh';

function t(key) {
    return i18n[lang][key] || i18n.en[key] || key;
}

const state = {
    columns: [],
    rows: [],
    rowCount: 0,
    affectedRows: 0,
    executionTime: 0,
    error: null,
    database: '',
    connectionName: '',
    status: 'idle',
    currentPage: 1,
    pageSize: 100,
    nullPlaceholder: 'NULL',
    enablePreload: false,
    jsonPrettyPrint: false,
    dateFormat: '',
    longTextThreshold: 200,
    sortColumn: null,
    sortDirection: null,
    filterConditions: [{ column: '', operator: '=', value: '' }],
    selectedCell: null,
    messages: [],
    history: [],
    queryId: null,
    currentSql: '',
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
};

var monacoEditor = null;
var monacoLoaded = false;

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

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 48;
const BUFFER_ROWS = 5;

function init() {
    applyI18n();
    const gridBodyWrapper = document.getElementById('gridBodyWrapper');
    gridBodyWrapper.addEventListener('scroll', onGridScroll);
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    updateEmptyState();
    updateHeader();
    updateStatusBar();
    initSplitter();
}

function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        if (key && i18n[lang] && i18n[lang][key]) {
            el.textContent = i18n[lang][key];
        }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-title');
        if (key && i18n[lang] && i18n[lang][key]) {
            el.title = i18n[lang][key];
        }
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-ph');
        if (key && i18n[lang] && i18n[lang][key]) {
            el.placeholder = i18n[lang][key];
        }
    });
}

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

function buildVscodeTheme() {
    var style = getComputedStyle(document.body);
    function getColor(varName, fallback) {
        var val = style.getPropertyValue(varName).trim();
        if (!val) return fallback;
        if (val.length === 9 && val.charAt(0) === '#') {
            val = val.substring(0, 7);
        }
        return val;
    }
    var isDark = document.body.classList.contains('vscode-dark') ||
                 document.querySelector('[data-vscode-theme-kind="vscode-dark"]') ||
                 (window.__CONFIG__ && window.__CONFIG__.themeKind === 2);
    var base = isDark ? 'vs-dark' : 'vs';
    var editorBg = getColor('--vscode-editor-background', isDark ? '#1e1e1e' : '#ffffff');
    var gutterBg = getColor('--vscode-editorGutter-background', editorBg);
    var overviewBg = getColor('--vscode-editorOverviewRuler-background', isDark ? '#252526' : '#ffffff');
    var tc = (window.__CONFIG__ && window.__CONFIG__.tokenColors) || {};
    var lineNumColor = getColor('--vscode-editorLineNumber-foreground', isDark ? '#858585' : '#237893');
    var activeLineNumColor = getColor('--vscode-editorLineNumber-activeForeground', isDark ? '#c6c6c6' : '#0b216f');
    return {
        base: base,
        inherit: true,
        rules: [
            { token: 'keyword', foreground: tc.keyword || getColor('--vscode-editorKeyword-foreground', isDark ? '#569cd6' : '#0000ff') },
            { token: 'string', foreground: tc.string || getColor('--vscode-string-foreground', isDark ? '#ce9178' : '#a31515') },
            { token: 'string.sql', foreground: tc.string || getColor('--vscode-string-foreground', isDark ? '#ce9178' : '#a31515') },
            { token: 'comment', foreground: tc.comment || getColor('--vscode-editorComments-foreground', isDark ? '#6a9955' : '#008000') },
            { token: 'number', foreground: tc.number || getColor('--vscode-editorNumbers-foreground', isDark ? '#b5cea8' : '#098658') },
            { token: 'type', foreground: tc.type || getColor('--vscode-editorType-foreground', isDark ? '#4ec9b0' : '#267f99') },
            { token: 'type.identifier', foreground: tc.type || getColor('--vscode-editorType-foreground', isDark ? '#4ec9b0' : '#267f99') },
            { token: 'function', foreground: tc.function || getColor('--vscode-editorFunction-foreground', isDark ? '#dcdcaa' : '#795e26') },
            { token: 'operator', foreground: tc.operator || getColor('--vscode-editorOperator-foreground', isDark ? '#d4d4d4' : '#000000') },
            { token: 'delimiter', foreground: tc.delimiter || getColor('--vscode-editorBracketMatch-background', isDark ? '#d4d4d4' : '#000000') },
            { token: 'variable', foreground: tc.variable || getColor('--vscode-editorVariable-foreground', isDark ? '#9cdcfe' : '#001080') },
            { token: '', foreground: getColor('--vscode-editor-foreground', isDark ? '#d4d4d4' : '#000000') },
        ],
        colors: {
            'editor.background': editorBg,
            'editor.foreground': getColor('--vscode-editor-foreground', isDark ? '#d4d4d4' : '#000000'),
            'editor.lineHighlightBackground': editorBg,
            'editor.selectionBackground': getColor('--vscode-editor-selectionBackground', isDark ? '#264f78' : '#add6ff'),
            'editorCursor.foreground': getColor('--vscode-editorCursor-foreground', isDark ? '#aeafad' : '#000000'),
            'editor.inactiveSelectionBackground': getColor('--vscode-editor-inactiveSelectionBackground', isDark ? '#3a3d41' : '#e5ebf1'),
            'editorLineNumber.foreground': lineNumColor,
            'editorLineNumber.activeForeground': activeLineNumColor,
            'editorIndentGuide.background1': getColor('--vscode-editorIndentGuide-background1', isDark ? '#404040' : '#e4e4e4'),
            'editorIndentGuide.activeBackground1': getColor('--vscode-editorIndentGuide-activeBackground1', isDark ? '#707070' : '#e4e4e4'),
            'editorGutter.background': gutterBg,
            'editorOverviewRuler.background': overviewBg,
            'editor.selectionHighlightBackground': getColor('--vscode-editor-selectionHighlightBackground', isDark ? '#add6ff26' : '#add6ff52'),
            'editorGutter.modifiedBackground': getColor('--vscode-editorGutter-modifiedBackground', '#0078d466'),
            'editorGutter.addedBackground': getColor('--vscode-editorGutter-addedBackground', '#587c0c66'),
            'editorGutter.deletedBackground': getColor('--vscode-editorGutter-deletedBackground', '#94151b66'),
        }
    };
}

function createMonacoInstance(monaco, container, sql) {
    if (monacoEditor) {
        monacoEditor.setValue(sql || '');
        return;
    }
    var isDark = document.body.classList.contains('vscode-dark') ||
                 document.querySelector('[data-vscode-theme-kind="vscode-dark"]') ||
                 (window.__CONFIG__ && window.__CONFIG__.themeKind === 2);
    var customThemeName = 'vscode-sync-' + (isDark ? 'dark' : 'light');
    monaco.editor.defineTheme(customThemeName, buildVscodeTheme());
    monacoEditor = monaco.editor.create(container, {
        value: sql || '',
        language: 'sql',
        theme: customThemeName,
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
    if (data.tokenColors && window.__CONFIG__) {
        window.__CONFIG__.tokenColors = data.tokenColors;
    }
    var isDark = data.kind === 2 || data.kind === 3;
    var customThemeName = 'vscode-sync-' + (isDark ? 'dark' : 'light');
    monaco.editor.defineTheme(customThemeName, buildVscodeTheme());
    monaco.editor.setTheme(customThemeName);
}

function onGridScroll() {
    renderVisibleRows();
}

function onDocumentClick(e) {
    const exportDropdown = document.getElementById('exportDropdown');
    const exportMenu = document.getElementById('exportMenu');
    if (!exportDropdown.contains(e.target)) {
        exportMenu.classList.remove('open');
    }
}

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

function copySelectedCell() {
    if (!state.selectedCell) return;
    const { row, col } = state.selectedCell;
    if (row < 0 || row >= state.rows.length) return;
    const row_ = state.rows[row];
    if (!row_) return;
    const val = row_[col];
    if (val === null || val === undefined) {
        navigator.clipboard.writeText(state.nullPlaceholder);
    } else {
        navigator.clipboard.writeText(String(val));
    }
}

function handleMessage(event) {
    const message = event.data;
    if (!message || !message.type) return;

    switch (message.type) {
        case 'queryResult':
            handleQueryResult(message.data);
            break;
        case 'queryStart':
            handleQueryStart(message.data);
            break;
        case 'queryError':
            handleQueryError(message.data);
            break;
        case 'historyData':
            handleHistoryData(message.data);
            break;
        case 'config':
            handleConfig(message.data);
            break;
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
        case 'setEditorSql':
            handleSetEditorSql(message.data);
            break;
        case 'themeChange':
            handleThemeChange(message.data);
            break;
    }
}

function handleQueryResult(data) {
    state.columns = data.columns || [];
    state.rows = data.rows || [];
    state.rowCount = data.rowCount || 0;
    state.affectedRows = data.affectedRows || 0;
    state.executionTime = data.executionTime || 0;
    state.error = data.error || null;
    state.database = data.database || '';
    state.connectionName = data.connectionName || '';
    state.queryId = data.queryId || null;
    state.status = data.status === 'error' ? 'error' : 'success';
    state.currentPage = 1;
    state.sortColumn = null;
    state.sortDirection = null;
    state.selectedCell = null;
    state.tableName = data.tableName || '';
    state.originalRows = (data.rows || []).map(function(row) { return Object.assign({}, row); });
    state.pendingChanges = [];
    state.validationErrors = {};
    state.editingCell = null;
    state.formCurrentIndex = 0;

    var config = window.__CONFIG__ || {};
    if (config.editMode === 'editable') {
        state.editMode = true;
        var btn = document.getElementById('btnEditMode');
        btn.classList.add('edit-mode-active');
        btn.title = t('resultPanel.editable');
        document.getElementById('btnAddRow').disabled = false;
        document.getElementById('btnDeleteRow').disabled = false;
        document.getElementById('btnBeginTx').disabled = false;
    }

    if (config.defaultView === 'form') {
        switchView('form');
    }

    addMessage(
        data.error ? 'error' : 'success',
        data.error
            ? t('resultPanel.queryFailed') + ': ' + (data.error.message || '')
            : t('resultPanel.queryCompleted') + ' - ' + state.rowCount + ' ' + t('resultPanel.rows') + ', ' + formatTime(state.executionTime)
    );

    renderGrid();
    updateHeader();
    updateStatusBar();
    updateEmptyState();
}

function handleQueryStart(data) {
    state.status = 'running';
    state.currentSql = data.sql || '';
    updateHeader();
    addMessage('info', t('resultPanel.queryStarted') + ': ' + (data.sql || '').substring(0, 200));
}

function handleQueryError(data) {
    state.status = 'error';
    state.error = data;
    updateHeader();
    addMessage('error', t('resultPanel.queryFailed') + ': ' + (data.code || '') + ' ' + (data.message || ''));
    updateEmptyState();
}

function handleHistoryData(data) {
    state.history = data.entries || [];
    renderHistory();
}

function handleConfig(data) {
    if (data.pageSize !== undefined) state.pageSize = data.pageSize;
    if (data.nullPlaceholder !== undefined) state.nullPlaceholder = data.nullPlaceholder;
    if (data.enablePreload !== undefined) state.enablePreload = data.enablePreload;
    if (data.jsonPrettyPrint !== undefined) state.jsonPrettyPrint = data.jsonPrettyPrint;
    if (data.dateFormat !== undefined) state.dateFormat = data.dateFormat;
    if (data.longTextThreshold !== undefined) state.longTextThreshold = data.longTextThreshold;
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
    if (data.monacoBasePath !== undefined) state.monacoBasePath = data.monacoBasePath;
}

function renderGrid() {
    renderHeader();
    requestAnimationFrame(function() {
        renderVisibleRows();
    });
}

function renderHeader() {
    const headerRow = document.getElementById('gridHeaderRow');
    headerRow.innerHTML = '';

    const thNum = document.createElement('th');
    thNum.className = 'row-num-header';
    thNum.textContent = '#';
    headerRow.appendChild(thNum);

    state.columns.forEach((col, idx) => {
        const th = document.createElement('th');
        th.onclick = () => handleSortClick(idx);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'col-name';
        nameSpan.textContent = col.name || '';

        const typeSpan = document.createElement('span');
        typeSpan.className = 'col-type';
        typeSpan.textContent = col.type || '';
        var typeColorInfo = getTypeColorInfo(col.type);
        if (typeColorInfo) {
            typeSpan.style.color = typeColorInfo.color;
            typeSpan.style.background = typeColorInfo.bg;
            typeSpan.style.border = '1px solid ' + typeColorInfo.border;
        }

        th.appendChild(nameSpan);
        th.appendChild(typeSpan);

        if (state.sortColumn === idx && state.sortDirection) {
            const sortSpan = document.createElement('span');
            sortSpan.className = 'sort-indicator';
            sortSpan.textContent = state.sortDirection === 'asc' ? '▲' : '▼';
            th.appendChild(sortSpan);
        }

        headerRow.appendChild(th);
    });
}

function renderVisibleRows() {
    var wrapper = document.getElementById('gridBodyWrapper');
    var spacer = document.getElementById('gridSpacer');
    var tbody = document.getElementById('gridBody');

    var totalHeight = (state.rows.length + (state.editMode ? 1 : 0)) * ROW_HEIGHT;
    spacer.style.height = totalHeight + 'px';

    var scrollTop = wrapper.scrollTop;
    var viewportHeight = wrapper.clientHeight;

    var totalRows = state.rows.length + (state.editMode ? 1 : 0);
    var startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    var endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

    tbody.innerHTML = '';

    var table = document.getElementById('gridBodyTable');
    table.style.top = (startRow * ROW_HEIGHT) + 'px';

    for (var i = startRow; i < endRow; i++) {
        var tr = document.createElement('tr');
        var isPlaceholder = i >= state.rows.length;

        var tdNum = document.createElement('td');
        tdNum.className = 'row-num';
        if (isPlaceholder) {
            tdNum.textContent = '*';
            tr.classList.add('row-placeholder');
        } else {
            tdNum.textContent = i + 1;
        }
        tr.appendChild(tdNum);

        var rowChange = isPlaceholder ? null : state.pendingChanges.find(function(c) { return c.rowIndex === i; });
        if (rowChange) {
            if (rowChange.type === 'insert') tr.classList.add('row-new');
            if (rowChange.type === 'delete') tr.classList.add('row-deleted');
            if (rowChange.type === 'update') tr.classList.add('row-modified');
        }

        if (!isPlaceholder) {
            var row = state.rows[i];
            state.columns.forEach(function(col, colIdx) {
                var td = document.createElement('td');
                var val = row ? row[colIdx] : undefined;

                if (state.editingCell && state.editingCell.row === i && state.editingCell.col === colIdx) {
                    td.className = 'cell-editing';
                    renderCellEditor(td, val, col, i, colIdx);
                } else {
                    if (val === null || val === undefined) {
                        td.className = state.editMode ? 'cell-null-editable' : 'cell-null';
                        td.textContent = state.nullPlaceholder;
                    } else {
                        var colType = (col.type || '').toUpperCase();
                        if (isBlobType(colType)) {
                            td.className = 'cell-blob';
                            td.textContent = '[BLOB]';
                        } else {
                            var display = String(val);
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

                    var validationKey = i + '_' + colIdx;
                    if (state.validationErrors[validationKey]) {
                        td.classList.add('cell-validation-error');
                        td.title = state.validationErrors[validationKey];
                    }
                }

                if (state.selectedCell && state.selectedCell.row === i && state.selectedCell.col === colIdx) {
                    td.classList.add('selected');
                }

                (function(rowIdx, colIdx2) {
                    td.onclick = function(e) {
                        e.stopPropagation();
                        if (state.editingCell && (state.editingCell.row !== rowIdx || state.editingCell.col !== colIdx2)) {
                            commitCellEdit();
                        }
                        selectCell(rowIdx, colIdx2);
                    };
                    td.ondblclick = function(e) {
                        e.stopPropagation();
                        if (state.editMode) {
                            startCellEdit(rowIdx, colIdx2);
                        }
                    };
                })(i, colIdx);

                tr.appendChild(td);
            });
        } else {
            state.columns.forEach(function(_, colIdx) {
                var td = document.createElement('td');
                td.textContent = '';
                td.onclick = function(e) {
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

function selectCell(row, col) {
    state.selectedCell = { row, col };
    const prev = document.querySelector('.grid-body-table td.selected');
    if (prev) prev.classList.remove('selected');
    const wrapper = document.getElementById('gridBodyWrapper');
    const rows = wrapper.querySelectorAll('.grid-body-table tbody tr');
    const targetRow = row - Math.max(0, Math.floor(wrapper.scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    if (rows[targetRow]) {
        const cells = rows[targetRow].querySelectorAll('td');
        if (cells[col + 1]) {
            cells[col + 1].classList.add('selected');
        }
    }
}

function handleSortClick(colIdx) {
    if (state.sortColumn === colIdx) {
        if (state.sortDirection === 'asc') {
            state.sortDirection = 'desc';
        } else if (state.sortDirection === 'desc') {
            state.sortColumn = null;
            state.sortDirection = null;
        } else {
            state.sortDirection = 'asc';
        }
    } else {
        state.sortColumn = colIdx;
        state.sortDirection = 'asc';
    }

    if (state.rows.length <= 1000 && state.sortColumn !== null) {
        sortClientSide();
        renderGrid();
    } else if (state.sortColumn !== null) {
        vscode.postMessage({
            command: 'requestSort',
            column: state.columns[colIdx].name,
            direction: state.sortDirection
        });
    } else {
        renderGrid();
    }

    renderHeader();
}

function sortClientSide() {
    const colIdx = state.sortColumn;
    const dir = state.sortDirection;
    if (colIdx === null || !dir) return;

    state.rows.sort((a, b) => {
        let va = a[colIdx];
        let vb = b[colIdx];

        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;

        if (typeof va === 'number' && typeof vb === 'number') {
            return dir === 'asc' ? va - vb : vb - va;
        }

        va = String(va);
        vb = String(vb);
        const cmp = va.localeCompare(vb);
        return dir === 'asc' ? cmp : -cmp;
    });
}

function toggleFilterBar() {
    const bar = document.getElementById('filterBar');
    bar.classList.toggle('open');
    if (bar.classList.contains('open')) {
        updateFilterColumnOptions();
    }
}

function updateFilterColumnOptions() {
    const selects = document.querySelectorAll('.filter-col');
    selects.forEach(sel => {
        const current = sel.value;
        sel.innerHTML = '';
        state.columns.forEach(col => {
            const opt = document.createElement('option');
            opt.value = col.name;
            opt.textContent = col.name + (col.type ? ' (' + col.type + ')' : '');
            sel.appendChild(opt);
        });
        if (current && state.columns.some(c => c.name === current)) {
            sel.value = current;
        }
    });
}

function onFilterColChange(sel, idx) {
}

function onFilterOpChange(sel, idx) {
    const row = sel.closest('.filter-row');
    const valInput = row.querySelector('.filter-val');
    const op = sel.value;
    if (op === 'IS NULL' || op === 'IS NOT NULL') {
        valInput.classList.add('hidden');
    } else {
        valInput.classList.remove('hidden');
    }
}

function addFilterCondition() {
    const container = document.getElementById('filterConditions');
    const idx = container.children.length;
    const row = document.createElement('div');
    row.className = 'filter-row';
    row.setAttribute('data-index', idx);

    let colSelect = document.createElement('select');
    colSelect.className = 'filter-col';
    (function(i) {
        colSelect.addEventListener('change', function() { onFilterColChange(colSelect, i); });
    })(idx);
    state.columns.forEach(col => {
        var opt = document.createElement('option');
        opt.value = col.name;
        opt.textContent = col.name + (col.type ? ' (' + col.type + ')' : '');
        colSelect.appendChild(opt);
    });

    let opSelect = document.createElement('select');
    opSelect.className = 'filter-op';
    (function(i) {
        opSelect.addEventListener('change', function() { onFilterOpChange(opSelect, i); });
    })(idx);
    ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL', 'BETWEEN'].forEach(function(op) {
        var opt = document.createElement('option');
        opt.value = op;
        opt.textContent = op;
        opSelect.appendChild(opt);
    });

    let valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'filter-val';
    valInput.placeholder = 'Value';

    let removeBtn = document.createElement('button');
    removeBtn.className = 'filter-remove-btn';
    (function(i) {
        removeBtn.addEventListener('click', function() { removeFilterCondition(i); });
    })(idx);
    removeBtn.textContent = '✕';

    row.appendChild(colSelect);
    row.appendChild(opSelect);
    row.appendChild(valInput);
    row.appendChild(removeBtn);

    container.appendChild(row);
    state.filterConditions.push({ column: '', operator: '=', value: '' });
}

function removeFilterCondition(idx) {
    const container = document.getElementById('filterConditions');
    const rows = container.querySelectorAll('.filter-row');
    if (rows.length <= 1) return;
    rows[idx].remove();
    state.filterConditions.splice(idx, 1);
    const remaining = container.querySelectorAll('.filter-row');
    remaining.forEach((row, i) => {
        row.setAttribute('data-index', i);
    });
}

function applyFilter() {
    const conditions = [];
    const rows = document.querySelectorAll('#filterConditions .filter-row');
    rows.forEach(row => {
        const col = row.querySelector('.filter-col').value;
        const op = row.querySelector('.filter-op').value;
        const val = row.querySelector('.filter-val').value;
        if (col) {
            conditions.push({ column: col, operator: op, value: val });
        }
    });
    vscode.postMessage({
        command: 'requestFilter',
        conditions: conditions
    });
}

function toggleExportMenu() {
    const menu = document.getElementById('exportMenu');
    menu.classList.toggle('open');
}

function handleExport(format) {
    document.getElementById('exportMenu').classList.remove('open');
    vscode.postMessage({
        command: 'requestExport',
        format: format
    });
}

function handleExecute() {
    executePanelSql();
}

function handleCancel() {
    vscode.postMessage({ command: 'cancelQuery' });
    state.status = 'idle';
    updateHeader();
    addMessage('warning', t('resultPanel.queryCancelled'));
}

function handleRefresh() {
    executePanelSql();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector('.tab-btn[data-tab="' + tabId + '"]').classList.add('active');
}

function updateHeader() {
    const connEl = document.getElementById('headerConn');
    const dotEl = document.getElementById('headerDot');
    const timeEl = document.getElementById('headerTime');

    connEl.textContent = state.connectionName ? ' - ' + state.connectionName : '';

    dotEl.className = 'header-dot';
    if (state.status === 'running') {
        dotEl.classList.add('running');
    } else if (state.status === 'error') {
        dotEl.classList.add('error');
    }

    if (state.executionTime > 0) {
        timeEl.textContent = t('resultPanel.timeTaken') + ': ' + formatTime(state.executionTime);
    } else {
        timeEl.textContent = '';
    }

    const btnExecute = document.getElementById('btnExecute');
    const btnCancel = document.getElementById('btnCancel');
    if (state.status === 'running') {
        btnExecute.disabled = true;
        btnCancel.disabled = false;
    } else {
        btnExecute.disabled = false;
        btnCancel.disabled = true;
    }
}

function updateStatusBar() {
    const statusInfo = document.getElementById('statusInfo');
    const pageInfo = document.getElementById('pageInfo');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');

    let info = '';
    if (state.rowCount > 0) {
        info = t('resultPanel.rowCount') + ': ' + state.rowCount;
    }
    if (state.affectedRows > 0) {
        info += (info ? ' | ' : '') + t('resultPanel.affectedRows') + ': ' + state.affectedRows;
    }
    if (state.executionTime > 0) {
        info += (info ? ' | ' : '') + t('resultPanel.timeTaken') + ': ' + formatTime(state.executionTime);
    }
    statusInfo.textContent = info;

    const totalPages = Math.max(1, Math.ceil(state.rowCount / state.pageSize));
    const startRow = (state.currentPage - 1) * state.pageSize + 1;
    const endRow = Math.min(state.currentPage * state.pageSize, state.rowCount);

    if (state.rowCount > 0) {
        pageInfo.textContent = t('resultPanel.showing') + ' ' + startRow + '-' + endRow + ' ' + t('resultPanel.of') + ' ' + formatNumber(state.rowCount) + ' ' + t('resultPanel.rows');
    } else {
        pageInfo.textContent = '';
    }

    btnPrev.disabled = state.currentPage <= 1;
    btnNext.disabled = state.currentPage >= totalPages;

    const pageJump = document.getElementById('pageJump');
    pageJump.max = totalPages;
}

function updateEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const gridContainer = document.getElementById('gridContainer');
    if (state.rows.length === 0 && state.status !== 'running') {
        emptyState.classList.add('visible');
        gridContainer.style.display = 'none';
    } else {
        emptyState.classList.remove('visible');
        gridContainer.style.display = '';
    }
}

function changePage(delta) {
    const totalPages = Math.max(1, Math.ceil(state.rowCount / state.pageSize));
    const newPage = state.currentPage + delta;
    if (newPage < 1 || newPage > totalPages) return;
    state.currentPage = newPage;
    vscode.postMessage({
        command: 'requestPage',
        page: newPage
    });
    updateStatusBar();
}

function jumpToPage(val) {
    const page = parseInt(val);
    if (isNaN(page) || page < 1) return;
    const totalPages = Math.max(1, Math.ceil(state.rowCount / state.pageSize));
    if (page > totalPages) return;
    state.currentPage = page;
    vscode.postMessage({
        command: 'requestPage',
        page: page
    });
    updateStatusBar();
}

function addMessage(level, text) {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0') + ':' +
        now.getSeconds().toString().padStart(2, '0');
    state.messages.push({ level, text, time: timeStr });
    renderMessages();
}

function renderMessages() {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    state.messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'msg-item msg-' + msg.level;
        const timeSpan = document.createElement('span');
        timeSpan.className = 'msg-time';
        timeSpan.textContent = '[' + msg.time + ']';
        div.appendChild(timeSpan);
        div.appendChild(document.createTextNode(msg.text));
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function renderHistory() {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';
    if (state.history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state visible';
        empty.innerHTML = '<div class="empty-state-icon">📋</div><div>' + t('resultPanel.noData') + '</div>';
        container.appendChild(empty);
        return;
    }
    state.history.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.onclick = () => {
            vscode.postMessage({
                command: 'executeQuery',
                sql: entry.sql
            });
        };

        const sqlDiv = document.createElement('div');
        sqlDiv.className = 'history-sql';
        sqlDiv.textContent = entry.sql || '';
        sqlDiv.title = entry.sql || '';

        const metaDiv = document.createElement('div');
        metaDiv.className = 'history-meta';

        const statusSpan = document.createElement('span');
        statusSpan.className = 'history-status ' + (entry.status === 'success' ? 'success' : 'error');
        statusSpan.textContent = entry.status === 'success' ? t('resultPanel.success') : t('resultPanel.error');

        const connSpan = document.createElement('span');
        connSpan.textContent = t('resultPanel.connection') + ': ' + (entry.connectionName || '-');

        const dbSpan = document.createElement('span');
        dbSpan.textContent = entry.database || '-';

        const timeSpan = document.createElement('span');
        timeSpan.textContent = t('resultPanel.executedAt') + ': ' + (entry.executedAt || '-');

        const rowsSpan = document.createElement('span');
        rowsSpan.textContent = t('resultPanel.rowCount') + ': ' + (entry.rowCount || 0);

        metaDiv.appendChild(statusSpan);
        metaDiv.appendChild(connSpan);
        metaDiv.appendChild(dbSpan);
        metaDiv.appendChild(timeSpan);
        metaDiv.appendChild(rowsSpan);

        if (entry.executionTime) {
            const execSpan = document.createElement('span');
            execSpan.textContent = t('resultPanel.timeTaken') + ': ' + formatTime(entry.executionTime);
            metaDiv.appendChild(execSpan);
        }

        if (entry.errorMessage) {
            const errSpan = document.createElement('span');
            errSpan.style.color = 'var(--error-color)';
            errSpan.textContent = entry.errorMessage;
            metaDiv.appendChild(errSpan);
        }

        div.appendChild(sqlDiv);
        div.appendChild(metaDiv);
        container.appendChild(div);
    });
}

function formatTime(ms) {
    if (ms < 1000) {
        return ms + t('resultPanel.ms');
    }
    return (ms / 1000).toFixed(2) + t('resultPanel.seconds');
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function isBlobType(type) {
    return !!type && (type.includes('BLOB') || type.includes('BINARY') || type.includes('VARBINARY'));
}

function renderCellEditor(td, val, col, rowIdx, colIdx) {
    var colType = (col.type || '').toUpperCase();

    if (col.isEnum && col.enumValues && col.enumValues.length > 0) {
        var select = document.createElement('select');
        if (col.nullable) {
            var opt = document.createElement('option');
            opt.value = '';
            opt.textContent = state.nullPlaceholder;
            select.appendChild(opt);
        }
        col.enumValues.forEach(function(ev) {
            var opt = document.createElement('option');
            opt.value = ev;
            opt.textContent = ev;
            if (ev === val) opt.selected = true;
            select.appendChild(opt);
        });
        select.onkeydown = function(e) {
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
        var select = document.createElement('select');
        if (col.nullable) {
            var opt = document.createElement('option');
            opt.value = '';
            opt.textContent = state.nullPlaceholder;
            select.appendChild(opt);
        }
        var fkKey = col.name;
        var fkOpts = state.foreignKeyOptions[fkKey] || [];
        fkOpts.forEach(function(fk) {
            var opt = document.createElement('option');
            opt.value = String(fk.value);
            opt.textContent = fk.displayText;
            if (String(fk.value) === String(val)) opt.selected = true;
            select.appendChild(opt);
        });
        var loadingOpt = document.createElement('option');
        loadingOpt.value = '__loading__';
        loadingOpt.textContent = '...';
        loadingOpt.disabled = true;
        select.appendChild(loadingOpt);
        select.onkeydown = function(e) {
            if (e.key === 'Escape') cancelCellEdit();
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                commitCellEdit();
            }
        };
        select.onfocus = function() {
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
        var input = document.createElement('input');
        input.type = 'text';
        input.value = val === null || val === undefined ? '' : String(val);
        if (val === null || val === undefined) {
            input.classList.add('field-null');
            input.placeholder = state.nullPlaceholder;
        }
        input.onkeydown = function(e) {
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

function toggleEditMode() {
    state.editMode = !state.editMode;
    var btn = document.getElementById('btnEditMode');
    if (state.editMode) {
        btn.classList.add('edit-mode-active');
        btn.title = t('resultPanel.editable');
    } else {
        btn.classList.remove('edit-mode-active');
        btn.title = t('resultPanel.readonly');
    }

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

function startCellEdit(row, col) {
    if (!state.editMode) return;
    if (state.editingCell) {
        commitCellEdit();
    }
    state.editingCell = { row: row, col: col };
    renderVisibleRows();
}

function commitCellEdit() {
    if (!state.editingCell) return;

    var row = state.editingCell.row;
    var col = state.editingCell.col;
    var input = document.querySelector('.cell-editing input, .cell-editing select');
    if (!input) {
        state.editingCell = null;
        return;
    }

    var newValue = input.value;
    var colMeta = state.columns[col];
    var oldValue = state.originalRows[row] ? state.originalRows[row][col] : state.rows[row][col];

    var processedValue = newValue;
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
    var existing = state.pendingChanges.find(function(c) { return c.rowIndex === row; });
    if (existing && existing.type === 'update') {
        if (!existing.changes) existing.changes = {};
        existing.changes[state.columns[col].name] = { old: oldVal, new: newVal };
    } else if (!existing) {
        var primaryKey = getPrimaryKeyValue(row);
        state.pendingChanges.push({
            type: 'update',
            table: state.tableName,
            primaryKey: primaryKey,
            changes: {},
            originalRow: Object.assign({}, state.originalRows[row]),
            rowIndex: row,
        });
        state.pendingChanges[state.pendingChanges.length - 1].changes[state.columns[col].name] = { old: oldVal, new: newVal };
    }
    updateEditStatusBar();
}

function getPrimaryKeyValue(row) {
    var pk = {};
    state.columns.forEach(function(col, idx) {
        if (col.isPrimaryKey) {
            pk[col.name] = state.originalRows[row] ? state.originalRows[row][idx] : state.rows[row][idx];
        }
    });
    return pk;
}

function addRow() {
    if (!state.editMode) return;
    var newRow = new Array(state.columns.length).fill(null);
    state.rows.push(newRow);
    var insertIndex = state.rows.length - 1;
    state.originalRows[insertIndex] = Object.assign({}, newRow);

    var primaryKey = {};
    state.columns.forEach(function(col, idx) {
        if (col.isPrimaryKey) {
            primaryKey[col.name] = null;
        }
    });

    state.pendingChanges.push({
        type: 'insert',
        table: state.tableName,
        primaryKey: primaryKey,
        rowIndex: insertIndex,
        originalRow: Object.assign({}, newRow),
    });

    renderGrid();
    updateEditStatusBar();
    var wrapper = document.getElementById('gridBodyWrapper');
    wrapper.scrollTop = wrapper.scrollHeight;
}

function deleteRow() {
    if (!state.editMode) return;
    if (!state.selectedCell) return;
    var row = state.selectedCell.row;
    if (row < 0 || row >= state.rows.length) return;

    var existingInsert = state.pendingChanges.find(function(c) { return c.rowIndex === row && c.type === 'insert'; });
    if (existingInsert) {
        state.pendingChanges = state.pendingChanges.filter(function(c) { return c !== existingInsert; });
        state.rows.splice(row, 1);
        state.pendingChanges.forEach(function(c) {
            if (c.rowIndex > row) c.rowIndex--;
        });
    } else {
        var existingDelete = state.pendingChanges.find(function(c) { return c.rowIndex === row && c.type === 'delete'; });
        if (existingDelete) {
            state.pendingChanges = state.pendingChanges.filter(function(c) { return c !== existingDelete; });
        } else {
            var existingUpdate = state.pendingChanges.find(function(c) { return c.rowIndex === row && c.type === 'update'; });
            if (existingUpdate) {
                state.pendingChanges = state.pendingChanges.filter(function(c) { return c !== existingUpdate; });
            }
            var primaryKey = getPrimaryKeyValue(row);
            state.pendingChanges.push({
                type: 'delete',
                table: state.tableName,
                primaryKey: primaryKey,
                originalRow: Object.assign({}, state.originalRows[row]),
                rowIndex: row,
            });
        }
    }

    renderGrid();
    updateEditStatusBar();
}

function commitChanges() {
    if (state.pendingChanges.length === 0) return;

    var sqlStatements = generateSqlFromChanges(state.pendingChanges);
    var updateCount = state.pendingChanges.filter(function(c) { return c.type === 'update'; }).length;
    var insertCount = state.pendingChanges.filter(function(c) { return c.type === 'insert'; }).length;
    var deleteCount = state.pendingChanges.filter(function(c) { return c.type === 'delete'; }).length;

    var summary = '';
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
    state.pendingChanges.forEach(function(change) {
        if (change.type === 'update' && change.originalRow) {
            var rowIdx = change.rowIndex;
            state.columns.forEach(function(_, colIdx) {
                state.rows[rowIdx][colIdx] = change.originalRow[colIdx];
            });
        } else if (change.type === 'insert') {
            var rowIdx = change.rowIndex;
            state.rows.splice(rowIdx, 1);
            state.pendingChanges.forEach(function(c) {
                if (c.rowIndex > rowIdx) c.rowIndex--;
            });
        }
    });
    state.pendingChanges = [];
    state.validationErrors = {};
    renderGrid();
    updateEditStatusBar();
}

function generateSqlFromChanges(changes) {
    var sqls = [];
    var sorted = changes.slice().sort(function(a, b) {
        var order = { delete: 0, update: 1, insert: 2 };
        return order[a.type] - order[b.type];
    });

    for (var i = 0; i < sorted.length; i++) {
        var change = sorted[i];
        if (change.type === 'delete') {
            var where = Object.entries(change.primaryKey)
                .map(function(entry) { return '`' + entry[0] + '` = ' + formatSqlVal(entry[1]); })
                .join(' AND ');
            sqls.push('DELETE FROM `' + change.table + '` WHERE ' + where);
        } else if (change.type === 'update') {
            var setClauses = Object.entries(change.changes || {})
                .map(function(entry) { return '`' + entry[0] + '` = ' + formatSqlVal(entry[1].new); })
                .join(', ');
            var where = Object.entries(change.primaryKey)
                .map(function(entry) { return '`' + entry[0] + '` = ' + formatSqlVal(entry[1]); })
                .join(' AND ');
            sqls.push('UPDATE `' + change.table + '` SET ' + setClauses + ' WHERE ' + where);
        } else if (change.type === 'insert') {
            var row = state.rows[change.rowIndex];
            var cols = state.columns.map(function(c) { return '`' + c.name + '`'; }).join(', ');
            var vals = state.columns.map(function(_, idx) { return formatSqlVal(row[idx]); }).join(', ');
            sqls.push('INSERT INTO `' + change.table + '` (' + cols + ') VALUES (' + vals + ')');
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

function beginTransaction() {
    vscode.postMessage({ command: 'beginTransaction' });
}

function createSavepoint() {
    var name = 'sp_' + Date.now();
    vscode.postMessage({ command: 'createSavepoint', name: name });
}

function rollbackToSavepoint() {
    vscode.postMessage({ command: 'rollbackToSavepoint', name: 'sp1' });
}

function updateTransactionStatus(active) {
    state.transactionActive = active;
    var statusEl = document.getElementById('transactionStatus');
    if (active) {
        state.transactionStartTime = Date.now();
        state.transactionTimer = setInterval(function() {
            var elapsed = Math.floor((Date.now() - state.transactionStartTime) / 1000);
            var mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            var secs = (elapsed % 60).toString().padStart(2, '0');
            statusEl.textContent = '🔒 ' + t('resultPanel.transactionActive') + ' (' + mins + ':' + secs + ')';

            var config = window.__CONFIG__ || {};
            var warningThreshold = config.longTransactionWarning || 300;
            if (elapsed >= warningThreshold) {
                statusEl.textContent += ' ⚠ ' + t('resultPanel.longTxWarning');
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

function updateEditStatusBar() {
    var editStatusEl = document.getElementById('editStatus');
    var updateCount = state.pendingChanges.filter(function(c) { return c.type === 'update'; }).length;
    var insertCount = state.pendingChanges.filter(function(c) { return c.type === 'insert'; }).length;
    var deleteCount = state.pendingChanges.filter(function(c) { return c.type === 'delete'; }).length;

    if (state.pendingChanges.length === 0) {
        editStatusEl.textContent = '';
    } else {
        var parts = [];
        if (updateCount > 0) parts.push(updateCount + ' ' + t('resultPanel.modify'));
        if (insertCount > 0) parts.push(insertCount + ' ' + t('resultPanel.insert'));
        if (deleteCount > 0) parts.push(deleteCount + ' ' + t('resultPanel.delete'));
        editStatusEl.textContent = t('resultPanel.pendingChanges') + ': ' + parts.join(', ');
    }

    var btnCommit = document.getElementById('btnCommit');
    var btnRollback = document.getElementById('btnRollback');
    if (btnCommit) btnCommit.disabled = !state.editMode || state.pendingChanges.length === 0;
    if (btnRollback) btnRollback.disabled = !state.editMode || state.pendingChanges.length === 0;
}

function switchView(view) {
    state.currentView = view;
    var gridContainer = document.getElementById('gridContainer');
    var formContainer = document.getElementById('formContainer');
    var btnGrid = document.getElementById('btnGridView');
    var btnForm = document.getElementById('btnFormView');

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
    var newIndex = state.formCurrentIndex + delta;
    if (newIndex < 0 || newIndex >= state.rows.length) return;
    state.formCurrentIndex = newIndex;
    renderFormView();
}

function renderFormView() {
    var container = document.getElementById('formFields');
    var infoEl = document.getElementById('formRecordInfo');
    container.innerHTML = '';

    if (state.rows.length === 0) {
        infoEl.textContent = '0/0';
        return;
    }

    infoEl.textContent = (state.formCurrentIndex + 1) + '/' + state.rows.length;
    document.getElementById('btnPrevRecord').disabled = state.formCurrentIndex <= 0;
    document.getElementById('btnNextRecord').disabled = state.formCurrentIndex >= state.rows.length - 1;

    var row = state.rows[state.formCurrentIndex];
    if (!row) return;

    state.columns.forEach(function(col, colIdx) {
        var fieldDiv = document.createElement('div');
        fieldDiv.className = 'form-field';

        var labelDiv = document.createElement('div');
        labelDiv.className = 'form-field-label';
        labelDiv.textContent = col.name;
        var typeSpan = document.createElement('span');
        typeSpan.className = 'field-type';
        typeSpan.textContent = col.type || '';
        var typeColorInfo = getTypeColorInfo(col.type);
        if (typeColorInfo) {
            typeSpan.style.color = typeColorInfo.color;
            typeSpan.style.background = typeColorInfo.bg;
            typeSpan.style.border = '1px solid ' + typeColorInfo.border;
        }
        labelDiv.appendChild(typeSpan);

        var valueDiv = document.createElement('div');
        valueDiv.className = 'form-field-value';

        var val = row[colIdx];
        var colType = (col.type || '').toUpperCase();

        if (col.isEnum && col.enumValues && col.enumValues.length > 0) {
            var select = document.createElement('select');
            if (col.nullable) {
                var opt = document.createElement('option');
                opt.value = '';
                opt.textContent = state.nullPlaceholder;
                select.appendChild(opt);
            }
            col.enumValues.forEach(function(ev) {
                var opt = document.createElement('option');
                opt.value = ev;
                opt.textContent = ev;
                if (ev === val) opt.selected = true;
                select.appendChild(opt);
            });
            if (state.editMode) {
                (function(ci) {
                    select.onchange = function() {
                        var newVal = select.value === '' ? null : select.value;
                        var oldVal = state.originalRows[state.formCurrentIndex] ? state.originalRows[state.formCurrentIndex][ci] : row[ci];
                        row[ci] = newVal;
                        if (newVal !== oldVal) trackChange(state.formCurrentIndex, ci, oldVal, newVal);
                    };
                })(colIdx);
            } else {
                select.disabled = true;
            }
            valueDiv.appendChild(select);
        } else if (col.referencedTable) {
            var select = document.createElement('select');
            if (col.nullable) {
                var opt = document.createElement('option');
                opt.value = '';
                opt.textContent = state.nullPlaceholder;
                select.appendChild(opt);
            }
            var fkKey = col.name;
            var fkOpts = state.foreignKeyOptions[fkKey] || [];
            fkOpts.forEach(function(fk) {
                var opt = document.createElement('option');
                opt.value = String(fk.value);
                opt.textContent = fk.displayText;
                if (String(fk.value) === String(val)) opt.selected = true;
                select.appendChild(opt);
            });
            if (state.editMode) {
                (function(ci, c) {
                    select.onfocus = function() {
                        vscode.postMessage({
                            command: 'requestForeignKeyOptions',
                            column: c.name,
                            referencedTable: c.referencedTable,
                            database: state.database,
                        });
                    };
                    select.onchange = function() {
                        var newVal = select.value === '' ? null : select.value;
                        var oldVal = state.originalRows[state.formCurrentIndex] ? state.originalRows[state.formCurrentIndex][ci] : row[ci];
                        row[ci] = newVal;
                        if (newVal !== oldVal) trackChange(state.formCurrentIndex, ci, oldVal, newVal);
                    };
                })(colIdx, col);
            } else {
                select.disabled = true;
            }
            valueDiv.appendChild(select);
        } else if (isBlobType(colType)) {
            var btn = document.createElement('button');
            btn.className = 'blob-preview-btn';
            btn.textContent = val === null || val === undefined ? state.nullPlaceholder : t('resultPanel.viewBlob');
            (function(ri, ci) {
                btn.onclick = function() {
                    vscode.postMessage({
                        command: 'requestBlobPreview',
                        rowIndex: ri,
                        colIndex: ci,
                    });
                };
            })(state.formCurrentIndex, colIdx);
            valueDiv.appendChild(btn);
        } else if (colType.includes('TEXT') || colType.includes('LONGTEXT') || colType.includes('MEDIUMTEXT')) {
            var textarea = document.createElement('textarea');
            textarea.value = val === null || val === undefined ? '' : String(val);
            if (val === null || val === undefined) textarea.classList.add('field-null');
            if (state.editMode) {
                (function(ci, c) {
                    textarea.onchange = function() {
                        var newVal = textarea.value === '' && c.nullable ? null : textarea.value;
                        var oldVal = state.originalRows[state.formCurrentIndex] ? state.originalRows[state.formCurrentIndex][ci] : row[ci];
                        row[ci] = newVal;
                        if (newVal !== oldVal) trackChange(state.formCurrentIndex, ci, oldVal, newVal);
                    };
                })(colIdx, col);
            } else {
                textarea.readOnly = true;
            }
            valueDiv.appendChild(textarea);
        } else {
            var input = document.createElement('input');
            input.type = 'text';
            input.value = val === null || val === undefined ? '' : String(val);
            if (val === null || val === undefined) input.classList.add('field-null');
            if (state.editMode) {
                (function(ci, c) {
                    input.onchange = function() {
                        var newVal = input.value === '' && c.nullable ? null : input.value;
                        var colType2 = (c.type || '').toUpperCase();
                        if (colType2.match(/INT|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC/i) && newVal !== null) {
                            var num = Number(newVal);
                            if (!isNaN(num)) newVal = num;
                        }
                        var oldVal = state.originalRows[state.formCurrentIndex] ? state.originalRows[state.formCurrentIndex][ci] : row[ci];
                        row[ci] = newVal;
                        if (newVal !== oldVal) trackChange(state.formCurrentIndex, ci, oldVal, newVal);
                    };
                })(colIdx, col);
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

function createBlobImage(mimeType, base64Data) {
    var allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(mimeType)) {
        mimeType = 'image/png';
    }
    var img = document.createElement('img');
    img.src = 'data:' + mimeType + ';base64,' + base64Data;
    return img;
}

function switchBlobTab(mode) {
    document.querySelectorAll('.blob-tab').forEach(function(t) { t.classList.remove('active'); });
    var tabs = document.querySelectorAll('.blob-tab');
    var modeIndex = { text: 0, hex: 1, image: 2 };
    if (tabs[modeIndex[mode]]) tabs[modeIndex[mode]].classList.add('active');

    var content = document.getElementById('blobContent');
    if (mode === 'text' && state._blobText) {
        content.textContent = state._blobText;
    } else if (mode === 'hex' && state._blobHex) {
        content.textContent = state._blobHex;
    } else if (mode === 'image' && state._blobImage) {
        content.textContent = '';
        content.appendChild(createBlobImage(state._blobMimeType, state._blobImage));
    }
}

function closeBlobDialog() {
    document.getElementById('blobDialog').style.display = 'none';
    state._blobText = null;
    state._blobHex = null;
    state._blobImage = null;
}

function validateCell(rowIdx, colIdx, value) {
    var config = window.__CONFIG__ || {};
    if (!config.enableValidation) return null;

    var col = state.columns[colIdx];
    if (!config.validateOnEdit) return null;

    if (value === null || value === undefined || value === '') {
        if (!col.nullable) {
            return t('resultPanel.notNullViolation');
        }
        return null;
    }

    var colType = (col.type || '').toUpperCase();
    if (colType.match(/INT|BIGINT|SMALLINT|TINYINT/i)) {
        if (!Number.isInteger(Number(value))) {
            return t('resultPanel.typeMismatch') + ': expected integer';
        }
    } else if (colType.match(/FLOAT|DOUBLE|DECIMAL|NUMERIC/i)) {
        if (isNaN(Number(value))) {
            return t('resultPanel.typeMismatch') + ': expected number';
        }
    }

    var lengthMatch = colType.match(/\((\d+)\)/);
    if (lengthMatch && typeof value === 'string') {
        var maxLen = parseInt(lengthMatch[1]);
        if (value.length > maxLen) {
            return t('resultPanel.lengthExceeded') + ': max ' + maxLen;
        }
    }

    if (col.isEnum && col.enumValues && !col.enumValues.includes(value)) {
        return t('resultPanel.typeMismatch') + ': invalid enum value';
    }

    return null;
}

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
        var sizeMB = (data.size / (1024 * 1024)).toFixed(2);
        document.getElementById('blobContent').textContent =
            t('resultPanel.blobTooLarge') + ' (' + sizeMB + ' MB) - ' + t('resultPanel.downloadBlob');
    } else if (data.mode === 'image') {
        state._blobImage = data.content;
        state._blobMimeType = data.mimeType;
        var blobContent = document.getElementById('blobContent');
        blobContent.textContent = '';
        blobContent.appendChild(createBlobImage(data.mimeType, data.content));
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

window.addEventListener('message', handleMessage);

function bindActions() {
    document.querySelectorAll('[data-action]').forEach(function(el) {
        var action = el.getAttribute('data-action');
        var arg = el.getAttribute('data-action-arg');
        if (action && typeof window[action] === 'function') {
            if (el.tagName === 'SELECT') {
                el.addEventListener('change', function() {
                    if (action === 'onFilterColChange' || action === 'onFilterOpChange') {
                        var numArg = Number(arg);
                        window[action](el, isNaN(numArg) ? arg : numArg);
                    } else if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action](el.value);
                    }
                });
            } else if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
                el.addEventListener('change', function() {
                    if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action](el.value);
                    }
                });
                el.addEventListener('input', function() {
                    if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action](el.value);
                    }
                });
            } else {
                el.addEventListener('click', function(e) {
                    if (action === 'jumpToPage') {
                        var pageJumpInput = document.getElementById('pageJump');
                        window[action](pageJumpInput.value);
                    } else if (arg !== null) {
                        var numArg = Number(arg);
                        window[action](isNaN(numArg) || arg.trim() === '' ? arg : numArg);
                    } else {
                        window[action]();
                    }
                });
            }
        }
        el.removeAttribute('data-action');
        el.removeAttribute('data-action-arg');
    });
}

bindActions();
init();
