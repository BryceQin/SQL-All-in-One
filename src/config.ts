import * as vscode from "vscode"
import {
    SqlLanguage,
    FormatOptionsWithLanguage,
} from "./formatter/sqlFormatter"
import {
    KeywordCase,
    DataTypeCase,
    FunctionCase,
    IdentifierCase,
    IndentStyle,
    LogicalOperatorNewline,
    FormatOptions,
} from "./formatter/FormatOptions"

type ParamTypes = FormatOptions["paramTypes"]

/**
 * 从VSCode配置和格式化选项创建格式化配置
 * @param extensionSettings - 插件配置
 * @param formattingOptions - 编辑器格式化选项
 * @param detectedDialect - 检测到的SQL方言
 */
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
        paramTypes: extensionSettings.get<ParamTypes>("paramTypes"),
    }
}

/**
 * 创建缩进配置
 */
const createIndentationConfig = (
    extensionSettings: vscode.WorkspaceConfiguration,
    formattingOptions: vscode.FormattingOptions,
): FormatOptionsWithLanguage => {
    // 如果启用了忽略标签设置，使用插件配置
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
