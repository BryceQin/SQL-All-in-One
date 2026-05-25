import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'

export interface HoverResolver {
    resolve(
        word: string,
        dialect: SqlLanguage,
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | null
}

export type KeywordCategory =
    | 'query'
    | 'join'
    | 'setop'
    | 'dml'
    | 'ddl'
    | 'window'
    | 'transaction'
    | 'auxiliary'
    | 'conditional'
    | 'type'
    | 'hint'

export interface KeywordInfo {
    keyword: string
    syntax: string
    description: string
    example?: string
    category: KeywordCategory
}
