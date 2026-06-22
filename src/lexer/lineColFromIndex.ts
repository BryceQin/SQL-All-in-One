import { precomputeLineStarts, lineFromOffset } from '../utils/lineIndex';

export interface LineCol {
    line: number;
    col: number;
}

/**
 * Compute 1-based line and column for `index` in `source` using a linear scan.
 *
 * This is O(n) per call. When multiple lookups are needed on the same text,
 * prefer {@link lineColFromIndexFast} with a precomputed line-starts array
 * (O(log n) per lookup).
 */
export function lineColFromIndex(source: string, index: number): LineCol {
    let line = 1;
    let lastNewline = -1;
    const limit = Math.min(index, source.length);
    for (let i = 0; i < limit; i++) {
        if (source.charCodeAt(i) === 10) {
            line++;
            lastNewline = i;
        }
    }
    return { line, col: index - lastNewline };
}

/**
 * Precompute line-start offsets for use with {@link lineColFromIndexFast}.
 * Re-exports the shared implementation from utils/lineIndex so callers have a
 * single lexical entry point.
 */
export const precomputeLineOffsets = precomputeLineStarts;

/**
 * Compute 1-based line and column for `index` using a precomputed line-starts
 * array (from {@link precomputeLineOffsets}). Uses binary search for O(log n)
 * lookup, which is significantly faster than the linear scan in
 * {@link lineColFromIndex} when many lookups are needed.
 *
 * The returned `col` is 1-based and matches the semantics of
 * {@link lineColFromIndex}: a newline character belongs to the preceding line.
 */
export function lineColFromIndexFast(
    lineStarts: number[],
    index: number,
): LineCol {
    // lineFromOffset returns the 1-based line number whose start offset is the
    // greatest value <= index. For an index pointing exactly at a newline
    // character, lineFromOffset treats it as part of the current line (start
    // offset <= index), which matches lineColFromIndex semantics.
    const line = lineFromOffset(lineStarts, index);
    const lineStart = lineStarts[line - 1];
    return { line, col: index - lineStart + 1 };
}
