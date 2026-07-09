const vscode = window.vscode || acquireVsCodeApi();

var i18nData = {
    zh: {
        materializedViewDesigner: '物化视图设计器',
        newMaterializedView: '新建物化视图',
        editMaterializedView: '编辑物化视图',
        save: '保存',
        refresh: '刷新',
        exportSql: '导出 SQL',
        viewName: '视图名称',
        refreshType: '刷新类型',
        activeStatus: '生效状态',
        refreshSchedule: '刷新计划',
        showDiff: '查看差异',
        diffTitle: 'DDL 差异对比',
        originalDDL: '原始 DDL',
        currentDDL: '当前 DDL',
        sqlPreview: 'SQL 预览',
        messages: '消息',
        confirmSave: '确认保存',
        sqlWillBeExecuted: '将执行以下 SQL:',
        execute: '执行',
        exportSqlOnly: '仅导出 SQL',
        cancel: '取消',
        viewNameRequired: '视图名称不能为空',
        ddlRequired: 'DDL 不能为空',
        saveSuccess: '保存成功',
        saveFailed: '保存失败',
        refreshSuccess: '刷新成功',
        refreshFailed: '刷新失败',
        noChanges: '无变更',
        unknownError: '未知错误',
        queryStarted: '查询开始执行',
        queryCompleted: '查询执行成功',
        queryFailed: '查询执行失败',
        startPrefix: '开始: ',
        intervalPrefix: '间隔: '
    },
    en: {
        materializedViewDesigner: 'Materialized View Designer',
        newMaterializedView: 'New Materialized View',
        editMaterializedView: 'Edit Materialized View',
        save: 'Save',
        refresh: 'Refresh',
        exportSql: 'Export SQL',
        viewName: 'View Name',
        refreshType: 'Refresh Type',
        activeStatus: 'Active',
        refreshSchedule: 'Refresh Schedule',
        showDiff: 'Diff',
        diffTitle: 'DDL Differences',
        originalDDL: 'Original DDL',
        currentDDL: 'Current DDL',
        sqlPreview: 'SQL Preview',
        messages: 'Messages',
        confirmSave: 'Confirm Save',
        sqlWillBeExecuted: 'The following SQL will be executed:',
        execute: 'Execute',
        exportSqlOnly: 'Export SQL Only',
        cancel: 'Cancel',
        viewNameRequired: 'View name is required',
        ddlRequired: 'DDL is required',
        saveSuccess: 'Save successful',
        saveFailed: 'Save failed',
        refreshSuccess: 'Refresh successful',
        refreshFailed: 'Refresh failed',
        noChanges: 'No changes',
        unknownError: 'Unknown error',
        queryStarted: 'Query started',
        queryCompleted: 'Query completed',
        queryFailed: 'Query failed',
        startPrefix: 'Start: ',
        intervalPrefix: 'Interval: '
    }
};

function getLang() {
    try {
        var cfg = window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__ || {};
        return cfg.lang || 'en';
    } catch (e) { return 'en'; }
}

var lang = getLang();

function t(key) {
    return (i18nData[lang] && i18nData[lang][key]) || (i18nData.en[key]) || key;
}

function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        var text = t(key);
        if (el.tagName === 'INPUT' && el.type !== 'radio') {
            el.placeholder = text;
        } else if (el.tagName === 'BUTTON') {
            el.textContent = text;
        } else {
            el.textContent = text;
        }
    });
}

var state = {
    mode: 'create',
    database: '',
    viewName: '',
    ddl: '',
    originalDDL: '',
    refreshType: 'ASYNC',
    activeStatus: 'ACTIVE',
    originalActiveStatus: 'ACTIVE',
    refreshSchedule: '-',
    messages: []
};

var editor = null;
var monacoLoaded = false;

