# Webview Monaco 语言特性增强 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为查询结果面板的 Webview Monaco 编辑器添加方言化语法高亮、关键字/函数/片段补全、Schema 感知补全、悬停提示、SQL 格式化和 Lint 诊断。

**Architecture:** 混合模式——静态特性（关键字/函数/片段补全、Monarch 高亮）在 Webview 内直接注册，动态特性（Schema 补全、悬停、格式化、Lint）通过 postMessage 桥接到 Extension Host 处理。Extension Host 端新增 LanguageBridge 处理桥接请求，MonacoDataAdapter 负责类型转换，InMemoryDocument 提供虚拟 TextDocument。

**Tech Stack:** TypeScript (Extension Host), JavaScript (Webview), Monaco Editor API, node-sql-parser, VS Code Extension API

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/views/queryResult/InMemoryDocument.ts` | 新建 | 虚拟 TextDocument 实现，满足 Provider 接口最小子集 |
| `src/views/queryResult/MonacoDataAdapter.ts` | 新建 | VS Code 类型 → Monaco 类型转换 |
| `src/views/queryResult/LanguageBridge.ts` | 新建 | Extension Host 端桥接处理，接收 Webview 请求并调用现有 Provider |
| `src/views/queryResult/QueryResultPanel.ts` | 修改 | 集成 LanguageBridge，扩展 WebviewMessage 类型，发送 languageData |
| `media/query-result.js` | 修改 | 注册 Monaco 语言特性（静态 + 桥接），处理桥接响应 |

---

### Task 1: InMemoryDocument — 虚拟 TextDocument

**Files:**
- Create: `src/views/queryResult/InMemoryDocument.ts`
- Test: `src/test/queryResult.test.ts` (追加)

- [ ] **Step 1: Write the failing test**

在 `src/test/queryResult.test.ts` 末尾追加：

```typescript
suite('InMemoryDocument', () => {
    test('getText returns full content', () => {
        const doc = new InMemoryDocument('SELECT * FROM users', 'mysql');
        assert.strictEqual(doc.getText(), 'SELECT * FROM users');
    });

    test('getText with range returns partial content', () => {
        const doc = new InMemoryDocument('SELECT * FROM users', 'mysql');
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 6));
        assert.strictEqual(doc.getText(range), 'SELECT');
    });

    test('lineAt returns correct line', () => {
        const doc = new InMemoryDocument('SELECT *\nFROM users', 'mysql');
        const line = doc.lineAt(0);
        assert.strictEqual(line.text, 'SELECT *');
        assert.strictEqual(line.lineNumber, 0);
    });

    test('positionAt converts offset to position', () => {
        const doc = new InMemoryDocument('SELECT *\nFROM users', 'mysql');
        const pos = doc.positionAt(9);
        assert.strictEqual(pos.line, 1);
        assert.strictEqual(pos.character, 0);
    });

    test('offsetAt converts position to offset', () => {
        const doc = new InMemoryDocument('SELECT *\nFROM users', 'mysql');
        const offset = doc.offsetAt(new vscode.Position(1, 0));
        assert.strictEqual(offset, 9);
    });

    test('lineCount returns correct count', () => {
        const doc = new InMemoryDocument('SELECT *\nFROM users', 'mysql');
        assert.strictEqual(doc.lineCount, 2);
    });

    test('uri and languageId are set', () => {
        const doc = new InMemoryDocument('SELECT 1', 'mysql');
        assert.strictEqual(doc.languageId, 'mysql');
        assert.ok(doc.uri.scheme === 'sql-all-in-one');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vscode-test-cli --extensionTestsPath out/test/queryResult.test.js 2>&1 | head -30`
Expected: FAIL — `InMemoryDocument is not defined`

- [ ] **Step 3: Write minimal implementation**

```typescript
import * as vscode from 'vscode';

export class InMemoryDocument implements vscode.TextDocument {
    readonly uri: vscode.Uri;
    readonly languageId: string;
    readonly version: number = 0;
    readonly isDirty: boolean = false;
    readonly isUntitled: boolean = true;
    readonly eol: vscode.EndOfLine = vscode.EndOfLine.LF;
    readonly fileName: string = '';

    private readonly _lines: string[];

    constructor(content: string, languageId: string) {
        this.uri = vscode.Uri.parse(`sql-all-in-one://virtual/${Date.now()}.sql`);
        this.languageId = languageId;
        this._lines = content.split('\n');
    }

    getText(range?: vscode.Range): string {
        const fullText = this._lines.join('\n');
        if (!range) return fullText;
        const startOffset = this.offsetAt(range.start);
        const endOffset = this.offsetAt(range.end);
        return fullText.substring(startOffset, endOffset);
    }

    lineAt(line: number): vscode.TextLine {
        if (line < 0 || line >= this._lines.length) {
            throw new Error(`Line ${line} out of range (0-${this._lines.length - 1})`);
        }
        const text = this._lines[line];
        return {
            lineNumber: line,
            text,
            range: new vscode.Range(line, 0, line, text.length),
            rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1 > this._lines.length ? line : line + 1, 0),
            firstNonWhitespaceCharacterIndex: text.search(/\S/),
            lastNonWhitespaceCharacterIndex: text.trimEnd().length,
            isEmptyOrWhitespace: text.trim().length === 0,
        };
    }

    lineCount: number = this._lines.length;

    offsetAt(position: vscode.Position): number {
        let offset = 0;
        for (let i = 0; i < position.line && i < this._lines.length; i++) {
            offset += this._lines[i].length + 1;
        }
        if (position.line < this._lines.length) {
            offset += Math.min(position.character, this._lines[position.line].length);
        }
        return offset;
    }

    positionAt(offset: number): vscode.Position {
        let remaining = offset;
        for (let i = 0; i < this._lines.length; i++) {
            if (remaining <= this._lines[i].length) {
                return new vscode.Position(i, remaining);
            }
            remaining -= this._lines[i].length + 1;
        }
        return new vscode.Position(this._lines.length - 1, this._lines[this._lines.length - 1].length);
    }

    getWordRangeAtPosition(_position: vscode.Position, _regex?: RegExp): vscode.Range | undefined {
        return undefined;
    }

    save(): Thenable<boolean> {
        return Promise.resolve(true);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vscode-test-cli --extensionTestsPath out/test/queryResult.test.js 2>&1 | head -30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/queryResult/InMemoryDocument.ts src/test/queryResult.test.ts
git commit -m "feat: add InMemoryDocument for virtual TextDocument in webview bridge"
```

---

### Task 2: MonacoDataAdapter — 类型转换层

**Files:**
- Create: `src/views/queryResult/MonacoDataAdapter.ts`
- Test: `src/test/queryResult.test.ts` (追加)

- [ ] **Step 1: Write the failing test**

在 `src/test/queryResult.test.ts` 末尾追加：

```typescript
suite('MonacoDataAdapter', () => {
    test('toMonacoCompletionItems converts VS Code items', () => {
        const vscodeItems: vscode.CompletionItem[] = [
            Object.assign(new vscode.CompletionItem('SELECT', vscode.CompletionItemKind.Keyword), {
                sortText: '1_SELECT',
                detail: 'SQL 关键字',
            }),
        ];
        const result = MonacoDataAdapter.toMonacoCompletionItems(vscodeItems);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].label, 'SELECT');
        assert.strictEqual(result[0].kind, 14); // CompletionItemKind.Keyword = 14
        assert.strictEqual(result[0].sortText, '1_SELECT');
    });

    test('toMonacoDiagnostics converts VS Code diagnostics', () => {
        const diagnostics = [
            new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 6),
                'Avoid SELECT *',
                vscode.DiagnosticSeverity.Warning
            ),
        ];
        const result = MonacoDataAdapter.toMonacoDiagnostics(diagnostics);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].startLineNumber, 1);
        assert.strictEqual(result[0].startColumn, 1);
        assert.strictEqual(result[0].endLineNumber, 1);
        assert.strictEqual(result[0].endColumn, 7);
        assert.strictEqual(result[0].message, 'Avoid SELECT *');
        assert.strictEqual(result[0].severity, 4); // MarkerSeverity.Warning = 4
    });

    test('toMonacoHoverContents converts VS Code Hover', () => {
        const hover = new vscode.Hover('Function description');
        const result = MonacoDataAdapter.toMonacoHoverContents(hover);
        assert.ok(result.length > 0);
    });

    test('mapCompletionItemKind maps correctly', () => {
        assert.strictEqual(MonacoDataAdapter.mapCompletionItemKind(vscode.CompletionItemKind.Function), 1);
        assert.strictEqual(MonacoDataAdapter.mapCompletionItemKind(vscode.CompletionItemKind.Keyword), 14);
        assert.strictEqual(MonacoDataAdapter.mapCompletionItemKind(vscode.CompletionItemKind.Snippet), 27);
        assert.strictEqual(MonacoDataAdapter.mapCompletionItemKind(vscode.CompletionItemKind.TypeParameter), 17);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vscode-test-cli --extensionTestsPath out/test/queryResult.test.js 2>&1 | head -30`
Expected: FAIL — `MonacoDataAdapter is not defined`

- [ ] **Step 3: Write minimal implementation**

```typescript
import * as vscode from 'vscode';

export interface MonacoCompletionItem {
    label: string;
    kind: number;
    insertText: string;
    insertTextRules?: number;
    documentation?: string;
    sortText: string;
    filterText?: string;
    detail?: string;
}

export interface MonacoDiagnostic {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    message: string;
    severity: number;
    source?: string;
}

const COMPLETION_ITEM_KIND_MAP: Record<number, number> = {
    [vscode.CompletionItemKind.Method]: 0,
    [vscode.CompletionItemKind.Function]: 1,
    [vscode.CompletionItemKind.Constructor]: 2,
    [vscode.CompletionItemKind.Field]: 3,
    [vscode.CompletionItemKind.Variable]: 4,
    [vscode.CompletionItemKind.Class]: 5,
    [vscode.CompletionItemKind.Struct]: 6,
    [vscode.CompletionItemKind.Interface]: 7,
    [vscode.CompletionItemKind.Module]: 8,
    [vscode.CompletionItemKind.Property]: 9,
    [vscode.CompletionItemKind.Event]: 10,
    [vscode.CompletionItemKind.Operator]: 11,
    [vscode.CompletionItemKind.Unit]: 12,
    [vscode.CompletionItemKind.Value]: 13,
    [vscode.CompletionItemKind.Keyword]: 14,
    [vscode.CompletionItemKind.Text]: 18,
    [vscode.CompletionItemKind.Color]: 19,
    [vscode.CompletionItemKind.File]: 20,
    [vscode.CompletionItemKind.Reference]: 21,
    [vscode.CompletionItemKind.Folder]: 23,
    [vscode.CompletionItemKind.EnumMember]: 16,
    [vscode.CompletionItemKind.Constant]: 14,
    [vscode.CompletionItemKind.TypeParameter]: 17,
    [vscode.CompletionItemKind.Snippet]: 27,
};

const SEVERITY_MAP: Record<number, number> = {
    [vscode.DiagnosticSeverity.Error]: 8,
    [vscode.DiagnosticSeverity.Warning]: 4,
    [vscode.DiagnosticSeverity.Information]: 2,
    [vscode.DiagnosticSeverity.Hint]: 1,
};

export class MonacoDataAdapter {
    static mapCompletionItemKind(kind: vscode.CompletionItemKind): number {
        return COMPLETION_ITEM_KIND_MAP[kind] ?? 14;
    }

    static toMonacoCompletionItems(items: vscode.CompletionItem[]): MonacoCompletionItem[] {
        return items.map((item) => {
            const result: MonacoCompletionItem = {
                label: typeof item.label === 'string' ? item.label : item.label.label,
                kind: MonacoDataAdapter.mapCompletionItemKind(item.kind ?? vscode.CompletionItemKind.Text),
                insertText: item.insertText instanceof vscode.SnippetString
                    ? item.insertText.value
                    : (item.insertText as string | undefined) ?? typeof item.label === 'string' ? item.label : item.label.label,
                sortText: item.sortText ?? '',
            };
            if (item.insertText instanceof vscode.SnippetString) {
                result.insertTextRules = 4; // InsertAsSnippet
            }
            if (item.documentation) {
                result.documentation = typeof item.documentation === 'string'
                    ? item.documentation
                    : (item.documentation as vscode.MarkdownString).value;
            }
            if (item.detail) {
                result.detail = item.detail;
            }
            if (item.filterText) {
                result.filterText = item.filterText;
            }
            return result;
        });
    }

    static toMonacoDiagnostics(diagnostics: vscode.Diagnostic[]): MonacoDiagnostic[] {
        return diagnostics.map((d) => ({
            startLineNumber: d.range.start.line + 1,
            startColumn: d.range.start.character + 1,
            endLineNumber: d.range.end.line + 1,
            endColumn: d.range.end.character + 1,
            message: d.message,
            severity: SEVERITY_MAP[d.severity] ?? 2,
            source: d.source,
        }));
    }

    static toMonacoHoverContents(hover: vscode.Hover): string[] {
        return hover.contents.map((content) => {
            if (typeof content === 'string') return content;
            return (content as vscode.MarkdownString).value;
        });
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vscode-test-cli --extensionTestsPath out/test/queryResult.test.js 2>&1 | head -30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/queryResult/MonacoDataAdapter.ts src/test/queryResult.test.ts
git commit -m "feat: add MonacoDataAdapter for VS Code to Monaco type conversion"
```

---

### Task 3: LanguageBridge — Extension Host 端桥接处理

**Files:**
- Create: `src/views/queryResult/LanguageBridge.ts`
- Test: `src/test/queryResult.test.ts` (追加)

- [ ] **Step 1: Write the failing test**

在 `src/test/queryResult.test.ts` 末尾追加：

```typescript
suite('LanguageBridge', () => {
    test('exportLanguageData returns keywords, dataTypes, functions, snippets for dialect', async () => {
        const bridge = new LanguageBridge(extensionUri);
        const data = bridge.exportLanguageData('mysql');
        assert.ok(data.keywords.length > 0, 'should have keywords');
        assert.ok(data.dataTypes.length > 0, 'should have data types');
        assert.ok(data.functions.length > 0, 'should have functions');
        assert.strictEqual(data.dialect, 'mysql');
    });

    test('exportLanguageData returns monarch rules', async () => {
        const bridge = new LanguageBridge(extensionUri);
        const data = bridge.exportLanguageData('mysql');
        assert.ok(data.monarchRules, 'should have monarch rules');
        assert.ok(data.monarchRules.keywords, 'monarch rules should have keywords');
    });

    test('handleFormatRequest formats SQL', async () => {
        const bridge = new LanguageBridge(extensionUri);
        const result = await bridge.handleFormatRequest('select * from users', 'mysql');
        assert.ok(result.includes('SELECT'), 'formatted SQL should uppercase SELECT');
    });

    test('handleDiagnosticsRequest returns diagnostics', async () => {
        const bridge = new LanguageBridge(extensionUri);
        const result = await bridge.handleDiagnosticsRequest('SELECT * FROM users', 'mysql');
        assert.ok(Array.isArray(result), 'should return array');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vscode-test-cli --extensionTestsPath out/test/queryResult.test.js 2>&1 | head -30`
Expected: FAIL — `LanguageBridge is not defined`

- [ ] **Step 3: Write minimal implementation**

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { sqlDialects } from '../../core/sqlDialects';
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
import { getConnectionManager } from '../../database/connection/ConnectionManager';

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
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    for (const [, value] of Object.entries(content)) {
                        const def = value as { prefix: string; body: string[] | string; description: string };
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
                    [/[^\/*]+/, 'comment'],
                    [/\*\//, 'comment', '@pop'],
                    [/[\/*]/, 'comment'],
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vscode-test-cli --extensionTestsPath out/test/queryResult.test.js 2>&1 | head -30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/queryResult/LanguageBridge.ts src/test/queryResult.test.ts
git commit -m "feat: add LanguageBridge for webview-to-extension-host language feature bridging"
```

---

### Task 4: 集成 LanguageBridge 到 QueryResultPanel

**Files:**
- Modify: `src/views/queryResult/QueryResultPanel.ts`

- [ ] **Step 1: Add LanguageBridge import and instantiation**

在 `QueryResultPanel.ts` 文件顶部添加 import：

```typescript
import { LanguageBridge, type LanguageData } from './LanguageBridge';
```

在 `QueryResultPanel` 类中添加私有属性：

```typescript
private _languageBridge: LanguageBridge;
private _currentDialect: string = 'mysql';
```

在构造函数中初始化（在 `this._update();` 之前）：

```typescript
this._languageBridge = new LanguageBridge(extensionUri);
```

- [ ] **Step 2: Extend WebviewMessage type**

在 `WebviewMessage` 联合类型中添加桥接消息：

```typescript
type WebviewMessage =
    | { command: 'executeQuery'; sql: string }
    | { command: 'executePanelSql'; sql: string }
    | { command: 'cancelQuery' }
    | { command: 'requestExport'; format: string; options?: Record<string, unknown> }
    | { command: 'requestSort'; column: string; direction: string }
    | { command: 'requestFilter'; conditions: FilterCondition[] }
    | { command: 'requestPage'; page: number }
    | { command: 'commitChanges'; changes: PendingChange[]; tableName: string; database: string }
    | { command: 'requestForeignKeyOptions'; column: string; referencedTable: string; database: string }
    | { command: 'beginTransaction' }
    | { command: 'commitTransaction' }
    | { command: 'rollbackTransaction' }
    | { command: 'createSavepoint'; name: string }
    | { command: 'rollbackToSavepoint'; name: string }
    | { command: 'requestBlobPreview'; rowIndex: number; colIndex: number }
    | { command: 'requestCompletion'; requestId: string; sql: string; position: { line: number; column: number }; dialect: string }
    | { command: 'requestHover'; requestId: string; sql: string; position: { line: number; column: number }; dialect: string }
    | { command: 'requestFormat'; requestId: string; sql: string; dialect: string }
    | { command: 'requestDiagnostics'; requestId: string; sql: string; dialect: string };
```

- [ ] **Step 3: Add bridge message handlers in onDidReceiveMessage switch**

在 `onDidReceiveMessage` 的 switch 语句中，`case 'executePanelSql'` 之后添加：

```typescript
case 'requestCompletion': {
    const items = await this._languageBridge.handleCompletionRequest(
        message.sql,
        message.position,
        message.dialect,
    );
    this._panel.webview.postMessage({
        type: 'completionResult',
        data: { requestId: message.requestId, items },
    });
    break;
}
case 'requestHover': {
    const contents = await this._languageBridge.handleHoverRequest(
        message.sql,
        message.position,
        message.dialect,
    );
    this._panel.webview.postMessage({
        type: 'hoverResult',
        data: { requestId: message.requestId, contents },
    });
    break;
}
case 'requestFormat': {
    const formattedSql = await this._languageBridge.handleFormatRequest(
        message.sql,
        message.dialect,
    );
    this._panel.webview.postMessage({
        type: 'formatResult',
        data: { requestId: message.requestId, formattedSql },
    });
    break;
}
case 'requestDiagnostics': {
    const diagnostics = await this._languageBridge.handleDiagnosticsRequest(
        message.sql,
        message.dialect,
    );
    this._panel.webview.postMessage({
        type: 'diagnosticsResult',
        data: { requestId: message.requestId, diagnostics },
    });
    break;
}
```

- [ ] **Step 4: Send languageData on Webview initialization**

在 `_getHtmlForWebview` 方法中，`configData` 对象中添加 `dialect` 字段：

```typescript
const configData = {
    // ... existing fields ...
    dialect: this._currentDialect,
    monacoBasePath: monacoBaseUri.toString(),
    themeKind: vscode.window.activeColorTheme.kind,
};
```

在 `_update` 方法中，`this._panel.webview.html = html;` 之后添加发送 languageData 的逻辑：

```typescript
private _update(): void {
    this._getHtmlForWebview().then(html => {
        this._panel.webview.html = html;
        this._sendLanguageData();
    });
}

private _sendLanguageData(): void {
    const data = this._languageBridge.exportLanguageData(this._currentDialect);
    this._panel.webview.postMessage({
        type: 'languageData',
        data,
    });
}
```

- [ ] **Step 5: Add setDialect public method**

```typescript
public setDialect(dialect: string): void {
    this._currentDialect = dialect;
    this._sendLanguageData();
}
```

- [ ] **Step 6: Update dispose to clean up LanguageBridge**

在 `dispose` 方法中添加：

```typescript
public dispose(): void {
    QueryResultPanel.currentPanel = undefined;
    this._languageBridge.dispose();
    this._panel.dispose();
    while (this._disposables.length) {
        const x = this._disposables.pop();
        if (x) {
            x.dispose();
        }
    }
}
```

- [ ] **Step 7: Build and verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to the modified files

- [ ] **Step 8: Commit**

```bash
git add src/views/queryResult/QueryResultPanel.ts
git commit -m "feat: integrate LanguageBridge into QueryResultPanel"
```

---

### Task 5: Webview 端静态语言特性注册

**Files:**
- Modify: `media/query-result.js`

- [ ] **Step 1: Add language feature state and bridge infrastructure**

在 `media/query-result.js` 的 `state` 对象中添加：

```javascript
var languageData = null;
var pendingRequests = new Map();
var requestIdCounter = 0;
var diagnosticsDebounceTimer = null;
```

在文件末尾（`bindActions(); init();` 之前）添加桥接基础设施函数：

```javascript
function generateRequestId() {
    return 'req_' + (++requestIdCounter) + '_' + Date.now();
}

function sendBridgeRequest(command, payload) {
    var requestId = generateRequestId();
    return new Promise(function(resolve) {
        pendingRequests.set(requestId, {
            resolve: resolve,
            timer: setTimeout(function() {
                pendingRequests.delete(requestId);
                resolve(null);
            }, 3000),
        });
        vscode.postMessage(Object.assign({ command: command, requestId: requestId }, payload));
    });
}

function handleBridgeResponse(data) {
    if (!data || !data.requestId) return;
    var pending = pendingRequests.get(data.requestId);
    if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(data.requestId);
        pending.resolve(data);
    }
}
```

- [ ] **Step 2: Add languageData handler and static feature registration**

在 `handleMessage` 函数的 switch 语句中添加 `languageData` case：

```javascript
case 'languageData':
    handleLanguageData(message.data);
    break;
case 'completionResult':
    handleBridgeResponse(message.data);
    break;
case 'hoverResult':
    handleBridgeResponse(message.data);
    break;
case 'formatResult':
    handleBridgeResponse(message.data);
    break;
case 'diagnosticsResult':
    handleBridgeResponse(message.data);
    break;
```

添加 `handleLanguageData` 函数和静态特性注册函数：

```javascript
function handleLanguageData(data) {
    languageData = data;
    if (monacoEditor && typeof monaco !== 'undefined') {
        registerLanguageFeatures(data);
    }
}

function registerLanguageFeatures(data) {
    if (!data || !monacoEditor) return;

    var dialect = data.dialect || 'mysql';

    monaco.languages.register({ id: dialect });

    monaco.languages.setMonarchTokensProvider(dialect, data.monarchRules);

    monaco.languages.registerCompletionItemProvider(dialect, {
        triggerCharacters: ['.', ' '],
        provideCompletionItems: function(model, position) {
            var word = model.getWordUntilPosition(position);
            var range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };
            var suggestions = [];

            if (data.snippets) {
                data.snippets.forEach(function(s) {
                    suggestions.push({
                        label: s.prefix,
                        kind: 27,
                        insertText: s.body.join('\n'),
                        insertTextRules: 4,
                        documentation: s.description,
                        sortText: '0_' + s.prefix,
                        range: range,
                    });
                });
            }

            if (data.keywords) {
                data.keywords.forEach(function(kw) {
                    suggestions.push({
                        label: kw,
                        kind: 14,
                        insertText: kw,
                        sortText: '1_' + kw,
                        range: range,
                    });
                });
            }

            if (data.dataTypes) {
                data.dataTypes.forEach(function(dt) {
                    suggestions.push({
                        label: dt,
                        kind: 17,
                        insertText: dt,
                        sortText: '1_' + dt,
                        range: range,
                    });
                });
            }

            if (data.functions) {
                data.functions.forEach(function(fn) {
                    var params = fn.params || [];
                    var snippetParams = params.map(function(p, i) { return '${' + (i + 1) + ':' + p + '}'; }).join(', ');
                    suggestions.push({
                        label: fn.name,
                        kind: 1,
                        insertText: fn.name + '(' + snippetParams + ')',
                        insertTextRules: 4,
                        documentation: fn.description || '',
                        detail: fn.category || '',
                        sortText: '2_' + fn.name,
                        range: range,
                    });
                });
            }

            return { suggestions: suggestions };
        },
    });

    monaco.languages.registerSignatureHelpProvider(dialect, {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp: function(model, position) {
            if (!data.functions || data.functions.length === 0) return { dispose: function() {} };

            var lineContent = model.getLineContent(position.lineNumber);
            var textBefore = lineContent.substring(0, position.column - 1);
            var funcMatch = textBefore.match(/(\w+)\s*\(([^)]*)$/);
            if (!funcMatch) return { dispose: function() {} };

            var funcName = funcMatch[1].toUpperCase();
            var funcDef = data.functions.find(function(f) { return f.name.toUpperCase() === funcName; });
            if (!funcDef) return { dispose: function() {} };

            var paramCount = funcMatch[2].split(',').length;
            var params = (funcDef.params || []).map(function(p, i) {
                return { label: p, documentation: '' };
            });

            return {
                value: {
                    signatures: [{
                        label: funcDef.name + '(' + (funcDef.params || []).join(', ') + ')',
                        parameters: params,
                        documentation: funcDef.description || '',
                    }],
                    activeSignature: 0,
                    activeParameter: Math.min(paramCount - 1, params.length - 1),
                },
                dispose: function() {},
            };
        },
    });

    var model = monacoEditor.getModel();
    if (model) {
        monaco.editor.setModelLanguage(model, dialect);
    }
}
```

- [ ] **Step 3: Update createMonacoInstance to register features after creation**

修改 `createMonacoInstance` 函数，在 `monacoEditor.focus();` 之前添加：

```javascript
if (languageData) {
    registerLanguageFeatures(languageData);
}
```

- [ ] **Step 4: Build and manually test**

Run: `npx esbuild.js 2>&1 | tail -5`
Expected: Build succeeds

在 VS Code 中打开扩展，连接数据库，打开查询面板，输入 SQL 验证：
- 关键字补全（输入 `SEL` 应出现 `SELECT`）
- 函数补全（输入 `COU` 应出现 `COUNT`）
- 语法高亮（关键字、数据类型、函数名应有不同颜色）

- [ ] **Step 5: Commit**

```bash
git add media/query-result.js
git commit -m "feat: register static language features in webview Monaco editor"
```

---

### Task 6: Webview 端动态特性桥接（Schema 补全、悬停、格式化、Lint）

**Files:**
- Modify: `media/query-result.js`

- [ ] **Step 1: Add bridge completion provider for Schema-aware completion**

在 `registerLanguageFeatures` 函数末尾（`monaco.editor.setModelLanguage` 之前）添加：

```javascript
monaco.languages.registerCompletionItemProvider(dialect, {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: function(model, position) {
        var sql = model.getValue();
        var pos = { line: position.lineNumber - 1, column: position.column - 1 };
        return sendBridgeRequest('requestCompletion', {
            sql: sql,
            position: pos,
            dialect: dialect,
        }).then(function(response) {
            if (!response || !response.items) return { suggestions: [] };
            var word = model.getWordUntilPosition(position);
            var range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };
            return {
                suggestions: response.items.map(function(item) {
                    return Object.assign({}, item, { range: range });
                }),
            };
        });
    },
});
```

- [ ] **Step 2: Add hover provider bridge**

在 `registerLanguageFeatures` 函数中，桥接补全之后添加：

```javascript
monaco.languages.registerHoverProvider(dialect, {
    provideHover: function(model, position) {
        var sql = model.getValue();
        var pos = { line: position.lineNumber - 1, column: position.column - 1 };
        return sendBridgeRequest('requestHover', {
            sql: sql,
            position: pos,
            dialect: dialect,
        }).then(function(response) {
            if (!response || !response.contents) return null;
            return {
                range: new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column + 20,
                ),
                contents: response.contents.map(function(c) {
                    return { value: c };
                }),
            };
        });
    },
});
```

- [ ] **Step 3: Add format command bridge**

在 `createMonacoInstance` 函数中，现有快捷键绑定之后添加格式化快捷键：

```javascript
monacoEditor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, function() {
    requestFormat();
});
monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI, function() {
    requestFormat();
});
```

添加 `requestFormat` 函数：

```javascript
function requestFormat() {
    if (!monacoEditor) return;
    var sql = monacoEditor.getValue();
    var dialect = languageData ? languageData.dialect : 'mysql';
    sendBridgeRequest('requestFormat', {
        sql: sql,
        dialect: dialect,
    }).then(function(response) {
        if (!response || !response.formattedSql) return;
        var fullRange = monacoEditor.getModel().getFullModelRange();
        monacoEditor.executeEdits('format', [{
            range: fullRange,
            text: response.formattedSql,
        }]);
        monacoEditor.pushUndoStop();
    });
}
```

- [ ] **Step 4: Add diagnostics (Lint) bridge with debounce**

在 `createMonacoInstance` 函数中，`monacoEditor.focus();` 之前添加模型变更监听：

```javascript
monacoEditor.onDidChangeModelContent(function() {
    requestDiagnosticsDebounced();
});
```

添加诊断请求函数：

```javascript
function requestDiagnosticsDebounced() {
    if (diagnosticsDebounceTimer) {
        clearTimeout(diagnosticsDebounceTimer);
    }
    diagnosticsDebounceTimer = setTimeout(function() {
        requestDiagnostics();
    }, 500);
}

function requestDiagnostics() {
    if (!monacoEditor) return;
    var sql = monacoEditor.getValue();
    var dialect = languageData ? languageData.dialect : 'mysql';
    sendBridgeRequest('requestDiagnostics', {
        sql: sql,
        dialect: dialect,
    }).then(function(response) {
        if (!response || !response.diagnostics) return;
        var model = monacoEditor.getModel();
        if (model) {
            monaco.editor.setModelMarkers(model, 'sql-lint', response.diagnostics);
        }
    });
}
```

- [ ] **Step 5: Build and manually test all dynamic features**

Run: `npx esbuild.js 2>&1 | tail -5`
Expected: Build succeeds

测试验证：
1. 连接数据库后输入 `SELECT * FROM u`，Schema 补全应出现表名
2. 鼠标悬停在函数名上应显示函数签名
3. Shift+Alt+F 应格式化 SQL
4. 输入 `SELECT * FROM` 后应有 Lint 波浪线提示

- [ ] **Step 6: Commit**

```bash
git add media/query-result.js
git commit -m "feat: add dynamic language feature bridges (schema completion, hover, format, lint)"
```

---

### Task 7: 连接切换时更新方言

**Files:**
- Modify: `src/views/queryResult/QueryResultPanel.ts`
- Modify: `media/query-result.js`

- [ ] **Step 1: Update showResult to detect and send dialect**

在 `QueryResultPanel.ts` 的 `showResult` 方法中，添加方言检测逻辑。在方法开头添加：

```typescript
const connMgr = getConnectionManager();
const activeConn = connMgr.getActiveConnection();
if (activeConn) {
    const newDialect = activeConn.type || 'mysql';
    if (newDialect !== this._currentDialect) {
        this._currentDialect = newDialect;
        this._sendLanguageData();
    }
}
```

需要在文件顶部添加 import（如果尚未导入）：

```typescript
import { getConnectionManager } from '../../database/connection/ConnectionManager';
```

- [ ] **Step 2: Update webview to handle dialect changes**

在 `media/query-result.js` 的 `handleLanguageData` 函数中，确保重新注册所有语言特性并更新编辑器语言：

```javascript
function handleLanguageData(data) {
    languageData = data;
    if (monacoEditor && typeof monaco !== 'undefined') {
        registerLanguageFeatures(data);
        var model = monacoEditor.getModel();
        if (model) {
            monaco.editor.setModelLanguage(model, data.dialect || 'mysql');
        }
    }
}
```

- [ ] **Step 3: Build and verify**

Run: `npx esbuild.js 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/views/queryResult/QueryResultPanel.ts media/query-result.js
git commit -m "feat: update dialect on connection switch and re-register language features"
```

---

### Task 8: 端到端集成测试与清理

**Files:**
- Modify: `src/test/queryResult.test.ts` (追加)
- All modified files (最终验证)

- [ ] **Step 1: Add integration test for full bridge flow**

在 `src/test/queryResult.test.ts` 末尾追加：

```typescript
suite('LanguageBridge Integration', () => {
    test('full completion flow: exportLanguageData + handleCompletionRequest', async () => {
        const bridge = new LanguageBridge(extensionUri);
        const data = bridge.exportLanguageData('mysql');
        assert.ok(data.keywords.includes('SELECT'), 'mysql should have SELECT keyword');
        assert.ok(data.functions.length > 0, 'mysql should have functions');

        const items = await bridge.handleCompletionRequest(
            'SELECT * FROM ',
            { line: 0, column: 15 },
            'mysql',
        );
        assert.ok(Array.isArray(items), 'should return array');
    });

    test('hover returns null for unknown word', async () => {
        const bridge = new LanguageBridge(extensionUri);
        const result = await bridge.handleHoverRequest(
            'SELECT xyzabc123 FROM users',
            { line: 0, column: 8 },
            'mysql',
        );
        assert.strictEqual(result, null, 'unknown word should return null');
    });

    test('format preserves valid SQL', async () => {
        const bridge = new LanguageBridge(extensionUri);
        const result = await bridge.handleFormatRequest('select 1', 'mysql');
        assert.ok(result.length > 0, 'formatted result should not be empty');
    });

    test('diagnostics for empty SQL returns empty', async () => {
        const bridge = new LanguageBridge(extensionUri);
        const result = await bridge.handleDiagnosticsRequest('', 'mysql');
        assert.ok(Array.isArray(result), 'should return array');
    });

    test('MonacoDataAdapter handles empty items', () => {
        const result = MonacoDataAdapter.toMonacoCompletionItems([]);
        assert.strictEqual(result.length, 0);
    });

    test('MonacoDataAdapter handles empty diagnostics', () => {
        const result = MonacoDataAdapter.toMonacoDiagnostics([]);
        assert.strictEqual(result.length, 0);
    });
});
```

- [ ] **Step 2: Run full test suite**

Run: `npx vscode-test-cli --extensionTestsPath out/test/queryResult.test.js 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 3: Run lint check**

Run: `npx eslint src/views/queryResult/ 2>&1 | head -20`
Expected: No errors (fix any that appear)

- [ ] **Step 4: Run TypeScript type check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Final commit**

```bash
git add src/test/queryResult.test.ts
git commit -m "test: add integration tests for LanguageBridge and MonacoDataAdapter"
```
