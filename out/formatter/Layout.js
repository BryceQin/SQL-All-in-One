"use strict";
// 管理空白符（空格、换行、缩进）的核心类，通过「延迟拼接 + 指令化空白符操作」实现高效的空白符管理
Object.defineProperty(exports, "__esModule", { value: true });
exports.WS = void 0;
const utils_1 = require("../lexer/utils");
/** 是控制空白符行为的核心指令，所有空白符操作均通过该枚举触发 */
exports.WS = Object.freeze({
    // 单个空格,向 items 中添加 SPACE 标记
    SPACE: 0,
    // 移除前置水平空白,循环弹出 items 末尾的水平空白（SPACE/SINGLE_INDENT）
    NO_SPACE: 1,
    // 移除前置所有可移除空白,循环弹出 items 末尾的可移除空白（SPACE/SINGLE_INDENT/NEWLINE），但保留 MANDATORY_NEWLINE
    NO_NEWLINE: 2,
    // 单个换行（可被移除）,先移除前置水平空白，再添加 NEWLINE（若已有 NEWLINE 则替换，已有 MANDATORY_NEWLINE 则保留）
    NEWLINE: 3,
    // 强制换行（不可被移除）,逻辑同 NEWLINE，但标记为 “强制”，NO_NEWLINE 无法移除
    MANDATORY_NEWLINE: 4,
    // 完整缩进（当前层级）,根据 Indentation 的层级，添加对应数量的 SINGLE_INDENT
    INDENT: 5,
    // 单个缩进步骤,向 items 中添加 SINGLE_INDENT 标记
    SINGLE_INDENT: 6,
});
/**
 * API for constructing SQL string (especially the whitespace part).
 *
 * It hides the internal implementation.
 * Originally it used plain string concatenation, which was expensive.
 * Now it's storing items to array and builds the string only in the end.
//  */
class Layout {
    // 核心存储结构，按顺序存储「空白符指令 + SQL 文本」
    items = [];
    // 缩进管理实例，提供「单个缩进字符串」和「当前缩进层级」
    indentation;
    constructor(indentation) {
        this.indentation = indentation;
    }
    // Layout 类的核心入口，接收任意数量的「空白符指令」或「SQL 文本」，逐个处理并更新 items 数组
    add(...items) {
        for (const item of items) {
            switch (item) {
                case exports.WS.SPACE:
                    this.items.push(exports.WS.SPACE);
                    break;
                case exports.WS.NO_SPACE:
                    this.trimHorizontalWhitespace();
                    break;
                case exports.WS.NO_NEWLINE:
                    this.trimWhitespace();
                    break;
                case exports.WS.NEWLINE:
                    this.trimHorizontalWhitespace();
                    this.addNewline(exports.WS.NEWLINE);
                    break;
                case exports.WS.MANDATORY_NEWLINE:
                    this.trimHorizontalWhitespace();
                    this.addNewline(exports.WS.MANDATORY_NEWLINE);
                    break;
                case exports.WS.INDENT:
                    this.addIndentation();
                    break;
                case exports.WS.SINGLE_INDENT:
                    this.items.push(exports.WS.SINGLE_INDENT);
                    break;
                default:
                    this.items.push(item);
            }
        }
    }
    // 移除前置水平空白
    trimHorizontalWhitespace() {
        while (isHorizontalWhitespace((0, utils_1.last)(this.items))) {
            this.items.pop();
        }
    }
    // 移除前置可移除空白
    trimWhitespace() {
        while (isRemovableWhitespace((0, utils_1.last)(this.items))) {
            this.items.pop();
        }
    }
    // 确保换行的唯一性，且强制换行不可被覆盖
    addNewline(newline) {
        if (this.items.length > 0) {
            switch ((0, utils_1.last)(this.items)) {
                case exports.WS.NEWLINE:
                    // 合并连续普通换行
                    this.items.pop();
                    this.items.push(newline);
                    break;
                // 强制换行不可被覆盖
                case exports.WS.MANDATORY_NEWLINE:
                    break;
                default:
                    this.items.push(newline);
                    break;
            }
        }
    }
    // 根据 Indentation 的当前层级，添加对应数量的 SINGLE_INDENT
    addIndentation() {
        for (let i = 0; i < this.indentation.getLevel(); i++) {
            this.items.push(exports.WS.SINGLE_INDENT);
        }
    }
    // 延迟拼接最终 SQL 字符串，将 LayoutItem 解析为实际字符
    toString() {
        return this.items.map((item) => this.itemToString(item)).join("");
    }
    /**
     * Returns the internal layout data
     */
    getLayoutItems() {
        return this.items;
    }
    itemToString(item) {
        switch (item) {
            case exports.WS.SPACE:
                return " ";
            case exports.WS.NEWLINE:
            case exports.WS.MANDATORY_NEWLINE:
                return "\n";
            case exports.WS.SINGLE_INDENT:
                return this.indentation.getSingleIndent();
            default:
                return item;
        }
    }
}
exports.default = Layout;
// 判断是否为水平空白
const isHorizontalWhitespace = (item) => item === exports.WS.SPACE || item === exports.WS.SINGLE_INDENT;
// 判断是否为可移除空白
const isRemovableWhitespace = (item) => item === exports.WS.SPACE || item === exports.WS.SINGLE_INDENT || item === exports.WS.NEWLINE;
//# sourceMappingURL=Layout.js.map