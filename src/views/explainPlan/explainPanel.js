const vscode = acquireVsCodeApi();

let currentView = 'visual';
let currentSql = '';

// --- Message handling ---

window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || !message.command) return;

    switch (message.command) {
        case 'loading':
            handleLoading(message.sql);
            break;
        case 'explainResult':
            handleExplainResult(message.data);
            break;
        case 'explainError':
            handleExplainError(message.error);
            break;
    }
});

function handleLoading(sql) {
    currentSql = sql || '';
    document.getElementById('loadingArea').style.display = 'flex';
    document.getElementById('errorArea').style.display = 'none';
    document.getElementById('visualView').style.display = 'none';
    document.getElementById('tableView').style.display = 'none';
    document.getElementById('jsonView').style.display = 'none';
    document.getElementById('suggestionsArea').style.display = 'none';

    const headerSql = document.getElementById('headerSql');
    headerSql.textContent = sql || '';
    headerSql.title = sql || '';
}

function handleExplainResult(data) {
    document.getElementById('loadingArea').style.display = 'none';
    document.getElementById('errorArea').style.display = 'none';

    const headerSql = document.getElementById('headerSql');
    headerSql.textContent = data.sql || '';
    headerSql.title = data.sql || '';

    const headerLabel = document.getElementById('headerLabel');
    headerLabel.textContent = data.useAnalyze ? 'EXPLAIN ANALYZE (Actual)' : 'EXPLAIN (Estimated)';

    renderVisualView(data.nodes || []);
    renderTableView(data.nodes || []);
    renderJsonView(data.raw || '');
    renderSuggestions(data.suggestions || []);

    switchView(currentView);
}

function handleExplainError(error) {
    document.getElementById('loadingArea').style.display = 'none';
    document.getElementById('errorArea').style.display = 'flex';
    document.getElementById('errorMessage').textContent = error || 'Unknown error';
    document.getElementById('visualView').style.display = 'none';
    document.getElementById('tableView').style.display = 'none';
    document.getElementById('jsonView').style.display = 'none';
    document.getElementById('suggestionsArea').style.display = 'none';
}

// --- View switching ---

function switchView(view) {
    currentView = view;

    document.getElementById('visualView').style.display = view === 'visual' ? 'block' : 'none';
    document.getElementById('tableView').style.display = view === 'table' ? 'block' : 'none';
    document.getElementById('jsonView').style.display = view === 'json' ? 'block' : 'none';

    document.getElementById('btnVisual').classList.toggle('active', view === 'visual');
    document.getElementById('btnTable').classList.toggle('active', view === 'table');
    document.getElementById('btnJson').classList.toggle('active', view === 'json');
}

// --- Visual tree view ---

function renderVisualView(nodes) {
    const container = document.getElementById('treeContainer');
    container.innerHTML = '';

    if (!nodes || nodes.length === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary);padding:16px;">No execution plan nodes available.</div>';
        return;
    }

    for (const node of nodes) {
        const el = createNodeElement(node, 0);
        container.appendChild(el);
    }
}

function createNodeElement(node, depth) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';

    const card = document.createElement('div');
    card.className = 'node-card';

    // Badge
    const badge = document.createElement('span');
    badge.className = 'node-badge ' + getBadgeClass(node.operation);
    badge.textContent = node.operation || 'UNKNOWN';
    card.appendChild(badge);

    // Table name
    if (node.table) {
        const tableName = document.createElement('span');
        tableName.className = 'node-table-name';
        tableName.textContent = node.table;
        card.appendChild(tableName);
    }

    // Details
    const details = document.createElement('div');
    details.className = 'node-details';

    if (node.rows != null) {
        const rowsItem = document.createElement('span');
        rowsItem.className = 'node-detail-item';
        rowsItem.innerHTML = '<span class="node-detail-label">Rows:</span><span class="node-detail-value">' + escapeHtml(String(node.rows)) + '</span>';
        details.appendChild(rowsItem);
    }

    if (node.cost != null) {
        const costItem = document.createElement('span');
        costItem.className = 'node-detail-item';
        costItem.innerHTML = '<span class="node-detail-label">Cost:</span><span class="node-detail-value">' + escapeHtml(String(node.cost)) + '</span>';
        details.appendChild(costItem);
    }

    if (node.key) {
        const keyItem = document.createElement('span');
        keyItem.className = 'node-detail-item';
        keyItem.innerHTML = '<span class="node-detail-label">Key:</span><span class="node-detail-value">' + escapeHtml(String(node.key)) + '</span>';
        details.appendChild(keyItem);
    }

    card.appendChild(details);

    // Extra
    if (node.extra) {
        const extra = document.createElement('span');
        extra.className = 'node-extra';
        extra.textContent = node.extra;
        extra.title = node.extra;
        card.appendChild(extra);
    }

    wrapper.appendChild(card);

    // Children
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            const childEl = createNodeElement(child, depth + 1);
            wrapper.appendChild(childEl);
        }
    }

    return wrapper;
}

