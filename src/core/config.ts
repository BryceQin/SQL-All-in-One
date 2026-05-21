import * as vscode from "vscode"
import {
    SqlLanguage,
    FormatOptionsWithLanguage,
} from "../formatter/sqlFormatter"
import {
    KeywordCase,
    DataTypeCase,
    FunctionCase,
    IdentifierCase,
    IndentStyle,
    LogicalOperatorNewline,
    FormatOptions,
    CommaPosition,
    CteCommaPosition,
    SubqueryParenStyle,
    CommentPosition,
} from "../formatter/FormatOptions"

type ParamTypes = FormatOptions["paramTypes"]

export const createConfig = (
    extensionSettings: vscode.WorkspaceConfiguration,
    formattingOptions: vscode.FormattingOptions,
    detectedDialect: SqlLanguage,
): FormatOptionsWithLanguage => {
    const configuredDialect = extensionSettings.get<
        SqlLanguage | "auto-detect"
    >("dialect")
    return {
        language:
            configuredDialect === "auto-detect"
                ? detectedDialect
                : configuredDialect,
        ...createIndentationConfig(extensionSettings, formattingOptions),
        keywordCase: extensionSettings.get<KeywordCase>("keywordCase"),
        dataTypeCase: extensionSettings.get<DataTypeCase>("dataTypeCase"),
        functionCase: extensionSettings.get<FunctionCase>("functionCase"),
        identifierCase: extensionSettings.get<IdentifierCase>("identifierCase"),
        indentStyle: extensionSettings.get<IndentStyle>("indentStyle"),
        logicalOperatorNewline: extensionSettings.get<LogicalOperatorNewline>(
            "logicalOperatorNewline",
        ),
        expressionWidth: extensionSettings.get<number>("expressionWidth"),
        linesBetweenQueries: extensionSettings.get<number>(
            "linesBetweenQueries",
        ),
        denseOperators: extensionSettings.get<boolean>("denseOperators"),
        newlineBeforeSemicolon: extensionSettings.get<boolean>(
            "newlineBeforeSemicolon",
        ),
        commaPosition: extensionSettings.get<CommaPosition>("commaPosition"),
        alignColumnDefinitions: extensionSettings.get<boolean>("alignColumnDefinitions"),
        newlineAfterSelect: extensionSettings.get<boolean>("newlineAfterSelect"),
        newlineAfterFrom: extensionSettings.get<boolean>("newlineAfterFrom"),
        newlineBeforeWhere: extensionSettings.get<boolean>("newlineBeforeWhere"),
        newlineAfterWhere: extensionSettings.get<boolean>("newlineAfterWhere"),
        newlineBeforeOrderBy: extensionSettings.get<boolean>("newlineBeforeOrderBy"),
        newlineBeforeGroupBy: extensionSettings.get<boolean>("newlineBeforeGroupBy"),
        newlineBeforeHaving: extensionSettings.get<boolean>("newlineBeforeHaving"),
        newlineBeforeLimit: extensionSettings.get<boolean>("newlineBeforeLimit"),
        maxLineLength: extensionSettings.get<number>("maxLineLength"),
        tabulateAlias: extensionSettings.get<boolean>("tabulateAlias"),
        reservedKeywordCase: extensionSettings.get<KeywordCase>("reservedKeywordCase"),
        builtinFunctionCase: extensionSettings.get<KeywordCase>("builtinFunctionCase"),
        newlineBeforeJoin: extensionSettings.get<boolean>("newlineBeforeJoin"),
        newlineAfterComma: extensionSettings.get<boolean>("newlineAfterComma"),
        alignWhereClauses: extensionSettings.get<boolean>("alignWhereClauses"),
        alignCaseStatements: extensionSettings.get<boolean>("alignCaseStatements"),
        breakAfterSelectItem: extensionSettings.get<boolean>("breakAfterSelectItem"),
        breakAfterFromItem: extensionSettings.get<boolean>("breakAfterFromItem"),
        spaceBeforeComma: extensionSettings.get<boolean>("spaceBeforeComma"),
        spaceInsideParentheses: extensionSettings.get<boolean>("spaceInsideParentheses"),
        trimTrailingSpaces: extensionSettings.get<boolean>("trimTrailingSpaces"),
        semicolonAtEnd: extensionSettings.get<boolean>("semicolonAtEnd"),
        singleLineMaxLength: extensionSettings.get<number>("singleLineMaxLength"),
        paramTypes: extensionSettings.get<ParamTypes>("paramTypes"),
        nullCase: extensionSettings.get<KeywordCase>("nullCase"),
        booleanCase: extensionSettings.get<KeywordCase>("booleanCase"),
        newlineAfterGroupBy: extensionSettings.get<boolean>("newlineAfterGroupBy"),
        newlineAfterHaving: extensionSettings.get<boolean>("newlineAfterHaving"),
        newlineAfterOrderBy: extensionSettings.get<boolean>("newlineAfterOrderBy"),
        newlineAfterLimit: extensionSettings.get<boolean>("newlineAfterLimit"),
        newlineAfterJoin: extensionSettings.get<boolean>("newlineAfterJoin"),
        newlineBeforeSetOperation: extensionSettings.get<boolean>("newlineBeforeSetOperation"),
        newlineAfterSetOperation: extensionSettings.get<boolean>("newlineAfterSetOperation"),
        newlineBeforeOn: extensionSettings.get<boolean>("newlineBeforeOn"),
        newlineBeforeUsing: extensionSettings.get<boolean>("newlineBeforeUsing"),
        newlineBeforeWith: extensionSettings.get<boolean>("newlineBeforeWith"),
        newlineAfterWith: extensionSettings.get<boolean>("newlineAfterWith"),
        indentCteBody: extensionSettings.get<boolean>("indentCteBody"),
        newlineBetweenCtes: extensionSettings.get<boolean>("newlineBetweenCtes"),
        cteCommaPosition: extensionSettings.get<CteCommaPosition>("cteCommaPosition"),
        newlineAfterOver: extensionSettings.get<boolean>("newlineAfterOver"),
        newlineBeforePartitionBy: extensionSettings.get<boolean>("newlineBeforePartitionBy"),
        newlineAfterPartitionBy: extensionSettings.get<boolean>("newlineAfterPartitionBy"),
        newlineBeforeOrderByInWindow: extensionSettings.get<boolean>("newlineBeforeOrderByInWindow"),
        indentJoinConditions: extensionSettings.get<boolean>("indentJoinConditions"),
        alignOnClauses: extensionSettings.get<boolean>("alignOnClauses"),
        alignInsertColumns: extensionSettings.get<boolean>("alignInsertColumns"),
        alignInsertValuesGroups: extensionSettings.get<boolean>("alignInsertValuesGroups"),
        newlineAfterInsert: extensionSettings.get<boolean>("newlineAfterInsert"),
        newlineAfterInsertColumns: extensionSettings.get<boolean>("newlineAfterInsertColumns"),
        newlineBetweenValuesGroups: extensionSettings.get<boolean>("newlineBetweenValuesGroups"),
        newlineAfterCase: extensionSettings.get<boolean>("newlineAfterCase"),
        newlineAfterWhen: extensionSettings.get<boolean>("newlineAfterWhen"),
        newlineAfterThen: extensionSettings.get<boolean>("newlineAfterThen"),
        newlineAfterElse: extensionSettings.get<boolean>("newlineAfterElse"),
        indentWhen: extensionSettings.get<boolean>("indentWhen"),
        indentThen: extensionSettings.get<boolean>("indentThen"),
        newlineAfterIn: extensionSettings.get<boolean>("newlineAfterIn"),
        maxItemsInlineList: extensionSettings.get<number>("maxItemsInlineList"),
        subqueryParenStyle: extensionSettings.get<SubqueryParenStyle>("subqueryParenStyle"),
        commentPosition: extensionSettings.get<CommentPosition>("commentPosition"),
        blankLinesBeforeSetOperation: extensionSettings.get<number>("blankLinesBeforeSetOperation"),
        blankLinesAfterSetOperation: extensionSettings.get<number>("blankLinesAfterSetOperation"),
        newlineBeforeLateralView: extensionSettings.get<boolean>("newlineBeforeLateralView"),
        newlineBeforeDistributeBy: extensionSettings.get<boolean>("newlineBeforeDistributeBy"),
        newlineBeforeClusterBy: extensionSettings.get<boolean>("newlineBeforeClusterBy"),
        newlineBeforeSortBy: extensionSettings.get<boolean>("newlineBeforeSortBy"),
        newlineBeforeConnectBy: extensionSettings.get<boolean>("newlineBeforeConnectBy"),
        newlineBeforeStartWith: extensionSettings.get<boolean>("newlineBeforeStartWith"),
    }
}

const createIndentationConfig = (
    extensionSettings: vscode.WorkspaceConfiguration,
    formattingOptions: vscode.FormattingOptions,
): FormatOptionsWithLanguage => {
    if (extensionSettings.get<boolean>("ignoreTabSettings")) {
        const tabSizeOverride = extensionSettings.get<number>("tabSizeOverride")
        return {
            tabWidth: (tabSizeOverride !== undefined && tabSizeOverride > 0) ? tabSizeOverride : 2,
            useTabs: !extensionSettings.get<boolean>("insertSpacesOverride", true),
        }
    } else {
        return {
            tabWidth: formattingOptions.tabSize,
            useTabs: !formattingOptions.insertSpaces,
        }
    }
}
