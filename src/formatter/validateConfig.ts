// 配置合法性校验模块，作用是：对用户传入的格式化配置项 FormatOptions 做全方位的合规性、有效性校验，提前拦截非法配置、废弃配置、不合理配置，避免这些配置导致格式化逻辑运行时报错 / 出 bug / 行为异常
// 格式化配置的核心类型（所有可配置项）
import type { FormatOptions } from "./FormatOptions"
// SQL参数的合法类型（对象/数组）
import type { ParamItems } from "./Params"
// SQL参数的匹配规则类型
import type { ParamTypes } from "../lexer/TokenizerOptions"

// 自定义错误类
export class ConfigError extends Error {}

// 接收用户的格式化配置 → 执行全量校验 → 校验通过则返回原配置，校验失败则抛出 ConfigError 错误 / 控制台警告
export function validateConfig(cfg: FormatOptions): FormatOptions {
    const removedOptions = [
        "multilineLists",
        "newlineBeforeOpenParen",
        "newlineBeforeCloseParen",
        "aliasAs",
    ]
    // 校验规则 1：检测【废弃配置项】，发现则直接抛错
    for (const optionName of removedOptions) {
        if (optionName in cfg) {
            throw new ConfigError(`${optionName} 配置项已废弃。`)
        }
    }

    // 校验 expressionWidth 必须为正整数，非法则抛错
    if (cfg.expressionWidth <= 0) {
        throw new ConfigError(
            `expressionWidth 必须为正整数。当前传入的值为 ${cfg.expressionWidth}.`,
        )
    }
    // 校验 cfg.params 参数合法性，非法则【控制台警告】
    if (cfg.params && !validateParams(cfg.params)) {
        console.warn("警告：params 配置项的所有值都应为字符串类型。")
    }

    // 校验 cfg.paramTypes 参数规则合法性，非法则抛错
    if (cfg.paramTypes && !validateParamTypes(cfg.paramTypes)) {
        throw new ConfigError(
            "自定义 paramTypes 中传入了空的正则表达式，这将导致匹配出无限多个参数。",
        )
    }

    return cfg
}

// 校验 SQL 参数配置的值，是否全部为字符串类型
function validateParams(params: ParamItems | string[]): boolean {
    // 第一步：统一格式 - 无论入参是数组/对象，都转为「值的数组」
    const paramValues = params instanceof Array ? params : Object.values(params)
    // 第二步：全量校验 - 数组中每一个值，都必须是 string 类型
    return paramValues.every((p) => typeof p === "string")
}

// 校验 自定义参数匹配规则 中，是否包含空正则表达式
function validateParamTypes(paramTypes: ParamTypes): boolean {
    // 仅校验「自定义规则」：如果有自定义参数规则数组，且是数组格式
    if (paramTypes.custom && Array.isArray(paramTypes.custom)) {
        // 数组中每一项的 regex 属性，都不能是空字符串
        return paramTypes.custom.every((p) => p.regex !== "")
    }
    // 无自定义规则 → 校验通过
    return true
}