// --- Table view ---

function renderTableView(nodes) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    const flatNodes = flattenNodes(nodes || []);

    if (flatNodes.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="7" style="text-align:center;color:var(--text-secondary);">No execution plan nodes available.</td>';
        tbody.appendChild(row);
        return;
    }

    for (const node of flatNodes) {
        const row = document.createElement('tr');

        const tdId = document.createElement('td');
        tdId.textContent = node.id || '';
        row.appendChild(tdId);

        const tdOp = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'node-badge ' + getBadgeClass(node.operation);
        badge.textContent = node.operation || 'UNKNOWN';
        tdOp.appendChild(badge);
        row.appendChild(tdOp);

        const tdTable = document.createElement('td');
        tdTable.textContent = node.table || '';
        row.appendChild(tdTable);

        const tdRows = document.createElement('td');
        tdRows.textContent = node.rows != null ? String(node.rows) : '';
        row.appendChild(tdRows);

        const tdCost = document.createElement('td');
        tdCost.textContent = node.cost != null ? String(node.cost) : '';
        row.appendChild(tdCost);

        const tdKey = document.createElement('td');
        tdKey.textContent = node.key || '';
        row.appendChild(tdKey);

        const tdExtra = document.createElement('td');
        tdExtra.textContent = node.extra || '';
        tdExtra.title = node.extra || '';
        row.appendChild(tdExtra);

        tbody.appendChild(row);
    }
}

function flattenNodes(nodes) {
    const result = [];
    for (const node of nodes) {
        result.push(node);
        if (node.children && node.children.length > 0) {
            result.push(...flattenNodes(node.children));
        }
    }
    return result;
}

// --- JSON view ---

function renderJsonView(raw) {
    const pre = document.getElementById('jsonPre');
    if (!raw) {
        pre.textContent = 'No raw data available.';
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        pre.textContent = JSON.stringify(parsed, null, 2);
    } catch {
        pre.textContent = raw;
    }
}

// --- Suggestions ---

function renderSuggestions(suggestions) {
    const area = document.getElementById('suggestionsArea');
    const list = document.getElementById('suggestionsList');
    list.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
        area.style.display = 'none';
        return;
    }

    area.style.display = 'block';

    for (const suggestion of suggestions) {
        const item = document.createElement('div');
        item.className = 'suggestion-item';

        const severity = document.createElement('span');
        severity.className = 'suggestion-severity ' + (suggestion.severity || 'info');
        item.appendChild(severity);

        const message = document.createElement('span');
        message.className = 'suggestion-message';
        message.textContent = suggestion.message || '';
        item.appendChild(message);

        if (suggestion.table) {
            const table = document.createElement('span');
            table.className = 'suggestion-table';
            table.textContent = suggestion.table;
            item.appendChild(table);
        }

        list.appendChild(item);
    }
}

// --- Badge class mapping ---

function getBadgeClass(operation) {
    if (!operation) return 'unknown';
    const op = operation.toUpperCase();
    if (op === 'TABLE SCAN') return 'table-scan';
    if (op === 'INDEX SCAN') return 'index-scan';
    if (op === 'INDEX SEEK') return 'index-seek';
    if (op === 'NESTED LOOP') return 'nested-loop';
    if (op === 'SORT') return 'sort';
    if (op === 'TEMPORARY') return 'temporary';
    return 'unknown';
}

// --- Run ANALYZE ---

function runAnalyze() {
    if (currentSql) {
        vscode.postMessage({
            command: 'runAnalyze',
            sql: currentSql,
        });
    }
}

// --- Utility ---

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function bindActions() {
    document.querySelectorAll('[data-action]').forEach(function(el) {
        var action = el.getAttribute('data-action');
        var arg = el.getAttribute('data-action-arg');
        if (action && typeof window[action] === 'function') {
            if (el.tagName === 'SELECT') {
                el.addEventListener('change', function() {
                    if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action](el.value);
                    }
                });
            } else if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
                el.addEventListener('input', function() {
                    if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action](el.value);
                    }
                });
            } else {
                el.addEventListener('click', function(e) {
                    if (arg !== null) {
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
