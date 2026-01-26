"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSelection = formatSelection;
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
const sqlDialects_1 = require("./sqlDialects");
const formatEditorText_1 = require("./formatEditorText");
function formatSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    try {
        replaceEachSelection(editor, (text) => (0, formatEditorText_1.formatEditorText)(text, createConfigForEditor(editor)));
    }
    catch (e) {
        vscode.window.showErrorMessage("Unable to format SQL:\n" + e);
    }
}
function replaceEachSelection(editor, fn) {
    editor.edit((editBuilder) => {
        editor.selections.forEach((sel) => editBuilder.replace(sel, fn(editor.document.getText(sel))));
    });
}
const createConfigForEditor = (editor) => (0, config_1.createConfig)(vscode.workspace.getConfiguration("SQL-Formatter-VSCode"), editorFormattingOptions(editor), detectSqlDialect(editor));
const detectSqlDialect = (editor) => sqlDialects_1.sqlDialects[editor.document.languageId] ?? "sql";
const editorFormattingOptions = (editor) => ({
    // According to types, these editor.options properties can also be strings or undefined,
    // but according to docs, the string|undefined value is only applicable when setting,
    // so it should be safe to cast them.
    tabSize: editor.options.tabSize,
    insertSpaces: editor.options.insertSpaces,
});
//# sourceMappingURL=formatSelection.js.map