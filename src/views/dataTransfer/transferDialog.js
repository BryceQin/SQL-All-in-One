const vscode = acquireVsCodeApi();

const i18nData = {
    zh: {
        "dataTransfer.title": "数据传输",
        "dataTransfer.source": "源",
        "dataTransfer.target": "目标",
        "dataTransfer.mapping": "映射",
        "dataTransfer.options": "选项",
        "dataTransfer.preview": "预览",
        "dataTransfer.filePath": "文件路径",
        "dataTransfer.selectFilePh": "选择数据文件...",
        "dataTransfer.selectFile": "选择文件",
        "dataTransfer.format": "格式",
        "dataTransfer.targetTable": "目标表",
        "dataTransfer.selectTablePh": "-- 请选择表 --",
        "dataTransfer.newTableName": "或创建新表",
        "dataTransfer.newTableNamePh": "输入新表名...",
        "dataTransfer.sourceColumn": "源列",
        "dataTransfer.targetColumn": "目标列",
        "dataTransfer.selectFileAndTable": "请先选择文件和目标表。",
        "dataTransfer.onError": "错误处理",
        "dataTransfer.skipInvalidRows": "跳过无效行",
        "dataTransfer.abortOnError": "出错时中止",
        "dataTransfer.batchSize": "批处理大小",
        "dataTransfer.previewRows": "预览行数",
        "dataTransfer.csvDelimiter": "CSV 分隔符",
        "dataTransfer.encoding": "编码",
        "dataTransfer.dataPreview": "数据预览",
        "dataTransfer.importing": "正在导入...",
        "dataTransfer.startImport": "开始导入",
        "dataTransfer.skipOption": "-- 跳过 --",
        "dataTransfer.noPreviewData": "无预览数据。",
        "dataTransfer.importSuccessful": "导入成功",
        "dataTransfer.totalRows": "总行数",
        "dataTransfer.imported": "已导入",
        "dataTransfer.skipped": "已跳过",
        "dataTransfer.importFailed": "导入失败",
        "dataTransfer.importingData": "正在导入数据...",
        "dataTransfer.loadingPreview": "加载预览...",
    },
    en: {
        "dataTransfer.title": "Data Transfer",
        "dataTransfer.source": "Source",
        "dataTransfer.target": "Target",
        "dataTransfer.mapping": "Mapping",
        "dataTransfer.options": "Options",
        "dataTransfer.preview": "Preview",
        "dataTransfer.filePath": "File Path",
        "dataTransfer.selectFilePh": "Select a data file...",
        "dataTransfer.selectFile": "Select File",
        "dataTransfer.format": "Format",
        "dataTransfer.targetTable": "Target Table",
        "dataTransfer.selectTablePh": "-- Select a table --",
        "dataTransfer.newTableName": "Or Create New Table",
        "dataTransfer.newTableNamePh": "Enter new table name...",
        "dataTransfer.sourceColumn": "Source Column",
        "dataTransfer.targetColumn": "Target Column",
        "dataTransfer.selectFileAndTable": "Select a file and target table first.",
        "dataTransfer.onError": "On Error",
        "dataTransfer.skipInvalidRows": "Skip invalid rows",
        "dataTransfer.abortOnError": "Abort on error",
        "dataTransfer.batchSize": "Batch Size",
        "dataTransfer.previewRows": "Preview Rows",
        "dataTransfer.csvDelimiter": "CSV Delimiter",
        "dataTransfer.encoding": "Encoding",
        "dataTransfer.dataPreview": "Data Preview",
        "dataTransfer.importing": "Importing...",
        "dataTransfer.startImport": "Start Import",
        "dataTransfer.skipOption": "-- Skip --",
        "dataTransfer.noPreviewData": "No preview data available.",
        "dataTransfer.importSuccessful": "Import Successful",
        "dataTransfer.totalRows": "Total Rows",
        "dataTransfer.imported": "Imported",
        "dataTransfer.skipped": "Skipped",
        "dataTransfer.importFailed": "Import Failed",
        "dataTransfer.importingData": "Importing data...",
        "dataTransfer.loadingPreview": "Loading preview...",
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
            if (el.tagName === "OPTION") {
                el.textContent = text;
            } else if (el.tagName === "TITLE") {
                document.title = text;
            } else {
                el.textContent = text;
            }
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

// Read language from injected config
(function initLang() {
    var config = window.__DATA_TRANSFER_CONFIG__ || {};
    if (config.lang) {
        lang = config.lang.startsWith("zh") ? "zh" : "en";
    }
})();

let currentStep = 1;
const totalSteps = 5;

const importConfig = {
    filePath: "",
    format: "auto",
    detectedFormat: "",
    tableName: "",
    newTableName: "",
    mapping: {},
    onError: "skip",
    dedupStrategy: "ignore",
    batchSize: 100,
    previewRows: 10,
    csvDelimiter: "auto",
    encoding: "utf-8",
};

const sourceColumns = [];
let targetColumns = [];
let tables = [];

function selectFile() {
    vscode.postMessage({ command: "selectFile" });
}

function nextStep() {
    if (!validateStep(currentStep)) {
        return;
    }

    if (currentStep < totalSteps) {
        currentStep++;
        updateStepDisplay();

        if (currentStep === 2) {
            vscode.postMessage({ command: "requestTables" });
        } else if (currentStep === 3) {
            const tableName = getEffectiveTableName();
            if (tableName) {
                vscode.postMessage({ command: "requestColumns", tableName: tableName });
            }
            renderMapping();
        } else if (currentStep === 4) {
            updateCsvOptionsVisibility();
        } else if (currentStep === 5) {
            requestPreview();
        }
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepDisplay();
    }
}

function validateStep(step) {
    if (step === 1) {
        if (!importConfig.filePath) {
            return false;
        }
        return true;
    }
    if (step === 2) {
        if (!getEffectiveTableName()) {
            return false;
        }
        return true;
    }
    return true;
}

function updateStepDisplay() {
    document.querySelectorAll(".step-page").forEach(function (p) {
        p.classList.remove("active");
    });
    document.querySelectorAll(".step-indicator").forEach(function (ind) {
        var step = parseInt(ind.getAttribute("data-step"));
        ind.classList.remove("active", "completed");
        if (step === currentStep) {
            ind.classList.add("active");
        } else if (step < currentStep) {
            ind.classList.add("completed");
        }
    });

    document.querySelectorAll(".step-connector").forEach(function (conn, idx) {
        conn.classList.toggle("completed", idx + 1 < currentStep);
    });

    var stepPage = document.getElementById("step" + currentStep);
    if (stepPage) {
        stepPage.classList.add("active");
    }

    var btnPrev = document.getElementById("btnPrev");
    var btnNext = document.getElementById("btnNext");
    var btnStartImport = document.getElementById("btnStartImport");

    btnPrev.disabled = currentStep <= 1;

    if (currentStep === totalSteps) {
        btnNext.style.display = "none";
        btnStartImport.style.display = "";
    } else {
        btnNext.style.display = "";
        btnStartImport.style.display = "none";
    }
}

function onTargetTableChange() {
    var select = document.getElementById("targetTable");
    importConfig.tableName = select.value;
    if (select.value) {
        document.getElementById("newTableName").value = "";
        importConfig.newTableName = "";
    }
}

function getEffectiveTableName() {
    var newTable = document.getElementById("newTableName").value.trim();
    if (newTable) {
        return newTable;
    }
    return importConfig.tableName;
}

function renderMapping() {
    var container = document.getElementById("mappingContainer");

    if (sourceColumns.length === 0) {
        container.innerHTML = '<div class="mapping-empty">' + t("dataTransfer.selectFileAndTable") + "</div>";
        return;
    }

    container.innerHTML = "";

    sourceColumns.forEach(function (srcCol) {
        var row = document.createElement("div");
        row.className = "mapping-row";

        var sourceDiv = document.createElement("div");
        sourceDiv.className = "mapping-source";
        sourceDiv.textContent = srcCol;

        var arrow = document.createElement("span");
        arrow.className = "mapping-arrow";
        arrow.textContent = "\u2192";

        var targetSelect = document.createElement("select");
        targetSelect.className = "mapping-target-select";
        targetSelect.setAttribute("data-source-col", srcCol);

        var skipOpt = document.createElement("option");
        skipOpt.value = "__skip__";
        skipOpt.textContent = t("dataTransfer.skipOption");
        targetSelect.appendChild(skipOpt);

        targetColumns.forEach(function (tgtCol) {
            var opt = document.createElement("option");
            opt.value = tgtCol.name;
            opt.textContent = tgtCol.name + " (" + tgtCol.type + ")";
            if (tgtCol.name.toLowerCase() === srcCol.toLowerCase() || tgtCol.name === srcCol) {
                opt.selected = true;
            }
            targetSelect.appendChild(opt);
        });

        targetSelect.onchange = function () {
            updateMappingFromUI();
        };

        row.appendChild(sourceDiv);
        row.appendChild(arrow);
        row.appendChild(targetSelect);
        container.appendChild(row);
    });

    updateMappingFromUI();
}

function updateMappingFromUI() {
    importConfig.mapping = {};
    var selects = document.querySelectorAll(".mapping-target-select");
    selects.forEach(function (sel) {
        var srcCol = sel.getAttribute("data-source-col");
        var tgtCol = sel.value;
        if (tgtCol && tgtCol !== "__skip__") {
            importConfig.mapping[srcCol] = tgtCol;
        }
    });
}

function renderPreview(headers, rows, format) {
    var wrapper = document.getElementById("previewTableWrapper");
    wrapper.innerHTML = "";

    if (!headers || headers.length === 0) {
        wrapper.innerHTML = '<div class="mapping-empty">' + t("dataTransfer.noPreviewData") + "</div>";
        return;
    }

    var table = document.createElement("table");
    table.className = "preview-table";

    var thead = document.createElement("thead");
    var headerRow = document.createElement("tr");
    headers.forEach(function (h) {
        var th = document.createElement("th");
        th.textContent = h;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    rows.forEach(function (row) {
        var tr = document.createElement("tr");
        row.forEach(function (cell) {
            var td = document.createElement("td");
            td.textContent = cell === null || cell === undefined ? "" : String(cell);
            td.title = td.textContent;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrapper.appendChild(table);
}

function showImportResult(result) {
    var section = document.getElementById("importResultSection");
    var progressSection = document.getElementById("importProgressSection");
    progressSection.style.display = "none";

    section.style.display = "";
    section.className = "import-result-section";

    if (result.success) {
        section.classList.add("import-result-success");
        section.innerHTML =
            '<div class="import-result-title">' +
            t("dataTransfer.importSuccessful") +
            "</div>" +
            '<div class="import-result-stats">' +
            '<div class="import-result-stat"><span class="import-result-stat-value">' +
            result.totalRows +
            '</span><span class="import-result-stat-label">' +
            t("dataTransfer.totalRows") +
            "</span></div>" +
            '<div class="import-result-stat"><span class="import-result-stat-value">' +
            result.importedRows +
            '</span><span class="import-result-stat-label">' +
            t("dataTransfer.imported") +
            "</span></div>" +
            '<div class="import-result-stat"><span class="import-result-stat-value">' +
            result.skippedRows +
            '</span><span class="import-result-stat-label">' +
            t("dataTransfer.skipped") +
            "</span></div>" +
            "</div>";
    } else {
        section.classList.add("import-result-error");
        var errorHtml = "";
        if (result.errors && result.errors.length > 0) {
            errorHtml = '<div class="import-result-errors">';
            result.errors.forEach(function (err) {
                errorHtml += '<div class="import-result-error-item">Row ' + err.row + ": " + escapeHtml(err.message) + "</div>";
            });
            errorHtml += "</div>";
        }
        section.innerHTML =
            '<div class="import-result-title">' +
            t("dataTransfer.importFailed") +
            "</div>" +
            '<div class="import-result-stats">' +
            '<div class="import-result-stat"><span class="import-result-stat-value">' +
            result.totalRows +
            '</span><span class="import-result-stat-label">' +
            t("dataTransfer.totalRows") +
            "</span></div>" +
            '<div class="import-result-stat"><span class="import-result-stat-value">' +
            result.importedRows +
            '</span><span class="import-result-stat-label">' +
            t("dataTransfer.imported") +
            "</span></div>" +
            '<div class="import-result-stat"><span class="import-result-stat-value">' +
            result.skippedRows +
            '</span><span class="import-result-stat-label">' +
            t("dataTransfer.skipped") +
            "</span></div>" +
            "</div>" +
            errorHtml;
    }
}

function startImport() {
    var tableName = getEffectiveTableName();
    if (!tableName) {
        return;
    }

    var config = {
        filePath: importConfig.filePath,
        format: importConfig.format === "auto" ? importConfig.detectedFormat : importConfig.format,
        tableName: importConfig.tableName,
        newTableName: document.getElementById("newTableName").value.trim() || undefined,
        mapping: importConfig.mapping,
        onError: document.getElementById("onError").value,
        dedupStrategy: document.getElementById("dedupStrategy").value,
        batchSize: parseInt(document.getElementById("batchSize").value) || 100,
        delimiter: document.getElementById("csvDelimiter").value,
        encoding: document.getElementById("encoding").value,
    };

    var progressSection = document.getElementById("importProgressSection");
    var progressBar = document.getElementById("importProgressBar");
    var progressText = document.getElementById("importProgressText");
    var resultSection = document.getElementById("importResultSection");

    resultSection.style.display = "none";
    progressSection.style.display = "";
    progressBar.classList.add("indeterminate");
    progressText.textContent = t("dataTransfer.importingData");

    var btnStartImport = document.getElementById("btnStartImport");
    btnStartImport.disabled = true;

    vscode.postMessage({ command: "startImport", config: config });
}

function requestPreview() {
    if (!importConfig.filePath) return;

    var format = importConfig.format === "auto" ? importConfig.detectedFormat : importConfig.format;
    var previewRows = parseInt(document.getElementById("previewRows").value) || 10;
    var delimiter = document.getElementById("csvDelimiter").value;

    vscode.postMessage({
        command: "requestPreview",
        filePath: importConfig.filePath,
        format: format,
        previewRows: previewRows,
        delimiter: delimiter,
    });
}

function updateCsvOptionsVisibility() {
    var format = document.getElementById("fileFormat").value;
    var effectiveFormat = format === "auto" ? importConfig.detectedFormat : format;
    var csvGroups = document.querySelectorAll(".csv-option");
    var csvHint = document.getElementById("csvOptionsHint");

    var isCsv = effectiveFormat === "csv";
    csvGroups.forEach(function (g) {
        g.style.display = isCsv ? "" : "none";
    });
    if (csvHint) {
        csvHint.style.display = isCsv ? "" : "none";
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.addEventListener("message", function (event) {
    var message = event.data;
    if (!message || !message.type) return;

    switch (message.type) {
        case "fileSelected":
            importConfig.filePath = message.filePath;
            importConfig.detectedFormat = message.format;
            document.getElementById("filePath").value = message.filePath;
            if (importConfig.format === "auto") {
                document.getElementById("fileFormat").value = "auto";
            }
            updateCsvOptionsVisibility();

            if (message.format === "csv") {
                vscode.postMessage({ command: "readFilePreview", firstLineFilePath: message.filePath });
            }
            break;

        case "tables":
            if (message.error) {
                tables = [];
            } else {
                tables = message.tables || [];
            }
            var tableSelect = document.getElementById("targetTable");
            tableSelect.innerHTML = '<option value="">' + t("dataTransfer.selectTablePh") + "</option>";
            tables.forEach(function (t) {
                var opt = document.createElement("option");
                opt.value = t;
                opt.textContent = t;
                tableSelect.appendChild(opt);
            });
            if (importConfig.tableName && tables.indexOf(importConfig.tableName) >= 0) {
                tableSelect.value = importConfig.tableName;
            }
            break;

        case "columns":
            if (message.error) {
                targetColumns = [];
            } else {
                targetColumns = message.columns || [];
            }
            if (currentStep === 3) {
                renderMapping();
            }
            break;

        case "preview":
            renderPreview(message.headers, message.rows, message.format);
            break;

        case "previewError":
            var wrapper = document.getElementById("previewTableWrapper");
            wrapper.innerHTML = '<div class="mapping-empty" style="color: var(--error-color);">' + escapeHtml(message.error) + "</div>";
            break;

        case "importResult":
            showImportResult(message.result);
            var btnStartImport = document.getElementById("btnStartImport");
            if (btnStartImport) btnStartImport.disabled = false;
            break;

        case "filePreview":
            break;
    }
});

// Initialize
updateStepDisplay();
updateCsvOptionsVisibility();
applyI18n();

// Listen for newTableName changes
document.getElementById("newTableName").addEventListener("input", function () {
    importConfig.newTableName = this.value.trim();
});

document.getElementById("fileFormat").addEventListener("change", function () {
    importConfig.format = this.value;
    updateCsvOptionsVisibility();
});

function bindActions() {
    document.querySelectorAll("[data-action]").forEach(function (el) {
        var action = el.getAttribute("data-action");
        var arg = el.getAttribute("data-action-arg");
        if (action && typeof window[action] === "function") {
            if (el.tagName === "SELECT") {
                el.addEventListener("change", function () {
                    if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action]();
                    }
                });
            } else if (el.tagName === "INPUT" && (el.type === "text" || el.type === "number")) {
                el.addEventListener("input", function () {
                    if (arg !== null) {
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