function parseDdlProperties(ddl) {
    if (!ddl || !ddl.trim()) return;

    var nameMatch = ddl.match(/CREATE\s+MATERIALIZED\s+VIEW\s+`([^`]+)`/i);
    if (nameMatch) {
        var newName = nameMatch[1];
        state.viewName = newName;
        var nameInput = document.getElementById('viewNameInput');
        if (nameInput) nameInput.value = newName;
        var headerName = document.getElementById('headerViewName');
        if (headerName) {
            if (state.mode === 'create') {
                headerName.textContent = t('newMaterializedView');
            } else {
                headerName.textContent = newName + ' - ' + t('materializedViewDesigner');
            }
        }
    }

    var refreshMatch = ddl.match(/REFRESH\s+(ASYNC|SYNC|MANUAL)/i);
    if (refreshMatch) {
        state.refreshType = refreshMatch[1].toUpperCase();
        var refreshEl = document.getElementById('refreshTypeValue');
        if (refreshEl) refreshEl.textContent = state.refreshType;
    }

    var schedule = '-';
    var startMatch = ddl.match(/START\s*\(\s*"([^"]+)"\s*\)/i);
    var everyMatch = ddl.match(/EVERY\s*\(\s*INTERVAL\s+(\d+)\s+(\w+)\s*\)/i);
    if (startMatch || everyMatch) {
        var parts = [];
        if (startMatch) {
            parts.push(t('startPrefix') + startMatch[1]);
        }
        if (everyMatch) {
            parts.push(t('intervalPrefix') + everyMatch[1] + ' ' + everyMatch[2]);
        }
        schedule = parts.join(', ');
    }
    state.refreshSchedule = schedule;
    var scheduleEl = document.getElementById('refreshScheduleValue');
    if (scheduleEl) scheduleEl.textContent = schedule;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightSql(sql) {
    var keywords = ['CREATE', 'MATERIALIZED', 'VIEW', 'ALTER', 'DROP', 'REFRESH', 'PARTITION', 'BY', 'DISTRIBUTED', 'HASH', 'ORDER', 'PROPERTIES', 'AS', 'SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'IF', 'REPLACE', 'DUPLICATE', 'KEY', 'INDEX', 'COMMENT', 'SET', 'TABLE', 'INSERT', 'UPDATE', 'DELETE', 'INTO', 'VALUES', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'LIMIT', 'OFFSET', 'ASC', 'DESC', 'SWAP', 'WITH', 'TEMPORARY'];
    var types = ['INT', 'INTEGER', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'VARCHAR', 'CHAR', 'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT', 'BLOB', 'TINYBLOB', 'MEDIUMBLOB', 'LONGBLOB', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR', 'ENUM', 'SET', 'BOOLEAN', 'BOOL', 'BINARY', 'VARBINARY', 'JSON'];

    var style = getComputedStyle(document.body);
    var isDark = document.body.classList.contains('vscode-dark') ||
                 document.querySelector('[data-vscode-theme-kind="vscode-dark"]') ||
                 (window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__ && window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__.themeKind === 2);
    var tc = (window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__ && window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__.tokenColors) || {};

    function getColor(varName, fallback) {
        var val = style.getPropertyValue(varName).trim();
        if (!val) return fallback;
        if (val.length === 9 && val.charAt(0) === '#') {
            val = val.substring(0, 7);
        }
        return val;
    }

    var keywordColor = tc.keyword || getColor('--vscode-editorKeyword-foreground', isDark ? '#569cd6' : '#0000ff');
    var stringColor = tc.string || getColor('--vscode-string-foreground', isDark ? '#ce9178' : '#a31515');
    var commentColor = tc.comment || getColor('--vscode-editorComments-foreground', isDark ? '#6a9955' : '#008000');
    var numberColor = tc.number || getColor('--vscode-editorNumbers-foreground', isDark ? '#b5cea8' : '#098658');
    var typeColor = tc.type || getColor('--vscode-editorType-foreground', isDark ? '#4ec9b0' : '#267f99');
    var identifierColor = tc.variable || getColor('--vscode-editorVariable-foreground', isDark ? '#9cdcfe' : '#001080');

    var keywordSet = {};
    for (var i = 0; i < keywords.length; i++) keywordSet[keywords[i].toUpperCase()] = true;
    var typeSet = {};
    for (var i = 0; i < types.length; i++) typeSet[types[i].toUpperCase()] = true;

    var tokens = [];
    var pos = 0;
    while (pos < sql.length) {
        if (sql[pos] === "'" || sql[pos] === '"') {
            var quote = sql[pos];
            var end = sql.indexOf(quote, pos + 1);
            if (end === -1) end = sql.length - 1;
            tokens.push({ type: 'string', value: sql.substring(pos, end + 1) });
            pos = end + 1;
        } else if (sql[pos] === '`') {
            var end = sql.indexOf('`', pos + 1);
            if (end === -1) end = sql.length - 1;
            tokens.push({ type: 'identifier', value: sql.substring(pos, end + 1) });
            pos = end + 1;
        } else if (sql[pos] === '-' && sql[pos + 1] === '-') {
            var end = sql.indexOf('\n', pos);
            if (end === -1) end = sql.length;
            tokens.push({ type: 'comment', value: sql.substring(pos, end) });
            pos = end;
        } else if (sql[pos] === '/' && sql[pos + 1] === '*') {
            var end = sql.indexOf('*/', pos + 2);
            if (end === -1) end = sql.length;
            tokens.push({ type: 'comment', value: sql.substring(pos, end + 2) });
            pos = end + 2;
        } else if (/[a-zA-Z_]/.test(sql[pos])) {
            var start = pos;
            while (pos < sql.length && /[a-zA-Z0-9_]/.test(sql[pos])) pos++;
            var word = sql.substring(start, pos);
            var upper = word.toUpperCase();
            if (keywordSet[upper]) {
                tokens.push({ type: 'keyword', value: word });
            } else if (typeSet[upper]) {
                tokens.push({ type: 'type', value: word });
            } else {
                tokens.push({ type: 'text', value: word });
            }
        } else if (/[0-9]/.test(sql[pos])) {
            var start = pos;
            while (pos < sql.length && /[0-9.]/.test(sql[pos])) pos++;
            tokens.push({ type: 'number', value: sql.substring(start, pos) });
        } else {
            tokens.push({ type: 'text', value: sql[pos] });
            pos++;
        }
    }

    var result = '';
    for (var j = 0; j < tokens.length; j++) {
        var tok = tokens[j];
        var escaped = escapeHtml(tok.value);
        if (tok.type === 'keyword') {
            result += '<span style="color:' + keywordColor + ';font-weight:600;">' + escaped + '</span>';
        } else if (tok.type === 'type') {
            result += '<span style="color:' + typeColor + ';">' + escaped + '</span>';
        } else if (tok.type === 'string') {
            result += '<span style="color:' + stringColor + ';">' + escaped + '</span>';
        } else if (tok.type === 'identifier') {
            result += '<span style="color:' + identifierColor + ';">' + escaped + '</span>';
        } else if (tok.type === 'comment') {
            result += '<span style="color:' + commentColor + ';font-style:italic;">' + escaped + '</span>';
        } else if (tok.type === 'number') {
            result += '<span style="color:' + numberColor + ';">' + escaped + '</span>';
        } else {
            result += escaped;
        }
    }

    return result;
}

