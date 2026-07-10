import type { Parser } from "node-sql-parser";
import type { AST } from "node-sql-parser";
import type { SqlDialect } from "./dialectMapper";
import { toNodeSqlParserDialect } from "./dialectMapper";
import { ParseError } from "./ParseError";
import { getContainer, Tokens } from "../core/diContainer";
import { LRUCache } from "../utils/lruCache";
import { hashSql } from "./sqlHasher";

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
            const { Parser } = require("node-sql-parser") as typeof import("node-sql-parser");
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
        // SHA-256 哈希提供抗碰撞保证，消除长 SQL 缓存命中错误 AST 的风险。
        // 之前的 `len + head32 + tail32` 方案对中间修改会碰撞，导致格式化/lint bug。
        // 性能：100KB SQL 哈希耗时小于 1ms，远小于解析耗时（10-100ms）。
        return `${dialect}::${hashSql(sql)}`;
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
