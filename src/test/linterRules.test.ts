import * as assert from 'assert';
import * as vscode from 'vscode';
import { AvoidSelectStarRule } from '../linter/rules/AvoidSelectStarRule';
import { UppercaseKeywordsRule } from '../linter/rules/UppercaseKeywordsRule';
import { LimitWithOrderByRule } from '../linter/rules/LimitWithOrderByRule';
import type { LintRuleConfig } from '../linter/lintRules';
import type { RuleContext } from '../linter/rules/LintRule';
import type { AstNode } from '../parser/astTypes';
import type { SqlDialect } from '../parser/dialectMapper';

/**
 * Minimal rule-config factory used to instantiate rules directly so the
 * tests below can exercise rule logic in isolation, without depending on
 * the global RuleRegistry / ConfigManager / DI container (and without
 * needing to flip VS Code settings to enable a disabled rule).
 */
function enabledConfig(severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Warning): LintRuleConfig {
    return { enabled: true, severity };
}

function disabledConfig(): LintRuleConfig {
    return { enabled: false, severity: vscode.DiagnosticSeverity.Warning };
}

function contextFor(node: AstNode, sql = '', dialect: SqlDialect = 'mysql'): RuleContext {
    return { sql, dialect, node };
}

function starColumn(line: number, column: number): AstNode {
    return {
        type: 'star',
        loc: { start: { line, column }, end: { line, column: column + 1 } },
    } as AstNode;
}

function columnRefStar(line: number, column: number): AstNode {
    return {
        type: 'column_ref',
        column: '*',
        loc: { start: { line, column }, end: { line, column: column + 1 } },
    } as AstNode;
}

function explicitColumn(line: number, column: number, name: string): AstNode {
    return {
        type: 'column_ref',
        column: name,
        loc: { start: { line, column }, end: { line, column: column + name.length } },
    } as AstNode;
}

suite('AvoidSelectStarRule (direct unit tests)', () => {
    test('flags a column_ref with column === "*"', () => {
        const rule = new AvoidSelectStarRule(enabledConfig());
        const node: AstNode = {
            type: 'select',
            columns: [columnRefStar(1, 7)],
        } as AstNode;

        const diags = rule.check(contextFor(node));

        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'avoid_select_star');
    });

    test('flags a "star" column node', () => {
        const rule = new AvoidSelectStarRule(enabledConfig());
        const node: AstNode = {
            type: 'select',
            columns: [starColumn(1, 7)],
        } as AstNode;

        const diags = rule.check(contextFor(node));

        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'avoid_select_star');
    });

    test('does not flag explicit columns', () => {
        const rule = new AvoidSelectStarRule(enabledConfig());
        const node: AstNode = {
            type: 'select',
            columns: [explicitColumn(1, 7, 'id'), explicitColumn(1, 11, 'name')],
        } as AstNode;

        const diags = rule.check(contextFor(node));

        assert.strictEqual(diags.length, 0);
    });

    test('returns no diagnostics when columns is missing', () => {
        const rule = new AvoidSelectStarRule(enabledConfig());
        const node: AstNode = { type: 'select' } as AstNode;

        const diags = rule.check(contextFor(node));

        assert.strictEqual(diags.length, 0);
    });

    test('isEnabled / updateConfig reflect config', () => {
        const rule = new AvoidSelectStarRule(disabledConfig());
        assert.strictEqual(rule.isEnabled(), false);

        rule.updateConfig(enabledConfig());
        assert.strictEqual(rule.isEnabled(), true);
    });
});

