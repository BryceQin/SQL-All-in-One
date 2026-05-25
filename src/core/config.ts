import * as vscode from "vscode"
import {
    SqlLanguage,
    FormatOptionsWithLanguage,
} from "../formatter/sqlFormatter"

const configMappings = [
    'keywordCase', 'dataTypeCase', 'functionCase', 'identifierCase',
    'indentStyle', 'logicalOperatorNewline', 'expressionWidth',
    'linesBetweenQueries', 'denseOperators', 'newlineBeforeSemicolon',
    'commaPosition', 'alignColumnDefinitions', 'newlineAfterSelect',
    'newlineAfterFrom', 'newlineBeforeWhere', 'newlineAfterWhere',
    'newlineBeforeOrderBy', 'newlineBeforeGroupBy', 'newlineBeforeHaving',
    'newlineBeforeLimit', 'maxLineLength', 'tabulateAlias',
    'reservedKeywordCase', 'builtinFunctionCase', 'newlineBeforeJoin',
    'newlineAfterComma', 'alignWhereClauses', 'alignCaseStatements',
    'breakAfterSelectItem', 'breakAfterFromItem', 'spaceBeforeComma',
    'spaceInsideParentheses', 'trimTrailingSpaces', 'semicolonAtEnd',
    'singleLineMaxLength', 'paramTypes', 'nullCase', 'booleanCase',
    'newlineAfterGroupBy', 'newlineAfterHaving', 'newlineAfterOrderBy',
    'newlineAfterLimit', 'newlineAfterJoin', 'newlineBeforeSetOperation',
    'newlineAfterSetOperation', 'newlineBeforeOn', 'newlineBeforeUsing',
    'newlineBeforeWith', 'newlineAfterWith', 'indentCteBody',
    'newlineBetweenCtes', 'cteCommaPosition', 'newlineAfterOver',
    'newlineBeforePartitionBy', 'newlineAfterPartitionBy',
    'newlineBeforeOrderByInWindow', 'indentJoinConditions', 'alignOnClauses',
    'alignInsertColumns', 'alignInsertValuesGroups', 'newlineAfterInsert',
    'newlineAfterInsertColumns', 'newlineBetweenValuesGroups',
    'newlineAfterCase', 'newlineAfterWhen', 'newlineAfterThen',
    'newlineAfterElse', 'indentWhen', 'indentThen', 'newlineAfterIn',
    'maxItemsInlineList', 'subqueryParenStyle', 'commentPosition',
    'blankLinesBeforeSetOperation', 'blankLinesAfterSetOperation',
    'newlineBeforeLateralView', 'newlineBeforeDistributeBy',
    'newlineBeforeClusterBy', 'newlineBeforeSortBy',
] as const

export const createConfig = (
    extensionSettings: vscode.WorkspaceConfiguration,
    formattingOptions: vscode.FormattingOptions,
    detectedDialect: SqlLanguage,
): FormatOptionsWithLanguage => {
    const configuredDialect = extensionSettings.get<
        SqlLanguage | "auto-detect"
    >("dialect")

    const cfg: Record<string, unknown> = {
        language:
            configuredDialect === "auto-detect"
                ? detectedDialect
                : configuredDialect,
        ...createIndentationConfig(extensionSettings, formattingOptions),
    }

    for (const key of configMappings) {
        cfg[key] = extensionSettings.get(key)
    }

    return cfg as FormatOptionsWithLanguage
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