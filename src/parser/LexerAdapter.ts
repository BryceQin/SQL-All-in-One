import { lineColFromIndex } from "../lexer/lineColFromIndex"
import type { Token } from "../lexer/token"
import { TokenType } from "../lexer/token"

// 作用是将你自定义的 SQL 分词器（Tokenizer）封装成 Nearley（JavaScript/TypeScript 主流解析器生成器）要求的「标准词法分析器（Lexer）接口」，解决两者之间的接口不兼容和 Token 格式不匹配 问题，让 Nearley 解析器能直接调用你的自定义分词逻辑

// 适配 Nearley 的 Token 类型：自定义 Token + 额外的 value 字段（值与 text 一致）
type NearleyToken = Token & { value: string }

export default class LexerAdapter {
    // 当前读取到的 Token 下标（游标）
    private index = 0
    // 分词后的 Token 数组（缓存）
    private tokens: Token[] = []
    // 原始输入字符串（用于错误格式化时计算行列号）
    private input = ""

    // 构造函数：接收自定义分词器的 tokenize 方法（依赖注入，解耦）
    // 改写构造函数参数属性
    private tokenize: (chunk: string) => Token[]
    constructor(tokenize: (chunk: string) => Token[]) {
        this.tokenize = tokenize
    }

    // 获取最后一个 token
    get lastToken(): Token | undefined {
        return this.tokens[this.index - 1]
    }

    // 初始化 / 重置词法分析器
    reset(chunk: string) {
        // 保存原始输入（用于错误定位）
        this.input = chunk
        // 重置 Token 游标
        this.index = 0
        // 调用自定义分词器，生成 Token 数组并缓存
        this.tokens = this.tokenize(chunk)
    }

    // 获取下一个 Token
    next(): NearleyToken | undefined {
        // 读取当前游标位置的 Token，游标自增，同时类型断言为 NearleyToken
        return this.tokens[this.index++] as NearleyToken | undefined
    }

    save(): Record<string, unknown> {
        return {}
    }

    // 格式化解析错误信息
    formatError(token: NearleyToken) {
        // 根据 Token 的起始位置，计算其在原始输入中的行号和列号
        const { line, col } = lineColFromIndex(this.input, token.start)
        // 返回人性化的错误信息（包含 Token 文本、行号、列号）
        return `解析错误发生在: ${token.text} 行 ${line}， 列 ${col}`
    }

    // 检查 Token 类型是否存在
    has(name: string): boolean {
        // 检查传入的类型名是否存在于 TokenType 枚举/对象中
        return name in TokenType
    }
}
