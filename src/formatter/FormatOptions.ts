import type { ParamItems } from './Params.ts';
import type { ParamTypes } from '../lexer/TokenizerOptions.ts';

export type IndentStyle = 'standard' | 'tabularLeft' | 'tabularRight';

export type KeywordCase = 'preserve' | 'upper' | 'lower';
export type IdentifierCase = KeywordCase;
export type DataTypeCase = KeywordCase;
export type FunctionCase = KeywordCase;

export type LogicalOperatorNewline = 'before' | 'after';

export type CommaPosition = 'before' | 'after';
export type CteCommaPosition = 'before' | 'after'
export type SubqueryParenStyle = 'inline' | 'newline'
export type CommentPosition = 'preserve' | 'newline' | 'inline'

export interface FormatOptions {
    tabWidth: number;
    useTabs: boolean;
    keywordCase: KeywordCase;
    identifierCase: IdentifierCase;
    dataTypeCase: DataTypeCase;
    functionCase: FunctionCase;
    indentStyle: IndentStyle;
    logicalOperatorNewline: LogicalOperatorNewline;
    expressionWidth: number;
    linesBetweenQueries: number;
    denseOperators: boolean;
    newlineBeforeSemicolon: boolean;
    commaPosition: CommaPosition;
    alignColumnDefinitions: boolean;
    newlineAfterSelect: boolean;
    newlineAfterFrom: boolean;
    newlineBeforeWhere: boolean;
    newlineAfterWhere: boolean;
    newlineBeforeOrderBy: boolean;
    newlineBeforeGroupBy: boolean;
    newlineBeforeHaving: boolean;
    newlineBeforeLimit: boolean;
    maxLineLength: number;
    tabulateAlias: boolean;
    reservedKeywordCase: KeywordCase;
    builtinFunctionCase: KeywordCase;
    newlineBeforeJoin: boolean;
    newlineAfterComma: boolean;
    alignWhereClauses: boolean;
    alignCaseStatements: boolean;
    breakAfterSelectItem: boolean;
    breakAfterFromItem: boolean;
    spaceBeforeComma: boolean;
    spaceInsideParentheses: boolean;
    trimTrailingSpaces: boolean;
    semicolonAtEnd: boolean;
    singleLineMaxLength: number;
    params?: ParamItems | string[];
    paramTypes?: ParamTypes;
    nullCase?: KeywordCase
    booleanCase?: KeywordCase
    newlineAfterGroupBy?: boolean
    newlineAfterHaving?: boolean
    newlineAfterOrderBy?: boolean
    newlineAfterLimit?: boolean
    newlineAfterJoin?: boolean
    newlineBeforeSetOperation?: boolean
    newlineAfterSetOperation?: boolean
    newlineBeforeOn?: boolean
    newlineBeforeUsing?: boolean
    newlineBeforeWith?: boolean
    newlineAfterWith?: boolean
    indentCteBody?: boolean
    newlineBetweenCtes?: boolean
    cteCommaPosition?: CteCommaPosition
    newlineAfterOver?: boolean
    newlineBeforePartitionBy?: boolean
    newlineAfterPartitionBy?: boolean
    newlineBeforeOrderByInWindow?: boolean
    indentJoinConditions?: boolean
    alignOnClauses?: boolean
    alignInsertColumns?: boolean
    alignInsertValuesGroups?: boolean
    newlineAfterInsert?: boolean
    newlineAfterInsertColumns?: boolean
    newlineBetweenValuesGroups?: boolean
    newlineAfterCase?: boolean
    newlineAfterWhen?: boolean
    newlineAfterThen?: boolean
    newlineAfterElse?: boolean
    indentWhen?: boolean
    indentThen?: boolean
    newlineAfterIn?: boolean
    maxItemsInlineList?: number
    subqueryParenStyle?: SubqueryParenStyle
    commentPosition?: CommentPosition
    blankLinesBeforeSetOperation?: number
    blankLinesAfterSetOperation?: number
    newlineBeforeLateralView?: boolean
    newlineBeforeDistributeBy?: boolean
    newlineBeforeClusterBy?: boolean
    newlineBeforeSortBy?: boolean
}
