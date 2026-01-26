"use strict";
// 专门用于格式化单行 SQL 表达式，核心限制是：不允许换行、表达式长度不超过配置的 expressionWidth，超出则抛出错误
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InlineLayoutError = void 0;
const Indentation_1 = __importDefault(require("./Indentation"));
const Layout_1 = __importStar(require("./Layout"));
class InlineLayout extends Layout_1.default {
    length = 0;
    // Keeps track of the trailing whitespace,
    // so that we can decrease length when encountering WS.NO_SPACE,
    // but only when there actually is a space to remove.
    trailingSpace = false;
    expressionWidth;
    constructor(expressionWidth) {
        super(new Indentation_1.default("")); // no indentation in inline layout
        this.expressionWidth = expressionWidth;
    }
    add(...items) {
        // 先遍历所有项，通过 addToLength 计算长度；
        items.forEach((item) => this.addToLength(item));
        // 若长度超过 expressionWidth，抛出 InlineLayoutError
        if (this.length > this.expressionWidth) {
            // We have exceeded the allowable width
            throw new InlineLayoutError();
        }
        // 最后调用父类 Layout 的 add 方法，完成内容拼接
        super.add(...items);
    }
    // 根据项的类型更新长度和尾随空格标记：
    addToLength(item) {
        // 普通字符串：直接累加长度，重置尾随空格标记
        if (typeof item === "string") {
            this.length += item.length;
            this.trailingSpace = false;
        }
        else if (item === Layout_1.WS.MANDATORY_NEWLINE || item === Layout_1.WS.NEWLINE) {
            // 换行符：禁止单行布局，直接抛错
            throw new InlineLayoutError();
        }
        else if (item === Layout_1.WS.INDENT ||
            item === Layout_1.WS.SINGLE_INDENT ||
            item === Layout_1.WS.SPACE) {
            // 缩进/空格：仅当无尾随空格时，长度+1，标记尾随空格
            if (!this.trailingSpace) {
                this.length++;
                this.trailingSpace = true;
            }
        }
        else if (item === Layout_1.WS.NO_NEWLINE || item === Layout_1.WS.NO_SPACE) {
            // 移除空格：仅当有尾随空格时，长度-1，重置尾随空格标记
            if (this.trailingSpace) {
                this.trailingSpace = false;
                this.length--;
            }
        }
    }
}
exports.default = InlineLayout;
/**
 * Thrown when block of SQL can't be formatted as a single line.
 */
class InlineLayoutError extends Error {
}
exports.InlineLayoutError = InlineLayoutError;
//# sourceMappingURL=InlineLayout.js.map