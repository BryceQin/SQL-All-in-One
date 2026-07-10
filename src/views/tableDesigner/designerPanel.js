const vscode = acquireVsCodeApi();

var i18nData = {
    zh: {
        newTable: "新建表",
        tableDesignerSuffix: " - 表设计器",
        tableDesigner: "表设计器",
        fieldName: "字段名",
        length: "长度",
        default: "默认值",
        comment: "注释",
        primaryKey: "主键",
        unique: "唯一",
        autoIncrement: "自增",
        deleteField: "删除字段",
        indexName: "索引名",
        deleteIndex: "删除索引",
        fkName: "外键名",
        selectPlaceholder: "-- 请选择 --",
        deleteFk: "删除外键",
        triggerName: "触发器名",
        beginEnd: "BEGIN ... END",
        deleteTrigger: "删除触发器",
        addAtLeastOneColumn: "-- 请至少添加一个列",
        noChangesDetected: "-- 未检测到变更",
        tableNameRequired: "表名不能为空",
        fieldNameRequired: "字段名不能为空",
        duplicateFieldName: "字段名重复",
        indexNameRequired: "索引名不能为空",
        duplicateIndexName: "索引名重复",
        fkNameRequired: "外键名不能为空",
        duplicateFkName: "外键名重复",
        unknownError: "未知错误",
        saveFailed: "保存失败: ",
        save: "保存",
        fields: "字段",
        indexes: "索引",
        foreignKeys: "外键",
        triggers: "触发器",
        options: "选项",
        sql: "SQL",
        tableName: "表名",
        addField: "+ 添加字段",
        fieldNameHeader: "字段名",
        type: "类型",
        lengthHeader: "长度",
        nullable: "允许为空",
        defaultHeader: "默认值",
        commentHeader: "注释",
        constraints: "约束",
        actions: "操作",
        addIndex: "+ 添加索引",
        indexNameHeader: "索引名",
        columns: "列",
        uniqueHeader: "唯一",
        addForeignKey: "+ 添加外键",
        fkNameHeader: "外键名",
        referencedTable: "引用表",
        referencedColumns: "引用列",
        onDelete: "ON DELETE",
        onUpdate: "ON UPDATE",
        addTrigger: "+ 添加触发器",
        triggerNameHeader: "触发器名",
        timing: "时机",
        event: "事件",
        statement: "语句",
        engine: "引擎",
        charset: "字符集",
        collation: "排序规则",
        autoIncrementOption: "自增",
        tableComment: "表注释",
        sqlPreview: "SQL 预览",
        confirmSave: "确认保存",
        sqlWillBeExecuted: "将执行以下 SQL:",
        execute: "执行",
        exportSqlOnly: "仅导出 SQL",
        cancel: "取消",
        columnReorderWarning: "列重排序警告",
        reorderWarningText: "列顺序变更将重建表，对大表可能较慢。建议导出 SQL 后手动执行。",
        continueBtn: "继续",
    },
    en: {
        newTable: "New Table",
        tableDesignerSuffix: " - Table Designer",
        tableDesigner: "Table Designer",
        fieldName: "field name",
        length: "length",
        default: "default",
        comment: "comment",
        primaryKey: "Primary Key",
        unique: "Unique",
        autoIncrement: "Auto Increment",
        deleteField: "Delete Field",
        indexName: "index name",
        deleteIndex: "Delete Index",
        fkName: "fk name",
        selectPlaceholder: "-- select --",
        deleteFk: "Delete FK",
        triggerName: "trigger name",
        beginEnd: "BEGIN ... END",
        deleteTrigger: "Delete Trigger",
        addAtLeastOneColumn: "-- Add at least one column",
        noChangesDetected: "-- No changes detected",
        tableNameRequired: "Table name is required",
        fieldNameRequired: "Field name is required",
        duplicateFieldName: "Duplicate field name",
        indexNameRequired: "Index name is required",
        duplicateIndexName: "Duplicate index name",
        fkNameRequired: "FK name is required",
        duplicateFkName: "Duplicate FK name",
        unknownError: "Unknown error",
        saveFailed: "Save failed: ",
        save: "Save",
        fields: "Fields",
        indexes: "Indexes",
        foreignKeys: "Foreign Keys",
        triggers: "Triggers",
        options: "Options",
        sql: "SQL",
        tableName: "Table Name",
        addField: "+ Add Field",
        fieldNameHeader: "Field Name",
        type: "Type",
        lengthHeader: "Length",
        nullable: "Nullable",
        defaultHeader: "Default",
        commentHeader: "Comment",
        constraints: "Constraints",
        actions: "Actions",
        addIndex: "+ Add Index",
        indexNameHeader: "Index Name",
        columns: "Columns",
        uniqueHeader: "Unique",
        addForeignKey: "+ Add Foreign Key",
        fkNameHeader: "FK Name",
        referencedTable: "Referenced Table",
        referencedColumns: "Referenced Columns",
        onDelete: "ON DELETE",
        onUpdate: "ON UPDATE",
        addTrigger: "+ Add Trigger",
        triggerNameHeader: "Trigger Name",
        timing: "Timing",
        event: "Event",
        statement: "Statement",
        engine: "Engine",
        charset: "Charset",
        collation: "Collation",
        autoIncrementOption: "Auto Increment",
        tableComment: "Table Comment",
        sqlPreview: "SQL Preview",
        confirmSave: "Confirm Save",
        sqlWillBeExecuted: "The following SQL will be executed:",
        execute: "Execute",
        exportSqlOnly: "Export SQL Only",
        cancel: "Cancel",
        columnReorderWarning: "Column Reorder Warning",
        reorderWarningText:
            "Column order changes will rebuild the table, which may be slow for large tables. Consider exporting SQL and executing manually.",
        continueBtn: "Continue",
    },
};

let lang = "zh";
function t(key) {
    var dict = i18nData[lang] || i18nData["en"];
    return dict[key] || i18nData["en"][key] || key;
}

function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
        var key = el.getAttribute("data-i18n");
        var text = t(key);
        if (text && text !== key) {
            el.textContent = text;
        }
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
        var key = el.getAttribute("data-i18n-ph");
        var text = t(key);
        if (text && text !== key) {
            el.placeholder = text;
        }
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
        var key = el.getAttribute("data-i18n-title");
        var text = t(key);
        if (text && text !== key) {
            el.title = text;
        }
    });
}

let idCounter = 0;

const state = {
    mode: "create",
    database: "",
    tableName: "",
    columns: [],
    indexes: [],
    foreignKeys: [],
    triggers: [],
    options: { engine: "InnoDB", charset: "utf8mb4", collation: "utf8mb4_general_ci", autoIncrement: "", comment: "" },
    dataTypes: [],
    originalStructure: null,
    activeTab: "fields",
    errors: {},
    availableTables: [],
    availableColumns: {},
};

const dragState = {
    dragging: false,
    dragId: null,
    overId: null,
    overPosition: null,
};

let pendingReorder = null;

