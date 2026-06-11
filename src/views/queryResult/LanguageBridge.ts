import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AstLinter } from '../../providers/AstLinter';
import { SchemaCompletionProvider } from '../../completion/SchemaCompletionProvider';
import { SqlCompletionProvider } from '../../completion/SqlCompletionProvider';
import { SqlHoverProvider } from '../../providers/SqlHoverProvider';
import { formatEditorText } from '../../utils/formatEditorText';
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
    monarchRules: Record<string, unknown>;
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

    constructor(extensionUri: vscode.Uri) {
        this._extensionPath = extensionUri.fsPath;
        this._linter = new AstLinter();
        this._schemaCompletionProvider = new SchemaCompletionProvider();
        this._hoverProvider = new SqlHoverProvider();
        this._completionProvider = new SqlCompletionProvider(extensionUri.fsPath);
    }

    exportLanguageData(dialect: string): LanguageData {
        const kwData = keywordMap[dialect] || keywordMap['mysql'];
        const funcData = functionSigMap[dialect] || functionSigMap['mysql'];
        const snippets = this._loadSnippets(dialect);
        const monarchRules = this._buildMonarchRules(dialect, kwData.keywords, kwData.dataTypes, funcData);

        return {
            dialect,
            keywords: kwData.keywords,
            dataTypes: kwData.dataTypes,
            functions: funcData,
            snippets,
            monarchRules,
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
                    const content: Record<string, { prefix: string; body: string[] | string; description: string }> = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
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

    private _buildMonarchRules(
        dialect: string,
        keywords: string[],
        dataTypes: string[],
        functions: FunctionSignature[],
    ): Record<string, unknown> {
        const functionNames = functions.map((f) => f.name.toUpperCase());
        return {
            defaultToken: '',
            tokenPostfix: `.${dialect}`,
            keywords,
            dataTypes,
            functions: functionNames,
            operators: [
                '=', '>', '<', '!', '~', '?', ':', '===', '>=', '<=',
                '!=', '<>', '==', '<=>', '&&', '||', '<<', '>>',
            ],
            symbols: /[=><!~?:&|+\-*/^%]+/,
            escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
            tokenizer: {
                root: [
                    { include: '@comments' },
                    { include: '@whitespace' },
                    { include: '@numbers' },
                    { include: '@strings' },
                    [/[a-zA-Z_]\w*/, {
                        cases: {
                            '@keywords': 'keyword',
                            '@dataTypes': 'type',
                            '@functions': 'function',
                            '@default': 'identifier',
                        },
                    }],
                    [/@symbols/, {
                        cases: {
                            '@operators': 'operator',
                            '@default': '',
                        },
                    }],
                ],
                whitespace: [
                    [/\s+/, 'white'],
                ],
                comments: [
                    [/--+.*/, 'comment'],
                    [/\/\*/, 'comment', '@comment'],
                ],
                comment: [
                    [(/[^/*]+/), 'comment'],
                    [(/\*\//), 'comment', '@pop'],
                    [(/[/*]/), 'comment'],
                ],
                numbers: [
                    [/0[xX][0-9a-fA-F]+/, 'number'],
                    [/[$][+-]*\d+(\.\d+)?/, 'number'],
                    [/\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
                ],
                strings: [
                    [/'/, 'string', '@stringSingle'],
                    [/"/, 'string', '@stringDouble'],
                ],
                stringSingle: [
                    [/[^']+/, 'string'],
                    [/''/, 'string'],
                    [/'/, 'string', '@pop'],
                ],
                stringDouble: [
                    [/[^"]+/, 'string'],
                    [/""/, 'string'],
                    [/"/, 'string', '@pop'],
                ],
            },
        };
    }

    dispose(): void {
        this._snippetCache.clear();
    }
}
