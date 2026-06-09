import * as vscode from 'vscode'
import { tAny, getLanguage } from '../i18n'
import { getConfigManager } from '../core/configManager'
import { RULES } from './rules/index'
import type { LintRule } from './rules/LintRule'

export interface LintRuleDefinition {
    id: string
    name: string
    description: string
    defaultSeverity: vscode.DiagnosticSeverity
    defaultEnabled: boolean
    category: string
}

export interface LintRuleConfig {
    enabled: boolean
    severity: vscode.DiagnosticSeverity
}

const DEFAULT_CONFIG: LintRuleConfig = { enabled: false, severity: vscode.DiagnosticSeverity.Warning }

/**
 * Build rule definitions dynamically from the RULES registry.
 * Each rule class is instantiated with a default config and its metadata is extracted.
 * This eliminates the need to maintain a separate BUILT_IN_RULES array.
 */
function buildRuleDefinitions(): LintRuleDefinition[] {
    const definitions: LintRuleDefinition[] = []

    for (const [, RuleClass] of Object.entries(RULES)) {
        const instance = new RuleClass(DEFAULT_CONFIG)
        definitions.push({
            id: instance.id,
            name: tAny(instance.name),
            description: tAny(instance.description),
            defaultSeverity: instance.defaultSeverity,
            defaultEnabled: instance.defaultEnabled,
            category: instance.category,
        })
    }

    return definitions
}

let _cachedDefinitions: LintRuleDefinition[] | undefined
let _cachedLang: string | undefined

function getRuleDefinitions(): LintRuleDefinition[] {
    const currentLang = getLanguage()
    if (!_cachedDefinitions || _cachedLang !== currentLang) {
        _cachedDefinitions = buildRuleDefinitions()
        _cachedLang = currentLang
    }
    return _cachedDefinitions
}

/** Invalidate the cached rule definitions (e.g. when i18n language changes) */
export function invalidateRuleDefinitions(): void {
    _cachedDefinitions = undefined
}

export function getAllRuleDefinitions(): LintRuleDefinition[] {
    return getRuleDefinitions()
}

export function getAllRuleDefinitionsFromRules(rules: LintRule[]): LintRuleDefinition[] {
    return rules.map(rule => ({
        id: rule.id,
        name: tAny(rule.name),
        description: tAny(rule.description),
        defaultSeverity: rule.defaultSeverity,
        defaultEnabled: rule.defaultEnabled,
        category: rule.category,
    }))
}

export function getRuleDefinition(id: string): LintRuleDefinition | undefined {
    return getRuleDefinitions().find(r => r.id === id)
}

export function loadRuleConfigs(): Map<string, LintRuleConfig> {
    const cfgMgr = getConfigManager()
    const result = new Map<string, LintRuleConfig>()
    const definitions = getRuleDefinitions()

    for (const rule of definitions) {
        const ruleConfig = cfgMgr.get<{ enabled?: boolean; severity?: string }>(`lint.${rule.id}`, { enabled: rule.defaultEnabled, severity: undefined })
        const enabled = ruleConfig?.enabled ?? rule.defaultEnabled
        const severityStr = ruleConfig?.severity
        let severity = rule.defaultSeverity

        if (severityStr) {
            switch (severityStr.toLowerCase()) {
                case 'error': severity = vscode.DiagnosticSeverity.Error; break
                case 'warning': severity = vscode.DiagnosticSeverity.Warning; break
                case 'information': severity = vscode.DiagnosticSeverity.Information; break
                case 'hint': severity = vscode.DiagnosticSeverity.Hint; break
            }
        }

        result.set(rule.id, { enabled, severity })
    }

    return result
}
