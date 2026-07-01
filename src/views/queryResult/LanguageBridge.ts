import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AstLinter } from '../../providers/AstLinter';
import { SchemaCompletionProvider } from '../../completion/SchemaCompletionProvider';
import { SqlCompletionProvider } from '../../completion/SqlCompletionProvider';
import { SqlHoverProvider } from '../../providers/SqlHoverProvider';
import { formatEditorText } from '../../utils/formatEditorText';
import type { SchemaProvider } from '../../database/schema/SchemaProvider';
import { createConfig } from '../../core/configManager';
import { handleError, ErrorCategory } from '../../core/errorHandler';
import { InMemoryDocument } from './InMemoryDocument';
import { MonacoDataAdapter, type MonacoCompletionItem, type MonacoDiagnostic } from './MonacoDataAdapter';
import { keywordMap, functionSigMap } from '../../dialects/dialectData';
import type { FunctionSignature } from '../../completion/functionSignatures';
import type { SqlDialect } from '../../parser/dialectMapper';
import type { SqlLanguage } from '../../formatter/sqlFormatter';

interface SnippetDef {
    prefix: string;
    body: string[];
    description: string;
}

export interface LanguageData {
    dialect: string;
    keywords: string[];
    dataTypes: string[];
    functions: FunctionSignature[];
    snippets: SnippetDef[];
}

const dialectToLanguageId: Record<string, string> = {
    hive: 'hive',
    mysql: 'mysql',
    spark: 'spark',
    flinksql: 'flinksql',
    sql: 'sql',
    postgresql: 'postgresql',
    bigquery: 'bigquery',
    sqlite: 'sqlite',
};

export class LanguageBridge implements vscode.Disposable {
    private _linter: AstLinter;
    private _schemaCompletionProvider: SchemaCompletionProvider;
    private _hoverProvider: SqlHoverProvider;
    private _completionProvider: SqlCompletionProvider;
    private _extensionPath: string;
    private _snippetCache = new Map<string, SnippetDef[]>();

    constructor(
        extensionUri: vscode.Uri,
        schemaProvider: SchemaProvider,
        hoverProvider: SqlHoverProvider,
        completionProvider: SqlCompletionProvider,
    ) {
        this._extensionPath = extensionUri.fsPath;
        this._linter = new AstLinter();
        this._schemaCompletionProvider = new SchemaCompletionProvider(schemaProvider);
        this._hoverProvider = hoverProvider;
        this._completionProvider = completionProvider;
    }

    exportLanguageData(dialect: string): LanguageData {
        const kwData = keywordMap[dialect] || keywordMap['mysql'];
        const funcData = functionSigMap[dialect] || functionSigMap['mysql'];
        const snippets = this._loadSnippets(dialect);

        return {
            dialect,
            keywords: kwData.keywords,
            dataTypes: kwData.dataTypes,
            functions: funcData,
            snippets,
        };
    }

    async handleCompletionRequest(
        sql: string,
        position: { line: number; column: number },
        dialect: string,
    ): Promise<MonacoCompletionItem[]> {
        try {
            const languageId = dialectToLanguageId[dialect] || 'mysql';
            const document = new InMemoryDocument(sql, languageId);
            const pos = new vscode.Position(position.line, position.column);
            const cts = new vscode.CancellationTokenSource();
            try {
                const items = await this._schemaCompletionProvider.provideCompletionItems(
                    document, pos, cts.token,
                );
                if (items && items.length > 0) {
                    return MonacoDataAdapter.toMonacoCompletionItems(items);
                }

                const allItems = await this._completionProvider.provideCompletionItems(
                    document, pos, cts.token,
                );
                return MonacoDataAdapter.toMonacoCompletionItems(allItems || []);
            } finally {
                cts.dispose();
            }
        } catch (e) {
            handleError(e, 'LanguageBridge.handleCompletionRequest', ErrorCategory.SUB_ITEM);
            return [];
        }
    }

    async handleHoverRequest(
        sql: string,
        position: { line: number; column: number },
        dialect: string,
    ): Promise<string[] | null> {
        try {
            const languageId = dialectToLanguageId[dialect] || 'mysql';
            const document = new InMemoryDocument(sql, languageId);
            const pos = new vscode.Position(position.line, position.column);
            const cts = new vscode.CancellationTokenSource();
            try {
                const hover = await this._hoverProvider.provideHover(
                    document, pos, cts.token,
                );
                if (!hover) return null;
                return MonacoDataAdapter.toMonacoHoverContents(hover);
            } finally {
                cts.dispose();
            }
        } catch (e) {
            handleError(e, 'LanguageBridge.handleHoverRequest', ErrorCategory.SUB_ITEM);
            return null;
        }
    }

    async handleFormatRequest(sql: string, dialect: string): Promise<string> {
        try {
            const languageId = (dialect || 'mysql') as SqlLanguage;
            const extensionSettings = vscode.workspace.getConfiguration('SQL-All-in-One');
            const formattingOptions: vscode.FormattingOptions = {
                tabSize: extensionSettings.get<number>('format.tabSize', 2),
                insertSpaces: extensionSettings.get<boolean>('format.useTabs', false) === false,
            };
            const config = createConfig(extensionSettings, formattingOptions, languageId);
            return formatEditorText(sql, config);
        } catch (e) {
            handleError(e, 'LanguageBridge.handleFormatRequest', ErrorCategory.FORMAT);
            return sql;
        }
    }

    async handleDiagnosticsRequest(sql: string, dialect: string): Promise<MonacoDiagnostic[]> {
        try {
            const diagnostics = this._linter.lint(sql, dialect as SqlDialect);
            return MonacoDataAdapter.toMonacoDiagnostics(diagnostics);
        } catch (e) {
            handleError(e, 'LanguageBridge.handleDiagnosticsRequest', ErrorCategory.PARSE);
            return [];
        }
    }

    private _loadSnippets(dialect: string): SnippetDef[] {
        if (this._snippetCache.has(dialect)) {
            return this._snippetCache.get(dialect)!;
        }
        const snippets: SnippetDef[] = [];
        const snippetFiles = ['common', dialect];
        for (const name of snippetFiles) {
            const filePath = path.join(this._extensionPath, 'snippets', `${name}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, { prefix: string; body: string[] | string; description: string }>;
                    for (const [, value] of Object.entries(content)) {
                        const def = value;
                        snippets.push({
                            prefix: def.prefix,
                            body: Array.isArray(def.body) ? def.body : [def.body],
                            description: def.description,
                        });
                    }
                } catch (e) { /* skip invalid snippet files */ handleError(e, `LanguageBridge._loadSnippets (${name})`, ErrorCategory.SUB_ITEM); }
            }
        }
        this._snippetCache.set(dialect, snippets);
        return snippets;
    }

    dispose(): void {
        this._snippetCache.clear();
    }
}
