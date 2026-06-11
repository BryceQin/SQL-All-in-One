import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AstLinter } from '../../providers/AstLinter';
import { SchemaCompletionProvider } from '../../completion/SchemaCompletionProvider';
import { SqlCompletionProvider } from '../../completion/SqlCompletionProvider';
import { SqlHoverProvider } from '../../providers/SqlHoverProvider';
import { formatEditorText } from '../../utils/formatEditorText';
import { getContainer, Tokens } from '../../core/diContainer';
import { createConfig } from '../../core/config';
import { InMemoryDocument } from './InMemoryDocument';
import { MonacoDataAdapter, type MonacoCompletionItem, type MonacoDiagnostic } from './MonacoDataAdapter';
import * as allDialects from '../../languages/allDialects';
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

const keywordMap: Record<string, { keywords: string[]; dataTypes: string[] }> = {
    hive: { keywords: allDialects.hiveKeywords, dataTypes: allDialects.hiveDataTypes },
    mysql: { keywords: allDialects.mysqlKeywords, dataTypes: allDialects.mysqlDataTypes },
    spark: { keywords: allDialects.sparkKeywords, dataTypes: allDialects.sparkDataTypes },
    flinksql: { keywords: allDialects.flinksqlKeywords, dataTypes: allDialects.flinksqlDataTypes },
    sql: { keywords: allDialects.sqlKeywords, dataTypes: allDialects.sqlDataTypes },
    postgresql: { keywords: allDialects.pgKeywords, dataTypes: allDialects.pgDataTypes },
    bigquery: { keywords: allDialects.bqKeywords, dataTypes: allDialects.bqDataTypes },
    sqlite: { keywords: allDialects.sqliteKeywords, dataTypes: allDialects.sqliteDataTypes },
};

const functionSigMap: Record<string, FunctionSignature[]> = {
    hive: allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    flinksql: allDialects.flinksqlFunctionSignatures,
    sql: allDialects.sqlFunctionSignatures,
    postgresql: allDialects.pgFunctionSignatures,
    bigquery: allDialects.bqFunctionSignatures,
    sqlite: allDialects.sqliteFunctionSignatures,
};

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
    private _container = getContainer();

    constructor(extensionUri: vscode.Uri) {
        this._extensionPath = extensionUri.fsPath;
        this._linter = new AstLinter();
        this._schemaCompletionProvider = new SchemaCompletionProvider();
        this._hoverProvider = this._container.tryGet<SqlHoverProvider>(Tokens.HoverProvider) ?? new SqlHoverProvider();
        this._completionProvider = this._container.tryGet<SqlCompletionProvider>(Tokens.CompletionProvider) ?? new SqlCompletionProvider(extensionUri.fsPath);
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
            const items = await this._schemaCompletionProvider.provideCompletionItems(
                document, pos, new vscode.CancellationTokenSource().token,
            );
            if (items && items.length > 0) {
                return MonacoDataAdapter.toMonacoCompletionItems(items);
            }

            const allItems = await this._completionProvider.provideCompletionItems(
                document, pos, new vscode.CancellationTokenSource().token,
            );
            return MonacoDataAdapter.toMonacoCompletionItems(allItems || []);
        } catch {
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
            const hover = await this._hoverProvider.provideHover(
                document, pos, new vscode.CancellationTokenSource().token,
            );
            if (!hover) return null;
            return MonacoDataAdapter.toMonacoHoverContents(hover);
        } catch {
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
        } catch {
            return sql;
        }
    }

    async handleDiagnosticsRequest(sql: string, dialect: string): Promise<MonacoDiagnostic[]> {
        try {
            const diagnostics = this._linter.lint(sql, dialect as SqlDialect);
            return MonacoDataAdapter.toMonacoDiagnostics(diagnostics);
        } catch {
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
                } catch { /* skip invalid snippet files */ }
            }
        }
        this._snippetCache.set(dialect, snippets);
        return snippets;
    }

    dispose(): void {
        this._snippetCache.clear();
    }
}