function updateSqlPreview() {
    var sqlToExecute = getSqlToExecute();
    var previewContent = document.getElementById('sqlPreviewContent');
    if (previewContent) {
        previewContent.innerHTML = highlightSql(sqlToExecute);
    }
}

function getSqlToExecute() {
    if (state.mode === 'create') {
        return state.ddl;
    }

    var statements = [];

    if (state.ddl !== state.originalDDL) {
        var tempViewName = state.viewName + '_tmp_' + Date.now();
        var tempDDL = state.ddl.replace(
            new RegExp('CREATE\\s+MATERIALIZED\\s+VIEW\\s+`?' + state.viewName + '`?', 'i'),
            'CREATE MATERIALIZED VIEW `' + tempViewName + '`'
        );
        statements.push(tempDDL);
        statements.push('ALTER MATERIALIZED VIEW `' + state.viewName + '` SWAP WITH `' + tempViewName + '`');
        statements.push('DROP MATERIALIZED VIEW IF EXISTS `' + tempViewName + '`');
    }

    if (state.activeStatus !== state.originalActiveStatus) {
        var statusCmd = state.activeStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
        statements.push('ALTER MATERIALIZED VIEW `' + state.viewName + '` ' + statusCmd);
    }

    return statements.join(';\n');
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
    var cfg = window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__ || {};
    var isDark = document.body.classList.contains('vscode-dark') ||
                 document.querySelector('[data-vscode-theme-kind="vscode-dark"]') ||
                 cfg.themeKind === 2;
    var base = isDark ? 'vs-dark' : 'vs';
    var editorBg = getColor('--vscode-editor-background', isDark ? '#1e1e1e' : '#ffffff');
    var gutterBg = getColor('--vscode-editorGutter-background', editorBg);
    var overviewBg = getColor('--vscode-editorOverviewRuler-background', isDark ? '#252526' : '#ffffff');
    var tc = cfg.tokenColors || {};
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

function initMonacoEditor(sql) {
    var container = document.getElementById('monacoEditor');
    if (!container) return;

    if (typeof require === 'function' && !monacoLoaded) {
        var cfg = window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__ || {};
        var monacoBasePath = cfg.monacoBasePath || '';
        require.config({ paths: { 'vs': monacoBasePath } });
        require(['vs/editor/editor.main'], function() {
            monacoLoaded = true;
            createMonacoInstance(container, sql);
        });
    } else if (monacoLoaded && typeof monaco !== 'undefined') {
        createMonacoInstance(container, sql);
    }
}

function createMonacoInstance(container, sql) {
    if (editor) {
        editor.setValue(sql || '');
        return;
    }

    var isDark = document.body.classList.contains('vscode-dark') ||
                 document.querySelector('[data-vscode-theme-kind="vscode-dark"]') ||
                 (window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__ && window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__.themeKind === 2);
    var customThemeName = 'vscode-sync-' + (isDark ? 'dark' : 'light');
    monaco.editor.defineTheme(customThemeName, buildVscodeTheme());

    editor = monaco.editor.create(container, {
        value: sql || '',
        language: 'sql',
        theme: customThemeName,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: 'on',
        renderLineHighlight: 'gutter',
        scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8
        },
        overviewRulerLanes: 0,
        folding: true,
        contextmenu: true,
        suggestOnTriggerCharacters: true,
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 4,
        padding: { top: 4, bottom: 4 },
        domReadOnly: false,
        readOnly: false,
        wordWrap: 'on'
    });

    editor.onDidChangeModelContent(function() {
        state.ddl = editor.getValue();
        parseDdlProperties(state.ddl);
        updateSqlPreview();
    });

    editor.focus();
}

