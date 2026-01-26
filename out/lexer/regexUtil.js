"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WHITESPACE_REGEX = void 0;
exports.escapeRegExp = escapeRegExp;
exports.patternToRegex = patternToRegex;
exports.toCaseInsensitivePattern = toCaseInsensitivePattern;
exports.withDashes = withDashes;
exports.prefixesPattern = prefixesPattern;
// 特殊字符使用反斜杠进行转义，以便在正则表达式中使用它们字面值
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// 匹配任何空白字符（空格、制表符、换行符等）
exports.WHITESPACE_REGEX = /\s+/uy;
// 将给定的模式字符串转换为一个正则表达式对象，使用非捕获组和 "uy" 标志
function patternToRegex(pattern) {
    return new RegExp(`(?:${pattern})`, "uy");
}
// 做形如"ab" to "[Aa][Bb]"的转换
function toCaseInsensitivePattern(prefix) {
    return prefix
        .split("")
        .map((char) => / /gu.test(char)
        ? "\\s+"
        : `[${char.toUpperCase()}${char.toLowerCase()}]`)
        .join("");
}
// 生成一个允许模式重复出现并由连字符分隔的正则表达式模式
function withDashes(pattern) {
    return pattern + "(?:-" + pattern + ")*";
}
// 为「带前缀的引号 / 变量规则（PrefixedQuoteType）」生成「前缀匹配的正则字符串」
// 当requirePrefix = true的时候，转化 ["a", "b"] 为 "(?:[Aa]|[Bb]|)" or "(?:[Aa]|[Bb])"
function prefixesPattern({ prefixes, requirePrefix, }) {
    return `(?:${prefixes.map(toCaseInsensitivePattern).join("|")}${requirePrefix ? "" : "|"})`;
}
//# sourceMappingURL=regexUtil.js.map