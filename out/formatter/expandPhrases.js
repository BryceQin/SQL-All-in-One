"use strict";
// SQL 语法描述解析器，核心作用是：将带特殊语法标记（[]可选块、{}必选块、|多选、嵌套块）的 SQL 语法描述字符串，解析并生成所有可能的语法组合字符串，最终输出格式规整（无多余空格）的组合数组
// 输入字符串 → 解析（parse）为抽象语法树（AST） → 生成所有组合（buildCombinations） → 清理空格 → 输出结果数组
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandSinglePhrase = exports.expandPhrases = void 0;
/**
 * Performs expandSinglePhrase() on array
 */
// 对字符串数组中的每个元素调用expandSinglePhrase，并用flatMap扁平化结果（避免二维数组）
const expandPhrases = (phrases) => phrases.flatMap(exports.expandSinglePhrase);
exports.expandPhrases = expandPhrases;
/**
 * Expands a syntax description like
 *
 *     "CREATE [OR REPLACE] [TEMP|TEMPORARY] TABLE"
 *
 * into an array of all possible combinations like:
 *
 *     [ "CREATE TABLE",
 *       "CREATE TEMP TABLE",
 *       "CREATE TEMPORARY TABLE",
 *       "CREATE OR REPLACE TABLE",
 *       "CREATE OR REPLACE TEMP TABLE",
 *       "CREATE OR REPLACE TEMPORARY TABLE" ]
 *
 */
const expandSinglePhrase = (phrase) => buildCombinations(parsePhrase(phrase)).map(stripExtraWhitespace);
exports.expandSinglePhrase = expandSinglePhrase;
// 空格清理
// 正则/ +/g：匹配 1 个及以上空格，替换为单个空格
// .trim()：去除首尾空格
const stripExtraWhitespace = (text) => text.replace(/ +/g, ' ').trim();
// 将输入字符串解析为 AST（由Phrase类型节点组成）
const parsePhrase = (text) => ({
    type: 'mandatory_block',
    items: parseAlteration(text, 0)[0]
});
// 处理「多选（|）」逻辑
const parseAlteration = (text, index, expectClosing) => {
    const alterations = [];
    while (text[index]) {
        // 解析单个子项（拼接块/必选块/可选块/纯文本）
        const [term, newIndex] = parseConcatenation(text, index);
        alterations.push(term);
        index = newIndex;
        // 遇到|：继续解析下一个多选项
        if (text[index] === '|') {
            index++;
        }
        // 遇到闭合括号：检查括号平衡，返回结果
        else if (text[index] === '}' || text[index] === ']') {
            if (expectClosing !== text[index]) {
                throw new Error(`未闭合的括号: ${text}`);
            }
            index++;
            return [alterations, index];
        }
        // 字符串结束：检查是否有未闭合的括号
        else if (index === text.length) {
            if (expectClosing) {
                throw new Error(`未闭合的括号: ${text}`);
            }
            return [alterations, index];
        }
        // 未知字符：抛错
        else {
            throw new Error(`未知字符 "${text[index]}"`);
        }
    }
    return [alterations, index];
};
// 处理「拼接」逻辑
const parseConcatenation = (text, index) => {
    const items = [];
    while (true) {
        const [term, newIndex] = parseTerm(text, index);
        if (term) {
            // 解析到有效子项
            items.push(term);
            index = newIndex;
        }
        else {
            // 无有效子项，终止循环
            break;
        }
    }
    // 单个子项直接返回，多个子项包装为Concatenation
    return items.length === 1
        ? [items[0], index]
        : [{ type: 'concatenation', items }, index];
};
// 解析「最小单元」
const parseTerm = (text, index) => {
    // 必选块 {}
    if (text[index] === '{') {
        return parseMandatoryBlock(text, index + 1);
    }
    // 可选块 []
    else if (text[index] === '[') {
        return parseOptionalBlock(text, index + 1);
    }
    // 纯文本（字母、数字、下划线、空格）
    else {
        let word = '';
        while (text[index] && /[A-Za-z0-9_ ]/.test(text[index])) {
            word += text[index];
            index++;
        }
        return [word, index];
    }
};
// 解析块级节点
// 解析必选块 { ... }，预期闭合符为 }
const parseMandatoryBlock = (text, index) => {
    const [items, newIndex] = parseAlteration(text, index, '}');
    return [{ type: 'mandatory_block', items }, newIndex];
};
// 解析可选块 [ ... ]，预期闭合符为 ]
const parseOptionalBlock = (text, index) => {
    const [items, newIndex] = parseAlteration(text, index, ']');
    return [{ type: 'optional_block', items }, newIndex];
};
// 递归遍历 AST，生成所有可能的字符串组合
const buildCombinations = (node) => {
    // 纯文本节点：直接返回自身
    if (typeof node === 'string') {
        return [node];
    }
    // 拼接块：子项组合的笛卡尔积（如A的组合 × B的组合）
    else if (node.type === 'concatenation') {
        return node.items
            .map(buildCombinations)
            .reduce(stringCombinations, ['']);
    }
    // 必选块：扁平化子项的组合（必须选一个，无空选项）
    else if (node.type === 'mandatory_block') {
        return node.items.flatMap(buildCombinations);
    }
    // 可选块：空字符串 + 子项的组合（可选，可跳过）
    else if (node.type === 'optional_block') {
        return ['', ...node.items.flatMap(buildCombinations)];
    }
    // 未知节点：抛错
    else {
        throw new Error(`未知节点类型: ${node}`);
    }
};
// 笛卡尔积实现
const stringCombinations = (xs, ys) => {
    const results = [];
    for (const x of xs) {
        for (const y of ys) {
            results.push(x + y);
        }
    }
    return results;
};
//# sourceMappingURL=expandPhrases.js.map