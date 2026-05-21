"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigError = void 0;
exports.validateConfig = validateConfig;
const i18n_1 = require("../i18n");
// 自定义错误类
class ConfigError extends Error {
}
exports.ConfigError = ConfigError;
// 接收用户的格式化配置 → 执行全量校验 → 校验通过则返回原配置，校验失败则抛出 ConfigError 错误 / 控制台警告
function validateConfig(cfg) {
    const removedOptions = [
        "multilineLists",
        "newlineBeforeOpenParen",
        "newlineBeforeCloseParen",
        "aliasAs",
    ];
    // 校验规则 1：检测【废弃配置项】，发现则直接抛错
    for (const optionName of removedOptions) {
        if (optionName in cfg) {
            throw new ConfigError((0, i18n_1.t)('validate.deprecated', optionName));
        }
    }
    // 校验 expressionWidth 必须为正整数，非法则抛错
    if (cfg.expressionWidth <= 0) {
        throw new ConfigError((0, i18n_1.t)('validate.expressionWidthPositive', String(cfg.expressionWidth)));
    }
    // 校验 cfg.params 参数合法性，非法则【控制台警告】
    if (cfg.params && !validateParams(cfg.params)) {
        console.warn((0, i18n_1.t)('validate.paramsStringType'));
    }
    // 校验 cfg.paramTypes 参数规则合法性，非法则抛错
    if (cfg.paramTypes && !validateParamTypes(cfg.paramTypes)) {
        throw new ConfigError((0, i18n_1.t)('validate.emptyParamRegex'));
    }
    return cfg;
}
// 校验 SQL 参数配置的值，是否全部为字符串类型
function validateParams(params) {
    // 第一步：统一格式 - 无论入参是数组/对象，都转为「值的数组」
    const paramValues = params instanceof Array ? params : Object.values(params);
    // 第二步：全量校验 - 数组中每一个值，都必须是 string 类型
    return paramValues.every((p) => typeof p === "string");
}
// 校验 自定义参数匹配规则 中，是否包含空正则表达式
function validateParamTypes(paramTypes) {
    // 仅校验「自定义规则」：如果有自定义参数规则数组，且是数组格式
    if (paramTypes.custom && Array.isArray(paramTypes.custom)) {
        // 数组中每一项的 regex 属性，都不能是空字符串，且必须是合法正则
        return paramTypes.custom.every((p) => {
            if (!p.regex || p.regex === "")
                return false;
            try {
                new RegExp(p.regex);
                return true;
            }
            catch {
                return false;
            }
        });
    }
    // 无自定义规则 → 校验通过
    return true;
}
//# sourceMappingURL=validateConfig.js.map