function setEditorSql(sql) {
    if (editor) {
        editor.setValue(sql || '');
    }
}

function handleThemeChange(data) {
    if (!editor || typeof monaco === 'undefined') return;
    if (data.tokenColors && window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__) {
        window.__MATERIALIZED_VIEW_DESIGNER_CONFIG__.tokenColors = data.tokenColors;
    }
    var isDark = data.kind === 2 || data.kind === 3;
    var customThemeName = 'vscode-sync-' + (isDark ? 'dark' : 'light');
    monaco.editor.defineTheme(customThemeName, buildVscodeTheme());
    monaco.editor.setTheme(customThemeName);
    updateSqlPreview();
}

function updateEditorContent() {
    if (editor) {
        editor.setValue(state.ddl || '');
    } else {
        initMonacoEditor(state.ddl);
    }
}

function showDiff() {
    if (state.mode === 'create') {
        showNotification(t('noChanges'), 'info');
        return;
    }

    if (state.ddl === state.originalDDL) {
        showNotification(t('noChanges'), 'info');
        return;
    }

    var oldLines = state.originalDDL.split('\n');
    var newLines = state.ddl.split('\n');

    var diffLeft = document.getElementById('diffLeft');
    var diffRight = document.getElementById('diffRight');

    if (!diffLeft || !diffRight) return;

    var leftHtml = '';
    var rightHtml = '';

    var maxLen = Math.max(oldLines.length, newLines.length);
    for (var i = 0; i < maxLen; i++) {
        var oldLine = i < oldLines.length ? oldLines[i] : null;
        var newLine = i < newLines.length ? newLines[i] : null;
        var lineNum = i + 1;

        if (oldLine === newLine) {
            leftHtml += '<div class="diff-line diff-line-context"><span class="diff-line-number">' + lineNum + '</span><span class="diff-line-content">' + escapeHtml(oldLine || '') + '</span></div>';
            rightHtml += '<div class="diff-line diff-line-context"><span class="diff-line-number">' + lineNum + '</span><span class="diff-line-content">' + escapeHtml(newLine || '') + '</span></div>';
        } else {
            if (oldLine !== null) {
                leftHtml += '<div class="diff-line diff-line-removed"><span class="diff-line-number">' + lineNum + '</span><span class="diff-line-content">' + escapeHtml(oldLine) + '</span></div>';
            } else {
                leftHtml += '<div class="diff-line diff-line-empty"><span class="diff-line-number"></span><span class="diff-line-content">&nbsp;</span></div>';
            }
            if (newLine !== null) {
                rightHtml += '<div class="diff-line diff-line-added"><span class="diff-line-number">' + lineNum + '</span><span class="diff-line-content">' + escapeHtml(newLine) + '</span></div>';
            } else {
                rightHtml += '<div class="diff-line diff-line-empty"><span class="diff-line-number"></span><span class="diff-line-content">&nbsp;</span></div>';
            }
        }
    }

    diffLeft.innerHTML = leftHtml;
    diffRight.innerHTML = rightHtml;
    document.getElementById('diffOverlay').style.display = 'flex';
}

