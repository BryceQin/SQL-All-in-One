"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDialect = void 0;
const Tokenizer_1 = __importDefault(require("../lexer/Tokenizer"));
const cache = new Map();
const createDialect = (options) => {
    let dialect = cache.get(options);
    if (!dialect) {
        dialect = dialectFromOptions(options);
        cache.set(options, dialect);
    }
    return dialect;
};
exports.createDialect = createDialect;
const dialectFromOptions = (dialectOptions) => ({
    tokenizer: new Tokenizer_1.default(dialectOptions.tokenizerOptions, dialectOptions.name),
    formatOptions: processDialectFormatOptions(dialectOptions.formatOptions),
});
const processDialectFormatOptions = (options) => ({
    alwaysDenseOperators: options.alwaysDenseOperators || [],
    onelineClauses: Object.fromEntries(options.onelineClauses.map((name) => [name, true])),
    tabularOnelineClauses: Object.fromEntries((options.tabularOnelineClauses ?? options.onelineClauses).map((name) => [name, true])),
});
//# sourceMappingURL=dialect.js.map