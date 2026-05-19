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
        paramTypes: extensionSettings.get<ParamTypes>("paramTypes"),
    }
}

const createIndentationConfig = (
    extensionSettings: vscode.WorkspaceConfiguration,
    formattingOptions: vscode.FormattingOptions,
): FormatOptionsWithLanguage => {
    if (extensionSettings.get<boolean>("ignoreTabSettings")) {
        return {
            tabWidth: extensionSettings.get<number>("tabSizeOverride"),
            useTabs: !extensionSettings.get<boolean>("insertSpacesOverride"),
        }
    } else {
        return {
            tabWidth: formattingOptions.tabSize,
            useTabs: !formattingOptions.insertSpaces,
        }
    }
}
