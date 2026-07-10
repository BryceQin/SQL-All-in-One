import * as vscode from "vscode";
import * as path from "path";
import { handleError, ErrorCategory } from "../core/errorHandler";

/**
 * Mapping from Monaco token types to their resolved hex colors.
 */
export interface TokenColorMap {
    keyword: string;
    string: string;
    comment: string;
    number: string;
    type: string;
    function: string;
    operator: string;
    delimiter: string;
    variable: string;
}

/**
 * TextMate scope prefix to Monaco token type mapping.
 * Order matters: more specific scopes should come before less specific ones
 * so that they are matched first during resolution.
 */
const SCOPE_TO_MONACO: [string, keyof TokenColorMap][] = [
    // Operator (must come before keyword to override keyword.operator)
    ["keyword.operator", "operator"],

    // Keyword
    ["keyword.control", "keyword"],
    ["keyword", "keyword"],

    // String
    ["string", "string"],

    // Comment
    ["comment", "comment"],

    // Number
    ["constant.numeric", "number"],

    // Type
    ["support.type", "type"],
    ["entity.name.type", "type"],
    ["storage.type", "type"],

    // Function
    ["entity.name.function", "function"],
    ["support.function", "function"],

    // Delimiter / punctuation
    ["punctuation", "delimiter"],

    // Variable
    ["variable.parameter", "variable"],
    ["variable.other", "variable"],
    ["variable", "variable"],
];

interface TokenColorSetting {
    scope: string | string[];
    settings: {
        foreground?: string;
    };
}

interface ThemeFile {
    tokenColors?: TokenColorSetting[];
}

/**
 * Reads the current VS Code theme's syntax token colors and returns them
 * as a mapping from Monaco token types to hex color strings.
 *
 * Steps:
 *  1. Get the current color theme name from workbench config.
 *  2. Find the extension that contributes that theme.
 *  3. Read and parse the theme JSON file.
 *  4. Resolve TextMate scopes to Monaco token types.
 *  5. Merge editor.tokenColorCustomizations on top.
 *  6. Return the color map, or undefined on any failure.
 */
let cachedColors: TokenColorMap | undefined;
let cachedThemeName: string | undefined;

export function invalidateTokenColorCache(): void {
    cachedColors = undefined;
    cachedThemeName = undefined;
}

export async function getTokenColors(): Promise<TokenColorMap | undefined> {
    const themeName = vscode.workspace.getConfiguration("workbench").get<string>("colorTheme");
    if (!themeName) return undefined;

    if (cachedColors && cachedThemeName === themeName) {
        return cachedColors;
    }

    try {
        const themeExtension = findThemeExtension(themeName);
        if (!themeExtension) return undefined;

        const themeFilePath = resolveThemeFilePath(themeExtension, themeName);
        if (!themeFilePath) return undefined;

        const fsPromises = await import("fs/promises");
        const themeContent = await fsPromises.readFile(themeFilePath, "utf-8");
        const cleanContent = themeContent.replace(/^\uFEFF/, "");
        const themeJson = JSON.parse(cleanContent) as ThemeFile;
        const tokenColors = themeJson.tokenColors ?? [];
        const colorMap = resolveTokenColors(tokenColors);

        const customizations = vscode.workspace
            .getConfiguration("editor")
            .get<{ tokenColors?: TokenColorSetting[] }>("tokenColorCustomizations");
        if (customizations?.tokenColors) {
            mergeTokenColors(colorMap, customizations.tokenColors);
        }

        const hasAnyColor = Object.values(colorMap).some((v) => v !== undefined);
        if (!hasAnyColor) return undefined;

        cachedColors = colorMap as TokenColorMap;
        cachedThemeName = themeName;
        return cachedColors;
    } catch (e) {
        handleError(e, "themeColors.getTokenColors", ErrorCategory.FEATURE);
        return undefined;
    }
}

export function getTokenColorsSync(): TokenColorMap | undefined {
    return cachedColors;
}

/**
 * Find the VS Code extension that contributes the given theme.
 */
function findThemeExtension(themeName: string): vscode.Extension<unknown> | undefined {
    for (const ext of vscode.extensions.all) {
        const pkgJson = ext.packageJSON as Record<string, unknown> | undefined;
        const contributes = pkgJson?.contributes as { themes?: { label?: string; id?: string }[] } | undefined;
        if (!contributes?.themes) {
            continue;
        }
        for (const theme of contributes.themes) {
            if (theme.label === themeName || theme.id === themeName) {
                return ext;
            }
        }
    }
    return undefined;
}

/**
 * Resolve the theme file path from the extension and theme name.
 */
function resolveThemeFilePath(ext: vscode.Extension<unknown>, themeName: string): string | undefined {
    const pkgJson = ext.packageJSON as Record<string, unknown> | undefined;
    const contributes = pkgJson?.contributes as { themes?: { label?: string; id?: string; path?: string }[] } | undefined;
    if (!contributes?.themes) {
        return undefined;
    }

    const extensionPath = ext.extensionPath;

    for (const theme of contributes.themes) {
        if (theme.label === themeName || theme.id === themeName) {
            if (theme.path) {
                return path.resolve(extensionPath, theme.path);
            }
        }
    }

    return undefined;
}

/**
 * Build a partial TokenColorMap by iterating tokenColors and matching
 * each scope against the SCOPE_TO_MONACO mapping.
 */
function resolveTokenColors(tokenColors: TokenColorSetting[]): Partial<TokenColorMap> {
    const colorMap: Partial<TokenColorMap> = {};

    for (const tokenColor of tokenColors) {
        const foreground = tokenColor.settings?.foreground;
        if (!foreground) {
            continue;
        }

        const scopes = Array.isArray(tokenColor.scope) ? tokenColor.scope : [tokenColor.scope];

        for (const scope of scopes) {
            const monacoType = resolveScopeToMonacoType(scope);
            if (monacoType && colorMap[monacoType] === undefined) {
                colorMap[monacoType] = foreground;
            }
        }
    }

    return colorMap;
}

/**
 * Map a single TextMate scope string to a Monaco token type.
 * More specific scopes are matched first (see SCOPE_TO_MONACO ordering).
 */
function resolveScopeToMonacoType(scope: string): keyof TokenColorMap | undefined {
    for (const [prefix, monacoType] of SCOPE_TO_MONACO) {
        if (scope === prefix || scope.startsWith(prefix + ".")) {
            return monacoType;
        }
    }
    return undefined;
}

/**
 * Merge custom token color overrides into the existing color map.
 * Customizations take precedence over theme defaults.
 */
function mergeTokenColors(colorMap: Partial<TokenColorMap>, customColors: TokenColorSetting[]): void {
    for (const tokenColor of customColors) {
        const foreground = tokenColor.settings?.foreground;
        if (!foreground) {
            continue;
        }

        const scopes = Array.isArray(tokenColor.scope) ? tokenColor.scope : [tokenColor.scope];

        for (const scope of scopes) {
            const monacoType = resolveScopeToMonacoType(scope);
            if (monacoType) {
                colorMap[monacoType] = foreground;
            }
        }
    }
}
