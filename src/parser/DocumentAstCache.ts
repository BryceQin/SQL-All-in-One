import * as vscode from 'vscode';
import type { AST } from 'node-sql-parser';
import { getParserEngine } from './SqlParserEngine';
import type { SqlDialect } from './dialectMapper';
import type { ParseError } from './ParseError';
import { LRUCache } from '../utils/lruCache';
import { getPerformanceMonitor } from '../core/performanceMonitor';
import { getContainer, Tokens } from '../core/diContainer';

interface CacheEntry {
  version: number;
  ast: AST[] | AST;
  timestamp: number;
}

export class DocumentAstCache {
  private cache: LRUCache<string, CacheEntry>;
  private disposables: vscode.Disposable[] = [];
  private perfMonitor = getPerformanceMonitor();

  constructor() {
    this.cache = new LRUCache<string, CacheEntry>({
      maxSize: 50,
      maxAge: 30000,
    });

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
    return this.perfMonitor.measure('DocumentAstCache.getOrParse', () => {
      const key = document.uri.toString();
      const version = document.version;
      const cached = this.cache.get(key);

      if (cached && cached.version === version) {
        return { success: true, ast: cached.ast, error: null };
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
    });
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

getContainer().registerFactory(Tokens.DocumentAstCache, getDocumentAstCache);
