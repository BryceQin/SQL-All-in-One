// 嵌套块注释的自定义匹配工具

import type { RegExpLike } from "./TokenizerEngine"

const START = /\/\*/uy // matches: /*

// 专门用于匹配嵌套块注释（/* ... /* ... */ ... */）的自定义 RegExpLike 实现
export class NestedComment implements RegExpLike {
    public lastIndex = 0

    public exec(input: string): string[] | null {
        // 1. 第一步：必须先匹配注释起始标记 START（/*）
        START.lastIndex = this.lastIndex
        const startMatch = START.exec(input)
        if (!startMatch) {
            return null
        }
        const startIndex = this.lastIndex
        let pos = this.lastIndex + startMatch[0].length
        let nestLevel = 1

        // 2. 循环匹配：只要嵌套层级 > 0，就继续匹配（直到注释完全闭合）
        //    使用 indexOf 批量跳过普通字符，避免逐字符正则匹配的开销。
        while (nestLevel > 0) {
            // 查找下一个可能的标记位置：/* 或 */
            const nextOpen = input.indexOf("/*", pos)
            const nextClose = input.indexOf("*/", pos)

            if (nextClose === -1) {
                // 未闭合的注释：与原实现一致，返回 null
                return null
            }

            if (nextOpen !== -1 && nextOpen < nextClose) {
                // 遇到嵌套注释起始 /*，层级加深
                nestLevel++
                pos = nextOpen + 2
            } else {
                // 遇到注释结束 */，层级变浅
                nestLevel--
                pos = nextClose + 2
            }
        }

        // 3. 循环结束（nestLevel = 0，注释完全闭合），更新 lastIndex 并返回匹配结果
        this.lastIndex = pos
        return [input.slice(startIndex, pos)]
    }
}
