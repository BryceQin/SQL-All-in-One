/*
 * shared.js
 *
 * 各 webview 面板共享的工具函数。每个面板的 HTML 先加载本文件，再加载
 * 面板自身的 JS。本文件将历史上 6 个面板各自重复实现的三段逻辑集中到
 * window 上：
 *   - window.escapeHtml(str)：HTML 转义，含 null/undefined 检查（修复
 *     explain-panel 旧版传 null 抛 TypeError 的 bug）。
 *   - window.applyI18n(root, translate, opts)：通过 data-i18n / data-i18n-ph /
 *     data-i18n-title 属性将译文写入 DOM。translate 为各面板传入的查字典回调。
 *   - window.bindDataActions(options)：data-action 事件委托的通用实现，
 *     通过 options.handlers 接收面板特有的特殊 case（详见函数注释）。
 *
 * 关于 vscode 句柄：本文件在加载时缓存 acquireVsCodeApi() 至 window.vscode。
 * VS Code 仅允许每个 webview 调用一次 acquireVsCodeApi()，因此所有面板
 * 必须通过 `const vscode = window.vscode || acquireVsCodeApi();` 复用该句柄，
 * 不得再次直接调用 acquireVsCodeApi()。
 *
 * 已知未消除的重复（R5，评估后未实施）：表设计器的 DDL 生成逻辑目前存在
 * 双份维护——扩展主机侧 src/views/tableDesigner/TableDesignerPanel.ts 的
 * _generateCreateDDL / _generateAlterDDL（实际执行路径，权威），以及 webview
 * 侧 media/table-designer.js 的 generateCreateDDL / generateAlterDDL（仅用于
 * 预览显示）。两者在以下方面存在刻意差异：
 *   - 类型大小写：主机 toUpperCase，webview 保留原值；
 *   - 长度输出：主机始终附加 (length)，webview 仅在 typeNeedsLength 为真时附加；
 *   - 默认值格式：主机内联 SQL 转义（''），webview 调用 formatSqlValue；
 *   - 注释转义：主机用 \\'，webview 调用 escapeString；
 *   - NULL 关键字：主机省略，webview 显式输出 NULL；
 *   - ALTER DDL 结构：主机拆分为 _generateColumnAlters/_generateIndexAlters/
 *     _generateForeignKeyAlters/_generateTriggerAlters/_generateTableOptionAlters
 *     并以 \n 连接每条带 ; 的语句，webview 内联且无表选项 alters，以 ;\n 连接。
 * 强行合并需要先统一上述差异并决定单一权威实现，且若让 webview 复用主机逻辑
 * 需改为 postMessage 取 DDL（每次按键的预览刷新都要消息往返，受 300ms 防抖
 * 保护但仍有架构变更），风险较高。本次仅在此标记该问题，未实施迁移。
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
     * 转义 HTML 特殊字符，防止将用户数据注入 innerHTML 时引发 XSS。
     *
     * 各面板原本各自实现 escapeHtml，且实现之间存在差异：
     *   - data-transfer / explain-panel / table-designer：纯字符串替换版本，
     *     但都缺 null/undefined 检查（explain-panel 调用方曾传入 null 导致
     *     TypeError，本函数通过提前 return '' 修复该 bug）。
     *   - config-editor：使用 div.textContent + div.innerHTML 的 DOM 方式，
     *     行为与字符串替换等价但性能略差。
     *
     * 此处统一为字符串替换版本，并对 null/undefined 安全地返回空字符串，
     * 避免调用 .replace 时抛 TypeError。所有面板通过 window.escapeHtml 复用。
     */
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 通用 data-action 事件委托。扫描文档中带有 `data-action` 属性的元素，
     * 为其绑定 change/input/click 事件并将调用派发到 `window[action]`。
     * 绑定后默认移除 `data-action` 与 `data-action-arg`，以避免重复绑定。
     *
     * 6 个面板原本各自实现 bindActions()，逻辑高度重复但存在若干面板特有
     * 的特殊 case（如 connection-dialog 的 updateField 需要 (arg, value)
     * 二元调用、togglePasswordVisibility 需要从 data-target 读取目标元素；
     * config-editor 的 searchConfig 需要 200ms 防抖、toggleGroup 需要传入
     * 元素本身且需保留 data-action-arg 供后续 switchTab 查询；table-designer
     * 的 updateOption 同样需要 (arg, value) 二元调用；query-result 的
     * onFilterColChange/onFilterOpChange 需要 (el, arg) 调用、jumpToPage 需要
     * 从 #pageJump 输入框读取值）。本函数通过 options.handlers 把这些特殊
     * case 以回调形式开放给调用方，使通用逻辑单一来源化。
     *
     * 通用 case 的面板（data-transfer、explain-panel）直接调用本函数即可；
     * 特殊 case 较多的面板（config-editor、table-designer、query-result、
     * connection-dialog）保留本地 bindActions()，但其内部只声明 handlers
     * 映射，再委托给本函数处理通用分支，避免重复实现 SELECT/INPUT/click
     * 的派发模板。
     *
     * Options:
     *   - selectValueFallback: 当为 true 且未设置 data-action-arg 时，SELECT
     *     change 处理函数传入 `el.value` 而非无参调用。默认 false。
     *   - handleCheckbox: 当为 true 时，INPUT[type=checkbox] 绑定 change
     *     事件，调用 window[action](arg, el.checked) 或 window[action](el.checked)。
     *     默认 false（checkbox 会落入 click 分支，行为不正确，故历史上面板
     *     都在本地 bindActions 单独处理；本选项用于消除该重复）。
     *   - inputBindChange: 当为 true 时，INPUT[text/number] 在 input 事件
     *     之外额外绑定 change 事件（query-result 的历史行为）。默认 false。
     *   - inputEventForAllInputs: 当为 true 时，所有非 checkbox 的 INPUT
     *     （含 password/email 等）均绑定 input 事件而非 click 事件
     *     （connection-dialog 的历史行为：updateField 需在用户键入时触发，
     *     包括密码框）。默认 false（非 text/number 的 INPUT 走 click）。
     *   - keepArg: 当为 true 时，绑定后保留 data-action-arg（config-editor
     *     的 switchTab/switchConnFormTab/键盘导航在绑定之后仍需按该属性
     *     查找按钮）。默认 false。
     *   - handlers: { actionName: function(el, arg, event) } 映射。若某
     *     action 在此映射中，则无论元素是 SELECT/INPUT/其他，触发事件时
     *     均调用该 handler 而非走通用派发逻辑。handler 接收 (el, arg, event)
     *     三个参数，可自由决定如何调用 window[action]。
     */
    function bindDataActions(options) {
        options = options || {};
        var selectValueFallback = !!options.selectValueFallback;
        var handleCheckbox = !!options.handleCheckbox;
        var inputBindChange = !!options.inputBindChange;
        var inputEventForAllInputs = !!options.inputEventForAllInputs;
        var keepArg = !!options.keepArg;
        var handlers = options.handlers || {};

        document.querySelectorAll('[data-action]').forEach(function (el) {
            var action = el.getAttribute('data-action');
            var arg = el.getAttribute('data-action-arg');
            if (!action || typeof window[action] !== 'function') {
                el.removeAttribute('data-action');
                if (!keepArg) el.removeAttribute('data-action-arg');
                return;
            }

            var customHandler = handlers[action];

            if (el.tagName === 'SELECT') {
                el.addEventListener('change', function (event) {
                    if (customHandler) {
                        customHandler(el, arg, event);
                    } else if (arg !== null) {
                        window[action](arg);
                    } else if (selectValueFallback) {
                        window[action](el.value);
                    } else {
                        window[action]();
                    }
                });
            } else if (el.tagName === 'INPUT') {
                if (el.type === 'checkbox' && handleCheckbox) {
                    el.addEventListener('change', function (event) {
                        if (customHandler) {
                            customHandler(el, arg, event);
                        } else if (arg !== null) {
                            window[action](arg, el.checked);
                        } else {
                            window[action](el.checked);
                        }
                    });
                } else if (el.type === 'text' || el.type === 'number' || inputEventForAllInputs) {
                    var inputFn = function (event) {
                        if (customHandler) {
                            customHandler(el, arg, event);
                        } else if (arg !== null) {
                            window[action](arg);
                        } else {
                            window[action](el.value);
                        }
                    };
                    el.addEventListener('input', inputFn);
                    if (inputBindChange) {
                        el.addEventListener('change', inputFn);
                    }
                } else {
                    // 其他 INPUT 类型（如 password）走 click 分支
                    el.addEventListener('click', function (event) {
                        if (customHandler) {
                            customHandler(el, arg, event);
                        } else if (arg !== null) {
                            window[action](coerceArg(arg));
                        } else {
                            window[action]();
                        }
                    });
                }
            } else {
                el.addEventListener('click', function (event) {
                    if (customHandler) {
                        customHandler(el, arg, event);
                    } else if (arg !== null) {
                        window[action](coerceArg(arg));
                    } else {
                        window[action]();
                    }
                });
            }

            el.removeAttribute('data-action');
            if (!keepArg) el.removeAttribute('data-action-arg');
        });
    }

    /**
     * 通用 i18n DOM 应用函数。扫描 root 子树中带 data-i18n / data-i18n-ph /
     * data-i18n-title 属性的元素，调用 translate(key) 取得译文后写入对应的
     * DOM 属性（textContent / placeholder / title）。
     *
     * 6 个面板原本各自实现 applyI18n / applyI18nDict / applyI18nToDom，逻辑
     * 高度重复：均遍历同样的三组属性并写入同样的 DOM 字段。差异仅在于：
     *   - 译文字典来源不同：有的用全局 i18nData + t()，有的接收外部传入 dict；
     *   - data-i18n 写入策略：explain-panel / data-transfer / query-result
     *     会区分 OPTION / TITLE 标签做特殊处理，connection-dialog /
     *     table-designer 不区分；config-editor 仅区分 TITLE。
     *
     * 本函数不直接读取任何全局字典，而是接受 translate 回调，由各面板传入
     * 自己的 t()/dict 查询逻辑。optionTagSpecial / titleTagSpecial 控制
     * 是否对 OPTION / TITLE 做特殊写入（OPTION 总是写 textContent，
     * TITLE 写 document.title），默认 true，使行为与多数面板一致。
     *
     * 各面板的本地 applyI18n 改为薄包装：构造 translate 回调后调用
     * window.applyI18n(root, translate, opts)。
     */
    function applyI18n(root, translate, opts) {
        if (typeof root === 'function' && typeof translate === 'undefined') {
            // 兼容无参调用形式：applyI18n() 等价于 applyI18n(document, t)
            translate = root;
            root = document;
        }
        root = root || document;
        translate = translate || function (k) { return k; };
        opts = opts || {};
        var optionTagSpecial = opts.optionTagSpecial !== false;
        var titleTagSpecial = opts.titleTagSpecial !== false;

        root.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            var text = translate(key);
            if (text && text !== key) {
                if (titleTagSpecial && el.tagName === 'TITLE') {
                    document.title = text;
                } else {
                    el.textContent = text;
                }
            }
        });
        root.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-ph');
            var text = translate(key);
            if (text && text !== key) {
                el.placeholder = text;
            }
        });
        root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-title');
            var text = translate(key);
            if (text && text !== key) {
                el.title = text;
            }
        });
    }

    window.bindDataActions = bindDataActions;
    window.applyI18n = applyI18n;
    window.escapeHtml = escapeHtml;
    window.__coerceActionArg = coerceArg;
})();
