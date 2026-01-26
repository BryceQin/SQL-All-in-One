"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dedupe = dedupe;
exports.last = last;
exports.sortByLengthDesc = sortByLengthDesc;
exports.maxLength = maxLength;
exports.equalizeWhitespace = equalizeWhitespace;
exports.isMultiline = isMultiline;
// 去除字符串数组中的重复元素
function dedupe(arr) {
    return [...new Set(arr)];
}
;
// 获取数组的最后一个元素
function last(arr) {
    return arr[arr.length - 1];
}
;
// 根据字符串的长度排序，长的排在前面
// 如果长度相同，则按字母顺序排序
function sortByLengthDesc(str) {
    return str.sort((a, b) => b.length - a.length || a.localeCompare(b));
}
;
// 获取字符串数组中最长字符串的长度
function maxLength(str) {
    return str.reduce((max, cur) => Math.max(max, cur.length), 0);
}
;
// 将字符串中的连续空白字符替换为单个空格
function equalizeWhitespace(str) {
    return str.replace(/\s+/gu, ' ');
}
;
// 检查字符串是否包含多行
function isMultiline(s) {
    return /\n/.test(s);
}
//# sourceMappingURL=utils.js.map