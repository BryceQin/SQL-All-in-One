const vscode = acquireVsCodeApi();

let idCounter = 0;

let state = {
    mode: 'create',
    database: '',
    tableName: '',
    columns: [],
    indexes: [],
    foreignKeys: [],
    triggers: [],
    options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
    dataTypes: [],
    originalStructure: null,
    activeTab: 'fields',
    errors: {},
    availableTables: [],
    availableColumns: {}
};

let dragState = {
    dragging: false,
    dragId: null,
    overId: null,
    overPosition: null
};

let pendingReorder = null;

function debounce(fn, delay) {
    let timer = null;
    return function() {
        let args = arguments;
        let ctx = this;
        clearTimeout(timer);
        timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
    };
}

let debouncedGenerateDDL = debounce(function() {
    generateDDL();
}, 300);

function init() {
    let config = window.__TABLE_DESIGNER_CONFIG__ || {};
    state.mode = config.mode || 'create';
    state.database = config.database || '';
    state.tableName = config.tableName || '';
    state.dataTypes = config.dataTypes || [];

    document.getElementById('tableNameInput').value = state.tableName;
    updateHeaderTitle();

    if (state.mode === 'edit') {
        vscode.postMessage({ command: 'requestTableList' });
    }

    renderFields();
    generateDDL();
}

function updateHeaderTitle() {
    let title = document.getElementById('headerTableName');
    let name = state.tableName || 'New Table';
    title.textContent = name + ' - Table Designer';
}

function updateTableName(value) {
    state.tableName = value;
    updateHeaderTitle();
    debouncedGenerateDDL();
}

function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.tab-page').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });

    let pageMap = {
        fields: 'pageFields',
        indexes: 'pageIndexes',
        foreignKeys: 'pageForeignKeys',
        triggers: 'pageTriggers',
        options: 'pageOptions',
        sql: 'pageSql'
    };

    let pageId = pageMap[tabName];
    if (pageId) {
        document.getElementById(pageId).classList.add('active');
    }
    document.querySelector('.tab-btn[data-tab="' + tabName + '"]').classList.add('active');

    if (tabName === 'fields') renderFields();
    if (tabName === 'indexes') renderIndexes();
    if (tabName === 'foreignKeys') renderForeignKeys();
    if (tabName === 'triggers') renderTriggers();
}

function addColumn() {
    state.columns.push({
        id: 'col_' + ++idCounter,
        name: '',
        type: 'INT',
        length: '11',
        nullable: true,
        defaultValue: '',
        comment: '',
        isPrimaryKey: false,
        isAutoIncrement: false,
        isUnique: false,
        originalName: undefined
    });
    renderFields();
    debouncedGenerateDDL();
}

function removeColumn(id) {
    state.columns = state.columns.filter(function(c) { return c.id !== id; });
    renderFields();
    debouncedGenerateDDL();
}

function updateColumn(id, field, value) {
    let col = state.columns.find(function(c) { return c.id === id; });
    if (!col) return;
    col[field] = value;
    if (field === 'type') {
        let typeInfo = findTypeInfo(value);
        if (typeInfo) {
            if (typeInfo.needsLength) {
                col.length = typeInfo.defaultValue || '';
            } else if (typeInfo.needsPrecision) {
                col.length = typeInfo.defaultValue || '';
            } else {
                col.length = '';
            }
        }
    }
    if (field === 'name' || field === 'type') {
        renderIndexes();
        renderForeignKeys();
    }
    debouncedGenerateDDL();
}

function toggleConstraint(id, constraint) {
    let col = state.columns.find(function(c) { return c.id === id; });
    if (!col) return;
    col[constraint] = !col[constraint];
    if (constraint === 'isPrimaryKey' && col.isPrimaryKey) {
        col.nullable = false;
    }
    renderFields();
    debouncedGenerateDDL();
}

function findTypeInfo(typeName) {
    for (let i = 0; i < state.dataTypes.length; i++) {
        let cat = state.dataTypes[i];
        for (let j = 0; j < cat.types.length; j++) {
            if (cat.types[j].name === typeName) {
                return cat.types[j];
            }
        }
    }
    return null;
}

function typeNeedsLength(typeName) {
    let info = findTypeInfo(typeName);
    if (!info) return true;
    return !!(info.needsLength || info.needsPrecision || info.needsScale);
}

