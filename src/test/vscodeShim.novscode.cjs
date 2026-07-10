// VS Code module shim for novscode benchmarks.
//
// This file is loaded as a side-effect import (it MUST be the first import
// of any novscode benchmark that transitively depends on a module doing
// `import * as vscode from 'vscode'` at its top level, e.g.
// `core/errorHandler`, `i18n`, `parser/DocumentAstCache`). It registers a
// no-op `vscode` shim in the Node module resolver *before* those project
// modules are loaded, so their top-level `require('vscode')` succeeds
// instead of throwing `MODULE_NOT_FOUND`.
//
// The shim only needs to make module *loading* succeed; benchmarks must not
// invoke real vscode APIs at runtime.
//
// Why a .cjs file (rather than .ts)?
//   We patch `Module._resolveFilename` so that `require('vscode')` resolves
//   to *this file's* absolute path, then pre-populate `require.cache` with a
//   module whose exports are the shim object. Runtime loaders like tsx/jiti
//   honour the require.cache entry for an already-resolved absolute path
//   without re-reading the file, which lets us hand out an in-memory object
//   instead of a real source file. Using .cjs (plain CommonJS) guarantees
//   the file is evaluated as-is with no transpilation step that could
//   reorder the patch installation.
//
// Why a plain object (rather than a Proxy)?
//   jiti (v2.x) inspects `module.exports` of imported .cjs modules for
//   well-known properties (`__esModule`, `default`, `Symbol.toStringTag`,
//   etc.) to decide how to interop with the module. A Proxy whose `get`
//   trap returns a fallback function for every unknown property makes those
//   inspections return callable values, which confuses jiti's ESM/CJS
//   interop detection and causes `jiti.import()` to never settle (observed
//   as "Detected unsettled top-level await"). A plain object with a fixed
//   set of properties avoids this entirely because unknown property access
//   returns `undefined` (the normal CJS behaviour).

const Module = require("module");
const path = require("path");

class EventEmitter {
    event(_listener) {
        return {
            dispose() {
                /* no-op */
            },
        };
    }
    fire(_e) {
        /* no-op */
    }
    dispose() {
        /* no-op */
    }
}

class Disposable {
    constructor(_fn) {
        /* no-op */
    }
    static from(..._disposables) {
        return {
            dispose() {
                /* no-op */
            },
        };
    }
    dispose() {
        /* no-op */
    }
}

class Uri {
    static parse(_s) {
        return new Uri();
    }
    static file(_p) {
        return new Uri();
    }
    toString() {
        return "vscode-shim-uri://";
    }
    with(_changes) {
        return new Uri();
    }
}

class Location {
    constructor(_uri, _rangeOrPos) {
        /* no-op */
    }
}

class Range {
    constructor(_a, _b, _c, _d) {
        /* no-op */
    }
    get start() {
        return { line: 0, character: 0 };
    }
    get end() {
        return { line: 0, character: 0 };
    }
}

class Position {
    constructor(_l, _c) {
        /* no-op */
    }
    get line() {
        return 0;
    }
    get character() {
        return 0;
    }
}

const vscodeShim = {
    EventEmitter,
    Disposable,
    Uri,
    Location,
    Range,
    Position,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CompletionItemKind: {},
    SymbolKind: {},
    FoldingRangeKind: { Comment: 1, Imports: 2, Region: 3 },
    env: { language: "en", machineId: "shim", sessionId: "shim", appName: "shim" },
    workspace: {
        getConfiguration(_section) {
            return {
                get(_key, defaultValue) {
                    return defaultValue;
                },
                has(_key) {
                    return false;
                },
                update(_key, _value) {
                    return Promise.resolve();
                },
            };
        },
        onDidCloseTextDocument(_cb) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        onDidChangeTextDocument(_cb) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        onDidOpenTextDocument(_cb) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        onDidSaveTextDocument(_cb) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        textDocuments: [],
        workspaceFolders: [],
    },
    window: {
        createOutputChannel(_name) {
            return {
                appendLine(_s) {
                    /* no-op */
                },
                append(_s) {
                    /* no-op */
                },
                show() {
                    /* no-op */
                },
                hide() {
                    /* no-op */
                },
                dispose() {
                    /* no-op */
                },
            };
        },
        showErrorMessage(_m) {
            return Promise.resolve(undefined);
        },
        showWarningMessage(_m) {
            return Promise.resolve(undefined);
        },
        showInformationMessage(_m) {
            return Promise.resolve(undefined);
        },
        activeTextEditor: undefined,
        onDidChangeActiveTextEditor(_cb) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        onDidChangeTextEditorSelection(_cb) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
    },
    commands: {
        registerCommand(_id, _cb) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        executeCommand(_id, ..._args) {
            return Promise.resolve(undefined);
        },
    },
    languages: {
        registerCompletionItemProvider(_sel, _p) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        registerHoverProvider(_sel, _p) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        registerDefinitionProvider(_sel, _p) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        registerReferenceProvider(_sel, _p) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        registerRenameProvider(_sel, _p) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        registerCodeActionsProvider(_sel, _p) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        registerFoldingRangeProvider(_sel, _p) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        registerDocumentSymbolProvider(_sel, _p) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
        createDiagnosticCollection(_name) {
            return {
                set(_uri, _diags) {
                    /* no-op */
                },
                delete(_uri) {
                    /* no-op */
                },
                clear() {
                    /* no-op */
                },
                dispose() {
                    /* no-op */
                },
            };
        },
        onDidChangeDiagnostics(_cb) {
            return {
                dispose() {
                    /* no-op */
                },
            };
        },
    },
};

// Resolve `require('vscode')` to this very file's absolute path, then make
// `require.cache` hand out the in-memory shim object without re-reading the
// file from disk.
const thisFilePath = __filename;
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function patchedResolveFilename(request, ...rest) {
    if (request === "vscode") {
        return thisFilePath;
    }
    return originalResolveFilename.call(this, request, ...rest);
};
// Pre-populate the require cache so the resolved path returns the shim.
require.cache[thisFilePath] = {
    id: thisFilePath,
    filename: thisFilePath,
    loaded: true,
    exports: vscodeShim,
    paths: [],
    children: [],
    parent: null,
    path: path.dirname(thisFilePath),
};

module.exports = vscodeShim;
