"use strict";
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
const config_1 = require("./config");
const Params_1 = __importDefault(require("./Params"));
const createParser_1 = require("../parser/createParser");
const ExpressionFormatter_1 = __importDefault(require("./ExpressionFormatter"));
const Layout_1 = __importStar(require("./Layout"));
const Indentation_1 = __importDefault(require("./Indentation"));
/** Main formatter class that produces a final output string from list of tokens */
class Formatter {
    dialect;
    cfg;
    params;
    constructor(dialect, cfg) {
        this.dialect = dialect;
        this.cfg = cfg;
        this.params = new Params_1.default(this.cfg.params);
    }
    /**
     * Formats an SQL query.
     * @param query - The SQL query string to be formatted
     */
    format(query) {
        // 步骤1：解析SQL为AST
        const ast = this.parse(query);
        // 步骤2：格式化AST为文本
        const formattedQuery = this.formatAst(ast);
        // 步骤3：去除末尾多余空格/换行
        return formattedQuery.trimEnd();
    }
    parse(query) {
        return (0, createParser_1.createParser)(this.dialect.tokenizer).parse(query, this.cfg.paramTypes || {});
    }
    formatAst(statements) {
        return statements
            .map((stat) => this.formatStatement(stat)) // 格式化单条语句
            .join("\n".repeat(this.cfg.linesBetweenQueries + 1)); // 按配置拼接多条语句
    }
    formatStatement(statement) {
        // 步骤1：创建表达式格式化器，处理AST子节点
        const layout = new ExpressionFormatter_1.default({
            cfg: this.cfg,
            dialectCfg: this.dialect.formatOptions,
            params: this.params,
            layout: new Layout_1.default(new Indentation_1.default((0, config_1.indentString)(this.cfg))),
        }).format(statement.children);
        // 步骤2：处理分号（根据配置和语句是否含分号）
        if (!statement.hasSemicolon) {
            // 无分号则不处理
        }
        else if (this.cfg.newlineBeforeSemicolon) {
            layout.add(Layout_1.WS.NEWLINE, ";"); // 分号前换行（如 SELECT * FROM t\n;）
        }
        else {
            layout.add(Layout_1.WS.NO_NEWLINE, ";"); // 分号紧跟语句（如 SELECT * FROM t;）
        }
        return layout.toString(); // 布局对象转为字符串
    }
}
exports.default = Formatter;
//# sourceMappingURL=Formatter.js.map