"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEditorText = formatEditorText;
const sqlFormatter_1 = require("./formatter/sqlFormatter");
function formatEditorText(text, config) {
    return (0, sqlFormatter_1.format)(text, config) + (endsWithNewline(text) ? "\n" : "");
}
const endsWithNewline = (text) => /\n$/.test(text);
//# sourceMappingURL=formatEditorText.js.map