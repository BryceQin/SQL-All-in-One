import * as vscode from 'vscode';
import type { LintRule, RuleContext } from './rules/LintRule';
import { loadRuleConfigs, type LintRuleConfig, type LintRuleDefinition } from './lintRules';
import { getContainer, Tokens } from '../core/diContainer';
import { RULES } from './rules/index';

const DEFAULT_CONFIG: LintRuleConfig = { enabled: false, severity: vscode.DiagnosticSeverity.Warning };

export class RuleRegistry {
  private rules = new Map<string, LintRule>();
  private rulesByType = new Map<string, LintRule[]>();

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
  }

  getEnabledRulesForType(type: string): LintRule[] {
    const rules = this.rulesByType.get(type) || [];
    return rules.filter(r => r.isEnabled());
  }

  getEnabledGlobalRules(): LintRule[] {
    return Array.from(this.rules.values())
      .filter(r => r.applicableTypes.length === 0 && r.isEnabled());
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
    return Array.from(this.rules.values()).map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      defaultSeverity: rule.defaultSeverity,
      defaultEnabled: rule.defaultEnabled,
      category: rule.category,
    }));
  }

  registerAllRules(): void {
    const configs = loadRuleConfigs();

    for (const [key, RuleClass] of Object.entries(RULES)) {
      const config = configs.get(key as string) ?? DEFAULT_CONFIG;
      this.register(new RuleClass(config));
    }
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
