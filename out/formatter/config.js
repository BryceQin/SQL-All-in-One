"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indentString = indentString;
exports.isTabularStyle = isTabularStyle;
/**
 * 生成单个缩进步骤的字符串
 */
function indentString(cfg) {
    if (cfg.indentStyle === 'tabularLeft' ||
        cfg.indentStyle === 'tabularRight') {
        return ' '.repeat(10);
    }
    if (cfg.useTabs) {
        return '\t';
    }
    return ' '.repeat(cfg.tabWidth);
}
/**
 * 判断当前缩进风格是否为表格风格
 */
function isTabularStyle(cfg) {
    return (cfg.indentStyle === 'tabularLeft' || cfg.indentStyle === 'tabularRight');
}
//# sourceMappingURL=config.js.map