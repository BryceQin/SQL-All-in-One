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
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../lexer/utils");
const config_1 = require("./config");
const token_1 = require("../lexer/token");
const ast_1 = require("../parser/ast");
const Layout_1 = require("./Layout");
const tabularStyle_1 = __importStar(require("./tabularStyle"));
const InlineLayout_1 = __importStar(require("./InlineLayout"));
/** Formats a generic SQL expression */
class ExpressionFormatter {
    cfg;
    dialectCfg;
    params;
    layout;
    inline = false;
    nodes = [];
    index = -1;
    constructor({ cfg, dialectCfg, params, layout, inline = false, }) {
        this.cfg = cfg;
        this.dialectCfg = dialectCfg;
        this.inline = inline;
        this.params = params;
        this.layout = layout;
    }
    findCurrentGroupStart(result) {
        for (let i = result.length - 1; i >= 0; i--) {
            if (result[i].type === ast_1.NodeType.comma) {
                if (i + 1 < result.length) {
                    return i + 1;
                }
                return -1;
            }
        }
        return result.length > 0 ? 0 : -1;
    }
    reorganizeComments(nodes) {
        const result = [];
        let pendingCommentsForGroup = [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.type === ast_1.NodeType.line_comment || node.type === ast_1.NodeType.block_comment || node.type === ast_1.NodeType.disable_comment) {
                const nextNonCommentIdx = this.findNextNonCommentIndexFromOriginal(nodes, i + 1);
                const isBeforeComma = nextNonCommentIdx !== -1 && nodes[nextNonCommentIdx].type === ast_1.NodeType.comma;
                const isLastInGroup = nextNonCommentIdx === -1;
                const isAfterCommaInResult = this.isAfterCommaInResult(result) && nextNonCommentIdx !== -1 && nodes[nextNonCommentIdx].type !== ast_1.NodeType.comma;
                if (isBeforeComma || isLastInGroup || isAfterCommaInResult) {
                    const groupStartIdx = this.findCurrentGroupStart(result);
                    if (groupStartIdx !== -1) {
                        const targetNode = result[groupStartIdx];
                        const existingLeading = targetNode.leadingComments || [];
                        result[groupStartIdx] = { ...targetNode, leadingComments: [...existingLeading, node] };
                    }
                    else {
                        pendingCommentsForGroup.push(node);
                    }
                }
                else {
                    result.push(node);
                }
            }
            else if (node.type === ast_1.NodeType.comma) {
                result.push(node);
            }
            else {
                if (pendingCommentsForGroup.length > 0) {
                    const existingLeading = node.leadingComments || [];
                    result.push({ ...node, leadingComments: [...pendingCommentsForGroup, ...existingLeading] });
                    pendingCommentsForGroup = [];
                }
                else {
                    result.push(node);
                }
            }
        }
        if (pendingCommentsForGroup.length > 0) {
            result.push(...pendingCommentsForGroup);
        }
        return result;
    }
    isAfterCommaInResult(result) {
        if (result.length === 0)
            return false;
        for (let i = result.length - 1; i >= 0; i--) {
            if (result[i].type === ast_1.NodeType.comma)
                return true;
            if (result[i].type !== ast_1.NodeType.line_comment && result[i].type !== ast_1.NodeType.block_comment && result[i].type !== ast_1.NodeType.disable_comment) {
                return false;
            }
        }
        return false;
    }
    findNextNonCommentIndexFromOriginal(nodes, startIdx) {
        for (let i = startIdx; i < nodes.length; i++) {
            const t = nodes[i].type;
            if (t !== ast_1.NodeType.line_comment && t !== ast_1.NodeType.block_comment && t !== ast_1.NodeType.disable_comment) {
                return i;
            }
        }
        return -1;
    }
    // 格式化入口，遍历所有 AST 节点并分发到对应格式化逻辑
    format(nodes) {
        this.nodes = this.reorganizeComments(nodes);
        for (this.index = 0; this.index < this.nodes.length; this.index++) {
            this.formatNode(this.nodes[this.index]);
        }
        return this.layout;
    }
    // 节点格式化的外层逻辑，先处理注释，再格式化节点本身：
    formatNode(node) {
        this.formatComments(node.leadingComments, true); // 前置注释
        this.formatNodeWithoutComments(node); // 核心节点逻辑（无注释）
        this.formatComments(node.trailingComments, false); // 后置注释
    }
    // 节点类型分发:根据 AST 节点类型（如函数调用、括号、子句、运算符等），分发到专属格式化方法
    formatNodeWithoutComments(node) {
        switch (node.type) {
            case ast_1.NodeType.function_call:
                return this.formatFunctionCall(node);
            case ast_1.NodeType.parameterized_data_type:
                return this.formatParameterizedDataType(node);
            case ast_1.NodeType.array_subscript:
                return this.formatArraySubscript(node);
            case ast_1.NodeType.property_access:
                return this.formatPropertyAccess(node);
            case ast_1.NodeType.parenthesis:
                return this.formatParenthesis(node);
            case ast_1.NodeType.between_predicate:
                return this.formatBetweenPredicate(node);
            case ast_1.NodeType.case_expression:
                return this.formatCaseExpression(node);
            case ast_1.NodeType.case_when:
                return this.formatCaseWhen(node);
            case ast_1.NodeType.case_else:
                return this.formatCaseElse(node);
            case ast_1.NodeType.clause:
                return this.formatClause(node);
            case ast_1.NodeType.set_operation:
                return this.formatSetOperation(node);
            case ast_1.NodeType.limit_clause:
                return this.formatLimitClause(node);
            case ast_1.NodeType.all_columns_asterisk:
                return this.formatAllColumnsAsterisk(node);
            case ast_1.NodeType.literal:
                return this.formatLiteral(node);
            case ast_1.NodeType.identifier:
                return this.formatIdentifier(node);
            case ast_1.NodeType.parameter:
                return this.formatParameter(node);
            case ast_1.NodeType.operator:
                return this.formatOperator(node);
            case ast_1.NodeType.comma:
                return this.formatComma(node);
            case ast_1.NodeType.line_comment:
                return this.formatLineComment(node);
            case ast_1.NodeType.block_comment:
                return this.formatBlockComment(node);
            case ast_1.NodeType.disable_comment:
                return this.formatBlockComment(node);
            case ast_1.NodeType.data_type:
                return this.formatDataType(node);
            case ast_1.NodeType.keyword:
                return this.formatKeywordNode(node);
        }
    }
    formatFunctionCall(node) {
        this.withComments(node.nameKw, () => {
            this.layout.add(this.showFunctionKw(node.nameKw));
        });
        this.formatNode(node.parenthesis);
    }
    formatParameterizedDataType(node) {
        this.withComments(node.dataType, () => {
            this.layout.add(this.showDataType(node.dataType));
        });
        this.formatNode(node.parenthesis);
    }
    formatArraySubscript(node) {
        let formattedArray;
        switch (node.array.type) {
            case ast_1.NodeType.data_type:
                formattedArray = this.showDataType(node.array);
                break;
            case ast_1.NodeType.keyword:
                formattedArray = this.showKw(node.array);
                break;
            default:
                formattedArray = this.showIdentifier(node.array);
                break;
        }
        this.withComments(node.array, () => {
            this.layout.add(formattedArray);
        });
        this.formatNode(node.parenthesis);
    }
    formatPropertyAccess(node) {
        this.formatNode(node.object);
        this.layout.add(Layout_1.WS.NO_SPACE, node.operator);
        this.formatNode(node.property);
    }
    formatParenthesis(node) {
        const inlineLayout = this.formatInlineExpression(node.children);
        if (inlineLayout) {
            this.layout.add(node.openParen);
            this.layout.add(...inlineLayout.getLayoutItems());
            this.layout.add(Layout_1.WS.NO_SPACE, node.closeParen, Layout_1.WS.SPACE);
        }
        else {
            this.layout.add(node.openParen, Layout_1.WS.NEWLINE);
            if ((0, config_1.isTabularStyle)(this.cfg)) {
                this.layout.add(Layout_1.WS.INDENT);
                this.layout = this.formatSubExpression(node.children);
            }
            else {
                this.layout.indentation.increaseBlockLevel();
                this.layout.add(Layout_1.WS.INDENT);
                this.layout = this.formatSubExpression(node.children);
                this.layout.indentation.decreaseBlockLevel();
            }
            this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, node.closeParen, Layout_1.WS.SPACE);
        }
    }
    formatBetweenPredicate(node) {
        this.layout.add(this.showKw(node.betweenKw), Layout_1.WS.SPACE);
        this.layout = this.formatSubExpression(node.expr1);
        this.layout.add(Layout_1.WS.NO_SPACE, Layout_1.WS.SPACE, this.showNonTabularKw(node.andKw), Layout_1.WS.SPACE);
        this.layout = this.formatSubExpression(node.expr2);
        this.layout.add(Layout_1.WS.SPACE);
    }
    formatCaseExpression(node) {
        this.formatNode(node.caseKw);
        this.layout.indentation.increaseBlockLevel();
        this.layout = this.formatSubExpression(node.expr);
        this.layout = this.formatSubExpression(node.clauses);
        this.layout.indentation.decreaseBlockLevel();
        this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT);
        this.formatNode(node.endKw);
    }
    formatCaseWhen(node) {
        this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT);
        this.formatNode(node.whenKw);
        this.layout = this.formatSubExpression(node.condition);
        this.formatNode(node.thenKw);
        this.layout = this.formatSubExpression(node.result);
    }
    formatCaseElse(node) {
        this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT);
        this.formatNode(node.elseKw);
        this.layout = this.formatSubExpression(node.result);
    }
    formatClause(node) {
        if (this.isOnelineClause(node)) {
            this.formatClauseInOnelineStyle(node);
        }
        else if ((0, config_1.isTabularStyle)(this.cfg)) {
            this.formatClauseInTabularStyle(node);
        }
        else {
            this.formatClauseInIndentedStyle(node);
        }
    }
    isOnelineClause(node) {
        if ((0, config_1.isTabularStyle)(this.cfg)) {
            return this.dialectCfg.tabularOnelineClauses[node.nameKw.text];
        }
        else {
            return this.dialectCfg.onelineClauses[node.nameKw.text];
        }
    }
    formatClauseInIndentedStyle(node) {
        this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, this.showKw(node.nameKw), Layout_1.WS.NEWLINE);
        this.layout.indentation.increaseTopLevel();
        this.layout.add(Layout_1.WS.INDENT);
        this.layout = this.formatSubExpression(node.children);
        this.layout.indentation.decreaseTopLevel();
    }
    formatClauseInOnelineStyle(node) {
        this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, this.showKw(node.nameKw), Layout_1.WS.SPACE);
        this.layout = this.formatSubExpression(node.children);
    }
    formatClauseInTabularStyle(node) {
        this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, this.showKw(node.nameKw), Layout_1.WS.SPACE);
        this.layout.indentation.increaseTopLevel();
        this.layout = this.formatSubExpression(node.children);
        this.layout.indentation.decreaseTopLevel();
    }
    formatSetOperation(node) {
        this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, this.showKw(node.nameKw), Layout_1.WS.NEWLINE);
        this.layout.add(Layout_1.WS.INDENT);
        this.layout = this.formatSubExpression(node.children);
    }
    formatLimitClause(node) {
        this.withComments(node.limitKw, () => {
            this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, this.showKw(node.limitKw));
        });
        this.layout.indentation.increaseTopLevel();
        if ((0, config_1.isTabularStyle)(this.cfg)) {
            this.layout.add(Layout_1.WS.SPACE);
        }
        else {
            this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT);
        }
        if (node.offset) {
            this.layout = this.formatSubExpression(node.offset);
            this.layout.add(Layout_1.WS.NO_SPACE, ",", Layout_1.WS.SPACE);
            this.layout = this.formatSubExpression(node.count);
        }
        else {
            this.layout = this.formatSubExpression(node.count);
        }
        this.layout.indentation.decreaseTopLevel();
    }
    formatAllColumnsAsterisk(_node) {
        void _node;
        this.layout.add("*", Layout_1.WS.SPACE);
    }
    formatLiteral(node) {
        this.layout.add(node.text, Layout_1.WS.SPACE);
    }
    formatIdentifier(node) {
        this.layout.add(this.showIdentifier(node), Layout_1.WS.SPACE);
    }
    formatParameter(node) {
        this.layout.add(this.params.get(node), Layout_1.WS.SPACE);
    }
    formatOperator({ text }) {
        if (this.cfg.denseOperators ||
            this.dialectCfg.alwaysDenseOperators.includes(text)) {
            this.layout.add(Layout_1.WS.NO_SPACE, text);
        }
        else if (text === ":") {
            this.layout.add(Layout_1.WS.NO_SPACE, text, Layout_1.WS.SPACE);
        }
        else {
            this.layout.add(text, Layout_1.WS.SPACE);
        }
    }
    formatComma(_node) {
        void _node;
        if (!this.inline) {
            const nextNode = this.nodes[this.index + 1];
            const hasNextLeadingComments = nextNode && (nextNode.leadingComments?.length ?? 0) > 0;
            if (hasNextLeadingComments) {
                this.layout.add(Layout_1.WS.NO_SPACE, ",");
            }
            else {
                this.layout.add(Layout_1.WS.NO_SPACE, ",", Layout_1.WS.NEWLINE, Layout_1.WS.INDENT);
            }
        }
        else {
            this.layout.add(Layout_1.WS.NO_SPACE, ",", Layout_1.WS.SPACE);
        }
    }
    withComments(node, fn) {
        this.formatComments(node.leadingComments, true);
        fn();
        this.formatComments(node.trailingComments, false);
    }
    formatComments(comments, isLeading = false) {
        if (!comments) {
            return;
        }
        comments.forEach((com) => {
            if (com.type === ast_1.NodeType.line_comment) {
                this.formatLineComment(com, isLeading);
            }
            else {
                this.formatBlockComment(com);
            }
        });
    }
    formatLineComment(node, isLeading = false) {
        const text = this.normalizeLineComment(node.text);
        if (isLeading || (0, utils_1.isMultiline)(node.precedingWhitespace || "")) {
            this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, text, Layout_1.WS.MANDATORY_NEWLINE, Layout_1.WS.INDENT);
        }
        else if (this.layout.getLayoutItems().length > 0) {
            this.layout.add(Layout_1.WS.NO_NEWLINE, Layout_1.WS.SPACE, text, Layout_1.WS.MANDATORY_NEWLINE, Layout_1.WS.INDENT);
        }
        else {
            // comment is the first item in code - no need to add preceding spaces
            this.layout.add(text, Layout_1.WS.MANDATORY_NEWLINE, Layout_1.WS.INDENT);
        }
    }
    normalizeLineComment(text) {
        return text.replace(/^(--)(\S)/, '$1 $2');
    }
    formatBlockComment(node) {
        if (node.type === ast_1.NodeType.block_comment &&
            this.isMultilineBlockComment(node)) {
            this.splitBlockComment(node.text).forEach((line) => {
                this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, line);
            });
            this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT);
        }
        else {
            this.layout.add(node.text, Layout_1.WS.SPACE);
        }
    }
    isMultilineBlockComment(node) {
        return ((0, utils_1.isMultiline)(node.text) ||
            (0, utils_1.isMultiline)(node.precedingWhitespace || ""));
    }
    isDocComment(comment) {
        const lines = comment.split(/\n/);
        return (
        // first line starts with /* or /**
        /^\/\*\*?$/.test(lines[0]) &&
            // intermediate lines start with *
            lines
                .slice(1, lines.length - 1)
                .every((line) => /^\s*\*/.test(line)) &&
            // last line ends with */
            /^\s*\*\/$/.test((0, utils_1.last)(lines)));
    }
    // Breaks up block comment to multiple lines.
    // For example this doc-comment (dots representing leading whitespace):
    //
    //   ..../**
    //   .....* Some description here
    //   .....* and here too
    //   .....*/
    //
    // gets broken to this array (note the leading single spaces):
    //
    //   [ '/**',
    //     '.* Some description here',
    //     '.* and here too',
    //     '.*/' ]
    //
    // However, a normal comment (non-doc-comment) like this:
    //
    //   ..../*
    //   ....Some description here
    //   ....*/
    //
    // gets broken to this array (no leading spaces):
    //
    //   [ '/*',
    //     'Some description here',
    //     '*/' ]
    //
    splitBlockComment(comment) {
        if (this.isDocComment(comment)) {
            return comment.split(/\n/).map((line) => {
                if (/^\s*\*/.test(line)) {
                    return " " + line.replace(/^\s*/, "");
                }
                else {
                    return line;
                }
            });
        }
        else {
            return comment.split(/\n/).map((line) => line.replace(/^\s*/, ""));
        }
    }
    formatSubExpression(nodes) {
        return new ExpressionFormatter({
            cfg: this.cfg,
            dialectCfg: this.dialectCfg,
            params: this.params,
            layout: this.layout,
            inline: this.inline,
        }).format(nodes);
    }
    formatInlineExpression(nodes) {
        const oldParamIndex = this.params.getPositionalParameterIndex();
        try {
            return new ExpressionFormatter({
                cfg: this.cfg,
                dialectCfg: this.dialectCfg,
                params: this.params,
                layout: new InlineLayout_1.default(this.cfg.expressionWidth),
                inline: true,
            }).format(nodes);
        }
        catch (e) {
            if (e instanceof InlineLayout_1.InlineLayoutError) {
                // While formatting, some of the positional parameters might have
                // been consumed, which increased the current parameter index.
                // We reset the index to an earlier state, so we can run the
                // formatting again and re-consume these parameters in non-inline mode.
                this.params.setPositionalParameterIndex(oldParamIndex);
                return undefined;
            }
            else {
                // forward all unexpected errors
                throw e;
            }
        }
    }
    formatKeywordNode(node) {
        switch (node.tokenType) {
            case token_1.TokenType.RESERVED_JOIN:
                return this.formatJoin(node);
            case token_1.TokenType.AND:
            case token_1.TokenType.OR:
            case token_1.TokenType.XOR:
                return this.formatLogicalOperator(node);
            default:
                return this.formatKeyword(node);
        }
    }
    formatJoin(node) {
        if ((0, config_1.isTabularStyle)(this.cfg)) {
            // in tabular style JOINs are at the same level as clauses
            this.layout.indentation.decreaseTopLevel();
            this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, this.showKw(node), Layout_1.WS.SPACE);
            this.layout.indentation.increaseTopLevel();
        }
        else {
            this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, this.showKw(node), Layout_1.WS.SPACE);
        }
    }
    formatKeyword(node) {
        this.layout.add(this.showKw(node), Layout_1.WS.SPACE);
    }
    formatLogicalOperator(node) {
        if (this.cfg.logicalOperatorNewline === "before") {
            if ((0, config_1.isTabularStyle)(this.cfg)) {
                // In tabular style AND/OR is placed on the same level as clauses
                this.layout.indentation.decreaseTopLevel();
                this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, this.showKw(node), Layout_1.WS.SPACE);
                this.layout.indentation.increaseTopLevel();
            }
            else {
                this.layout.add(Layout_1.WS.NEWLINE, Layout_1.WS.INDENT, this.showKw(node), Layout_1.WS.SPACE);
            }
        }
        else {
            this.layout.add(this.showKw(node), Layout_1.WS.NEWLINE, Layout_1.WS.INDENT);
        }
    }
    formatDataType(node) {
        this.layout.add(this.showDataType(node), Layout_1.WS.SPACE);
    }
    showKw(node) {
        if ((0, tabularStyle_1.isTabularToken)(node.tokenType)) {
            return (0, tabularStyle_1.default)(this.showNonTabularKw(node), this.cfg.indentStyle);
        }
        else {
            return this.showNonTabularKw(node);
        }
    }
    // Like showKw(), but skips tabular formatting
    showNonTabularKw(node) {
        switch (this.cfg.keywordCase) {
            case "preserve":
                return (0, utils_1.equalizeWhitespace)(node.raw);
            case "upper":
                return node.text;
            case "lower":
                return node.text.toLowerCase();
        }
    }
    showFunctionKw(node) {
        if ((0, tabularStyle_1.isTabularToken)(node.tokenType)) {
            return (0, tabularStyle_1.default)(this.showNonTabularFunctionKw(node), this.cfg.indentStyle);
        }
        else {
            return this.showNonTabularFunctionKw(node);
        }
    }
    // Like showFunctionKw(), but skips tabular formatting
    showNonTabularFunctionKw(node) {
        switch (this.cfg.functionCase) {
            case "preserve":
                return (0, utils_1.equalizeWhitespace)(node.raw);
            case "upper":
                return node.text;
            case "lower":
                return node.text.toLowerCase();
        }
    }
    showIdentifier(node) {
        if (node.quoted) {
            return node.text;
        }
        else {
            switch (this.cfg.identifierCase) {
                case "preserve":
                    return node.text;
                case "upper":
                    return node.text.toUpperCase();
                case "lower":
                    return node.text.toLowerCase();
            }
        }
    }
    showDataType(node) {
        switch (this.cfg.dataTypeCase) {
            case "preserve":
                return (0, utils_1.equalizeWhitespace)(node.raw);
            case "upper":
                return node.text;
            case "lower":
                return node.text.toLowerCase();
        }
    }
}
exports.default = ExpressionFormatter;
//# sourceMappingURL=ExpressionFormatter.js.map