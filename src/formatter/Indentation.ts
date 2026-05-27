import { last } from "../lexer/utils"

const INDENT_TYPE_TOP_LEVEL = "top-level"
const INDENT_TYPE_BLOCK_LEVEL = "block-level"

/**
 * 缩进层级的核心管理类
 *
 * 两种缩进类型:
 *
 * - BLOCK_LEVEL,块级缩进 : 遇到左括号 (（如子查询、函数参数、JOIN 条件）时触发
 * - TOP_LEVEL,顶级缩进 : 遇到 RESERVED_CLAUSE 关键字（如 FROM/WHERE/GROUP BY）时触发
 */
export default class Indentation {
    // 栈结构，存储缩进类型（top-level/block-level），数组长度 = 当前总缩进层级
    private indentTypes: string[] = []

    // 单个缩进步骤的字符串（如 4 个空格、1 个制表符、10 个空格（tabular 风格））
    private indent: string
    constructor(indent: string) {
        this.indent = indent
    }

    // 返回「单个缩进步骤」的字符串（基础缩进单元）
    getSingleIndent(): string {
        return this.indent
    }

    // 返回当前总缩进层级（栈的长度）
    getLevel(): number {
        return this.indentTypes.length
    }

    // 重置缩进栈（用于缓存格式化器时在每次 format 调用前清理状态）
    reset() {
        this.indentTypes = []
    }

    // 增加一层「顶级缩进」
    increaseTopLevel() {
        this.indentTypes.push(INDENT_TYPE_TOP_LEVEL)
    }

    // 增加一层「块级缩进」
    increaseBlockLevel() {
        this.indentTypes.push(INDENT_TYPE_BLOCK_LEVEL)
    }

    // 移除最后一层「顶级缩进」（非顶级缩进则无操作）
    // 栈非空且栈顶是 top-level 时，弹出栈顶元素
    decreaseTopLevel() {
        if (
            this.indentTypes.length > 0 &&
            last(this.indentTypes) === INDENT_TYPE_TOP_LEVEL
        ) {
            this.indentTypes.pop()
        }
    }

    // 移除一层「块级缩进」，并清理块内所有嵌套的顶级缩进
    // 循环弹出栈顶元素，直到遇到非顶级缩进（即 block-level）或栈空，确保块级缩进关闭时，内部所有顶级缩进也被清理
    decreaseBlockLevel() {
        while (this.indentTypes.length > 0) {
            const type = this.indentTypes.pop()
            if (type !== INDENT_TYPE_TOP_LEVEL) {
                break
            }
        }
    }
}
