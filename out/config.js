"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConfig = void 0;
const createConfig = (extensionSettings, formattingOptions, detectedDialect) => {
    const configuredDialect = extensionSettings.get("dialect");
    return {
        language: configuredDialect === "auto-detect"
            ? detectedDialect
            : configuredDialect,
        ...createIndentationConfig(extensionSettings, formattingOptions),
        keywordCase: extensionSettings.get("keywordCase"),
        dataTypeCase: extensionSettings.get("dataTypeCase"),
        functionCase: extensionSettings.get("functionCase"),
        identifierCase: extensionSettings.get("identifierCase"),
        indentStyle: extensionSettings.get("indentStyle"),
        logicalOperatorNewline: extensionSettings.get("logicalOperatorNewline"),
        expressionWidth: extensionSettings.get("expressionWidth"),
        linesBetweenQueries: extensionSettings.get("linesBetweenQueries"),
        denseOperators: extensionSettings.get("denseOperators"),
        newlineBeforeSemicolon: extensionSettings.get("newlineBeforeSemicolon"),
        paramTypes: extensionSettings.get("paramTypes"),
    };
};
exports.createConfig = createConfig;
const createIndentationConfig = (extensionSettings, formattingOptions) => {
    // override tab settings if ignoreTabSettings is true
    if (extensionSettings.get("ignoreTabSettings")) {
        return {
            tabWidth: extensionSettings.get("tabSizeOverride"),
            useTabs: !extensionSettings.get("insertSpacesOverride"),
        };
    }
    else {
        return {
            tabWidth: formattingOptions.tabSize,
            useTabs: !formattingOptions.insertSpaces,
        };
    }
};
//# sourceMappingURL=config.js.map