function closeDiff() {
    document.getElementById('diffOverlay').style.display = 'none';
}

function handleSave() {
    var validationError = validateDesign();
    if (validationError) {
        showNotification(validationError, 'error');
        return;
    }

    var sqlToExecute = getSqlToExecute();
    var saveSqlPreview = document.getElementById('saveSqlPreview');
    if (saveSqlPreview) saveSqlPreview.textContent = sqlToExecute;

    var dialog = document.getElementById('saveDialog');
    if (dialog) dialog.style.display = 'flex';
}

function confirmSave() {
    var dialog = document.getElementById('saveDialog');
    if (dialog) dialog.style.display = 'none';

    vscode.postMessage({
        command: 'save',
        data: {
            viewName: state.viewName,
            database: state.database,
            mode: state.mode,
            ddl: state.ddl,
            originalDDL: state.originalDDL,
            refreshType: state.refreshType,
            activeStatus: state.activeStatus
        }
    });
}

function cancelSave() {
    var dialog = document.getElementById('saveDialog');
    if (dialog) dialog.style.display = 'none';
}

function exportSqlOnly() {
    cancelSave();
    handleExport();
}

function handleRefresh() {
    if (!state.viewName) {
        showNotification(t('viewNameRequired'), 'error');
        return;
    }

    vscode.postMessage({
        command: 'refresh',
        viewName: state.viewName
    });
}

function handleExport() {
    vscode.postMessage({
        command: 'exportSql',
        sql: state.ddl
    });
}

function handleClose() {
    vscode.postMessage({ command: 'close' });
}

