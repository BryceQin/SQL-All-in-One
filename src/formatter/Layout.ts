// 管理空白符（空格、换行、缩进）的核心类，通过「延迟拼接 + 指令化空白符操作」实现高效的空白符管理

import { last } from "../lexer/utils"

import Indentation from "./Indentation"

/** 是控制空白符行为的核心指令，所有空白符操作均通过该枚举触发 */
export const WS = Object.freeze({
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
} as const)

export type WS = (typeof WS)[keyof typeof WS]

export type LayoutItem =
    | (typeof WS)["SPACE"]
    | (typeof WS)["SINGLE_INDENT"]
    | (typeof WS)["NEWLINE"]
    | (typeof WS)["MANDATORY_NEWLINE"]
    | string
/**
 * API for constructing SQL string (especially the whitespace part).
 *
 * It hides the internal implementation.
 * Originally it used plain string concatenation, which was expensive.
 * Now it's storing items to array and builds the string only in the end.
//  */
export default class Layout {
    // 核心存储结构，按顺序存储「空白符指令 + SQL 文本」
    private items: LayoutItem[] = []

    // 缩进管理实例，提供「单个缩进字符串」和「当前缩进层级」
    public indentation: Indentation
    constructor(indentation: Indentation) {
        this.indentation = indentation
    }

    // Layout 类的核心入口，接收任意数量的「空白符指令」或「SQL 文本」，逐个处理并更新 items 数组
    public add(...items: (WS | string)[]) {
        for (const item of items) {
            switch (item) {
                case WS.SPACE:
                    this.items.push(WS.SPACE)
                    break
                case WS.NO_SPACE:
                    this.trimHorizontalWhitespace()
                    break
                case WS.NO_NEWLINE:
                    this.trimWhitespace()
                    break
                case WS.NEWLINE:
                    this.trimHorizontalWhitespace()
                    this.addNewline(WS.NEWLINE)
                    break
                case WS.MANDATORY_NEWLINE:
                    this.trimHorizontalWhitespace()
                    this.addNewline(WS.MANDATORY_NEWLINE)
                    break
                case WS.INDENT:
                    this.addIndentation()
                    break
                case WS.SINGLE_INDENT:
                    this.items.push(WS.SINGLE_INDENT)
                    break
                default:
                    this.items.push(item)
            }
        }
    }

    // 移除前置水平空白
    private trimHorizontalWhitespace() {
        while (isHorizontalWhitespace(last(this.items))) {
            this.items.pop()
        }
    }

    // 移除前置可移除空白
    private trimWhitespace() {
        while (isRemovableWhitespace(last(this.items))) {
            this.items.pop()
        }
    }

    // 确保换行的唯一性，且强制换行不可被覆盖
    private addNewline(
        newline: (typeof WS)["NEWLINE"] | (typeof WS)["MANDATORY_NEWLINE"],
    ) {
        if (this.items.length > 0) {
            switch (last(this.items)) {
                case WS.NEWLINE:
                    // 合并连续普通换行
                    this.items.pop()
                    this.items.push(newline)
                    break
                // 强制换行不可被覆盖
                case WS.MANDATORY_NEWLINE:
                    break
                default:
                    this.items.push(newline)
                    break
            }
        }
    }

    // 根据 Indentation 的当前层级，添加对应数量的 SINGLE_INDENT
    private addIndentation() {
        for (let i = 0; i < this.indentation.getLevel(); i++) {
            this.items.push(WS.SINGLE_INDENT)
        }
    }

    // 延迟拼接最终 SQL 字符串，将 LayoutItem 解析为实际字符
    public toString(): string {
        return this.items.map((item) => this.itemToString(item)).join("")
    }

    /**
     * Returns the internal layout data
     */
    public getLayoutItems(): LayoutItem[] {
        return this.items
    }

    private itemToString(item: LayoutItem): string {
        switch (item) {
            case WS.SPACE:
                return " "
            case WS.NEWLINE:
            case WS.MANDATORY_NEWLINE:
                return "\n"
            case WS.SINGLE_INDENT:
                return this.indentation.getSingleIndent()
            default:
                return item
        }
    }
}
// 判断是否为水平空白
const isHorizontalWhitespace = (item: WS | string | undefined) =>
    item === WS.SPACE || item === WS.SINGLE_INDENT

// 判断是否为可移除空白
const isRemovableWhitespace = (item: WS | string | undefined) =>
    item === WS.SPACE || item === WS.SINGLE_INDENT || item === WS.NEWLINE
