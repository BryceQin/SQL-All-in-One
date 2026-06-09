"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../lexer/utils");
const INDENT_TYPE_TOP_LEVEL = "top-level";
const INDENT_TYPE_BLOCK_LEVEL = "block-level";
class Indentation {
    indentTypes = [];
    indent;
    constructor(indent) {
        this.indent = indent;
    }
    getSingleIndent() {
        return this.indent;
    }
    getLevel() {
        return this.indentTypes.length;
    }
    reset() {
        this.indentTypes = [];
    }
    increaseTopLevel() {
        this.indentTypes.push(INDENT_TYPE_TOP_LEVEL);
    }
    increaseBlockLevel() {
        this.indentTypes.push(INDENT_TYPE_BLOCK_LEVEL);
    }
    decreaseTopLevel() {
        if (this.indentTypes.length > 0 &&
            (0, utils_1.last)(this.indentTypes) === INDENT_TYPE_TOP_LEVEL) {
            this.indentTypes.pop();
        }
    }
    decreaseBlockLevel() {
        while (this.indentTypes.length > 0) {
            const type = this.indentTypes.pop();
            if (type !== INDENT_TYPE_TOP_LEVEL) {
                break;
            }
        }
    }
}
exports.default = Indentation;
//# sourceMappingURL=Indentation.js.map