function debounce(fn, delay) {
    let timer = null;
    return function () {
        const args = arguments;
        const ctx = this;
        clearTimeout(timer);
        timer = setTimeout(function () {
            fn.apply(ctx, args);
        }, delay);
    };
}

const debouncedGenerateDDL = debounce(function () {
    generateDDL();
}, 300);

function init() {
    const config = window.__TABLE_DESIGNER_CONFIG__ || {};
    lang = config.lang && config.lang.startsWith("zh") ? "zh" : "en";
    state.mode = config.mode || "create";
    state.database = config.database || "";
    state.tableName = config.tableName || "";
    state.dataTypes = config.dataTypes || [];

    document.getElementById("tableNameInput").value = state.tableName;
    updateHeaderTitle();

    if (state.mode === "edit") {
        vscode.postMessage({ command: "requestTableList" });
    }

    renderFields();
    generateDDL();
}

function updateHeaderTitle() {
    const title = document.getElementById("headerTableName");
    const name = state.tableName || t("newTable");
    title.textContent = name + t("tableDesignerSuffix");
}

function updateTableName(value) {
    state.tableName = value;
    updateHeaderTitle();
    debouncedGenerateDDL();
}

function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll(".tab-page").forEach(function (p) {
        p.classList.remove("active");
    });
    document.querySelectorAll(".tab-btn").forEach(function (b) {
        b.classList.remove("active");
    });

    const pageMap = {
        fields: "pageFields",
        indexes: "pageIndexes",
        foreignKeys: "pageForeignKeys",
        triggers: "pageTriggers",
        options: "pageOptions",
        sql: "pageSql",
    };

    const pageId = pageMap[tabName];
    if (pageId) {
        document.getElementById(pageId).classList.add("active");
    }
    document.querySelector('.tab-btn[data-tab="' + tabName + '"]').classList.add("active");

    if (tabName === "fields") renderFields();
    if (tabName === "indexes") renderIndexes();
    if (tabName === "foreignKeys") renderForeignKeys();
    if (tabName === "triggers") renderTriggers();
}

function addColumn() {
    state.columns.push({
        id: "col_" + ++idCounter,
        name: "",
        type: "INT",
        length: "11",
        nullable: true,
        defaultValue: "",
        comment: "",
        isPrimaryKey: false,
        isAutoIncrement: false,
        isUnique: false,
        originalName: undefined,
    });
    renderFields();
    debouncedGenerateDDL();
}

function removeColumn(id) {
    state.columns = state.columns.filter(function (c) {
        return c.id !== id;
    });
    renderFields();
    debouncedGenerateDDL();
}

function updateColumn(id, field, value) {
    const col = state.columns.find(function (c) {
        return c.id === id;
    });
    if (!col) return;
    col[field] = value;
    if (field === "type") {
        const typeInfo = findTypeInfo(value);
        if (typeInfo) {
            if (typeInfo.needsLength) {
                col.length = typeInfo.defaultValue || "";
            } else if (typeInfo.needsPrecision) {
                col.length = typeInfo.defaultValue || "";
            } else {
                col.length = "";
            }
        }
    }
    if (field === "name" || field === "type") {
        renderIndexes();
        renderForeignKeys();
    }
    debouncedGenerateDDL();
}

function toggleConstraint(id, constraint) {
    const col = state.columns.find(function (c) {
        return c.id === id;
    });
    if (!col) return;
    col[constraint] = !col[constraint];
    if (constraint === "isPrimaryKey" && col.isPrimaryKey) {
        col.nullable = false;
    }
    renderFields();
    debouncedGenerateDDL();
}

function findTypeInfo(typeName) {
    for (let i = 0; i < state.dataTypes.length; i++) {
        const cat = state.dataTypes[i];
        for (let j = 0; j < cat.types.length; j++) {
            if (cat.types[j].name === typeName) {
                return cat.types[j];
            }
        }
    }
    return null;
}

function typeNeedsLength(typeName) {
    const info = findTypeInfo(typeName);
    if (!info) return true;
    return !!(info.needsLength || info.needsPrecision || info.needsScale);
}

