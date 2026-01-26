// 嵌套块注释的自定义匹配工具

import type { RegExpLike } from "./TokenizerEngine"

const START = /\/\*/uy // matches: /*
const ANY_CHAR = /[\s\S]/uy // matches single character
const END = /\*\//uy // matches: */

// 专门用于匹配嵌套块注释（/* ... /* ... */ ... */）的自定义 RegExpLike 实现
export class NestedComment implements RegExpLike {
    public lastIndex = 0

    public exec(input: string): string[] | null {
        // 1. 变量初始化
        // 存储最终匹配到的完整嵌套注释文本
        let result = ""
        // 存储单次匹配结果
        let match: string | null
        // 嵌套层级计数器（核心：跟踪注释嵌套深度）
        let nestLevel = 0

        // 2. 第一步：必须先匹配注释起始标记 START（/*）
        if ((match = this.matchSection(START, input))) {
            // 匹配成功：将 /* 加入结果
            result += match
            // 嵌套层级 +1（进入第一层注释）
            nestLevel++
        } else {
            // 未匹配到起始标记，直接返回 null
            return null
        }

        // 3. 循环匹配：只要嵌套层级 > 0，就继续匹配（直到注释完全闭合）
        while (nestLevel > 0) {
            // 分支1：匹配新的嵌套注释起始（/*）,层级加深
            if ((match = this.matchSection(START, input))) {
                result += match
                nestLevel++
            }
            // 分支2：匹配嵌套注释结束（*/）,层级变浅
            else if ((match = this.matchSection(END, input))) {
                result += match
                nestLevel--
            }
            // 分支3：匹配任意单个字符,加入结果，继续推进
            else if ((match = this.matchSection(ANY_CHAR, input))) {
                result += match
            }
            // 分支4：所有匹配失败（如输入结束，注释未闭合）,返回 null
            else {
                return null
            }
        }

        // 4. 循环结束（nestLevel = 0，注释完全闭合）,返回匹配结果（兼容 RegExp.exec 格式）
        return [result]
    }

    private matchSection(regex: RegExp, input: string): string | null {
        // 关键：将正则的 lastIndex 与实例的 lastIndex 同步，确保从当前位置开始匹配
        regex.lastIndex = this.lastIndex
        const matches = regex.exec(input)
        if (matches) {
            // 匹配成功：更新实例 lastIndex，推进匹配进度
            this.lastIndex += matches[0].length
        }
        // 匹配成功返回文本，失败返回 null
        return matches ? matches[0] : null
    }
}
