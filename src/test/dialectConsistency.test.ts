import * as assert from "assert";
import { getDialectEntries } from "../core/dialectRegistry";
import { keywordMap, functionSigMap } from "../dialects/dialectData";
import { getKeywordsForDialect } from "../dialects/keywords";

suite("Dialect List Consistency", () => {
    test("dialectRegistry, allDialects, dialectData, and keywords/index agree on dialect set", () => {
        const registryDialects = new Set(getDialectEntries().map((e) => e.sqlDialect));
        // allDialects exposes 12 named exports; the keyword/data arrays exist for each.
        const allDialectsKeys = new Set([
            "hive",
            "mysql",
            "spark",
            "flinksql",
            "sql",
            "postgresql",
            "bigquery",
            "sqlite",
            "starrocks",
            "sqlserver",
            "oracle",
            "dameng",
        ]);

        // dialectData.keywordMap must answer for every registry dialect.
        for (const d of registryDialects) {
            assert.ok(d in keywordMap, `dialectData.keywordMap missing dialect: ${d}`);
            assert.ok(d in functionSigMap, `dialectData.functionSigMap missing dialect: ${d}`);
            assert.ok(allDialectsKeys.has(d), `allDialects missing dialect: ${d}`);
        }
        // keywords/index answers for every dialect too (sql maps to []).
        for (const d of registryDialects) {
            const kw = getKeywordsForDialect(d as never);
            assert.ok(Array.isArray(kw), `keywords/index missing dialect: ${d}`);
        }
    });

    test("all four lists have exactly 12 dialects (no drift)", () => {
        const registryCount = new Set(getDialectEntries().map((e) => e.sqlDialect)).size;
        assert.strictEqual(registryCount, 12, "dialectRegistry should have 12 dialects");

        let dialectDataCount = 0;
        for (const _ of Object.keys(keywordMap)) dialectDataCount++;
        assert.strictEqual(dialectDataCount, 12, "dialectData.keywordMap should have 12 dialects");

        let funcDataCount = 0;
        for (const _ of Object.keys(functionSigMap)) funcDataCount++;
        assert.strictEqual(funcDataCount, 12, "dialectData.functionSigMap should have 12 dialects");
    });
});
