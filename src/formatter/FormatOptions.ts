import type { ParamItems } from './Params.ts';
import type { ParamTypes } from '../lexer/TokenizerOptions.ts';

export type IndentStyle = 'standard' | 'tabularLeft' | 'tabularRight';

export type KeywordCase = 'preserve' | 'upper' | 'lower';
export type IdentifierCase = KeywordCase;
export type DataTypeCase = KeywordCase;
export type FunctionCase = KeywordCase;

export type LogicalOperatorNewline = 'before' | 'after';

export type CommaPosition = 'before' | 'after';

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
}
