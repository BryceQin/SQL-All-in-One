import * as vscode from 'vscode';
import type { AST } from 'node-sql-parser';
import { getParserEngine } from './SqlParserEngine';
import type { SqlDialect } from './dialectMapper';
import type { ParseError } from './ParseError';

interface CacheEntry {
    version: number;
    ast: AST[] | AST;
    timestamp: number;
}

export class DocumentAstCache {
    private cache = new Map<string, CacheEntry>();
    private disposables: vscode.Disposable[] = [];
    private maxAge = 5000;

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument((doc) => {
                this.cache.delete(doc.uri.toString());
            }),
        );
    }

    getOrParse(document: vscode.TextDocument, dialect: SqlDialect): {
        success: boolean;
        ast: AST[] | AST | null;
        error: ParseError | null;
    } {
        const key = document.uri.toString();
        const version = document.version;
        const cached = this.cache.get(key);

        if (cached && cached.version === version) {
            if (Date.now() - cached.timestamp < this.maxAge) {
                return { success: true, ast: cached.ast, error: null };
            }
        }

        const engine = getParserEngine();
        const result = engine.tryAstify(document.getText(), dialect);

        if (result.success && result.ast) {
            this.cache.set(key, {
                version,
                ast: result.ast,
                timestamp: Date.now(),
            });
        }

        return result;
    }

    invalidate(uri: vscode.Uri): void {
        this.cache.delete(uri.toString());
    }

    dispose(): void {
        this.cache.clear();
        this.disposables.forEach((d) => d.dispose());
    }
}

let instance: DocumentAstCache | null = null;

export function getDocumentAstCache(): DocumentAstCache {
    if (!instance) {
        instance = new DocumentAstCache();
    }
    return instance;
}