function validateDesign() {
    if (!state.viewName || state.viewName.trim() === '') {
        return t('viewNameRequired');
    }
    if (!state.ddl || state.ddl.trim() === '') {
        return t('ddlRequired');
    }
    return null;
}

function showNotification(message, type) {
    var existing = document.querySelector('.notification');
    if (existing) existing.remove();

    var notification = document.createElement('div');
    notification.className = 'notification notification-' + (type || 'info');
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(function() {
        notification.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(function() {
            notification.remove();
        }, 300);
    }, 3000);
}

function handleMaterializedViewStructure(data) {
    state.mode = data.mode;
    state.database = data.database;
    state.viewName = data.viewName || '';
    state.ddl = data.ddl || '';
    state.originalDDL = data.originalDDL || '';
    state.refreshType = data.refreshType || 'ASYNC';
    state.activeStatus = data.activeStatus || 'ACTIVE';
    state.originalActiveStatus = data.activeStatus || 'ACTIVE';

    var viewNameInput = document.getElementById('viewNameInput');
    if (viewNameInput) viewNameInput.value = state.viewName;

    var refreshEl = document.getElementById('refreshTypeValue');
    if (refreshEl) refreshEl.textContent = state.refreshType;

    var activeSelect = document.getElementById('activeStatusValue');
    if (activeSelect) activeSelect.value = state.activeStatus;

    var btnDiff = document.getElementById('btnDiff');
    var btnRefresh = document.getElementById('btnRefresh');
    if (btnDiff) btnDiff.style.display = state.mode === 'alter' ? '' : 'none';
    if (btnRefresh) btnRefresh.style.display = state.mode === 'alter' ? '' : 'none';

    updateEditorContent();

    state.originalDDL = state.ddl;

    updateSqlPreview();

    var headerViewName = document.getElementById('headerViewName');
    if (headerViewName) {
        if (state.mode === 'create') {
            headerViewName.textContent = t('newMaterializedView');
        } else {
            headerViewName.textContent = state.viewName + ' - ' + t('materializedViewDesigner');
        }
    }
}

function addMessage(level, text) {
    var now = new Date();
    var timeStr = now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0') + ':' +
        now.getSeconds().toString().padStart(2, '0');
    state.messages.push({ level: level, text: text, time: timeStr });
    renderMessages();
    switchTab('pageMessages');
}