function renderFields() {
    const tbody = document.getElementById("fieldsBody");
    tbody.innerHTML = "";

    state.columns.forEach(function (col) {
        const tr = document.createElement("tr");
        tr.setAttribute("draggable", "true");
        tr.setAttribute("data-id", col.id);

        tr.addEventListener("dragstart", onFieldDragStart);
        tr.addEventListener("dragover", onFieldDragOver);
        tr.addEventListener("dragleave", onFieldDragLeave);
        tr.addEventListener("drop", onFieldDrop);
        tr.addEventListener("dragend", onFieldDragEnd);

        const tdDrag = document.createElement("td");
        tdDrag.innerHTML = '<span class="drag-handle">&#9776;</span>';
        tr.appendChild(tdDrag);

        const tdName = document.createElement("td");
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "cell-input" + (state.errors["col_name_" + col.id] ? " has-error" : "");
        nameInput.value = col.name;
        nameInput.placeholder = t("fieldName");
        nameInput.oninput = function () {
            updateColumn(col.id, "name", this.value);
        };
        tdName.appendChild(nameInput);
        if (state.errors["col_name_" + col.id]) {
            const errDiv = document.createElement("div");
            errDiv.className = "error-message";
            errDiv.textContent = state.errors["col_name_" + col.id];
            tdName.appendChild(errDiv);
        }
        tr.appendChild(tdName);

        const tdType = document.createElement("td");
        const typeSelect = document.createElement("select");
        typeSelect.className = "cell-select type-select";
        state.dataTypes.forEach(function (cat) {
            const optgroup = document.createElement("optgroup");
            optgroup.label = cat.category;
            cat.types.forEach(function (t) {
                const opt = document.createElement("option");
                opt.value = t.name;
                opt.textContent = t.name;
                if (t.name === col.type) opt.selected = true;
                optgroup.appendChild(opt);
            });
            typeSelect.appendChild(optgroup);
        });
        typeSelect.onchange = function () {
            updateColumn(col.id, "type", this.value);
            renderFields();
        };
        tdType.appendChild(typeSelect);
        tr.appendChild(tdType);

        const tdLength = document.createElement("td");
        const lengthInput = document.createElement("input");
        lengthInput.type = "text";
        lengthInput.className = "length-input" + (typeNeedsLength(col.type) ? "" : " hidden");
        lengthInput.value = col.length;
        lengthInput.placeholder = t("length");
        lengthInput.oninput = function () {
            updateColumn(col.id, "length", this.value);
        };
        tdLength.appendChild(lengthInput);
        tr.appendChild(tdLength);

        const tdNullable = document.createElement("td");
        const nullableDiv = document.createElement("div");
        nullableDiv.className = "cell-checkbox";
        const nullableCb = document.createElement("input");
        nullableCb.type = "checkbox";
        nullableCb.checked = col.nullable;
        nullableCb.onchange = function () {
            updateColumn(col.id, "nullable", this.checked);
        };
        nullableDiv.appendChild(nullableCb);
        tdNullable.appendChild(nullableDiv);
        tr.appendChild(tdNullable);

        const tdDefault = document.createElement("td");
        const defaultInput = document.createElement("input");
        defaultInput.type = "text";
        defaultInput.className = "cell-input";
        defaultInput.value = col.defaultValue;
        defaultInput.placeholder = t("default");
        defaultInput.oninput = function () {
            updateColumn(col.id, "defaultValue", this.value);
        };
        tdDefault.appendChild(defaultInput);
        tr.appendChild(tdDefault);

        const tdComment = document.createElement("td");
        const commentInput = document.createElement("input");
        commentInput.type = "text";
        commentInput.className = "cell-input";
        commentInput.value = col.comment;
        commentInput.placeholder = t("comment");
        commentInput.oninput = function () {
            updateColumn(col.id, "comment", this.value);
        };
        tdComment.appendChild(commentInput);
        tr.appendChild(tdComment);

        const tdConstraints = document.createElement("td");
        const constraintsDiv = document.createElement("div");
        constraintsDiv.className = "constraint-btns";

        const pkBtn = document.createElement("button");
        pkBtn.className = "constraint-btn" + (col.isPrimaryKey ? " active" : "");
        pkBtn.textContent = "PK";
        pkBtn.title = t("primaryKey");
        pkBtn.onclick = function () {
            toggleConstraint(col.id, "isPrimaryKey");
        };
        constraintsDiv.appendChild(pkBtn);

        const uqBtn = document.createElement("button");
        uqBtn.className = "constraint-btn" + (col.isUnique ? " active" : "");
        uqBtn.textContent = "UQ";
        uqBtn.title = t("unique");
        uqBtn.onclick = function () {
            toggleConstraint(col.id, "isUnique");
        };
        constraintsDiv.appendChild(uqBtn);

        const aiBtn = document.createElement("button");
        aiBtn.className = "constraint-btn" + (col.isAutoIncrement ? " active" : "");
        aiBtn.textContent = "AI";
        aiBtn.title = t("autoIncrement");
        aiBtn.onclick = function () {
            toggleConstraint(col.id, "isAutoIncrement");
        };
        constraintsDiv.appendChild(aiBtn);

        tdConstraints.appendChild(constraintsDiv);
        tr.appendChild(tdConstraints);

        const tdActions = document.createElement("td");
        const delBtn = document.createElement("button");
        delBtn.className = "action-btn";
        delBtn.innerHTML = "&#10005;";
        delBtn.title = t("deleteField");
        delBtn.onclick = function () {
            removeColumn(col.id);
        };
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

function onFieldDragStart(e) {
    const tr = e.target.closest("tr");
    if (!tr) return;
    dragState.dragging = true;
    dragState.dragId = tr.getAttribute("data-id");
    tr.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragState.dragId);
}

function onFieldDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const tr = e.target.closest("tr");
    if (!tr || tr.getAttribute("data-id") === dragState.dragId) return;

    document.querySelectorAll(".design-table tr.drag-over-top, .design-table tr.drag-over-bottom").forEach(function (r) {
        r.classList.remove("drag-over-top", "drag-over-bottom");
    });

    const rect = tr.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
        tr.classList.add("drag-over-top");
        dragState.overPosition = "top";
    } else {
        tr.classList.add("drag-over-bottom");
        dragState.overPosition = "bottom";
    }
    dragState.overId = tr.getAttribute("data-id");
}

function onFieldDragLeave(e) {
    const tr = e.target.closest("tr");
    if (tr) {
        tr.classList.remove("drag-over-top", "drag-over-bottom");
    }
}

function onFieldDrop(e) {
    e.preventDefault();
    document.querySelectorAll(".design-table tr.drag-over-top, .design-table tr.drag-over-bottom").forEach(function (r) {
        r.classList.remove("drag-over-top", "drag-over-bottom");
    });

    if (!dragState.dragId || !dragState.overId || dragState.dragId === dragState.overId) return;

    const fromIdx = state.columns.findIndex(function (c) {
        return c.id === dragState.dragId;
    });
    const toIdx = state.columns.findIndex(function (c) {
        return c.id === dragState.overId;
    });
    if (fromIdx === -1 || toIdx === -1) return;

    if (state.mode === "edit") {
        pendingReorder = { fromIdx: fromIdx, toIdx: toIdx, position: dragState.overPosition };
        document.getElementById("reorderDialog").style.display = "flex";
        return;
    }

    executeReorder(fromIdx, toIdx, dragState.overPosition);
}

function executeReorder(fromIdx, toIdx, position) {
    const item = state.columns.splice(fromIdx, 1)[0];
    let newToIdx = toIdx;
    if (fromIdx < toIdx) newToIdx--;
    if (position === "bottom") newToIdx++;
    state.columns.splice(newToIdx, 0, item);
    renderFields();
    debouncedGenerateDDL();
}

function confirmReorder() {
    document.getElementById("reorderDialog").style.display = "none";
    if (pendingReorder) {
        executeReorder(pendingReorder.fromIdx, pendingReorder.toIdx, pendingReorder.position);
        pendingReorder = null;
    }
}

function exportReorderSql() {
    document.getElementById("reorderDialog").style.display = "none";
    if (pendingReorder) {
        executeReorder(pendingReorder.fromIdx, pendingReorder.toIdx, pendingReorder.position);
        pendingReorder = null;
    }
    const sql = generateDDL();
    vscode.postMessage({ command: "exportSql", sql: sql });
}

function cancelReorder() {
    document.getElementById("reorderDialog").style.display = "none";
    pendingReorder = null;
}

function onFieldDragEnd(e) {
    dragState.dragging = false;
    dragState.dragId = null;
    dragState.overId = null;
    dragState.overPosition = null;
    document.querySelectorAll(".design-table tr.dragging").forEach(function (r) {
        r.classList.remove("dragging");
    });
    document.querySelectorAll(".design-table tr.drag-over-top, .design-table tr.drag-over-bottom").forEach(function (r) {
        r.classList.remove("drag-over-top", "drag-over-bottom");
    });
}

function addIndex() {
    state.indexes.push({
        id: "idx_" + ++idCounter,
        name: "",
        type: "BTREE",
        columns: [],
        isUnique: false,
    });
    renderIndexes();
    debouncedGenerateDDL();
}

function removeIndex(id) {
    state.indexes = state.indexes.filter(function (i) {
        return i.id !== id;
    });
    renderIndexes();
    debouncedGenerateDDL();
}

function updateIndex(id, field, value) {
    const idx = state.indexes.find(function (i) {
        return i.id === id;
    });
    if (!idx) return;
    idx[field] = value;
    debouncedGenerateDDL();
}

function toggleIndexColumn(indexId, colName) {
    const idx = state.indexes.find(function (i) {
        return i.id === indexId;
    });
    if (!idx) return;
    const pos = idx.columns.indexOf(colName);
    if (pos === -1) {
        idx.columns.push(colName);
    } else {
        idx.columns.splice(pos, 1);
    }
    debouncedGenerateDDL();
}

