import type { Parser } from 'node-sql-parser';
import type { AST } from 'node-sql-parser';
import type { SqlDialect } from './dialectMapper';
import { toNodeSqlParserDialect } from './dialectMapper';
import { ParseError } from './ParseError';
import { getContainer, Tokens } from '../core/diContainer';
import { LRUCache } from '../utils/lruCache';

interface AstifyCacheEntry {
    ast: AST[] | AST;
}

export class SqlParserEngine {
    private parser: Parser | null = null;
    private astifyCache: LRUCache<string, AstifyCacheEntry> | null = null;
    private readonly ASTIFY_CACHE_SIZE = 50;
    private readonly ASTIFY_CACHE_MAX_AGE = 10000;

    private getParser(): Parser {
        if (!this.parser) {
            // Lazy-load node-sql-parser to defer ~5MB module evaluation
            // until first parse, reducing extension activation time.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { Parser } = require('node-sql-parser') as typeof import('node-sql-parser');
            this.parser = new Parser();
        }
        return this.parser;
    }

    private getAstifyCache(): LRUCache<string, AstifyCacheEntry> {
        if (!this.astifyCache) {
            this.astifyCache = new LRUCache<string, AstifyCacheEntry>({
                maxSize: this.ASTIFY_CACHE_SIZE,
                maxAge: this.ASTIFY_CACHE_MAX_AGE,
            });
        }
        return this.astifyCache;
    }

    private makeCacheKey(sql: string, dialect: SqlDialect): string {
        // Use length + head + tail as the key instead of a 32-bit FNV hash.
        // The previous FNV-1a hash had a non-trivial collision probability on
        // large SQL inputs (32-bit space, ~50k entriesBirthday-bound ≈ 0.1%
        // at 100k distinct statements). A collision would silently return the
        // wrong AST, producing formatter/linter bugs that are nearly
        // impossible to reproduce.
        //
        // Length + first 32 + last 32 chars uniquely identifies virtually all
        // real-world SQL (two statements with identical length AND identical
        // 64-char head+tail but different middles are astronomically unlikely).
        // For statements shorter than 64 chars, the whole string is covered.
        const len = sql.length;
        const head = sql.substring(0, 32);
        const tail = len > 32 ? sql.substring(len - 32) : '';
        return `${dialect}::${len}::${head}::${tail}`;
    }

    astify(sql: string, dialect: SqlDialect): AST[] | AST {
        const cache = this.getAstifyCache();
        const key = this.makeCacheKey(sql, dialect);
        const cached = cache.get(key);
        if (cached) {
            return cached.ast;
        }

        try {
            const ast = this.getParser().astify(sql, {
                database: toNodeSqlParserDialect(dialect),
                parseOptions: { includeLocations: true },
            });
            cache.set(key, { ast });
            return ast;
        } catch (e) {
            throw new ParseError(dialect, sql, e);
        }
    }

    sqlify(ast: AST[] | AST, dialect: SqlDialect): string {
        return this.getParser().sqlify(ast, {
            database: toNodeSqlParserDialect(dialect),
        });
    }

    tryAstify(sql: string, dialect: SqlDialect): { success: boolean; ast: AST[] | AST | null; error: ParseError | null } {
        try {
            const ast = this.astify(sql, dialect);
            return { success: true, ast, error: null };
        } catch (e) {
            const error = e instanceof ParseError ? e : new ParseError(dialect, sql, e);
            return { success: false, ast: null, error };
        }
    }

    clearCache(): void {
        if (this.astifyCache) {
            this.astifyCache.clear();
        }
    }

    dispose(): void {
        this.parser = null;
        if (this.astifyCache) {
            this.astifyCache.clear();
            this.astifyCache = null;
        }
    }
}

export function createParserEngine(): SqlParserEngine {
    return new SqlParserEngine();
}

export function getParserEngine(): SqlParserEngine {
    return getContainer().get<SqlParserEngine>(Tokens.ParserEngine);
}
