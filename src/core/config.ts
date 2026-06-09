import * as vscode from "vscode"
import {
    SqlLanguage,
    FormatOptionsWithLanguage,
} from "../formatter/sqlFormatter"
import type { FormatOptions } from "../formatter/FormatOptions"
import { getFormatterConfigKeys } from "../config/configDefinitions"

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

    for (const key of getFormatterConfigKeys()) {
        cfg[key] = extensionSettings.get(key)
    }

    return cfg as FormatOptionsWithLanguage
}

const createIndentationConfig = (
    extensionSettings: vscode.WorkspaceConfiguration,
    formattingOptions: vscode.FormattingOptions,
): Pick<FormatOptions, 'tabWidth' | 'useTabs'> => {
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