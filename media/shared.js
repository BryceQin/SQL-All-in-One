/*
 * shared.js
 *
 * Optional helpers shared across webview panels. Each panel script is loaded
 * after this file and may override or ignore anything defined here. Panels
 * that already declare their own `const vscode = window.vscode || acquireVsCodeApi()`
 * or their own `bindActions()` keep working because their own declaration
 * shadows the helpers exposed on `window` here.
 *
 * Why this file is intentionally small:
 *   - Each panel's `bindActions()` has panel-specific special cases (e.g.
 *     connection-dialog's `togglePasswordVisibility`, table-designer's
 *     `updateOption`, query-result's `onFilterColChange` / `jumpToPage`,
 *     config-editor's `searchConfig` / `toggleGroup`). Forcing them through
 *     a single shared implementation would either drop those special cases
 *     or require a configuration surface as large as the code it replaces.
 *   - Panels that wish to reuse the generic dispatch logic can call
 *     `window.bindDataActions(options)` below; panels with special needs
 *     keep their own `bindActions()`.
 */

(function () {
    'use strict';

    /**
     * Cached acquireVsCodeApi() handle. VS Code only allows this to be called
     * ONCE per webview — a second call throws. All panel scripts MUST reuse
     * this cached handle via `const vscode = window.vscode || acquireVsCodeApi();`
     * instead of calling acquireVsCodeApi() directly.
     */
    if (typeof window.vscode === 'undefined') {
        try {
            window.vscode = acquireVsCodeApi();
        } catch (e) {
            // acquireVsCodeApi is only available inside a VS Code webview.
            // Outside that context (e.g. unit tests) we leave window.vscode
            // undefined; panel scripts that need it declare their own.
        }
    }

    /**
     * Coerce a `data-action-arg` string into a number when it looks numeric,
     * otherwise return the original string. Empty strings stay as strings so
     * that actions which accept '' as a meaningful value are not broken.
     */
    function coerceArg(arg) {
        if (arg === null || arg === undefined) {
            return arg;
        }
        var numArg = Number(arg);
        return isNaN(numArg) || arg.trim() === '' ? arg : numArg;
    }

    /**
     * Generic data-action event delegation. Scans the document for elements
     * with a `data-action` attribute and wires up change/input/click handlers
     * that dispatch to `window[action]`. After binding, the data-action and
     * data-action-arg attributes are removed so the same elements are not
     * re-bound if the function runs again.
     *
     * Panels whose bindActions() had no special cases (data-transfer,
     * explain-panel) can call this directly. Panels with special cases keep
     * their own bindActions() and may still call this for the generic
     * branches if they wish.
     *
     * Options:
     *   - selectValueFallback: when true and no data-action-arg is present,
     *     SELECT change handlers pass `el.value` instead of calling the
     *     action with no arguments. Defaults to false (call with no args).
     */
    function bindDataActions(options) {
        options = options || {};
        var selectValueFallback = !!options.selectValueFallback;

        document.querySelectorAll('[data-action]').forEach(function (el) {
            var action = el.getAttribute('data-action');
            var arg = el.getAttribute('data-action-arg');
            if (!action || typeof window[action] !== 'function') {
                el.removeAttribute('data-action');
                el.removeAttribute('data-action-arg');
                return;
            }

            if (el.tagName === 'SELECT') {
                el.addEventListener('change', function () {
                    if (arg !== null) {
                        window[action](arg);
                    } else if (selectValueFallback) {
                        window[action](el.value);
                    } else {
                        window[action]();
                    }
                });
            } else if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
                el.addEventListener('input', function () {
                    if (arg !== null) {
                        window[action](arg);
                    } else {
                        window[action](el.value);
                    }
                });
            } else {
                el.addEventListener('click', function () {
                    if (arg !== null) {
                        window[action](coerceArg(arg));
                    } else {
                        window[action]();
                    }
                });
            }

            el.removeAttribute('data-action');
            el.removeAttribute('data-action-arg');
        });
    }

    window.bindDataActions = bindDataActions;
    window.__coerceActionArg = coerceArg;
})();
