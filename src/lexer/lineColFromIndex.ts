export interface LineCol {
    line: number;
    col: number;
}
// 源码字符索引到行号/列号的转换工具
export function lineColFromIndex(source: string, index: number): LineCol {
    const lines = source.slice(0, index).split(/\n/);
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}
