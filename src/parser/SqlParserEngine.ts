import { Parser } from 'node-sql-parser';
import type { AST, TableColumnAst } from 'node-sql-parser';
import type { SqlDialect } from './dialectMapper';
import { toNodeSqlParserDialect } from './dialectMapper';
import { ParseError } from './ParseError';
import { getContainer, Tokens } from '../core/diContainer';
import { LRUCache } from '../utils/lruCache';

export interface ParseResult {
    ast: AST[] | AST;
    tableList: string[];
    columnList: string[];
}

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
        const FNV_OFFSET = 2166136261;
        const FNV_PRIME = 16777619;
        let hash = FNV_OFFSET;
        for (let i = 0; i < sql.length; i++) {
            hash ^= sql.charCodeAt(i);
            hash = Math.imul(hash, FNV_PRIME);
        }
        return `${dialect}::${sql.length}::${hash >>> 0}`;
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

    parse(sql: string, dialect: SqlDialect): ParseResult {
        try {
            const result: TableColumnAst = this.getParser().parse(sql, {
                database: toNodeSqlParserDialect(dialect),
                parseOptions: { includeLocations: true },
            });
            return {
                ast: result.ast,
                tableList: result.tableList,
                columnList: result.columnList,
            };
        } catch (e) {
            throw new ParseError(dialect, sql, e);
        }
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