function renderMessages() {
    var container = document.getElementById('messagesContainer');
    if (!container) return;
    container.innerHTML = '';
    state.messages.forEach(function(msg) {
        var div = document.createElement('div');
        div.className = 'msg-item msg-' + msg.level;
        var timeSpan = document.createElement('span');
        timeSpan.className = 'msg-time';
        timeSpan.textContent = '[' + msg.time + ']';
        div.appendChild(timeSpan);
        div.appendChild(document.createTextNode(msg.text));
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function clearMessages() {
    state.messages = [];
    var container = document.getElementById('messagesContainer');
    if (container) container.innerHTML = '';
    var messagesBar = document.getElementById('messagesBar');
    if (messagesBar) messagesBar.style.display = 'none';
}

function handleQueryStart(data) {
    var sql = data.sql || '';
    var displaySql = sql.length > 200 ? sql.substring(0, 200) + '...' : sql;
    addMessage('info', t('queryStarted') + ': ' + displaySql);
}

function handleQuerySuccess(data) {
    addMessage('success', t('queryCompleted'));
    showNotification(t('saveSuccess'), 'success');
}

function handleQueryError(data) {
    var errorMsg = data.message || t('unknownError');
    addMessage('error', t('queryFailed') + ': ' + errorMsg);
    showNotification(t('saveFailed') + ': ' + errorMsg, 'error');
}

function handleUpdateOriginalDDL(data) {
    state.originalDDL = data.originalDDL || '';
    if (data.originalActiveStatus !== undefined) {
        state.originalActiveStatus = data.originalActiveStatus;
    }
    updateSqlPreview();
}

function switchTab(tabId) {
    var tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    var tabPages = document.querySelectorAll('.tab-page');
    tabPages.forEach(function(page) {
        page.classList.toggle('active', page.id === tabId);
    });
}

function initSplitter() {
    var splitter = document.getElementById('splitter');
    var editorSection = document.getElementById('editorSection');
    var bottomSection = document.getElementById('bottomSection');
    var panelSplit = document.getElementById('panelSplit');

    if (!splitter || !editorSection || !bottomSection || !panelSplit) return;

    var startY = 0;
    var startEditorHeight = 0;
    var isDragging = false;

    function onMouseDown(e) {
        e.preventDefault();
        isDragging = true;
        startY = e.clientY;
        startEditorHeight = editorSection.offsetHeight;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        var deltaY = e.clientY - startY;
        var newEditorHeight = startEditorHeight + deltaY;
        var totalHeight = panelSplit.offsetHeight;
        var minEditorHeight = 100;
        var minBottomHeight = 80;
        var maxEditorHeight = totalHeight - minBottomHeight - splitter.offsetHeight;

        newEditorHeight = Math.max(minEditorHeight, Math.min(maxEditorHeight, newEditorHeight));
        var newBottomHeight = totalHeight - newEditorHeight - splitter.offsetHeight;

        editorSection.style.flex = 'none';
        editorSection.style.height = newEditorHeight + 'px';
        bottomSection.style.flex = 'none';
        bottomSection.style.height = newBottomHeight + 'px';

        if (typeof editor !== 'undefined' && editor) {
            editor.layout();
        }
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    splitter.addEventListener('mousedown', onMouseDown);
}

function bindEvents() {
    document.addEventListener('click', function(e) {
        var target = e.target.closest('[data-action]');
        if (!target) return;

        var action = target.getAttribute('data-action');
        switch (action) {
            case 'handleSave':
                handleSave();
                break;
            case 'handleRefresh':
                handleRefresh();
                break;
            case 'handleExport':
                handleExport();
                break;
            case 'handleClose':
                handleClose();
                break;
            case 'showDiff':
                showDiff();
                break;
            case 'closeDiff':
                closeDiff();
                break;
            case 'confirmSave':
                confirmSave();
                break;
            case 'cancelSave':
                cancelSave();
                break;
            case 'exportSqlOnly':
                exportSqlOnly();
                break;
            case 'clearMessages':
                clearMessages();
                break;
            case 'switchTab':
                var tabId = target.getAttribute('data-tab');
                if (tabId) switchTab(tabId);
                break;
        }
    });

    document.addEventListener('input', function(e) {
        var target = e.target;
        var action = target.getAttribute('data-action');
        if (!action) return;

        switch (action) {
            case 'updateViewName':
                state.viewName = target.value;
                updateSqlPreview();
                break;
            case 'updateActiveStatus':
                state.activeStatus = target.value;
                updateSqlPreview();
                break;
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            cancelSave();
            closeDiff();
        }
    });

    initSplitter();
}

function init() {
    applyI18n();
    bindEvents();
    updateSqlPreview();

    window.addEventListener('message', function(event) {
        var message = event.data;
        switch (message.type) {
            case 'materializedViewStructure':
                handleMaterializedViewStructure(message.data);
                break;
            case 'updateOriginalDDL':
                handleUpdateOriginalDDL(message.data);
                break;
            case 'themeChange':
                handleThemeChange(message.data);
                break;
            case 'queryStart':
                handleQueryStart(message.data);
                break;
            case 'querySuccess':
                handleQuerySuccess(message.data);
                break;
            case 'queryError':
                handleQueryError(message.data);
                break;
            case 'error':
                showNotification(message.message, 'error');
                break;
        }
    });

    vscode.postMessage({ command: 'ready' });
}

document.addEventListener('DOMContentLoaded', init);
