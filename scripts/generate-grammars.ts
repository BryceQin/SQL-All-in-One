/**
 * Build script: generates TextMate grammar files for all SQL dialects.
 *
 * Imports the dialect tokenizer configs (src/grammar/) and writes
 * syntaxes/<dialect>.tmLanguage.json for each registered language ID.
 * Generated files are committed to git (same policy as snippetData.ts —
 * build environments may not run the full toolchain).
 *
 * Validation is performed before each write; any data error aborts with
 * a non-zero exit code (CI-safe).
 *
 * Usage: npx tsx scripts/generate-grammars.ts
 */

import * as fs from "fs";
import * as path from "path";
import { buildGrammar } from "../src/grammar/grammarBuilder";
import { dialectGrammarConfigs } from "../src/grammar/dialectGrammarConfigs";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "syntaxes");

/** oniguruma（TextMate 引擎）不支持 JS 的 [^] 与 \p{...}，生成物中必须不存在 */
const ONIGURUMA_INCOMPATIBLE = [/[^\\]\[\^\]/, /\\p\{/];

function validateGrammar(json: string, langId: string): void {
    for (const pattern of ONIGURUMA_INCOMPATIBLE) {
        if (pattern.test(json)) {
            throw new Error(`${langId}: 生成物包含 oniguruma 不兼容的模式 ${pattern}（源：${json.slice(0, 200)}）`);
        }
    }
    const parsed = JSON.parse(json) as { name?: string; scopeName?: string; patterns?: unknown; repository?: unknown };
    if (!parsed.name || !parsed.scopeName || !Array.isArray(parsed.patterns) || typeof parsed.repository !== "object") {
        throw new Error(`${langId}: 生成物结构不完整（缺 name/scopeName/patterns/repository）`);
    }
    // 每条 match/begin/end 必须是可编译的正则（JSON 字符串形式，用 RegExp 粗校验语法）。
    // oniguruma 的 inline flag 前缀（如 (?i)）为 JS RegExp 不支持，校验前剥离。
    const stripOnigurumaFlags = (re: string): string => re.replace(/\(\?[a-z]+\)/g, "");
    const walk = (rules: unknown): void => {
        if (Array.isArray(rules)) {
            for (const rule of rules) walk(rule);
        } else if (rules && typeof rules === "object") {
            for (const key of ["match", "begin", "end"]) {
                const value = (rules as Record<string, unknown>)[key];
                if (typeof value === "string") {
                    try {
                        new RegExp(stripOnigurumaFlags(value));
                    } catch (e) {
                        throw new Error(`${langId}: 规则 ${key} 不是合法正则: ${value} (${e})`);
                    }
                }
            }
            for (const value of Object.values(rules)) walk(value);
        }
    };
    walk(parsed.repository);
}

function main(): void {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const scopeNames = new Set<string>();
    let totalRules = 0;

    for (const config of dialectGrammarConfigs) {
        if (scopeNames.has(config.scopeName)) {
            throw new Error(`scopeName 重复: ${config.scopeName}`);
        }
        scopeNames.add(config.scopeName);

        const grammar = buildGrammar(config);
        totalRules += grammar.patterns.length;
        const json = JSON.stringify(grammar, null, 4) + "\n";

        validateGrammar(json, config.langId);

        const outFile = path.join(OUTPUT_DIR, `${config.fileName}.tmLanguage.json`);
        fs.writeFileSync(outFile, json, "utf-8");
        console.log(`  ${config.langId.padEnd(12)} → ${path.relative(PROJECT_ROOT, outFile)} (${grammar.patterns.length} includes)`);
    }

    console.log(
        `Generated ${dialectGrammarConfigs.length} grammars (${totalRules} includes total) in ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}/`,
    );
}

main();
