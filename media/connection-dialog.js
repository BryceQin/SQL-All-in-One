const vscode = acquireVsCodeApi();

const DIALECT_DEFAULT_PORTS = {
    mysql: 3306,
    hive: 10000,
    spark: 10001,
    flinksql: 8083,
    postgresql: 5432,
    bigquery: 443,
    sqlite: 0
};

const DIALECT_DEFAULT_USERNAMES = {
    mysql: 'root',
    hive: 'hive',
    spark: 'spark',
    flinksql: 'flink',
    postgresql: 'postgres',
    bigquery: 'bigquery',
    sqlite: ''
};

const DIALECT_INFO = {
    mysql: { name: 'MySQL', icon: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="#4CAF50"/></svg>' },
    hive: { name: 'Hive', icon: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#FF9800" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    spark: { name: 'Spark', icon: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" fill="#F44336"/></svg>' },
    flinksql: { name: 'Flink', icon: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#E65100"/></svg>' },
    postgresql: { name: 'PostgreSQL', icon: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="#2196F3"/></svg>' },
    bigquery: { name: 'BigQuery', icon: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.34 2.73-2.27 5.46-3.87 6.47-.48.3-.91.47-1.27.47-.34 0-.61-.14-.78-.41-.18-.3-.2-.7-.06-1.16.3-1.01.87-2.72.87-2.72s-1.53.94-2.72 1.69c-.58.36-1.04.55-1.4.55-.31 0-.54-.14-.67-.4-.15-.3-.12-.71.08-1.2.57-1.38 1.83-3.73 1.83-3.73s-2.22 1.28-3.26 1.88c-.35.2-.64.3-.87.3-.24 0-.41-.12-.51-.35-.13-.3-.07-.72.17-1.25.8-1.77 2.67-3.94 2.67-3.94" stroke="#9C27B0" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' },
    sqlite: { name: 'SQLite', icon: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" fill="#00BCD4"/></svg>' }
};

const PRESET_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0', '#00BCD4', '#795548', '#607D8B'];

let state = {
    mode: 'create',
    connectionId: undefined,
    name: '',
    dialect: 'mysql',
    group: '',
    color: '',
    host: '127.0.0.1',
    port: 3306,
    username: 'root',
    password: '',
    database: '',
    ssl: { enabled: false, rejectUnauthorized: true, ca: '', cert: '', key: '' },
    ssh: { enabled: false, host: '', port: 22, username: '', authentication: 'password', password: '', privateKey: '', passphrase: '' },
    connectTimeout: 10000,
    poolConfig: { maxConnections: 5 },
    options: { charset: 'utf8mb4', timezone: 'local', initSql: '' },
    groups: [],
    existingNames: [],
    activeTab: 'general',
    passwordChanged: false,
    sshPasswordChanged: false,
    sshPassphraseChanged: false
};

function init() {
    let config = window.__CONNECTION_DIALOG_CONFIG__ || {};
    state.mode = config.mode || 'create';
    state.connectionId = config.connectionId;
    state.groups = config.groups || [];
    state.existingNames = config.existingNames || [];

    if (config.initialValues) {
        let iv = config.initialValues;
        state.name = iv.name || '';
        state.dialect = iv.dialect || 'mysql';
        state.group = iv.group || '';
        state.color = iv.color || '';
        state.host = iv.host || '127.0.0.1';
        state.port = iv.port || DIALECT_DEFAULT_PORTS[state.dialect] || 3306;
        state.username = iv.username || '';
        state.database = iv.database || '';
        state.connectTimeout = iv.connectTimeout || 10000;
        if (iv.poolConfig) {
            state.poolConfig = Object.assign({}, state.poolConfig, iv.poolConfig);
        }
        if (iv.options) {
            state.options = Object.assign({}, state.options, iv.options);
        }
        if (iv.ssl) {
            state.ssl = Object.assign({}, state.ssl, iv.ssl);
        }
        if (iv.ssh) {
            state.ssh = Object.assign({}, state.ssh, iv.ssh);
        }
        if (state.mode === 'edit') {
            state.password = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
            state.ssh.password = iv.ssh && iv.ssh.password ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '';
            state.ssh.passphrase = iv.ssh && iv.ssh.passphrase ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '';
        }
    }

    populateForm();
    renderDialectGrid();
    renderColorPicker();
    renderGroupDropdown();
    updateDialectUI();
    updateSshFieldsVisibility();
    updateSslFieldsVisibility();
    updateHeaderTitle();
}

function populateForm() {
    document.getElementById('connName').value = state.name;
    document.getElementById('connHost').value = state.host;
    document.getElementById('connPort').value = state.port;
    document.getElementById('connUsername').value = state.username;
    document.getElementById('connPassword').value = state.password;
    document.getElementById('connDatabase').value = state.database;
    document.getElementById('sshEnabled').checked = state.ssh.enabled;
    document.getElementById('sshHost').value = state.ssh.host;
    document.getElementById('sshPort').value = state.ssh.port;
    document.getElementById('sshUsername').value = state.ssh.username;
    document.getElementById('sshAuthMethod').value = state.ssh.authentication;
    document.getElementById('sshPassword').value = state.ssh.password;
    document.getElementById('sshPrivateKey').value = state.ssh.privateKey;
    document.getElementById('sshPassphrase').value = state.ssh.passphrase;
    document.getElementById('sslEnabled').checked = state.ssl.enabled;
    document.getElementById('sslCa').value = state.ssl.ca || '';
    document.getElementById('sslCert').value = state.ssl.cert || '';
    document.getElementById('sslKey').value = state.ssl.key || '';
    document.getElementById('sslRejectUnauthorized').checked = state.ssl.rejectUnauthorized;
    document.getElementById('connTimeout').value = state.connectTimeout;
    document.getElementById('poolSize').value = state.poolConfig.maxConnections;
    document.getElementById('connCharset').value = state.options.charset;
    document.getElementById('connTimezone').value = state.options.timezone;
    document.getElementById('connInitSql').value = state.options.initSql || '';
}

function updateHeaderTitle() {
    let title = document.getElementById('headerTitle');
    if (state.mode === 'edit') {
        title.textContent = (state.name || 'Edit Connection') + ' - Edit Connection';
    } else {
        title.textContent = 'New Connection';
    }
}

function renderDialectGrid() {
    let grid = document.getElementById('dialectGrid');
    grid.innerHTML = '';

    Object.keys(DIALECT_INFO).forEach(function(key) {
        let info = DIALECT_INFO[key];
        let card = document.createElement('div');
        card.className = 'dialect-card' + (state.dialect === key ? ' active' : '');
        card.setAttribute('data-dialect', key);
        card.innerHTML = '<div class="dialect-card-icon">' + info.icon + '</div><div class="dialect-card-name">' + info.name + '</div>';
        card.onclick = function() { selectDialect(key); };
        grid.appendChild(card);
    });
}

function selectDialect(dialect) {
    state.dialect = dialect;
    state.port = DIALECT_DEFAULT_PORTS[dialect] || 3306;
    state.username = DIALECT_DEFAULT_USERNAMES[dialect] || 'root';

    document.getElementById('connPort').value = state.port;
    document.getElementById('connUsername').value = state.username;

    document.querySelectorAll('.dialect-card').forEach(function(card) {
        card.classList.toggle('active', card.getAttribute('data-dialect') === dialect);
    });

    updateDialectUI();
}

function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.conn-form-page').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.conn-form-tab').forEach(function(b) { b.classList.remove('active'); });

    let pageMap = {
        general: 'pageGeneral',
        ssh: 'pageSsh',
        ssl: 'pageSsl',
        advanced: 'pageAdvanced'
    };

    let pageId = pageMap[tabName];
    if (pageId) {
        document.getElementById(pageId).classList.add('active');
    }
    let tabBtn = document.querySelector('.conn-form-tab[data-tab="' + tabName + '"]');
    if (tabBtn) {
        tabBtn.classList.add('active');
    }
}

function updateField(field, value) {
    if (field === 'name') {
        state.name = value;
        updateHeaderTitle();
    } else if (field === 'host') {
        state.host = value;
    } else if (field === 'port') {
        state.port = parseInt(value, 10) || 0;
    } else if (field === 'username') {
        state.username = value;
    } else if (field === 'password') {
        state.password = value;
        state.passwordChanged = true;
    } else if (field === 'database') {
        state.database = value;
    } else if (field === 'group') {
        state.group = value;
    } else if (field === 'connectTimeout') {
        state.connectTimeout = parseInt(value, 10) || 10000;
    } else if (field === 'ssh.enabled') {
        state.ssh.enabled = value;
        updateSshFieldsVisibility();
    } else if (field === 'ssh.host') {
        state.ssh.host = value;
    } else if (field === 'ssh.port') {
        state.ssh.port = parseInt(value, 10) || 22;
    } else if (field === 'ssh.username') {
        state.ssh.username = value;
    } else if (field === 'ssh.authentication') {
        state.ssh.authentication = value;
        updateSshAuthMethodUI();
    } else if (field === 'ssh.password') {
        state.ssh.password = value;
        state.sshPasswordChanged = true;
    } else if (field === 'ssh.privateKey') {
        state.ssh.privateKey = value;
    } else if (field === 'ssh.passphrase') {
        state.ssh.passphrase = value;
        state.sshPassphraseChanged = true;
    } else if (field === 'ssl.enabled') {
        state.ssl.enabled = value;
        updateSslFieldsVisibility();
    } else if (field === 'ssl.ca') {
        state.ssl.ca = value;
    } else if (field === 'ssl.cert') {
        state.ssl.cert = value;
    } else if (field === 'ssl.key') {
        state.ssl.key = value;
    } else if (field === 'ssl.rejectUnauthorized') {
        state.ssl.rejectUnauthorized = value;
    } else if (field === 'poolConfig.maxConnections') {
        state.poolConfig.maxConnections = parseInt(value, 10) || 5;
    } else if (field === 'options.charset') {
        state.options.charset = value;
    } else if (field === 'options.timezone') {
        state.options.timezone = value;
    } else if (field === 'options.initSql') {
        state.options.initSql = value;
    }
}

function updateDialectUI() {
    let isSqlite = state.dialect === 'sqlite';
    document.getElementById('hostSection').style.display = isSqlite ? 'none' : '';
    document.getElementById('sqliteSection').style.display = isSqlite ? '' : 'none';
}

function updateSshFieldsVisibility() {
    let fields = document.getElementById('sshFields');
    if (state.ssh.enabled) {
        fields.classList.remove('disabled');
    } else {
        fields.classList.add('disabled');
    }
}

function updateSshAuthMethodUI() {
    let method = state.ssh.authentication;
    document.getElementById('sshPasswordRow').style.display = method === 'password' ? '' : 'none';
    document.getElementById('sshKeyRow').style.display = method === 'privateKey' ? '' : 'none';
}

function updateSslFieldsVisibility() {
    let fields = document.getElementById('sslFields');
    if (state.ssl.enabled) {
        fields.classList.remove('disabled');
    } else {
        fields.classList.add('disabled');
    }
}

function renderColorPicker() {
    let container = document.getElementById('colorPicker');
    container.innerHTML = '';

    let noneSwatch = document.createElement('div');
    noneSwatch.className = 'color-swatch' + (!state.color ? ' active' : '');
    noneSwatch.style.background = 'transparent';
    noneSwatch.style.border = '2px dashed var(--text-secondary)';
    noneSwatch.title = 'None';
    noneSwatch.onclick = function() { selectColor(''); };
    container.appendChild(noneSwatch);

    PRESET_COLORS.forEach(function(color) {
        let swatch = document.createElement('div');
        swatch.className = 'color-swatch' + (state.color === color ? ' active' : '');
        swatch.style.background = color;
        swatch.title = color;
        swatch.onclick = function() { selectColor(color); };
        container.appendChild(swatch);
    });
}

function selectColor(color) {
    state.color = color;
    renderColorPicker();
}

function renderGroupDropdown() {
    let select = document.getElementById('connGroup');
    let currentValue = state.group;
    select.innerHTML = '<option value="">No Group</option>';

    state.groups.forEach(function(g) {
        let opt = document.createElement('option');
        opt.value = g.name;
        opt.textContent = g.name;
        if (g.name === currentValue) opt.selected = true;
        select.appendChild(opt);
    });

    let newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '+ New Group...';
    select.appendChild(newOpt);

    select.onchange = function() {
        if (this.value === '__new__') {
            let newName = prompt('Enter new group name:');
            if (newName && newName.trim()) {
                state.groups.push({ name: newName.trim(), color: '#4CAF50' });
                state.group = newName.trim();
                renderGroupDropdown();
            } else {
                this.value = currentValue;
            }
        } else {
            state.group = this.value;
        }
    };
}

function togglePasswordVisibility(targetId) {
    let input = document.getElementById(targetId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

function browseFile(field) {
    vscode.postMessage({ command: 'browseFile', data: { field: field } });
}

function collectFormData() {
    let data = {
        id: state.connectionId || '',
        name: state.name.trim(),
        dialect: state.dialect,
        host: state.host,
        port: state.port,
        username: state.username,
        database: state.database || undefined,
        group: state.group || undefined,
        color: state.color || undefined,
        connectTimeout: state.connectTimeout,
        poolConfig: { maxConnections: state.poolConfig.maxConnections },
        options: Object.assign({}, state.options)
    };

    if (state.mode === 'create' || state.passwordChanged) {
        data.password = state.password || undefined;
    }

    if (state.dialect === 'sqlite') {
        data.host = 'localhost';
        data.port = 0;
        data.username = '';
    }

    if (state.ssl.enabled) {
        data.ssl = {
            enabled: true,
            rejectUnauthorized: state.ssl.rejectUnauthorized,
            ca: state.ssl.ca || undefined,
            cert: state.ssl.cert || undefined,
            key: state.ssl.key || undefined
        };
    } else {
        data.ssl = { enabled: false, rejectUnauthorized: true };
    }

    if (state.ssh.enabled) {
        data.ssh = {
            enabled: true,
            host: state.ssh.host,
            port: state.ssh.port,
            username: state.ssh.username,
            authentication: state.ssh.authentication
        };
        if (state.mode === 'create' || state.sshPasswordChanged) {
            data.ssh.password = state.ssh.password || undefined;
        }
        if (state.ssh.privateKey) {
            data.ssh.privateKey = state.ssh.privateKey;
        }
        if (state.mode === 'create' || state.sshPassphraseChanged) {
            data.ssh.passphrase = state.ssh.passphrase || undefined;
        }
    } else {
        data.ssh = { enabled: false };
    }

    return data;
}

function validate() {
    let errors = [];

    if (!state.name || !state.name.trim()) {
        errors.push('Connection name is required');
    } else if (state.existingNames.indexOf(state.name.trim()) !== -1) {
        errors.push('Connection name already exists');
    }

    if (state.dialect !== 'sqlite') {
        if (!state.host || !state.host.trim()) {
            errors.push('Host is required');
        }
        if (!state.port || state.port < 1 || state.port > 65535) {
            errors.push('Port must be between 1 and 65535');
        }
        if (!state.username || !state.username.trim()) {
            errors.push('Username is required');
        }
    } else {
        if (!state.database || !state.database.trim()) {
            errors.push('Database file path is required for SQLite');
        }
    }

    if (state.ssh.enabled) {
        if (!state.ssh.host) errors.push('SSH host is required');
        if (!state.ssh.port || state.ssh.port < 1 || state.ssh.port > 65535) errors.push('SSH port must be between 1 and 65535');
        if (!state.ssh.username) errors.push('SSH username is required');
    }

    return errors;
}

function handleSave() {
    let errors = validate();
    if (errors.length > 0) {
        showTestResult('error', errors.join('; '));
        return;
    }

    let data = collectFormData();
    vscode.postMessage({ command: 'save', data: data });
}

function handleTestConnection() {
    let errors = validate();
    if (errors.length > 0) {
        showTestResult('error', errors.join('; '));
        return;
    }

    let data = collectFormData();
    vscode.postMessage({ command: 'testConnection', data: data });
}

function handleClose() {
    vscode.postMessage({ command: 'close' });
}

function showTestResult(type, message) {
    let result = document.getElementById('testResult');
    result.className = 'conn-form-result ' + type;
    if (type === 'loading') {
        result.innerHTML = '<span class="loading-spinner"></span>';
        result.appendChild(document.createTextNode(message));
    } else if (type === 'success') {
        result.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> ';
        result.appendChild(document.createTextNode(message));
    } else {
        result.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8 4v5M8 11v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> ';
        result.appendChild(document.createTextNode(message));
    }
}

function bindActions() {
    document.querySelectorAll('[data-action]').forEach(function(el) {
        var action = el.getAttribute('data-action');
        var arg = el.getAttribute('data-action-arg');
        if (action && typeof window[action] === 'function') {
            if (el.tagName === 'SELECT') {
                el.addEventListener('change', function() {
                    if (action === 'updateField') {
                        window[action](arg, el.value);
                    } else if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action](el.value);
                    }
                });
            } else if (el.tagName === 'INPUT') {
                if (el.type === 'checkbox') {
                    el.addEventListener('change', function() {
                        if (action === 'updateField') {
                            window[action](arg, el.checked);
                        }
                    });
                } else {
                    el.addEventListener('input', function() {
                        if (action === 'updateField') {
                            window[action](arg, el.value);
                        }
                    });
                }
            } else {
                el.addEventListener('click', function() {
                    if (action === 'togglePasswordVisibility') {
                        var target = el.getAttribute('data-target');
                        if (target) {
                            window[action](target);
                        }
                    } else if (arg !== null && arg !== undefined) {
                        window[action](arg);
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

window.addEventListener('message', function(event) {
    let message = event.data;
    if (!message || !message.command) return;

    switch (message.command) {
        case 'testStart':
            showTestResult('loading', 'Testing connection...');
            document.getElementById('btnTest').disabled = true;
            break;
        case 'testResult':
            document.getElementById('btnTest').disabled = false;
            if (message.success) {
                let parts = ['Connection successful'];
                if (message.serverVersion) parts.push(message.serverVersion);
                if (message.latency !== undefined) parts.push(message.latency + 'ms');
                showTestResult('success', parts.join(', '));
            } else {
                showTestResult('error', 'Connection failed: ' + (message.error || 'Unknown error'));
            }
            break;
        case 'saveResult':
            if (message.success) {
                vscode.postMessage({ command: 'close' });
            } else {
                showTestResult('error', 'Save failed: ' + (message.error || 'Unknown error'));
            }
            break;
        case 'fileSelected':
            if (message.field && message.path) {
                let input = document.getElementById(message.field);
                if (input) {
                    input.value = message.path;
                    input.dispatchEvent(new Event('input'));
                }
            }
            break;
    }
});

bindActions();
init();
