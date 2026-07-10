import * as vscode from "vscode";
import type { LintRule, RuleContext } from "./rules/LintRule";
import { loadRuleConfigs, setDefinitionsProvider, type LintRuleConfig, type LintRuleDefinition } from "./lintRules";
import { getContainer, Tokens } from "../core/diContainer";
import { getConfigManager } from "../core/configManager";
import { RULES } from "./rules/index";
import { tAny } from "../i18n";

const DEFAULT_CONFIG: LintRuleConfig = { enabled: false, severity: vscode.DiagnosticSeverity.Warning };

export class RuleRegistry {
    private rules = new Map<string, LintRule>();
    private rulesByType = new Map<string, LintRule[]>();
    private enabledRulesCache = new Map<string, LintRule[]>();
    private enabledGlobalRulesCache: LintRule[] | null = null;
    private cacheVersion = 0;
    private cacheValidVersion = -1;

    private invalidateCache(): void {
        this.enabledRulesCache.clear();
        this.enabledGlobalRulesCache = null;
        this.cacheVersion++;
    }

    register(rule: LintRule): void {
        this.rules.set(rule.id, rule);

        for (const type of rule.applicableTypes) {
            if (!this.rulesByType.has(type)) {
                this.rulesByType.set(type, []);
            }
            const list = this.rulesByType.get(type);
            if (list) {
                list.push(rule);
            }
        }
        this.invalidateCache();
    }

    getRuleById(ruleId: string): LintRule | undefined {
        return this.rules.get(ruleId);
    }

    getEnabledRulesForType(type: string): LintRule[] {
        if (this.cacheValidVersion === this.cacheVersion) {
            const cached = this.enabledRulesCache.get(type);
            if (cached !== undefined) return cached;
        }

        const rules = this.rulesByType.get(type) || [];
        const enabled = rules.filter((r) => r.isEnabled());
        this.enabledRulesCache.set(type, enabled);
        this.cacheValidVersion = this.cacheVersion;
        return enabled;
    }

    getEnabledGlobalRules(): LintRule[] {
        if (this.cacheValidVersion === this.cacheVersion && this.enabledGlobalRulesCache !== null) {
            return this.enabledGlobalRulesCache;
        }

        const enabled = Array.from(this.rules.values()).filter((r) => r.applicableTypes.length === 0 && r.isEnabled());
        this.enabledGlobalRulesCache = enabled;
        this.cacheValidVersion = this.cacheVersion;
        return enabled;
    }

    runRules(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const rules = this.getEnabledRulesForType(context.node.type);

        for (const rule of rules) {
            diagnostics.push(...rule.check(context));
        }

        return diagnostics;
    }

    runGlobalRules(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const globalRules = this.getEnabledGlobalRules();

        for (const rule of globalRules) {
            diagnostics.push(...rule.check(context));
        }

        return diagnostics;
    }

    getRuleDefinitions(): LintRuleDefinition[] {
        return Array.from(this.rules.values()).map((rule) => ({
            id: rule.id,
            name: tAny(rule.name),
            description: tAny(rule.description),
            defaultSeverity: rule.defaultSeverity,
            defaultEnabled: rule.defaultEnabled,
            category: rule.category,
        }));
    }

    registerAllRules(): void {
        const lintKeys = Object.keys(RULES).map((k) => `lint.${k}`);
        getConfigManager().registerLintKeys(lintKeys);

        // Step 1: Instantiate all rules with DEFAULT_CONFIG and register them.
        // This creates each rule instance only once.
        for (const [, RuleClass] of Object.entries(RULES)) {
            this.register(new RuleClass(DEFAULT_CONFIG));
        }

        // Step 2: Set the definitions provider so that buildRuleDefinitions() in lintRules.ts
        // can extract metadata from these already-instantiated rules instead of creating
        // separate instances.
        setDefinitionsProvider(() => this.getRuleDefinitions());

        // Step 3: Load configs using definitions from the registered instances.
        // Now loadRuleConfigs() -> getRuleDefinitions() -> buildRuleDefinitions()
        // will use the provider (our getRuleDefinitions()) instead of instantiating rules again.
        const configs = loadRuleConfigs();

        // Step 4: Update each rule's config from the loaded configs.
        for (const [key] of Object.entries(RULES)) {
            const rule = this.getRuleById(key as string);
            const config = configs.get(key as string) ?? DEFAULT_CONFIG;
            rule?.updateConfig(config);
        }

        // Invalidate caches since configs changed after initial registration
        this.invalidateCache();
    }

    reloadConfig(): void {
        const configs = loadRuleConfigs();
        for (const [key, rule] of this.rules) {
            const config = configs.get(key) ?? DEFAULT_CONFIG;
            rule.updateConfig(config);
        }
        this.invalidateCache();
    }
}

export function createRuleRegistry(): RuleRegistry {
    const registry = new RuleRegistry();
    registry.registerAllRules();
    return registry;
}

export function getRuleRegistry(): RuleRegistry {
    return getContainer().get<RuleRegistry>(Tokens.RuleRegistry);
}
