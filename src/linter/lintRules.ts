import * as vscode from "vscode";
import { tAny, getLanguage } from "../i18n";
import { getConfigManager } from "../core/configManager";
import { RULES } from "./rules/index";
import type { LintRule } from "./rules/LintRule";

export interface LintRuleDefinition {
    id: string;
    name: string;
    description: string;
    defaultSeverity: vscode.DiagnosticSeverity;
    defaultEnabled: boolean;
    category: string;
}

export interface LintRuleConfig {
    enabled: boolean;
    severity: vscode.DiagnosticSeverity;
}

const DEFAULT_CONFIG: LintRuleConfig = { enabled: false, severity: vscode.DiagnosticSeverity.Warning };

/**
 * Provider function that returns rule definitions from the RuleRegistry's
 * already-instantiated rules, avoiding duplicate instantiation.
 * Set by RuleRegistry.registerAllRules() after rules are registered.
 */
let _definitionsProvider: (() => LintRuleDefinition[]) | undefined;

/**
 * Set the definitions provider (called by RuleRegistry after rules are registered).
 * This allows buildRuleDefinitions() to extract metadata from the RuleRegistry's
 * existing rule instances instead of creating separate instances.
 */
export function setDefinitionsProvider(provider: (() => LintRuleDefinition[]) | undefined): void {
    _definitionsProvider = provider;
    _cachedDefinitions = undefined;
}

/**
 * Build rule definitions dynamically.
 * If a definitions provider is available (set by RuleRegistry), uses it to extract
 * metadata from already-instantiated rules. Otherwise, falls back to instantiating
 * each rule class with a default config to extract metadata.
 */
function buildRuleDefinitions(): LintRuleDefinition[] {
    if (_definitionsProvider) {
        return _definitionsProvider();
    }

    // Fallback: instantiate rules to extract metadata (used before RuleRegistry is initialized)
    const definitions: LintRuleDefinition[] = [];

    for (const [, RuleClass] of Object.entries(RULES)) {
        const instance = new RuleClass(DEFAULT_CONFIG);
        definitions.push({
            id: instance.id,
            name: tAny(instance.name),
            description: tAny(instance.description),
            defaultSeverity: instance.defaultSeverity,
            defaultEnabled: instance.defaultEnabled,
            category: instance.category,
        });
    }

    return definitions;
}

let _cachedDefinitions: LintRuleDefinition[] | undefined;
let _cachedLang: string | undefined;

function getRuleDefinitions(): LintRuleDefinition[] {
    const currentLang = getLanguage();
    if (!_cachedDefinitions || _cachedLang !== currentLang) {
        _cachedDefinitions = buildRuleDefinitions();
        _cachedLang = currentLang;
    }
    return _cachedDefinitions;
}

/** Invalidate the cached rule definitions (e.g. when i18n language changes) */
export function invalidateRuleDefinitions(): void {
    _cachedDefinitions = undefined;
}

export function getAllRuleDefinitions(): LintRuleDefinition[] {
    return getRuleDefinitions();
}

export function getAllRuleDefinitionsFromRules(rules: LintRule[]): LintRuleDefinition[] {
    return rules.map((rule) => ({
        id: rule.id,
        name: tAny(rule.name),
        description: tAny(rule.description),
        defaultSeverity: rule.defaultSeverity,
        defaultEnabled: rule.defaultEnabled,
        category: rule.category,
    }));
}

export function getRuleDefinition(id: string): LintRuleDefinition | undefined {
    return getRuleDefinitions().find((r) => r.id === id);
}

export function loadRuleConfigs(): Map<string, LintRuleConfig> {
    const cfgMgr = getConfigManager();
    const result = new Map<string, LintRuleConfig>();
    const definitions = getRuleDefinitions();

    for (const rule of definitions) {
        const ruleConfig = cfgMgr.get<{ enabled?: boolean; severity?: string }>(`lint.${rule.id}`, {
            enabled: rule.defaultEnabled,
            severity: undefined,
        });
        const enabled = ruleConfig?.enabled ?? rule.defaultEnabled;
        const severityStr = ruleConfig?.severity;
        let severity = rule.defaultSeverity;

        if (severityStr) {
            switch (severityStr.toLowerCase()) {
                case "error":
                    severity = vscode.DiagnosticSeverity.Error;
                    break;
                case "warning":
                    severity = vscode.DiagnosticSeverity.Warning;
                    break;
                case "information":
                    severity = vscode.DiagnosticSeverity.Information;
                    break;
                case "hint":
                    severity = vscode.DiagnosticSeverity.Hint;
                    break;
            }
        }

        result.set(rule.id, { enabled, severity });
    }

    return result;
}
