"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeType = void 0;
exports.NodeType = {
    // // SQL 语句（如 SELECT * FROM user;）
    statement: "statement",
    // 子句（如 FROM user、WHERE id=1）
    clause: "clause",
    set_operation: "set_operation",
    function_call: "function_call",
    parameterized_data_type: "parameterized_data_type",
    array_subscript: "array_subscript",
    property_access: "property_access",
    parenthesis: "parenthesis",
    between_predicate: "between_predicate",
    case_expression: "case_expression",
    case_when: "case_when",
    case_else: "case_else",
    limit_clause: "limit_clause",
    all_columns_asterisk: "all_columns_asterisk",
    literal: "literal",
    identifier: "identifier",
    keyword: "keyword",
    data_type: "data_type",
    parameter: "parameter",
    operator: "operator",
    comma: "comma",
    line_comment: "line_comment",
    block_comment: "block_comment",
    disable_comment: "disable_comment",
};
//# sourceMappingURL=ast.js.map