function renderFields() {
    let tbody = document.getElementById('fieldsBody');
    tbody.innerHTML = '';

    state.columns.forEach(function(col) {
        let tr = document.createElement('tr');
        tr.setAttribute('draggable', 'true');
        tr.setAttribute('data-id', col.id);

        tr.addEventListener('dragstart', onFieldDragStart);
        tr.addEventListener('dragover', onFieldDragOver);
        tr.addEventListener('dragleave', onFieldDragLeave);
        tr.addEventListener('drop', onFieldDrop);
        tr.addEventListener('dragend', onFieldDragEnd);

        let tdDrag = document.createElement('td');
        tdDrag.innerHTML = '<span class="drag-handle">&#9776;</span>';
        tr.appendChild(tdDrag);

        let tdName = document.createElement('td');
        let nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'cell-input' + (state.errors['col_name_' + col.id] ? ' has-error' : '');
        nameInput.value = col.name;
        nameInput.placeholder = 'field name';
        nameInput.oninput = function() { updateColumn(col.id, 'name', this.value); };
        tdName.appendChild(nameInput);
        if (state.errors['col_name_' + col.id]) {
            let errDiv = document.createElement('div');
            errDiv.className = 'error-message';
            errDiv.textContent = state.errors['col_name_' + col.id];
            tdName.appendChild(errDiv);
        }
        tr.appendChild(tdName);

        let tdType = document.createElement('td');
        let typeSelect = document.createElement('select');
        typeSelect.className = 'cell-select type-select';
        state.dataTypes.forEach(function(cat) {
            let optgroup = document.createElement('optgroup');
            optgroup.label = cat.category;
            cat.types.forEach(function(t) {
                let opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = t.name;
                if (t.name === col.type) opt.selected = true;
                optgroup.appendChild(opt);
            });
            typeSelect.appendChild(optgroup);
        });
        typeSelect.onchange = function() { updateColumn(col.id, 'type', this.value); renderFields(); };
        tdType.appendChild(typeSelect);
        tr.appendChild(tdType);

        let tdLength = document.createElement('td');
        let lengthInput = document.createElement('input');
        lengthInput.type = 'text';
        lengthInput.className = 'length-input' + (typeNeedsLength(col.type) ? '' : ' hidden');
        lengthInput.value = col.length;
        lengthInput.placeholder = 'length';
        lengthInput.oninput = function() { updateColumn(col.id, 'length', this.value); };
        tdLength.appendChild(lengthInput);
        tr.appendChild(tdLength);

        let tdNullable = document.createElement('td');
        let nullableDiv = document.createElement('div');
        nullableDiv.className = 'cell-checkbox';
        let nullableCb = document.createElement('input');
        nullableCb.type = 'checkbox';
        nullableCb.checked = col.nullable;
        nullableCb.onchange = function() { updateColumn(col.id, 'nullable', this.checked); };
        nullableDiv.appendChild(nullableCb);
        tdNullable.appendChild(nullableDiv);
        tr.appendChild(tdNullable);

        let tdDefault = document.createElement('td');
        let defaultInput = document.createElement('input');
        defaultInput.type = 'text';
        defaultInput.className = 'cell-input';
        defaultInput.value = col.defaultValue;
        defaultInput.placeholder = 'default';
        defaultInput.oninput = function() { updateColumn(col.id, 'defaultValue', this.value); };
        tdDefault.appendChild(defaultInput);
        tr.appendChild(tdDefault);

        let tdComment = document.createElement('td');
        let commentInput = document.createElement('input');
        commentInput.type = 'text';
        commentInput.className = 'cell-input';
        commentInput.value = col.comment;
        commentInput.placeholder = 'comment';
        commentInput.oninput = function() { updateColumn(col.id, 'comment', this.value); };
        tdComment.appendChild(commentInput);
        tr.appendChild(tdComment);

        let tdConstraints = document.createElement('td');
        let constraintsDiv = document.createElement('div');
        constraintsDiv.className = 'constraint-btns';

        let pkBtn = document.createElement('button');
        pkBtn.className = 'constraint-btn' + (col.isPrimaryKey ? ' active' : '');
        pkBtn.textContent = 'PK';
        pkBtn.title = 'Primary Key';
        pkBtn.onclick = function() { toggleConstraint(col.id, 'isPrimaryKey'); };
        constraintsDiv.appendChild(pkBtn);

        let uqBtn = document.createElement('button');
        uqBtn.className = 'constraint-btn' + (col.isUnique ? ' active' : '');
        uqBtn.textContent = 'UQ';
        uqBtn.title = 'Unique';
        uqBtn.onclick = function() { toggleConstraint(col.id, 'isUnique'); };
        constraintsDiv.appendChild(uqBtn);

        let aiBtn = document.createElement('button');
        aiBtn.className = 'constraint-btn' + (col.isAutoIncrement ? ' active' : '');
        aiBtn.textContent = 'AI';
        aiBtn.title = 'Auto Increment';
        aiBtn.onclick = function() { toggleConstraint(col.id, 'isAutoIncrement'); };
        constraintsDiv.appendChild(aiBtn);

        tdConstraints.appendChild(constraintsDiv);
        tr.appendChild(tdConstraints);

        let tdActions = document.createElement('td');
        let delBtn = document.createElement('button');
        delBtn.className = 'action-btn';
        delBtn.innerHTML = '&#10005;';
        delBtn.title = 'Delete Field';
        delBtn.onclick = function() { removeColumn(col.id); };
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

function onFieldDragStart(e) {
    let tr = e.target.closest('tr');
    if (!tr) return;
    dragState.dragging = true;
    dragState.dragId = tr.getAttribute('data-id');
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragState.dragId);
}

function onFieldDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    let tr = e.target.closest('tr');
    if (!tr || tr.getAttribute('data-id') === dragState.dragId) return;

    document.querySelectorAll('.design-table tr.drag-over-top, .design-table tr.drag-over-bottom').forEach(function(r) {
        r.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    let rect = tr.getBoundingClientRect();
    let midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
        tr.classList.add('drag-over-top');
        dragState.overPosition = 'top';
    } else {
        tr.classList.add('drag-over-bottom');
        dragState.overPosition = 'bottom';
    }
    dragState.overId = tr.getAttribute('data-id');
}

function onFieldDragLeave(e) {
    let tr = e.target.closest('tr');
    if (tr) {
        tr.classList.remove('drag-over-top', 'drag-over-bottom');
    }
}

function onFieldDrop(e) {
    e.preventDefault();
    document.querySelectorAll('.design-table tr.drag-over-top, .design-table tr.drag-over-bottom').forEach(function(r) {
        r.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    if (!dragState.dragId || !dragState.overId || dragState.dragId === dragState.overId) return;

    let fromIdx = state.columns.findIndex(function(c) { return c.id === dragState.dragId; });
    let toIdx = state.columns.findIndex(function(c) { return c.id === dragState.overId; });
    if (fromIdx === -1 || toIdx === -1) return;

    if (state.mode === 'edit') {
        pendingReorder = { fromIdx: fromIdx, toIdx: toIdx, position: dragState.overPosition };
        document.getElementById('reorderDialog').style.display = 'flex';
        return;
    }

    executeReorder(fromIdx, toIdx, dragState.overPosition);
}

function executeReorder(fromIdx, toIdx, position) {
    let item = state.columns.splice(fromIdx, 1)[0];
    let newToIdx = toIdx;
    if (fromIdx < toIdx) newToIdx--;
    if (position === 'bottom') newToIdx++;
    state.columns.splice(newToIdx, 0, item);
    renderFields();
    debouncedGenerateDDL();
}

function confirmReorder() {
    document.getElementById('reorderDialog').style.display = 'none';
    if (pendingReorder) {
        executeReorder(pendingReorder.fromIdx, pendingReorder.toIdx, pendingReorder.position);
        pendingReorder = null;
    }
}

function exportReorderSql() {
    document.getElementById('reorderDialog').style.display = 'none';
    if (pendingReorder) {
        executeReorder(pendingReorder.fromIdx, pendingReorder.toIdx, pendingReorder.position);
        pendingReorder = null;
    }
    let sql = generateDDL();
    vscode.postMessage({ command: 'exportSql', sql: sql });
}

function cancelReorder() {
    document.getElementById('reorderDialog').style.display = 'none';
    pendingReorder = null;
}

function onFieldDragEnd(e) {
    dragState.dragging = false;
    dragState.dragId = null;
    dragState.overId = null;
    dragState.overPosition = null;
    document.querySelectorAll('.design-table tr.dragging').forEach(function(r) {
        r.classList.remove('dragging');
    });
    document.querySelectorAll('.design-table tr.drag-over-top, .design-table tr.drag-over-bottom').forEach(function(r) {
        r.classList.remove('drag-over-top', 'drag-over-bottom');
    });
}

function addIndex() {
    state.indexes.push({
        id: 'idx_' + ++idCounter,
        name: '',
        type: 'BTREE',
        columns: [],
        isUnique: false
    });
    renderIndexes();
    debouncedGenerateDDL();
}

function removeIndex(id) {
    state.indexes = state.indexes.filter(function(i) { return i.id !== id; });
    renderIndexes();
    debouncedGenerateDDL();
}

function updateIndex(id, field, value) {
    let idx = state.indexes.find(function(i) { return i.id === id; });
    if (!idx) return;
    idx[field] = value;
    debouncedGenerateDDL();
}

function toggleIndexColumn(indexId, colName) {
    let idx = state.indexes.find(function(i) { return i.id === indexId; });
    if (!idx) return;
    let pos = idx.columns.indexOf(colName);
    if (pos === -1) {
        idx.columns.push(colName);
    } else {
        idx.columns.splice(pos, 1);
    }
    debouncedGenerateDDL();
}

function renderIndexes() {
    let tbody = document.getElementById('indexesBody');
    tbody.innerHTML = '';

    state.indexes.forEach(function(idx) {
        let tr = document.createElement('tr');

        let tdName = document.createElement('td');
        let nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'cell-input' + (state.errors['idx_name_' + idx.id] ? ' has-error' : '');
        nameInput.value = idx.name;
        nameInput.placeholder = 'index name';
        nameInput.oninput = function() { updateIndex(idx.id, 'name', this.value); };
        tdName.appendChild(nameInput);
        if (state.errors['idx_name_' + idx.id]) {
            let errDiv = document.createElement('div');
            errDiv.className = 'error-message';
            errDiv.textContent = state.errors['idx_name_' + idx.id];
            tdName.appendChild(errDiv);
        }
        tr.appendChild(tdName);

        let tdType = document.createElement('td');
        let typeSelect = document.createElement('select');
        typeSelect.className = 'cell-select';
        ['BTREE', 'HASH', 'FULLTEXT', 'SPATIAL'].forEach(function(t) {
            let opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === idx.type) opt.selected = true;
            typeSelect.appendChild(opt);
        });
        typeSelect.onchange = function() { updateIndex(idx.id, 'type', this.value); };
        tdType.appendChild(typeSelect);
        tr.appendChild(tdType);

        let tdColumns = document.createElement('td');
        let colCheckboxes = document.createElement('div');
        colCheckboxes.className = 'column-checkboxes';
        state.columns.forEach(function(col) {
            if (!col.name) return;
            let label = document.createElement('label');
            let cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = idx.columns.indexOf(col.name) !== -1;
            cb.onchange = function() { toggleIndexColumn(idx.id, col.name); };
            label.appendChild(cb);
            label.appendChild(document.createTextNode(col.name));
            colCheckboxes.appendChild(label);
        });
        tdColumns.appendChild(colCheckboxes);
        tr.appendChild(tdColumns);

        let tdUnique = document.createElement('td');
        let uniqueDiv = document.createElement('div');
        uniqueDiv.className = 'cell-checkbox';
        let uniqueCb = document.createElement('input');
        uniqueCb.type = 'checkbox';
        uniqueCb.checked = idx.isUnique;
        uniqueCb.onchange = function() { updateIndex(idx.id, 'isUnique', this.checked); };
        uniqueDiv.appendChild(uniqueCb);
        tdUnique.appendChild(uniqueDiv);
        tr.appendChild(tdUnique);

        let tdActions = document.createElement('td');
        let delBtn = document.createElement('button');
        delBtn.className = 'action-btn';
        delBtn.innerHTML = '&#10005;';
        delBtn.title = 'Delete Index';
        delBtn.onclick = function() { removeIndex(idx.id); };
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

function addForeignKey() {
    state.foreignKeys.push({
        id: 'fk_' + ++idCounter,
        name: '',
        columns: [],
        referencedTable: '',
        referencedColumns: [],
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT'
    });
    renderForeignKeys();
    debouncedGenerateDDL();
}

function removeForeignKey(id) {
    state.foreignKeys = state.foreignKeys.filter(function(fk) { return fk.id !== id; });
    renderForeignKeys();
    debouncedGenerateDDL();
}

function updateForeignKey(id, field, value) {
    let fk = state.foreignKeys.find(function(f) { return f.id === id; });
    if (!fk) return;
    fk[field] = value;
    if (field === 'referencedTable') {
        fk.referencedColumns = [];
        if (value) {
            vscode.postMessage({ command: 'requestColumnList', table: value });
        }
    }
    debouncedGenerateDDL();
}

function updateFkColumn(fkId, value) {
    let fk = state.foreignKeys.find(function(f) { return f.id === fkId; });
    if (!fk) return;
    fk.columns = [value];
    debouncedGenerateDDL();
}

function updateFkRefColumn(fkId, value) {
    let fk = state.foreignKeys.find(function(f) { return f.id === fkId; });
    if (!fk) return;
    fk.referencedColumns = [value];
    debouncedGenerateDDL();
}

function renderForeignKeys() {
    let tbody = document.getElementById('foreignKeysBody');
    tbody.innerHTML = '';

    state.foreignKeys.forEach(function(fk) {
        let tr = document.createElement('tr');

        let tdName = document.createElement('td');
        let nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'cell-input' + (state.errors['fk_name_' + fk.id] ? ' has-error' : '');
        nameInput.value = fk.name;
        nameInput.placeholder = 'fk name';
        nameInput.oninput = function() { updateForeignKey(fk.id, 'name', this.value); };
        tdName.appendChild(nameInput);
        if (state.errors['fk_name_' + fk.id]) {
            let errDiv = document.createElement('div');
            errDiv.className = 'error-message';
            errDiv.textContent = state.errors['fk_name_' + fk.id];
            tdName.appendChild(errDiv);
        }
        tr.appendChild(tdName);

        let tdColumns = document.createElement('td');
        let colSelect = document.createElement('select');
        colSelect.className = 'fk-columns-select';
        let emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- select --';
        colSelect.appendChild(emptyOpt);
        state.columns.forEach(function(col) {
            if (!col.name) return;
            let opt = document.createElement('option');
            opt.value = col.name;
            opt.textContent = col.name;
            if (fk.columns.indexOf(col.name) !== -1) opt.selected = true;
            colSelect.appendChild(opt);
        });
        colSelect.onchange = function() { updateFkColumn(fk.id, this.value); };
        tdColumns.appendChild(colSelect);
        tr.appendChild(tdColumns);

        let tdRefTable = document.createElement('td');
        let refTableSelect = document.createElement('select');
        refTableSelect.className = 'fk-columns-select';
        let refEmptyOpt = document.createElement('option');
        refEmptyOpt.value = '';
        refEmptyOpt.textContent = '-- select --';
        refTableSelect.appendChild(refEmptyOpt);
        state.availableTables.forEach(function(t) {
            let opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === fk.referencedTable) opt.selected = true;
            refTableSelect.appendChild(opt);
        });
        refTableSelect.onchange = function() { updateForeignKey(fk.id, 'referencedTable', this.value); };
        tdRefTable.appendChild(refTableSelect);
        tr.appendChild(tdRefTable);

        let tdRefColumns = document.createElement('td');
        let refColSelect = document.createElement('select');
        refColSelect.className = 'fk-columns-select';
        let refColEmptyOpt = document.createElement('option');
        refColEmptyOpt.value = '';
        refColEmptyOpt.textContent = '-- select --';
        refColSelect.appendChild(refColEmptyOpt);
        let refCols = state.availableColumns[fk.referencedTable] || [];
        refCols.forEach(function(c) {
            let opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (fk.referencedColumns.indexOf(c) !== -1) opt.selected = true;
            refColSelect.appendChild(opt);
        });
        refColSelect.onchange = function() { updateFkRefColumn(fk.id, this.value); };
        tdRefColumns.appendChild(refColSelect);
        tr.appendChild(tdRefColumns);

        let tdOnDelete = document.createElement('td');
        let onDeleteSelect = document.createElement('select');
        onDeleteSelect.className = 'cell-select';
        ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'].forEach(function(a) {
            let opt = document.createElement('option');
            opt.value = a;
            opt.textContent = a;
            if (a === fk.onDelete) opt.selected = true;
            onDeleteSelect.appendChild(opt);
        });
        onDeleteSelect.onchange = function() { updateForeignKey(fk.id, 'onDelete', this.value); };
        tdOnDelete.appendChild(onDeleteSelect);
        tr.appendChild(tdOnDelete);

        let tdOnUpdate = document.createElement('td');
        let onUpdateSelect = document.createElement('select');
        onUpdateSelect.className = 'cell-select';
        ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'].forEach(function(a) {
            let opt = document.createElement('option');
            opt.value = a;
            opt.textContent = a;
            if (a === fk.onUpdate) opt.selected = true;
            onUpdateSelect.appendChild(opt);
        });
        onUpdateSelect.onchange = function() { updateForeignKey(fk.id, 'onUpdate', this.value); };
        tdOnUpdate.appendChild(onUpdateSelect);
        tr.appendChild(tdOnUpdate);

        let tdActions = document.createElement('td');
        let delBtn = document.createElement('button');
        delBtn.className = 'action-btn';
        delBtn.innerHTML = '&#10005;';
        delBtn.title = 'Delete FK';
        delBtn.onclick = function() { removeForeignKey(fk.id); };
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

function addTrigger() {
    state.triggers.push({
        id: 'trg_' + ++idCounter,
        name: '',
        timing: 'BEFORE',
        event: 'INSERT',
        statement: ''
    });
    renderTriggers();
    debouncedGenerateDDL();
}

function removeTrigger(id) {
    state.triggers = state.triggers.filter(function(t) { return t.id !== id; });
    renderTriggers();
    debouncedGenerateDDL();
}

function updateTrigger(id, field, value) {
    let trg = state.triggers.find(function(t) { return t.id === id; });
    if (!trg) return;
    trg[field] = value;
    debouncedGenerateDDL();
}

function renderTriggers() {
    let tbody = document.getElementById('triggersBody');
    tbody.innerHTML = '';

    state.triggers.forEach(function(trg) {
        let tr = document.createElement('tr');

        let tdName = document.createElement('td');
        let nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'cell-input';
        nameInput.value = trg.name;
        nameInput.placeholder = 'trigger name';
        nameInput.oninput = function() { updateTrigger(trg.id, 'name', this.value); };
        tdName.appendChild(nameInput);
        tr.appendChild(tdName);

        let tdTiming = document.createElement('td');
        let timingSelect = document.createElement('select');
        timingSelect.className = 'cell-select';
        ['BEFORE', 'AFTER'].forEach(function(t) {
            let opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === trg.timing) opt.selected = true;
            timingSelect.appendChild(opt);
        });
        timingSelect.onchange = function() { updateTrigger(trg.id, 'timing', this.value); };
        tdTiming.appendChild(timingSelect);
        tr.appendChild(tdTiming);

        let tdEvent = document.createElement('td');
        let eventSelect = document.createElement('select');
        eventSelect.className = 'cell-select';
        ['INSERT', 'UPDATE', 'DELETE'].forEach(function(e) {
            let opt = document.createElement('option');
            opt.value = e;
            opt.textContent = e;
            if (e === trg.event) opt.selected = true;
            eventSelect.appendChild(opt);
        });
        eventSelect.onchange = function() { updateTrigger(trg.id, 'event', this.value); };
        tdEvent.appendChild(eventSelect);
        tr.appendChild(tdEvent);

        let tdStatement = document.createElement('td');
        let stmtTextarea = document.createElement('textarea');
        stmtTextarea.className = 'statement-textarea';
        stmtTextarea.value = trg.statement;
        stmtTextarea.placeholder = 'BEGIN ... END';
        stmtTextarea.oninput = function() { updateTrigger(trg.id, 'statement', this.value); };
        tdStatement.appendChild(stmtTextarea);
        tr.appendChild(tdStatement);

        let tdActions = document.createElement('td');
        let delBtn = document.createElement('button');
        delBtn.className = 'action-btn';
        delBtn.innerHTML = '&#10005;';
        delBtn.title = 'Delete Trigger';
        delBtn.onclick = function() { removeTrigger(trg.id); };
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

function updateOption(field, value) {
    state.options[field] = value;
    debouncedGenerateDDL();
}

function generateDDL() {
    let sql = '';
    if (state.mode === 'create') {
        sql = generateCreateDDL();
    } else {
        sql = generateAlterDDL();
    }

    let highlighted = highlightSql(sql);

    let bottomPreview = document.getElementById('sqlPreviewBottom');
    let fullPreview = document.getElementById('sqlPreviewFull');
    if (bottomPreview) bottomPreview.innerHTML = highlighted;
    if (fullPreview) fullPreview.innerHTML = highlighted;

    return sql;
}

function generateCreateDDL() {
    if (state.columns.length === 0) return '-- Add at least one column';

    let lines = [];
    let pkCols = [];

    state.columns.forEach(function(col) {
        if (!col.name) return;
        let line = '  `' + col.name + '` ' + col.type;
        if (col.length && typeNeedsLength(col.type)) {
            line += '(' + col.length + ')';
        }
        if (!col.nullable) {
            line += ' NOT NULL';
        } else {
            line += ' NULL';
        }
        if (col.isAutoIncrement) {
            line += ' AUTO_INCREMENT';
        }
        if (col.defaultValue) {
            line += ' DEFAULT ' + formatSqlValue(col.defaultValue);
        }
        if (col.comment) {
            line += " COMMENT '" + escapeString(col.comment) + "'";
        }
        lines.push(line);
        if (col.isPrimaryKey) pkCols.push(col.name);
    });

    if (pkCols.length > 0) {
        lines.push('  PRIMARY KEY (' + pkCols.map(function(c) { return '`' + c + '`'; }).join(', ') + ')');
    }

    state.indexes.forEach(function(idx) {
        if (!idx.name || idx.columns.length === 0) return;
        if (idx.isUnique) {
            lines.push('  UNIQUE KEY `' + idx.name + '` (' + idx.columns.map(function(c) { return '`' + c + '`'; }).join(', ') + ')');
        } else {
            lines.push('  KEY `' + idx.name + '` (' + idx.columns.map(function(c) { return '`' + c + '`'; }).join(', ') + ')');
        }
    });

    state.foreignKeys.forEach(function(fk) {
        if (!fk.name || fk.columns.length === 0 || !fk.referencedTable || fk.referencedColumns.length === 0) return;
        let line = '  CONSTRAINT `' + fk.name + '` FOREIGN KEY (' + fk.columns.map(function(c) { return '`' + c + '`'; }).join(', ') + ') REFERENCES `' + fk.referencedTable + '` (' + fk.referencedColumns.map(function(c) { return '`' + c + '`'; }).join(', ') + ')';
        if (fk.onDelete && fk.onDelete !== 'RESTRICT') line += ' ON DELETE ' + fk.onDelete;
        if (fk.onUpdate && fk.onUpdate !== 'RESTRICT') line += ' ON UPDATE ' + fk.onUpdate;
        lines.push(line);
    });

    let sql = 'CREATE TABLE `' + (state.tableName || 'new_table') + '` (\n';
    sql += lines.join(',\n');
    sql += '\n)';

    let tableOptions = [];
    if (state.options.engine) tableOptions.push('ENGINE=' + state.options.engine);
    if (state.options.charset) tableOptions.push('DEFAULT CHARSET=' + state.options.charset);
    if (state.options.collation) tableOptions.push('COLLATE=' + state.options.collation);
    if (state.options.autoIncrement) tableOptions.push('AUTO_INCREMENT=' + state.options.autoIncrement);
    if (state.options.comment) tableOptions.push("COMMENT='" + escapeString(state.options.comment) + "'");
    if (tableOptions.length > 0) sql += ' ' + tableOptions.join(' ');

    sql += ';';

    return sql;
}

function generateAlterDDL() {
    if (!state.originalStructure) return generateCreateDDL();

    let stmts = [];
    let orig = state.originalStructure;
    let origColMap = {};
    (orig.columns || []).forEach(function(c) { origColMap[c.name] = c; });

    let curColMap = {};
    state.columns.forEach(function(c) { if (c.name) curColMap[c.name] = c; });

    let origIdxMap = {};
    (orig.indexes || []).forEach(function(i) { origIdxMap[i.name] = i; });

    let curIdxMap = {};
    state.indexes.forEach(function(i) { if (i.name) curIdxMap[i.name] = i; });

    let origFkMap = {};
    (orig.foreignKeys || []).forEach(function(f) { origFkMap[f.name] = f; });

    let curFkMap = {};
    state.foreignKeys.forEach(function(f) { if (f.name) curFkMap[f.name] = f; });

    let origTrgMap = {};
    (orig.triggers || []).forEach(function(t) { origTrgMap[t.name] = t; });

    let curTrgMap = {};
    state.triggers.forEach(function(t) { if (t.name) curTrgMap[t.name] = t; });

    let tn = '`' + (state.tableName || 'table') + '`';

    state.columns.forEach(function(col) {
        if (!col.name) return;
        if (col.originalName && col.originalName !== col.name) {
            stmts.push('ALTER TABLE ' + tn + ' CHANGE COLUMN `' + col.originalName + '` `' + col.name + '` ' + buildColumnDef(col));
        } else if (!origColMap[col.name]) {
            stmts.push('ALTER TABLE ' + tn + ' ADD COLUMN `' + col.name + '` ' + buildColumnDef(col));
        } else {
            let origCol = origColMap[col.name];
            if (isColumnChanged(origCol, col)) {
                stmts.push('ALTER TABLE ' + tn + ' MODIFY COLUMN `' + col.name + '` ' + buildColumnDef(col));
            }
        }
    });

    (orig.columns || []).forEach(function(origCol) {
        if (!curColMap[origCol.name] && !(state.columns.some(function(c) { return c.originalName === origCol.name; }))) {
            stmts.push('ALTER TABLE ' + tn + ' DROP COLUMN `' + origCol.name + '`');
        }
    });

    state.indexes.forEach(function(idx) {
        if (!idx.name) return;
        if (!origIdxMap[idx.name]) {
            if (idx.isUnique) {
                stmts.push('CREATE UNIQUE INDEX `' + idx.name + '` ON ' + tn + ' (' + idx.columns.map(function(c) { return '`' + c + '`'; }).join(', ') + ')');
            } else {
                stmts.push('ALTER TABLE ' + tn + ' ADD INDEX `' + idx.name + '` (' + idx.columns.map(function(c) { return '`' + c + '`'; }).join(', ') + ')');
            }
        } else {
            let origIdx = origIdxMap[idx.name];
            if (isIndexChanged(origIdx, idx)) {
                stmts.push('DROP INDEX `' + idx.name + '` ON ' + tn);
                if (idx.isUnique) {
                    stmts.push('CREATE UNIQUE INDEX `' + idx.name + '` ON ' + tn + ' (' + idx.columns.map(function(c) { return '`' + c + '`'; }).join(', ') + ')');
                } else {
                    stmts.push('ALTER TABLE ' + tn + ' ADD INDEX `' + idx.name + '` (' + idx.columns.map(function(c) { return '`' + c + '`'; }).join(', ') + ')');
                }
            }
        }
    });

    (orig.indexes || []).forEach(function(origIdx) {
        if (!curIdxMap[origIdx.name]) {
            stmts.push('DROP INDEX `' + origIdx.name + '` ON ' + tn);
        }
    });

    state.foreignKeys.forEach(function(fk) {
        if (!fk.name) return;
        if (!origFkMap[fk.name]) {
            let line = 'ALTER TABLE ' + tn + ' ADD CONSTRAINT `' + fk.name + '` FOREIGN KEY (' + fk.columns.map(function(c) { return '`' + c + '`'; }).join(', ') + ') REFERENCES `' + fk.referencedTable + '` (' + fk.referencedColumns.map(function(c) { return '`' + c + '`'; }).join(', ') + ')';
            if (fk.onDelete && fk.onDelete !== 'RESTRICT') line += ' ON DELETE ' + fk.onDelete;
            if (fk.onUpdate && fk.onUpdate !== 'RESTRICT') line += ' ON UPDATE ' + fk.onUpdate;
            stmts.push(line);
        }
    });

    (orig.foreignKeys || []).forEach(function(origFk) {
        if (!curFkMap[origFk.name]) {
            stmts.push('ALTER TABLE ' + tn + ' DROP FOREIGN KEY `' + origFk.name + '`');
        }
    });

    state.triggers.forEach(function(trg) {
        if (!trg.name) return;
        if (!origTrgMap[trg.name]) {
            stmts.push('CREATE TRIGGER `' + trg.name + '` ' + trg.timing + ' ' + trg.event + ' ON ' + tn + ' FOR EACH ROW ' + trg.statement);
        }
    });

    (orig.triggers || []).forEach(function(origTrg) {
        if (!curTrgMap[origTrg.name]) {
            stmts.push('DROP TRIGGER `' + origTrg.name + '`');
        }
    });

    if (stmts.length === 0) return '-- No changes detected';

    return stmts.join(';\n') + ';';
}

function buildColumnDef(col) {
    let def = col.type;
    if (col.length && typeNeedsLength(col.type)) {
        def += '(' + col.length + ')';
    }
    if (!col.nullable) {
        def += ' NOT NULL';
    } else {
        def += ' NULL';
    }
    if (col.isAutoIncrement) def += ' AUTO_INCREMENT';
    if (col.defaultValue) def += ' DEFAULT ' + formatSqlValue(col.defaultValue);
    if (col.comment) def += " COMMENT '" + escapeString(col.comment) + "'";
    return def;
}

function isColumnChanged(orig, cur) {
    return orig.type !== cur.type ||
        orig.length !== cur.length ||
        orig.nullable !== cur.nullable ||
        orig.defaultValue !== cur.defaultValue ||
        orig.comment !== cur.comment ||
        orig.isAutoIncrement !== cur.isAutoIncrement ||
        orig.isPrimaryKey !== cur.isPrimaryKey ||
        orig.isUnique !== cur.isUnique;
}

function isIndexChanged(orig, cur) {
    if (orig.type !== cur.type || orig.isUnique !== cur.isUnique) return true;
    if (orig.columns.length !== cur.columns.length) return true;
    for (let i = 0; i < orig.columns.length; i++) {
        if (orig.columns[i] !== cur.columns[i]) return true;
    }
    return false;
}

function formatSqlValue(val) {
    if (val === null || val === undefined) return 'NULL';
    if (val.toUpperCase && val.toUpperCase() === 'NULL') return 'NULL';
    if (val.toUpperCase && (val.toUpperCase() === 'CURRENT_TIMESTAMP' || val.toUpperCase() === 'NOW()')) return val;
    if (/^-?\d+(\.\d+)?$/.test(val)) return val;
    return "'" + escapeString(val) + "'";
}

function escapeString(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function highlightSql(sql) {
    let keywords = ['CREATE', 'TABLE', 'ALTER', 'ADD', 'DROP', 'COLUMN', 'MODIFY', 'CHANGE', 'INDEX', 'UNIQUE', 'KEY', 'CONSTRAINT', 'FOREIGN', 'REFERENCES', 'ON', 'DELETE', 'UPDATE', 'CASCADE', 'RESTRICT', 'SET', 'NULL', 'NOT', 'NULL', 'DEFAULT', 'AUTO_INCREMENT', 'COMMENT', 'ENGINE', 'CHARSET', 'COLLATE', 'PRIMARY', 'TRIGGER', 'BEFORE', 'AFTER', 'INSERT', 'FOR', 'EACH', 'ROW', 'BEGIN', 'END', 'NO', 'ACTION', 'IF', 'EXISTS'];
    let types = ['INT', 'INTEGER', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'VARCHAR', 'CHAR', 'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT', 'BLOB', 'TINYBLOB', 'MEDIUMBLOB', 'LONGBLOB', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR', 'ENUM', 'SET', 'BOOLEAN', 'BOOL', 'BINARY', 'VARBINARY', 'JSON', 'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON'];

    let escaped = sql.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    escaped = escaped.replace(/'([^']*)'/g, '<span class="sql-string">\'$1\'</span>');

    let keywordRegex = new RegExp('\\b(' + keywords.join('|') + ')\\b', 'gi');
    escaped = escaped.replace(keywordRegex, function(match) {
        if (match.indexOf('sql-') !== -1) return match;
        return '<span class="sql-keyword">' + match + '</span>';
    });

    let typeRegex = new RegExp('\\b(' + types.join('|') + ')\\b', 'gi');
    escaped = escaped.replace(typeRegex, function(match) {
        if (match.indexOf('sql-') !== -1) return match;
        return '<span class="sql-type">' + match + '</span>';
    });

    return escaped;
}

function validate() {
    state.errors = {};
    let valid = true;

    if (!state.tableName || !state.tableName.trim()) {
        state.errors['tableName'] = 'Table name is required';
        document.getElementById('tableNameInput').classList.add('has-error');
        valid = false;
    } else {
        document.getElementById('tableNameInput').classList.remove('has-error');
    }

    if (state.columns.length === 0) {
        valid = false;
    }

    let colNames = {};
    state.columns.forEach(function(col) {
        if (!col.name || !col.name.trim()) {
            state.errors['col_name_' + col.id] = 'Field name is required';
            valid = false;
        } else if (colNames[col.name]) {
            state.errors['col_name_' + col.id] = 'Duplicate field name';
            valid = false;
        } else {
            colNames[col.name] = true;
        }
    });

    let idxNames = {};
    state.indexes.forEach(function(idx) {
        if (!idx.name || !idx.name.trim()) {
            state.errors['idx_name_' + idx.id] = 'Index name is required';
            valid = false;
        } else if (idxNames[idx.name]) {
            state.errors['idx_name_' + idx.id] = 'Duplicate index name';
            valid = false;
        } else {
            idxNames[idx.name] = true;
        }
    });

    let fkNames = {};
    state.foreignKeys.forEach(function(fk) {
        if (!fk.name || !fk.name.trim()) {
            state.errors['fk_name_' + fk.id] = 'FK name is required';
            valid = false;
        } else if (fkNames[fk.name]) {
            state.errors['fk_name_' + fk.id] = 'Duplicate FK name';
            valid = false;
        } else {
            fkNames[fk.name] = true;
        }
    });

    return valid;
}

function handleSave() {
    if (!validate()) {
        if (state.activeTab === 'fields') renderFields();
        if (state.activeTab === 'indexes') renderIndexes();
        if (state.activeTab === 'foreignKeys') renderForeignKeys();
        return;
    }

    let sql = generateDDL();
    document.getElementById('saveSqlPreview').textContent = sql;
    document.getElementById('saveDialog').style.display = 'flex';
}

function confirmSave() {
    document.getElementById('saveDialog').style.display = 'none';

    let data = {
        tableName: state.tableName,
        columns: state.columns.map(function(c) {
            let obj = {
                name: c.name,
                type: c.type,
                length: c.length,
                nullable: c.nullable,
                defaultValue: c.defaultValue,
                comment: c.comment,
                isPrimaryKey: c.isPrimaryKey,
                isAutoIncrement: c.isAutoIncrement,
                isUnique: c.isUnique
            };
            if (c.originalName) obj.originalName = c.originalName;
            return obj;
        }),
        indexes: state.indexes.map(function(i) {
            return { name: i.name, type: i.type, columns: i.columns, isUnique: i.isUnique };
        }),
        foreignKeys: state.foreignKeys.map(function(f) {
            return { name: f.name, columns: f.columns, referencedTable: f.referencedTable, referencedColumns: f.referencedColumns, onDelete: f.onDelete, onUpdate: f.onUpdate };
        }),
        triggers: state.triggers.map(function(t) {
            return { name: t.name, timing: t.timing, event: t.event, statement: t.statement };
        }),
        options: Object.assign({}, state.options)
    };

    vscode.postMessage({ command: 'save', data: data });
}

function exportSqlOnly() {
    document.getElementById('saveDialog').style.display = 'none';
    let sql = generateDDL();
    vscode.postMessage({ command: 'exportSql', sql: sql });
}

function cancelSave() {
    document.getElementById('saveDialog').style.display = 'none';
}

function handleClose() {
    vscode.postMessage({ command: 'close' });
}

window.addEventListener('message', function(event) {
    let message = event.data;
    if (!message || !message.command) return;

    switch (message.command) {
        case 'tableStructure':
            handleTableStructure(message);
            break;
        case 'saveResult':
            handleSaveResult(message);
            break;
        case 'tableList':
            handleTableList(message);
            break;
        case 'columnList':
            handleColumnList(message);
            break;
    }
});

function handleTableStructure(message) {
    let data = message.data || {};
    if (data.columns) {
        state.columns = data.columns.map(function(c) {
            return {
                id: 'col_' + ++idCounter,
                name: c.name || '',
                type: c.type || 'INT',
                length: c.length || '',
                nullable: c.nullable !== undefined ? c.nullable : true,
                defaultValue: c.defaultValue || '',
                comment: c.comment || '',
                isPrimaryKey: c.isPrimaryKey || false,
                isAutoIncrement: c.isAutoIncrement || false,
                isUnique: c.isUnique || false,
                originalName: c.originalName || c.name
            };
        });
    }

    if (data.indexes) {
        state.indexes = data.indexes.map(function(i) {
            return {
                id: 'idx_' + ++idCounter,
                name: i.name || '',
                type: i.type || 'BTREE',
                columns: i.columns || [],
                isUnique: i.isUnique || false
            };
        });
    }

    if (data.foreignKeys) {
        state.foreignKeys = data.foreignKeys.map(function(f) {
            return {
                id: 'fk_' + ++idCounter,
                name: f.name || '',
                columns: f.columns || [],
                referencedTable: f.referencedTable || '',
                referencedColumns: f.referencedColumns || [],
                onDelete: f.onDelete || 'RESTRICT',
                onUpdate: f.onUpdate || 'RESTRICT'
            };
        });
    }

    if (data.triggers) {
        state.triggers = data.triggers.map(function(t) {
            return {
                id: 'trg_' + ++idCounter,
                name: t.name || '',
                timing: t.timing || 'BEFORE',
                event: t.event || 'INSERT',
                statement: t.statement || ''
            };
        });
    }

    if (data.options) {
        state.options = Object.assign({}, state.options, data.options);
        if (document.getElementById('optEngine')) document.getElementById('optEngine').value = state.options.engine;
        if (document.getElementById('optCharset')) document.getElementById('optCharset').value = state.options.charset;
        if (document.getElementById('optCollation')) document.getElementById('optCollation').value = state.options.collation;
        if (document.getElementById('optAutoIncrement')) document.getElementById('optAutoIncrement').value = state.options.autoIncrement;
        if (document.getElementById('optComment')) document.getElementById('optComment').value = state.options.comment;
    }

    if (data.tableName) {
        state.tableName = data.tableName;
        document.getElementById('tableNameInput').value = state.tableName;
        updateHeaderTitle();
    }

    if (data.mode) {
        state.mode = data.mode;
    }

    if (message.dataTypes) {
        state.dataTypes = message.dataTypes;
    }

    state.originalStructure = {
        columns: JSON.parse(JSON.stringify(state.columns)),
        indexes: JSON.parse(JSON.stringify(state.indexes)),
        foreignKeys: JSON.parse(JSON.stringify(state.foreignKeys)),
        triggers: JSON.parse(JSON.stringify(state.triggers)),
        options: JSON.parse(JSON.stringify(state.options))
    };

    renderFields();
    renderIndexes();
    renderForeignKeys();
    renderTriggers();
    generateDDL();
}

function handleSaveResult(message) {
    if (message.success) {
        vscode.postMessage({ command: 'close' });
    } else {
        let errorMsg = message.error || 'Unknown error';
        let errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = 'Save failed: ' + errorMsg;
        errorDiv.style.position = 'fixed';
        errorDiv.style.bottom = '210px';
        errorDiv.style.left = '12px';
        errorDiv.style.right = '12px';
        errorDiv.style.padding = '8px 12px';
        errorDiv.style.background = 'rgba(244, 71, 71, 0.15)';
        errorDiv.style.borderRadius = '6px';
        errorDiv.style.zIndex = '999';
        document.body.appendChild(errorDiv);
        setTimeout(function() {
            if (errorDiv.parentNode) errorDiv.parentNode.removeChild(errorDiv);
        }, 5000);
    }
}

function handleTableList(message) {
    state.availableTables = message.tables || [];
    if (state.activeTab === 'foreignKeys') renderForeignKeys();
}

function handleColumnList(message) {
    state.availableColumns[message.table] = message.columns || [];
    if (state.activeTab === 'foreignKeys') renderForeignKeys();
}

init();
