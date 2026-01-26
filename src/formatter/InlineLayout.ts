// 专门用于格式化单行 SQL 表达式，核心限制是：不允许换行、表达式长度不超过配置的 expressionWidth，超出则抛出错误

import Indentation from "./Indentation"
import Layout, { WS } from "./Layout"

export default class InlineLayout extends Layout {
    private length = 0
    // Keeps track of the trailing whitespace,
    // so that we can decrease length when encountering WS.NO_SPACE,
    // but only when there actually is a space to remove.
    private trailingSpace = false
    private expressionWidth: number

    constructor(expressionWidth: number) {
        super(new Indentation("")) // no indentation in inline layout
        this.expressionWidth = expressionWidth
    }

    public add(...items: (WS | string)[]) {
        // 先遍历所有项，通过 addToLength 计算长度；
        items.forEach((item) => this.addToLength(item))
        // 若长度超过 expressionWidth，抛出 InlineLayoutError
        if (this.length > this.expressionWidth) {
            // We have exceeded the allowable width
            throw new InlineLayoutError()
        }
        // 最后调用父类 Layout 的 add 方法，完成内容拼接
        super.add(...items)
    }

    // 根据项的类型更新长度和尾随空格标记：
    private addToLength(item: WS | string) {
        // 普通字符串：直接累加长度，重置尾随空格标记
        if (typeof item === "string") {
            this.length += item.length
            this.trailingSpace = false
        } else if (item === WS.MANDATORY_NEWLINE || item === WS.NEWLINE) {
            // 换行符：禁止单行布局，直接抛错
            throw new InlineLayoutError()
        } else if (
            item === WS.INDENT ||
            item === WS.SINGLE_INDENT ||
            item === WS.SPACE
        ) {
            // 缩进/空格：仅当无尾随空格时，长度+1，标记尾随空格
            if (!this.trailingSpace) {
                this.length++
                this.trailingSpace = true
            }
        } else if (item === WS.NO_NEWLINE || item === WS.NO_SPACE) {
            // 移除空格：仅当有尾随空格时，长度-1，重置尾随空格标记
            if (this.trailingSpace) {
                this.trailingSpace = false
                this.length--
            }
        }
    }
}

/**
 * Thrown when block of SQL can't be formatted as a single line.
 */
export class InlineLayoutError extends Error {}
