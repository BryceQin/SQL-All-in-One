import * as vscode from 'vscode'
import { getConfigManager } from '../core/configManager'
import type { AstNavigator, SymbolIndex } from './AstNavigator'

export interface NavigationContext {
    word: string
    ast: unknown[] | unknown
    index: SymbolIndex
}

export function getNavigationContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    navigator: AstNavigator
): NavigationContext | null {
    const cfgMgr = getConfigManager()
    if (!cfgMgr.get<boolean>('enableNavigation', true)) return null

    const range = document.getWordRangeAtPosition(position)
    if (!range) return null
    const word = document.getText(range)

    const result = navigator.getAST(document)
    if (!result) return null

    return { word, ast: result.ast, index: result.index }
}