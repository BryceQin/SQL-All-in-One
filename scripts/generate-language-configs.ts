/**
 * Build script: generates VSCode language-configuration files for all SQL dialects.
 *
 * Imports the dialect tokenizer configs (src/grammar/) and writes
 * language-configurations/<langId>.json for each registered language ID.
 * Generated files are committed to git (same policy as syntaxes/ —
 * build environments may not run the full toolchain).
 *
 * Validation is performed before each write; any data error aborts with
 * a non-zero exit code (CI-safe).
 *
 * Usage: npx tsx scripts/generate-language-configs.ts
 */

import * as fs from "fs";
import * as path from "path";
import { buildLanguageConfiguration } from "../src/grammar/languageConfigBuilder";
import { dialectGrammarConfigs } from "../src/grammar/dialectGrammarConfigs";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "language-configurations");

function main(): void {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const langIds = new Set<string>();
    for (const config of dialectGrammarConfigs) {
        if (langIds.has(config.langId)) {
            throw new Error(`langId 重复: ${config.langId}`);
        }
        langIds.add(config.langId);

        // buildLanguageConfiguration 内部已校验派生数据（注释符非法即抛错，CI-safe）
        const json = JSON.stringify(buildLanguageConfiguration(config), null, 4) + "\n";

        const outFile = path.join(OUTPUT_DIR, `${config.langId}.language-configuration.json`);
        fs.writeFileSync(outFile, json, "utf8");
        console.log(`  ${config.langId.padEnd(12)} → ${path.relative(PROJECT_ROOT, outFile)}`);
    }

    console.log(`Generated ${dialectGrammarConfigs.length} language configurations in ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}/`);
}

main();