function renderIndexes() {
    const tbody = document.getElementById("indexesBody");
    tbody.innerHTML = "";

    state.indexes.forEach(function (idx) {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "cell-input" + (state.errors["idx_name_" + idx.id] ? " has-error" : "");
        nameInput.value = idx.name;
        nameInput.placeholder = t("indexName");
        nameInput.oninput = function () {
            updateIndex(idx.id, "name", this.value);
        };
        tdName.appendChild(nameInput);
        if (state.errors["idx_name_" + idx.id]) {
            const errDiv = document.createElement("div");
            errDiv.className = "error-message";
            errDiv.textContent = state.errors["idx_name_" + idx.id];
            tdName.appendChild(errDiv);
        }
        tr.appendChild(tdName);

        const tdType = document.createElement("td");
        const typeSelect = document.createElement("select");
        typeSelect.className = "cell-select";
        ["BTREE", "HASH", "FULLTEXT", "SPATIAL"].forEach(function (t) {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            if (t === idx.type) opt.selected = true;
            typeSelect.appendChild(opt);
        });
        typeSelect.onchange = function () {
            updateIndex(idx.id, "type", this.value);
        };
        tdType.appendChild(typeSelect);
        tr.appendChild(tdType);

        const tdColumns = document.createElement("td");
        const colCheckboxes = document.createElement("div");
        colCheckboxes.className = "column-checkboxes";
        state.columns.forEach(function (col) {
            if (!col.name) return;
            const label = document.createElement("label");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = idx.columns.indexOf(col.name) !== -1;
            cb.onchange = function () {
                toggleIndexColumn(idx.id, col.name);
            };
            label.appendChild(cb);
            label.appendChild(document.createTextNode(col.name));
            colCheckboxes.appendChild(label);
        });
        tdColumns.appendChild(colCheckboxes);
        tr.appendChild(tdColumns);

        const tdUnique = document.createElement("td");
        const uniqueDiv = document.createElement("div");
        uniqueDiv.className = "cell-checkbox";
        const uniqueCb = document.createElement("input");
        uniqueCb.type = "checkbox";
        uniqueCb.checked = idx.isUnique;
        uniqueCb.onchange = function () {
            updateIndex(idx.id, "isUnique", this.checked);
        };
        uniqueDiv.appendChild(uniqueCb);
        tdUnique.appendChild(uniqueDiv);
        tr.appendChild(tdUnique);

        const tdActions = document.createElement("td");
        const delBtn = document.createElement("button");
        delBtn.className = "action-btn";
        delBtn.innerHTML = "&#10005;";
        delBtn.title = t("deleteIndex");
        delBtn.onclick = function () {
            removeIndex(idx.id);
        };
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

function addForeignKey() {
    state.foreignKeys.push({
        id: "fk_" + ++idCounter,
        name: "",
        columns: [],
        referencedTable: "",
        referencedColumns: [],
        onDelete: "RESTRICT",
        onUpdate: "RESTRICT",
    });
    renderForeignKeys();
    debouncedGenerateDDL();
}

function removeForeignKey(id) {
    state.foreignKeys = state.foreignKeys.filter(function (fk) {
        return fk.id !== id;
    });
    renderForeignKeys();
    debouncedGenerateDDL();
}

function updateForeignKey(id, field, value) {
    const fk = state.foreignKeys.find(function (f) {
        return f.id === id;
    });
    if (!fk) return;
    fk[field] = value;
    if (field === "referencedTable") {
        fk.referencedColumns = [];
        if (value) {
            vscode.postMessage({ command: "requestColumnList", table: value });
        }
    }
    debouncedGenerateDDL();
}

function updateFkColumn(fkId, value) {
    const fk = state.foreignKeys.find(function (f) {
        return f.id === fkId;
    });
    if (!fk) return;
    fk.columns = [value];
    debouncedGenerateDDL();
}

function updateFkRefColumn(fkId, value) {
    const fk = state.foreignKeys.find(function (f) {
        return f.id === fkId;
    });
    if (!fk) return;
    fk.referencedColumns = [value];
    debouncedGenerateDDL();
}

function renderForeignKeys() {
    const tbody = document.getElementById("foreignKeysBody");
    tbody.innerHTML = "";

    state.foreignKeys.forEach(function (fk) {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "cell-input" + (state.errors["fk_name_" + fk.id] ? " has-error" : "");
        nameInput.value = fk.name;
        nameInput.placeholder = t("fkName");
        nameInput.oninput = function () {
            updateForeignKey(fk.id, "name", this.value);
        };
        tdName.appendChild(nameInput);
        if (state.errors["fk_name_" + fk.id]) {
            const errDiv = document.createElement("div");
            errDiv.className = "error-message";
            errDiv.textContent = state.errors["fk_name_" + fk.id];
            tdName.appendChild(errDiv);
        }
        tr.appendChild(tdName);

        const tdColumns = document.createElement("td");
        const colSelect = document.createElement("select");
        colSelect.className = "fk-columns-select";
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = t("selectPlaceholder");
        colSelect.appendChild(emptyOpt);
        state.columns.forEach(function (col) {
            if (!col.name) return;
            const opt = document.createElement("option");
            opt.value = col.name;
            opt.textContent = col.name;
            if (fk.columns.indexOf(col.name) !== -1) opt.selected = true;
            colSelect.appendChild(opt);
        });
        colSelect.onchange = function () {
            updateFkColumn(fk.id, this.value);
        };
        tdColumns.appendChild(colSelect);
        tr.appendChild(tdColumns);

        const tdRefTable = document.createElement("td");
        const refTableSelect = document.createElement("select");
        refTableSelect.className = "fk-columns-select";
        const refEmptyOpt = document.createElement("option");
        refEmptyOpt.value = "";
        refEmptyOpt.textContent = t("selectPlaceholder");
        refTableSelect.appendChild(refEmptyOpt);
        state.availableTables.forEach(function (t) {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            if (t === fk.referencedTable) opt.selected = true;
            refTableSelect.appendChild(opt);
        });
        refTableSelect.onchange = function () {
            updateForeignKey(fk.id, "referencedTable", this.value);
        };
        tdRefTable.appendChild(refTableSelect);
        tr.appendChild(tdRefTable);

        const tdRefColumns = document.createElement("td");
        const refColSelect = document.createElement("select");
        refColSelect.className = "fk-columns-select";
        const refColEmptyOpt = document.createElement("option");
        refColEmptyOpt.value = "";
        refColEmptyOpt.textContent = t("selectPlaceholder");
        refColSelect.appendChild(refColEmptyOpt);
        const refCols = state.availableColumns[fk.referencedTable] || [];
        refCols.forEach(function (c) {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            if (fk.referencedColumns.indexOf(c) !== -1) opt.selected = true;
            refColSelect.appendChild(opt);
        });
        refColSelect.onchange = function () {
            updateFkRefColumn(fk.id, this.value);
        };
        tdRefColumns.appendChild(refColSelect);
        tr.appendChild(tdRefColumns);

        const tdOnDelete = document.createElement("td");
        const onDeleteSelect = document.createElement("select");
        onDeleteSelect.className = "cell-select";
        ["RESTRICT", "CASCADE", "SET NULL", "NO ACTION"].forEach(function (a) {
            const opt = document.createElement("option");
            opt.value = a;
            opt.textContent = a;
            if (a === fk.onDelete) opt.selected = true;
            onDeleteSelect.appendChild(opt);
        });
        onDeleteSelect.onchange = function () {
            updateForeignKey(fk.id, "onDelete", this.value);
        };
        tdOnDelete.appendChild(onDeleteSelect);
        tr.appendChild(tdOnDelete);

        const tdOnUpdate = document.createElement("td");
        const onUpdateSelect = document.createElement("select");
        onUpdateSelect.className = "cell-select";
        ["RESTRICT", "CASCADE", "SET NULL", "NO ACTION"].forEach(function (a) {
            const opt = document.createElement("option");
            opt.value = a;
            opt.textContent = a;
            if (a === fk.onUpdate) opt.selected = true;
            onUpdateSelect.appendChild(opt);
        });
        onUpdateSelect.onchange = function () {
            updateForeignKey(fk.id, "onUpdate", this.value);
        };
        tdOnUpdate.appendChild(onUpdateSelect);
        tr.appendChild(tdOnUpdate);

        const tdActions = document.createElement("td");
        const delBtn = document.createElement("button");
        delBtn.className = "action-btn";
        delBtn.innerHTML = "&#10005;";
        delBtn.title = t("deleteFk");
        delBtn.onclick = function () {
            removeForeignKey(fk.id);
        };
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

function addTrigger() {
    state.triggers.push({
        id: "trg_" + ++idCounter,
        name: "",
        timing: "BEFORE",
        event: "INSERT",
        statement: "",
    });
    renderTriggers();
    debouncedGenerateDDL();
}

function removeTrigger(id) {
    state.triggers = state.triggers.filter(function (t) {
        return t.id !== id;
    });
    renderTriggers();
    debouncedGenerateDDL();
}

function updateTrigger(id, field, value) {
    const trg = state.triggers.find(function (t) {
        return t.id === id;
    });
    if (!trg) return;
    trg[field] = value;
    debouncedGenerateDDL();
}

function renderTriggers() {
    const tbody = document.getElementById("triggersBody");
    tbody.innerHTML = "";

    state.triggers.forEach(function (trg) {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "cell-input";
        nameInput.value = trg.name;
        nameInput.placeholder = t("triggerName");
        nameInput.oninput = function () {
            updateTrigger(trg.id, "name", this.value);
        };
        tdName.appendChild(nameInput);
        tr.appendChild(tdName);

        const tdTiming = document.createElement("td");
        const timingSelect = document.createElement("select");
        timingSelect.className = "cell-select";
        ["BEFORE", "AFTER"].forEach(function (t) {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            if (t === trg.timing) opt.selected = true;
            timingSelect.appendChild(opt);
        });
        timingSelect.onchange = function () {
            updateTrigger(trg.id, "timing", this.value);
        };
        tdTiming.appendChild(timingSelect);
        tr.appendChild(tdTiming);

        const tdEvent = document.createElement("td");
        const eventSelect = document.createElement("select");
        eventSelect.className = "cell-select";
        ["INSERT", "UPDATE", "DELETE"].forEach(function (e) {
            const opt = document.createElement("option");
            opt.value = e;
            opt.textContent = e;
            if (e === trg.event) opt.selected = true;
            eventSelect.appendChild(opt);
        });
        eventSelect.onchange = function () {
            updateTrigger(trg.id, "event", this.value);
        };
        tdEvent.appendChild(eventSelect);
        tr.appendChild(tdEvent);

        const tdStatement = document.createElement("td");
        const stmtTextarea = document.createElement("textarea");
        stmtTextarea.className = "statement-textarea";
        stmtTextarea.value = trg.statement;
        stmtTextarea.placeholder = t("beginEnd");
        stmtTextarea.oninput = function () {
            updateTrigger(trg.id, "statement", this.value);
        };
        tdStatement.appendChild(stmtTextarea);
        tr.appendChild(tdStatement);

        const tdActions = document.createElement("td");
        const delBtn = document.createElement("button");
        delBtn.className = "action-btn";
        delBtn.innerHTML = "&#10005;";
        delBtn.title = t("deleteTrigger");
        delBtn.onclick = function () {
            removeTrigger(trg.id);
        };
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
    let sql = "";
    if (state.mode === "create") {
        sql = generateCreateDDL();
    } else {
        sql = generateAlterDDL();
    }

    const highlighted = highlightSql(sql);

    const bottomPreview = document.getElementById("sqlPreviewBottom");
    const fullPreview = document.getElementById("sqlPreviewFull");
    if (bottomPreview) bottomPreview.innerHTML = highlighted;
    if (fullPreview) fullPreview.innerHTML = highlighted;

    return sql;
}

function generateCreateDDL() {
    if (state.columns.length === 0) return t("addAtLeastOneColumn");

    const lines = [];
    const pkCols = [];

    state.columns.forEach(function (col) {
        if (!col.name) return;
        let line = "  `" + col.name + "` " + col.type;
        if (col.length && typeNeedsLength(col.type)) {
            line += "(" + col.length + ")";
        }
        if (!col.nullable) {
            line += " NOT NULL";
        } else {
            line += " NULL";
        }
        if (col.isAutoIncrement) {
            line += " AUTO_INCREMENT";
        }
        if (col.defaultValue) {
            line += " DEFAULT " + formatSqlValue(col.defaultValue);
        }
        if (col.comment) {
            line += " COMMENT '" + escapeString(col.comment) + "'";
        }
        lines.push(line);
        if (col.isPrimaryKey) pkCols.push(col.name);
    });

    if (pkCols.length > 0) {
        lines.push(
            "  PRIMARY KEY (" +
                pkCols
                    .map(function (c) {
                        return "`" + c + "`";
                    })
                    .join(", ") +
                ")",
        );
    }

    state.indexes.forEach(function (idx) {
        if (!idx.name || idx.columns.length === 0) return;
        if (idx.isUnique) {
            lines.push(
                "  UNIQUE KEY `" +
                    idx.name +
                    "` (" +
                    idx.columns
                        .map(function (c) {
                            return "`" + c + "`";
                        })
                        .join(", ") +
                    ")",
            );
        } else {
            lines.push(
                "  KEY `" +
                    idx.name +
                    "` (" +
                    idx.columns
                        .map(function (c) {
                            return "`" + c + "`";
                        })
                        .join(", ") +
                    ")",
            );
        }
    });

    state.foreignKeys.forEach(function (fk) {
        if (!fk.name || fk.columns.length === 0 || !fk.referencedTable || fk.referencedColumns.length === 0) return;
        let line =
            "  CONSTRAINT `" +
            fk.name +
            "` FOREIGN KEY (" +
            fk.columns
                .map(function (c) {
                    return "`" + c + "`";
                })
                .join(", ") +
            ") REFERENCES `" +
            fk.referencedTable +
            "` (" +
            fk.referencedColumns
                .map(function (c) {
                    return "`" + c + "`";
                })
                .join(", ") +
            ")";
        if (fk.onDelete && fk.onDelete !== "RESTRICT") line += " ON DELETE " + fk.onDelete;
        if (fk.onUpdate && fk.onUpdate !== "RESTRICT") line += " ON UPDATE " + fk.onUpdate;
        lines.push(line);
    });

    let sql = "CREATE TABLE `" + (state.tableName || "new_table") + "` (\n";
    sql += lines.join(",\n");
    sql += "\n)";

    const tableOptions = [];
    if (state.options.engine) tableOptions.push("ENGINE=" + state.options.engine);
    if (state.options.charset) tableOptions.push("DEFAULT CHARSET=" + state.options.charset);
    if (state.options.collation) tableOptions.push("COLLATE=" + state.options.collation);
    if (state.options.autoIncrement) tableOptions.push("AUTO_INCREMENT=" + state.options.autoIncrement);
    if (state.options.comment) tableOptions.push("COMMENT='" + escapeString(state.options.comment) + "'");
    if (tableOptions.length > 0) sql += " " + tableOptions.join(" ");

    sql += ";";

    return sql;
}

function generateAlterDDL() {
    if (!state.originalStructure) return generateCreateDDL();

    const stmts = [];
    const orig = state.originalStructure;
    const origColMap = {};
    (orig.columns || []).forEach(function (c) {
        origColMap[c.name] = c;
    });

    const curColMap = {};
    state.columns.forEach(function (c) {
        if (c.name) curColMap[c.name] = c;
    });

    const origIdxMap = {};
    (orig.indexes || []).forEach(function (i) {
        origIdxMap[i.name] = i;
    });

    const curIdxMap = {};
    state.indexes.forEach(function (i) {
        if (i.name) curIdxMap[i.name] = i;
    });

    const origFkMap = {};
    (orig.foreignKeys || []).forEach(function (f) {
        origFkMap[f.name] = f;
    });

    const curFkMap = {};
    state.foreignKeys.forEach(function (f) {
        if (f.name) curFkMap[f.name] = f;
    });

    const origTrgMap = {};
    (orig.triggers || []).forEach(function (t) {
        origTrgMap[t.name] = t;
    });

    const curTrgMap = {};
    state.triggers.forEach(function (t) {
        if (t.name) curTrgMap[t.name] = t;
    });

    const tn = "`" + (state.tableName || "table") + "`";

    state.columns.forEach(function (col) {
        if (!col.name) return;
        if (col.originalName && col.originalName !== col.name) {
            stmts.push("ALTER TABLE " + tn + " CHANGE COLUMN `" + col.originalName + "` `" + col.name + "` " + buildColumnDef(col));
        } else if (!origColMap[col.name]) {
            stmts.push("ALTER TABLE " + tn + " ADD COLUMN `" + col.name + "` " + buildColumnDef(col));
        } else {
            const origCol = origColMap[col.name];
            if (isColumnChanged(origCol, col)) {
                stmts.push("ALTER TABLE " + tn + " MODIFY COLUMN `" + col.name + "` " + buildColumnDef(col));
            }
        }
    });

    (orig.columns || []).forEach(function (origCol) {
        if (
            !curColMap[origCol.name] &&
            !state.columns.some(function (c) {
                return c.originalName === origCol.name;
            })
        ) {
            stmts.push("ALTER TABLE " + tn + " DROP COLUMN `" + origCol.name + "`");
        }
    });

    state.indexes.forEach(function (idx) {
        if (!idx.name) return;
        if (!origIdxMap[idx.name]) {
            if (idx.isUnique) {
                stmts.push(
                    "CREATE UNIQUE INDEX `" +
                        idx.name +
                        "` ON " +
                        tn +
                        " (" +
                        idx.columns
                            .map(function (c) {
                                return "`" + c + "`";
                            })
                            .join(", ") +
                        ")",
                );
            } else {
                stmts.push(
                    "ALTER TABLE " +
                        tn +
                        " ADD INDEX `" +
                        idx.name +
                        "` (" +
                        idx.columns
                            .map(function (c) {
                                return "`" + c + "`";
                            })
                            .join(", ") +
                        ")",
                );
            }
        } else {
            const origIdx = origIdxMap[idx.name];
            if (isIndexChanged(origIdx, idx)) {
                stmts.push("DROP INDEX `" + idx.name + "` ON " + tn);
                if (idx.isUnique) {
                    stmts.push(
                        "CREATE UNIQUE INDEX `" +
                            idx.name +
                            "` ON " +
                            tn +
                            " (" +
                            idx.columns
                                .map(function (c) {
                                    return "`" + c + "`";
                                })
                                .join(", ") +
                            ")",
                    );
                } else {
                    stmts.push(
                        "ALTER TABLE " +
                            tn +
                            " ADD INDEX `" +
                            idx.name +
                            "` (" +
                            idx.columns
                                .map(function (c) {
                                    return "`" + c + "`";
                                })
                                .join(", ") +
                            ")",
                    );
                }
            }
        }
    });

    (orig.indexes || []).forEach(function (origIdx) {
        if (!curIdxMap[origIdx.name]) {
            stmts.push("DROP INDEX `" + origIdx.name + "` ON " + tn);
        }
    });

    state.foreignKeys.forEach(function (fk) {
        if (!fk.name) return;
        if (!origFkMap[fk.name]) {
            let line =
                "ALTER TABLE " +
                tn +
                " ADD CONSTRAINT `" +
                fk.name +
                "` FOREIGN KEY (" +
                fk.columns
                    .map(function (c) {
                        return "`" + c + "`";
                    })
                    .join(", ") +
                ") REFERENCES `" +
                fk.referencedTable +
                "` (" +
                fk.referencedColumns
                    .map(function (c) {
                        return "`" + c + "`";
                    })
                    .join(", ") +
                ")";
            if (fk.onDelete && fk.onDelete !== "RESTRICT") line += " ON DELETE " + fk.onDelete;
            if (fk.onUpdate && fk.onUpdate !== "RESTRICT") line += " ON UPDATE " + fk.onUpdate;
            stmts.push(line);
        }
    });

    (orig.foreignKeys || []).forEach(function (origFk) {
        if (!curFkMap[origFk.name]) {
            stmts.push("ALTER TABLE " + tn + " DROP FOREIGN KEY `" + origFk.name + "`");
        }
    });

    state.triggers.forEach(function (trg) {
        if (!trg.name) return;
        if (!origTrgMap[trg.name]) {
            stmts.push(
                "CREATE TRIGGER `" + trg.name + "` " + trg.timing + " " + trg.event + " ON " + tn + " FOR EACH ROW " + trg.statement,
            );
        }
    });

    (orig.triggers || []).forEach(function (origTrg) {
        if (!curTrgMap[origTrg.name]) {
            stmts.push("DROP TRIGGER `" + origTrg.name + "`");
        }
    });

    if (stmts.length === 0) return t("noChangesDetected");

    return stmts.join(";\n") + ";";
}

function buildColumnDef(col) {
    let def = col.type;
    if (col.length && typeNeedsLength(col.type)) {
        def += "(" + col.length + ")";
    }
    if (!col.nullable) {
        def += " NOT NULL";
    } else {
        def += " NULL";
    }
    if (col.isAutoIncrement) def += " AUTO_INCREMENT";
    if (col.defaultValue) def += " DEFAULT " + formatSqlValue(col.defaultValue);
    if (col.comment) def += " COMMENT '" + escapeString(col.comment) + "'";
    return def;
}

function isColumnChanged(orig, cur) {
    return (
        orig.type !== cur.type ||
        orig.length !== cur.length ||
        orig.nullable !== cur.nullable ||
        orig.defaultValue !== cur.defaultValue ||
        orig.comment !== cur.comment ||
        orig.isAutoIncrement !== cur.isAutoIncrement ||
        orig.isPrimaryKey !== cur.isPrimaryKey ||
        orig.isUnique !== cur.isUnique
    );
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
    if (val === null || val === undefined) return "NULL";
    if (val.toUpperCase && val.toUpperCase() === "NULL") return "NULL";
    if (val.toUpperCase && (val.toUpperCase() === "CURRENT_TIMESTAMP" || val.toUpperCase() === "NOW()")) return val;
    if (/^-?\d+(\.\d+)?$/.test(val)) return val;
    return "'" + escapeString(val) + "'";
}

function escapeString(str) {
    return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function highlightSql(sql) {
    const keywords = [
        "CREATE",
        "TABLE",
        "ALTER",
        "ADD",
        "DROP",
        "COLUMN",
        "MODIFY",
        "CHANGE",
        "INDEX",
        "UNIQUE",
        "KEY",
        "CONSTRAINT",
        "FOREIGN",
        "REFERENCES",
        "ON",
        "DELETE",
        "UPDATE",
        "CASCADE",
        "RESTRICT",
        "SET",
        "NULL",
        "NOT",
        "DEFAULT",
        "AUTO_INCREMENT",
        "COMMENT",
        "ENGINE",
        "CHARSET",
        "COLLATE",
        "PRIMARY",
        "TRIGGER",
        "BEFORE",
        "AFTER",
        "INSERT",
        "FOR",
        "EACH",
        "ROW",
        "BEGIN",
        "END",
        "NO",
        "ACTION",
        "IF",
        "EXISTS",
    ];
    const types = [
        "INT",
        "INTEGER",
        "TINYINT",
        "SMALLINT",
        "MEDIUMINT",
        "BIGINT",
        "FLOAT",
        "DOUBLE",
        "DECIMAL",
        "NUMERIC",
        "VARCHAR",
        "CHAR",
        "TEXT",
        "TINYTEXT",
        "MEDIUMTEXT",
        "LONGTEXT",
        "BLOB",
        "TINYBLOB",
        "MEDIUMBLOB",
        "LONGBLOB",
        "DATE",
        "DATETIME",
        "TIMESTAMP",
        "TIME",
        "YEAR",
        "ENUM",
        "SET",
        "BOOLEAN",
        "BOOL",
        "BINARY",
        "VARBINARY",
        "JSON",
        "GEOMETRY",
        "POINT",
        "LINESTRING",
        "POLYGON",
    ];

    const keywordSet = {};
    for (let i = 0; i < keywords.length; i++) keywordSet[keywords[i].toUpperCase()] = true;
    const typeSet = {};
    for (let i = 0; i < types.length; i++) typeSet[types[i].toUpperCase()] = true;

    const tokens = [];
    let i = 0;
    while (i < sql.length) {
        if (sql[i] === "'") {
            let end = sql.indexOf("'", i + 1);
            if (end === -1) end = sql.length - 1;
            tokens.push({ type: "string", value: sql.substring(i, end + 1) });
            i = end + 1;
        } else if (sql[i] === "-" && sql[i + 1] === "-") {
            let end = sql.indexOf("\n", i);
            if (end === -1) end = sql.length;
            tokens.push({ type: "comment", value: sql.substring(i, end) });
            i = end;
        } else if (/[a-zA-Z_]/.test(sql[i])) {
            const start = i;
            while (i < sql.length && /[a-zA-Z0-9_]/.test(sql[i])) i++;
            const word = sql.substring(start, i);
            const upper = word.toUpperCase();
            if (keywordSet[upper]) {
                tokens.push({ type: "keyword", value: word });
            } else if (typeSet[upper]) {
                tokens.push({ type: "type", value: word });
            } else {
                tokens.push({ type: "text", value: word });
            }
        } else {
            const start = i;
            while (i < sql.length && !/[a-zA-Z_']/.test(sql[i]) && !(sql[i] === "-" && sql[i + 1] === "-")) i++;
            tokens.push({ type: "text", value: sql.substring(start, i) });
        }
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    let result = "";
    for (let j = 0; j < tokens.length; j++) {
        const tok = tokens[j];
        const escaped = escapeHtml(tok.value);
        if (tok.type === "keyword") {
            result += '<span class="sql-keyword">' + escaped + "</span>";
        } else if (tok.type === "type") {
            result += '<span class="sql-type">' + escaped + "</span>";
        } else if (tok.type === "string") {
            result += '<span class="sql-string">' + escaped + "</span>";
        } else if (tok.type === "comment") {
            result += '<span class="sql-comment">' + escaped + "</span>";
        } else {
            result += escaped;
        }
    }

    return result;
}

function validate() {
    state.errors = {};
    let valid = true;

    if (!state.tableName || !state.tableName.trim()) {
        state.errors["tableName"] = t("tableNameRequired");
        document.getElementById("tableNameInput").classList.add("has-error");
        valid = false;
    } else {
        document.getElementById("tableNameInput").classList.remove("has-error");
    }

    if (state.columns.length === 0) {
        valid = false;
    }

    const colNames = {};
    state.columns.forEach(function (col) {
        if (!col.name || !col.name.trim()) {
            state.errors["col_name_" + col.id] = t("fieldNameRequired");
            valid = false;
        } else if (colNames[col.name]) {
            state.errors["col_name_" + col.id] = t("duplicateFieldName");
            valid = false;
        } else {
            colNames[col.name] = true;
        }
    });

    const idxNames = {};
    state.indexes.forEach(function (idx) {
        if (!idx.name || !idx.name.trim()) {
            state.errors["idx_name_" + idx.id] = t("indexNameRequired");
            valid = false;
        } else if (idxNames[idx.name]) {
            state.errors["idx_name_" + idx.id] = t("duplicateIndexName");
            valid = false;
        } else {
            idxNames[idx.name] = true;
        }
    });

    const fkNames = {};
    state.foreignKeys.forEach(function (fk) {
        if (!fk.name || !fk.name.trim()) {
            state.errors["fk_name_" + fk.id] = t("fkNameRequired");
            valid = false;
        } else if (fkNames[fk.name]) {
            state.errors["fk_name_" + fk.id] = t("duplicateFkName");
            valid = false;
        } else {
            fkNames[fk.name] = true;
        }
    });

    return valid;
}

function handleSave() {
    if (!validate()) {
        if (state.activeTab === "fields") renderFields();
        if (state.activeTab === "indexes") renderIndexes();
        if (state.activeTab === "foreignKeys") renderForeignKeys();
        return;
    }

    const sql = generateDDL();
    document.getElementById("saveSqlPreview").textContent = sql;
    document.getElementById("saveDialog").style.display = "flex";
}

function confirmSave() {
    document.getElementById("saveDialog").style.display = "none";

    const data = {
        tableName: state.tableName,
        columns: state.columns.map(function (c) {
            const obj = {
                name: c.name,
                type: c.type,
                length: c.length,
                nullable: c.nullable,
                defaultValue: c.defaultValue,
                comment: c.comment,
                isPrimaryKey: c.isPrimaryKey,
                isAutoIncrement: c.isAutoIncrement,
                isUnique: c.isUnique,
            };
            if (c.originalName) obj.originalName = c.originalName;
            return obj;
        }),
        indexes: state.indexes.map(function (i) {
            return { name: i.name, type: i.type, columns: i.columns, isUnique: i.isUnique };
        }),
        foreignKeys: state.foreignKeys.map(function (f) {
            return {
                name: f.name,
                columns: f.columns,
                referencedTable: f.referencedTable,
                referencedColumns: f.referencedColumns,
                onDelete: f.onDelete,
                onUpdate: f.onUpdate,
            };
        }),
        triggers: state.triggers.map(function (t) {
            return { name: t.name, timing: t.timing, event: t.event, statement: t.statement };
        }),
        options: Object.assign({}, state.options),
    };

    vscode.postMessage({ command: "save", data: data });
}

function exportSqlOnly() {
    document.getElementById("saveDialog").style.display = "none";
    const sql = generateDDL();
    vscode.postMessage({ command: "exportSql", sql: sql });
}

function cancelSave() {
    document.getElementById("saveDialog").style.display = "none";
}

function handleClose() {
    vscode.postMessage({ command: "close" });
}

window.addEventListener("message", function (event) {
    const message = event.data;
    if (!message || !message.command) return;

    switch (message.command) {
        case "tableStructure":
            handleTableStructure(message);
            break;
        case "saveResult":
            handleSaveResult(message);
            break;
        case "tableList":
            handleTableList(message);
            break;
        case "columnList":
            handleColumnList(message);
            break;
    }
});

function handleTableStructure(message) {
    const data = message.data || {};
    if (data.columns) {
        state.columns = data.columns.map(function (c) {
            return {
                id: "col_" + ++idCounter,
                name: c.name || "",
                type: c.type || "INT",
                length: c.length || "",
                nullable: c.nullable !== undefined ? c.nullable : true,
                defaultValue: c.defaultValue || "",
                comment: c.comment || "",
                isPrimaryKey: c.isPrimaryKey || false,
                isAutoIncrement: c.isAutoIncrement || false,
                isUnique: c.isUnique || false,
                originalName: c.originalName || c.name,
            };
        });
    }

    if (data.indexes) {
        state.indexes = data.indexes.map(function (i) {
            return {
                id: "idx_" + ++idCounter,
                name: i.name || "",
                type: i.type || "BTREE",
                columns: i.columns || [],
                isUnique: i.isUnique || false,
            };
        });
    }

    if (data.foreignKeys) {
        state.foreignKeys = data.foreignKeys.map(function (f) {
            return {
                id: "fk_" + ++idCounter,
                name: f.name || "",
                columns: f.columns || [],
                referencedTable: f.referencedTable || "",
                referencedColumns: f.referencedColumns || [],
                onDelete: f.onDelete || "RESTRICT",
                onUpdate: f.onUpdate || "RESTRICT",
            };
        });
    }

    if (data.triggers) {
        state.triggers = data.triggers.map(function (t) {
            return {
                id: "trg_" + ++idCounter,
                name: t.name || "",
                timing: t.timing || "BEFORE",
                event: t.event || "INSERT",
                statement: t.statement || "",
            };
        });
    }

    if (data.options) {
        state.options = Object.assign({}, state.options, data.options);
        if (document.getElementById("optEngine")) document.getElementById("optEngine").value = state.options.engine;
        if (document.getElementById("optCharset")) document.getElementById("optCharset").value = state.options.charset;
        if (document.getElementById("optCollation")) document.getElementById("optCollation").value = state.options.collation;
        if (document.getElementById("optAutoIncrement")) document.getElementById("optAutoIncrement").value = state.options.autoIncrement;
        if (document.getElementById("optComment")) document.getElementById("optComment").value = state.options.comment;
    }

    if (data.tableName) {
        state.tableName = data.tableName;
        document.getElementById("tableNameInput").value = state.tableName;
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
        options: JSON.parse(JSON.stringify(state.options)),
    };

    renderFields();
    renderIndexes();
    renderForeignKeys();
    renderTriggers();
    generateDDL();
}

function handleSaveResult(message) {
    if (message.success) {
        vscode.postMessage({ command: "close" });
    } else {
        const errorMsg = message.error || t("unknownError");
        const errorDiv = document.createElement("div");
        errorDiv.className = "error-message";
        errorDiv.textContent = t("saveFailed") + errorMsg;
        errorDiv.style.position = "fixed";
        errorDiv.style.bottom = "210px";
        errorDiv.style.left = "12px";
        errorDiv.style.right = "12px";
        errorDiv.style.padding = "8px 12px";
        errorDiv.style.background = "rgba(244, 71, 71, 0.15)";
        errorDiv.style.borderRadius = "6px";
        errorDiv.style.zIndex = "999";
        document.body.appendChild(errorDiv);
        setTimeout(function () {
            if (errorDiv.parentNode) errorDiv.parentNode.removeChild(errorDiv);
        }, 5000);
    }
}

function handleTableList(message) {
    state.availableTables = message.tables || [];
    if (state.activeTab === "foreignKeys") renderForeignKeys();
}

function handleColumnList(message) {
    state.availableColumns[message.table] = message.columns || [];
    if (state.activeTab === "foreignKeys") renderForeignKeys();
}

function bindActions() {
    document.querySelectorAll("[data-action]").forEach(function (el) {
        var action = el.getAttribute("data-action");
        var arg = el.getAttribute("data-action-arg");
        if (action && typeof window[action] === "function") {
            if (el.tagName === "SELECT") {
                el.addEventListener("change", function () {
                    if (action === "updateOption") {
                        window[action](arg, el.value);
                    } else if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action](el.value);
                    }
                });
            } else if (el.tagName === "INPUT" && (el.type === "text" || el.type === "number")) {
                el.addEventListener("input", function () {
                    if (action === "updateOption") {
                        window[action](arg, el.value);
                    } else if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action](el.value);
                    }
                });
            } else {
                el.addEventListener("click", function (e) {
                    if (arg !== null) {
                        var numArg = Number(arg);
                        window[action](isNaN(numArg) || arg.trim() === "" ? arg : numArg);
                    } else {
                        window[action]();
                    }
                });
            }
        }
        el.removeAttribute("data-action");
        el.removeAttribute("data-action-arg");
    });
}

bindActions();
init();
applyI18n();
