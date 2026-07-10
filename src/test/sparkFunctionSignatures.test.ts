import * as assert from "assert";
import { functionSignatures } from "../dialects/spark/spark.functions";

suite("Spark Function Signatures Completeness Tests", () => {
    const requiredHigherOrderFunctions = ["TRANSFORM", "FILTER", "AGGREGATE", "REDUCE", "ZIP_WITH"];

    for (const fn of requiredHigherOrderFunctions) {
        test(`高阶函数 ${fn} 存在签名`, () => {
            const sig = functionSignatures.find((s) => s.name === fn);
            assert.ok(sig, `missing function signature: ${fn}`);
            assert.ok(sig!.params.length >= 2, `${fn} should have >=2 params (array + lambda)`);
            assert.ok(sig!.description.length > 0);
            assert.strictEqual(sig!.category, "collection");
        });
    }

    const requiredNewFunctions = ["ANY_VALUE", "BIT_COUNT", "SPLIT_PART", "MAKE_YM_INTERVAL"];

    for (const fn of requiredNewFunctions) {
        test(`Spark 3.4+ 新函数 ${fn} 存在签名`, () => {
            const sig = functionSignatures.find((s) => s.name === fn);
            assert.ok(sig, `missing function signature: ${fn}`);
            assert.ok(sig!.description.length > 0);
        });
    }

    const requiredGeneratorFunctions = ["POSEXPLODE", "STACK", "INLINE", "EXPLODE_OUTER", "POSEXPLODE_OUTER"];

    for (const fn of requiredGeneratorFunctions) {
        test(`Generator 函数 ${fn} 存在签名`, () => {
            const sig = functionSignatures.find((s) => s.name === fn);
            assert.ok(sig, `missing function signature: ${fn}`);
            assert.strictEqual(sig!.category, "table");
        });
    }

    test("所有签名有非空描述", () => {
        for (const sig of functionSignatures) {
            assert.ok(sig.description.length > 0, `${sig.name} missing description`);
        }
    });

    test("函数名唯一（无重复签名）", () => {
        const names = functionSignatures.map((s) => s.name);
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        assert.deepStrictEqual(dupes, [], `duplicate signatures: ${dupes.join(", ")}`);
    });

    test("TRANSFORM 签名包含 lambda 参数", () => {
        const sig = functionSignatures.find((s) => s.name === "TRANSFORM");
        assert.ok(sig);
        const paramsStr = sig!.params.join(" ");
        assert.ok(
            paramsStr.includes("lambda") || paramsStr.includes("function") || paramsStr.includes("func"),
            "TRANSFORM should have lambda/function param",
        );
    });
});
