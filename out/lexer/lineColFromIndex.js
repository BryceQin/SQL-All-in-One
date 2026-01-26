"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lineColFromIndex = lineColFromIndex;
// 源码字符索引到行号/列号的转换工具
function lineColFromIndex(source, index) {
    const lines = source.slice(0, index).split(/\n/);
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}
//# sourceMappingURL=lineColFromIndex.js.map