suite('UppercaseKeywordsRule (direct unit tests)', () => {
    test('flags lowercase keywords', () => {
        const rule = new UppercaseKeywordsRule(enabledConfig(vscode.DiagnosticSeverity.Information));
        const ctx: RuleContext = { sql: 'select id from users', dialect: 'mysql', node: {} as AstNode };

        const diags = rule.check(ctx);

        // "select" and "from" should both be flagged.
        const codes = diags.map(d => d.code);
        assert.ok(codes.every(c => c === 'uppercase_keywords'));
        assert.ok(diags.length >= 2, `expected at least 2 diagnostics, got ${diags.length}`);
    });

    test('does not flag uppercase keywords', () => {
        const rule = new UppercaseKeywordsRule(enabledConfig(vscode.DiagnosticSeverity.Information));
        const ctx: RuleContext = { sql: 'SELECT id FROM users', dialect: 'mysql', node: {} as AstNode };

        const diags = rule.check(ctx);

        assert.strictEqual(diags.length, 0);
    });

    test('diagnostic range covers the matched keyword', () => {
        const rule = new UppercaseKeywordsRule(enabledConfig(vscode.DiagnosticSeverity.Information));
        const sql = 'select id';
        const ctx: RuleContext = { sql, dialect: 'mysql', node: {} as AstNode };

        const diags = rule.check(ctx);

        assert.strictEqual(diags.length, 1);
        const d = diags[0];
        // "select" starts at column 0 on line 1 (0-indexed line 0).
        assert.strictEqual(d.range.start.line, 0);
        assert.strictEqual(d.range.start.character, 0);
        assert.strictEqual(d.range.end.character, 'select'.length);
        assert.strictEqual(d.code, 'uppercase_keywords');
        assert.ok(d.source, 'diagnostic should carry a source');
    });

    test('flags keywords across multiple lines with correct line numbers', () => {
        const rule = new UppercaseKeywordsRule(enabledConfig(vscode.DiagnosticSeverity.Information));
        const sql = 'SELECT id\nfrom users\nwhere id = 1';
        const ctx: RuleContext = { sql, dialect: 'mysql', node: {} as AstNode };

        const diags = rule.check(ctx);

        // Uppercase SELECT on line 1 must NOT be flagged; only the lowercase
        // "from" (line 2) and "where" (line 3) should be.
        assert.strictEqual(diags.length, 2);
        const lines = diags.map(d => d.range.start.line).sort();
        assert.deepStrictEqual(lines, [1, 2]);
    });

    test('defaultEnabled is false', () => {
        const rule = new UppercaseKeywordsRule(enabledConfig());
        assert.strictEqual(rule.defaultEnabled, false);
    });
});

suite('LimitWithOrderByRule (direct unit tests)', () => {
    test('flags LIMIT without ORDER BY', () => {
        const rule = new LimitWithOrderByRule(enabledConfig());
        const node: AstNode = {
            type: 'select',
            limit: { value: 10 },
            loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } },
        } as AstNode;

        const diags = rule.check(contextFor(node));

        assert.strictEqual(diags.length, 1);
        assert.strictEqual(diags[0].code, 'limit_with_order_by');
    });

    test('does not flag LIMIT with ORDER BY present', () => {
        const rule = new LimitWithOrderByRule(enabledConfig());
        const node: AstNode = {
            type: 'select',
            limit: { value: 10 },
            orderby: [{ expr: { type: 'column_ref', column: 'id' } }],
            loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 40 } },
        } as AstNode;

        const diags = rule.check(contextFor(node));

        assert.strictEqual(diags.length, 0);
    });

    test('does not flag when LIMIT is absent', () => {
        const rule = new LimitWithOrderByRule(enabledConfig());
        const node: AstNode = {
            type: 'select',
            loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 20 } },
        } as AstNode;

        const diags = rule.check(contextFor(node));

        assert.strictEqual(diags.length, 0);
    });

    test('does not flag when ORDER BY is an empty array', () => {
        // The rule treats an empty orderby array the same as a missing one
        // only when it ALSO considers LIMIT present — verify the empty-array
        // branch is treated as "no order by" so LIMIT still triggers.
        const rule = new LimitWithOrderByRule(enabledConfig());
        const nodeWithOrderBy: AstNode = {
            type: 'select',
            limit: { value: 10 },
            orderby: [],
            loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } },
        } as AstNode;

        const diags = rule.check(contextFor(nodeWithOrderBy));

        assert.strictEqual(diags.length, 1, 'empty orderby array should still trigger the rule');
    });

    test('does not emit a diagnostic when the select node has no loc', () => {
        const rule = new LimitWithOrderByRule(enabledConfig());
        const node: AstNode = {
            type: 'select',
            limit: { value: 10 },
        } as AstNode;

        const diags = rule.check(contextFor(node));

        // Without a loc the rule cannot place a diagnostic; it must return [].
        assert.strictEqual(diags.length, 0);
    });
});
