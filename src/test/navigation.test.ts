import * as assert from 'assert'
import * as vscode from 'vscode'
import type { AstNavigator, SymbolIndex, SymbolType } from '../navigation/AstNavigator'
import { AstNavigator as RealAstNavigator } from '../navigation/AstNavigator'
import { getNavigationContext } from '../navigation/guard'
import { SqlDefinitionProvider } from '../navigation/SqlDefinitionProvider'
import { SqlReferenceProvider } from '../navigation/SqlReferenceProvider'
import { SqlRenameProvider } from '../navigation/SqlRenameProvider'
import { getConfigManager } from '../core/configManager'

// ---------------------------------------------------------------------------
// Helper: create a minimal SymbolIndex for testing
// ---------------------------------------------------------------------------
function makeLocation(line: number, col: number): vscode.Location {
    const uri = vscode.Uri.file('/test.sql')
    const pos = new vscode.Position(line, col)
    return new vscode.Location(uri, new vscode.Range(pos, pos))
}

function makeSymbolIndex(overrides?: {
    ctes?: Map<string, vscode.Location>
    tableAliases?: Map<string, vscode.Location>
    columnAliases?: Map<string, vscode.Location>
}): SymbolIndex {
    return {
        cteDefinitions: overrides?.ctes ?? new Map<string, vscode.Location>(),
        tableAliasDefinitions: overrides?.tableAliases ?? new Map<string, vscode.Location>(),
        columnAliasDefinitions: overrides?.columnAliases ?? new Map<string, vscode.Location>(),
    }
}

// ---------------------------------------------------------------------------
// Helper: create a minimal mock AstNavigator
// ---------------------------------------------------------------------------
class MockAstNavigator {
    private mockAST: { ast: unknown[] | unknown; index: SymbolIndex } | null

    constructor(astResult: { ast: unknown[] | unknown; index: SymbolIndex } | null) {
        this.mockAST = astResult
    }

    getAST(_document: vscode.TextDocument): { ast: unknown[] | unknown; index: SymbolIndex } | null {
        return this.mockAST
    }

    // The following methods are never called by the test branches we exercise,
    // but they satisfy the type shape if needed.
    getDefinition(_word: string, _index: SymbolIndex): vscode.Location | null { return null }
    hasDefinition(_word: string, _index: SymbolIndex): boolean { return false }
    detectSymbolType(_word: string, _index: SymbolIndex): SymbolType | null { return null }
    findReferences(
        _ast: unknown[] | unknown,
        _symbolName: string,
        _document: vscode.TextDocument,
        _symbolType: SymbolType,
    ) { return [] }
    invalidate(_document: vscode.TextDocument): void {
        // no-op for mock: invalidate is intentionally empty
    }
}

// Helper to access private validateNewName via type assertion
function callValidateNewName(
    provider: SqlRenameProvider,
    newName: string,
    oldName: string,
    index: SymbolIndex,
    languageId: string,
): string | null {
    // Access private method for testing - cast through unknown
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    return (provider as unknown as { validateNewName(n: string, o: string, i: SymbolIndex, l: string): string | null }).validateNewName(newName, oldName, index, languageId)
}

// ============================================================================
// Test Suites
// ============================================================================

suite('Navigation Module - Pure Logic Tests', () => {

    // ============================================================
    // SymbolIndex
    // ============================================================
    suite('SymbolIndex', () => {

        test('empty SymbolIndex has three empty Maps', () => {
            const index = makeSymbolIndex()
            assert.ok(index.cteDefinitions instanceof Map)
            assert.ok(index.tableAliasDefinitions instanceof Map)
            assert.ok(index.columnAliasDefinitions instanceof Map)
            assert.strictEqual(index.cteDefinitions.size, 0)
            assert.strictEqual(index.tableAliasDefinitions.size, 0)
            assert.strictEqual(index.columnAliasDefinitions.size, 0)
        })

        test('SymbolIndex supports adding entries to cteDefinitions', () => {
            const loc = makeLocation(0, 0)
            const ctes = new Map<string, vscode.Location>()
            ctes.set('mycte', loc)
            const index = makeSymbolIndex({ ctes })
            assert.strictEqual(index.cteDefinitions.size, 1)
            assert.ok(index.cteDefinitions.has('mycte'))
            assert.strictEqual(index.cteDefinitions.get('mycte'), loc)
        })

        test('SymbolIndex supports adding entries to tableAliasDefinitions', () => {
            const loc = makeLocation(2, 5)
            const aliases = new Map<string, vscode.Location>()
            aliases.set('t1', loc)
            const index = makeSymbolIndex({ tableAliases: aliases })
            assert.strictEqual(index.tableAliasDefinitions.size, 1)
            assert.ok(index.tableAliasDefinitions.has('t1'))
        })

        test('SymbolIndex supports adding entries to columnAliasDefinitions', () => {
            const loc = makeLocation(1, 10)
            const aliases = new Map<string, vscode.Location>()
            aliases.set('total', loc)
            const index = makeSymbolIndex({ columnAliases: aliases })
            assert.strictEqual(index.columnAliasDefinitions.size, 1)
            assert.ok(index.columnAliasDefinitions.has('total'))
        })

        test('SymbolIndex handles case-insensitive lookups via lowercase keys', () => {
            const ctes = new Map<string, vscode.Location>()
            ctes.set('mycte', makeLocation(0, 0))
            const index = makeSymbolIndex({ ctes })
            // Keys are stored lowercase; lookup with different case should fail
            assert.ok(index.cteDefinitions.has('mycte'))
            assert.ok(!index.cteDefinitions.has('MyCTE'))
            assert.ok(!index.cteDefinitions.has('MYCTE'))
        })
    })

    // ============================================================
    // detectSymbolType (pure logic on Map lookups)
    // ============================================================
    suite('detectSymbolType', () => {

        let navigator: RealAstNavigator

        setup(() => {
            navigator = new RealAstNavigator()
        })

        test('returns null when word is not in any index map', () => {
            const index = makeSymbolIndex()
            const result = navigator.detectSymbolType('unknown', index)
            assert.strictEqual(result, null)
        })

        test('returns "cte" when word exists in cteDefinitions', () => {
            const ctes = new Map<string, vscode.Location>()
            ctes.set('mycte', makeLocation(0, 0))
            const index = makeSymbolIndex({ ctes })

            const result = navigator.detectSymbolType('mycte', index)
            assert.strictEqual(result, 'cte')
        })

        test('detectSymbolType uses case-insensitive lookup', () => {
            const ctes = new Map<string, vscode.Location>()
            ctes.set('mycte', makeLocation(0, 0))
            const index = makeSymbolIndex({ ctes })

            // Input is uppercase, but index stores lowercase
            const result = navigator.detectSymbolType('MYCTE', index)
            assert.strictEqual(result, 'cte')
        })

        test('returns "tableAlias" when word exists in tableAliasDefinitions', () => {
            const aliases = new Map<string, vscode.Location>()
            aliases.set('t1', makeLocation(1, 0))
            const index = makeSymbolIndex({ tableAliases: aliases })

            const result = navigator.detectSymbolType('t1', index)
            assert.strictEqual(result, 'tableAlias')
        })

        test('returns "columnAlias" when word exists only in columnAliasDefinitions', () => {
            const colAliases = new Map<string, vscode.Location>()
            colAliases.set('cnt', makeLocation(2, 5))
            const index = makeSymbolIndex({ columnAliases: colAliases })

            const result = navigator.detectSymbolType('cnt', index)
            assert.strictEqual(result, 'columnAlias')
        })

        test('cte takes priority over tableAlias when word is in both', () => {
            const ctes = new Map<string, vscode.Location>()
            ctes.set('x', makeLocation(0, 0))
            const aliases = new Map<string, vscode.Location>()
            aliases.set('x', makeLocation(1, 0))
            const index = makeSymbolIndex({ ctes, tableAliases: aliases })

            const result = navigator.detectSymbolType('x', index)
            assert.strictEqual(result, 'cte')
        })

        test('cte takes priority over columnAlias when word is in both', () => {
            const ctes = new Map<string, vscode.Location>()
            ctes.set('y', makeLocation(0, 0))
            const colAliases = new Map<string, vscode.Location>()
            colAliases.set('y', makeLocation(1, 0))
            const index = makeSymbolIndex({ ctes, columnAliases: colAliases })

            const result = navigator.detectSymbolType('y', index)
            assert.strictEqual(result, 'cte')
        })

        test('tableAlias takes priority over columnAlias when word is in both', () => {
            const aliases = new Map<string, vscode.Location>()
            aliases.set('z', makeLocation(0, 0))
            const colAliases = new Map<string, vscode.Location>()
            colAliases.set('z', makeLocation(1, 0))
            const index = makeSymbolIndex({ tableAliases: aliases, columnAliases: colAliases })

            const result = navigator.detectSymbolType('z', index)
            assert.strictEqual(result, 'tableAlias')
        })
    })

    // ============================================================
    // validateNewName
    // ============================================================
    suite('validateNewName', () => {

        let provider: SqlRenameProvider

        setup(() => {
            // Create a dummy navigator – we never call its methods
            // because validateNewName only uses the index parameter.
            provider = new SqlRenameProvider(new MockAstNavigator(null) as unknown as AstNavigator)
        })

        test('reserved word is rejected', () => {
            const index = makeSymbolIndex()
            // 'SELECT' is a reserved word in all SQL dialects
            const error = callValidateNewName(provider, 'SELECT', 'old_name', index, 'sql')
            assert.ok(error !== null && error.includes('保留字'), 'error should mention reserved word')
        })

        test('reserved word (case-insensitive) is rejected', () => {
            const index = makeSymbolIndex()
            // 'select' (lowercase) should also be caught
            const error = callValidateNewName(provider, 'select', 'old_name', index, 'sql')
            assert.ok(error !== null, 'lowercase reserved word should still produce error')
            assert.ok(error?.includes('保留字'), 'error should mention reserved word')
        })

        test('existing CTE name is rejected', () => {
            const ctes = new Map<string, vscode.Location>()
            ctes.set('my_cte', makeLocation(0, 0))
            const index = makeSymbolIndex({ ctes })

            const error = callValidateNewName(provider, 'my_cte', 'different_name', index, 'sql')
            assert.ok(error !== null, 'duplicate CTE name should produce error')
            assert.ok(error?.includes('已被使用'), 'error should mention name already used')
        })

        test('existing table alias name is rejected', () => {
            const aliases = new Map<string, vscode.Location>()
            aliases.set('t', makeLocation(0, 0))
            const index = makeSymbolIndex({ tableAliases: aliases })

            const error = callValidateNewName(provider, 't', 'different_name', index, 'sql')
            assert.ok(error !== null, 'duplicate table alias should produce error')
            assert.ok(error?.includes('已被使用'), 'error should mention name already used')
        })

        test('existing column alias name is rejected', () => {
            const colAliases = new Map<string, vscode.Location>()
            colAliases.set('cnt', makeLocation(0, 0))
            const index = makeSymbolIndex({ columnAliases: colAliases })

            const error = callValidateNewName(provider, 'Cnt', 'different_name', index, 'sql')
            assert.ok(error !== null, 'duplicate column alias (case-insensitive) should produce error')
            assert.ok(error?.includes('已被使用'), 'error should mention name already used')
        })

        test('same name as oldName (case-insensitive) is allowed when it matches existing entry', () => {
            const ctes = new Map<string, vscode.Location>()
            ctes.set('mycte', makeLocation(0, 0))
            const index = makeSymbolIndex({ ctes })

            // Renaming 'MyCTE' to 'mycte' should be allowed (same name, just case change)
            const error = callValidateNewName(provider, 'mycte', 'MyCTE', index, 'sql')
            assert.strictEqual(error, null, 'same name with different case should be allowed')
        })

        test('name starting with digit is rejected (illegal characters)', () => {
            const index = makeSymbolIndex()
            const error = callValidateNewName(provider, '123abc', 'old_name', index, 'sql')
            assert.ok(error !== null, 'name starting with digit should be rejected')
            assert.ok(error?.includes('只能包含字母'), 'error should mention character restrictions')
        })

        test('name with special characters is rejected', () => {
            const index = makeSymbolIndex()
            const error = callValidateNewName(provider, 'my-name', 'old_name', index, 'sql')
            assert.ok(error !== null, 'name with hyphen should be rejected')
            assert.ok(error?.includes('只能包含字母'), 'error should mention character restrictions')
        })

        test('name with spaces is rejected', () => {
            const index = makeSymbolIndex()
            const error = callValidateNewName(provider, 'my name', 'old_name', index, 'sql')
            assert.ok(error !== null, 'name with space should be rejected')
        })

        test('valid simple name returns null', () => {
            const index = makeSymbolIndex()
            const error = callValidateNewName(provider, 'valid_name', 'old_name', index, 'sql')
            assert.strictEqual(error, null, 'valid name should pass validation')
        })

        test('valid name with digits returns null', () => {
            const index = makeSymbolIndex()
            const error = callValidateNewName(provider, 'col_123', 'old_name', index, 'sql')
            assert.strictEqual(error, null, 'valid name with digits should pass')
        })

        test('valid mixed-case name returns null', () => {
            const index = makeSymbolIndex()
            const error = callValidateNewName(provider, 'MyColumnName', 'old_name', index, 'sql')
            assert.strictEqual(error, null, 'mixed-case valid name should pass')
        })

        test('empty name is rejected', () => {
            const index = makeSymbolIndex()
            const error = callValidateNewName(provider, '', 'old_name', index, 'sql')
            assert.ok(error !== null, 'empty name should be rejected')
        })

        test('validation works across different language dialects', () => {
            const index = makeSymbolIndex()
            // hive dialect should still reject SELECT
            const error = callValidateNewName(provider, 'SELECT', 'old_name', index, 'hive')
            assert.ok(error !== null, 'SELECT should be reserved in hive dialect too')
        })

        test('unknown languageId defaults to sql reserved words', () => {
            const index = makeSymbolIndex()
            // unknown languageId should fallback to sql
            const error = callValidateNewName(provider, 'SELECT', 'old_name', index, 'unknown_lang')
            assert.ok(error !== null, 'SELECT should be reserved with unknown dialect')
        })
    })

    // ============================================================
    // AstNavigator.invalidate
    // ============================================================
    suite('invalidate', () => {

        test('invalidate clears document from cache', async () => {
            // Create a real document to get a valid URI
            const doc = await vscode.workspace.openTextDocument({
                content: 'SELECT 1',
                language: 'sql',
            })

            const navigator = new RealAstNavigator()

            // First, getAST to populate cache
            const result1 = navigator.getAST(doc)
            // invalidate should not throw
            navigator.invalidate(doc)

            // After invalidation, getting AST again should still work (fresh parse)
            const result2 = navigator.getAST(doc)
            // Both should have consistent results (both null or both non-null)
            assert.strictEqual(
                result1 === null,
                result2 === null,
                'getAST results should be consistent before and after invalidate',
            )
        })

        test('invalidate on non-cached document does not throw', async () => {
            const doc = await vscode.workspace.openTextDocument({
                content: 'SELECT 1',
                language: 'sql',
            })
            const navigator = new RealAstNavigator()

            // Invalidate without ever calling getAST first
            navigator.invalidate(doc)
            // Should not throw
            assert.ok(true)
        })
    })
})

// ============================================================================
// guard.ts - getNavigationContext
// ============================================================================
suite('getNavigationContext', () => {

    test('returns null when enableNavigation is false', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'SELECT my_col FROM my_table',
            language: 'sql',
        })
        const pos = new vscode.Position(0, 7) // on 'my_col'
        const mockNav = new MockAstNavigator(null)

        // Save original config value
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const originalValue = config.get<boolean>('enableNavigation', true)

        try {
            await config.update('enableNavigation', false, vscode.ConfigurationTarget.Global)
            // Need to invalidate config manager cache
            getConfigManager().invalidate()

            const result = getNavigationContext(doc, pos, mockNav as unknown as AstNavigator)
            assert.strictEqual(result, null, 'should return null when navigation is disabled')
        } finally {
            await config.update('enableNavigation', originalValue, vscode.ConfigurationTarget.Global)
            getConfigManager().invalidate()
        }
    })

    test('returns null when position has no valid word', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'SELECT 1',
            language: 'sql',
        })
        // Position on whitespace between SELECT and 1
        const pos = new vscode.Position(0, 6)
        const mockNav = new MockAstNavigator(null)

        const result = getNavigationContext(doc, pos, mockNav as unknown as AstNavigator)
        assert.strictEqual(result, null, 'should return null when no word at position')
    })

    test('returns null when navigator.getAST returns null', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'SELECT my_col FROM my_table',
            language: 'sql',
        })
        const pos = new vscode.Position(0, 7) // on 'my_col'
        const mockNav = new MockAstNavigator(null) // getAST returns null

        const result = getNavigationContext(doc, pos, mockNav as unknown as AstNavigator)
        assert.strictEqual(result, null, 'should return null when AST is not available')
    })

    test('returns NavigationContext when all conditions are met', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'SELECT my_col FROM my_table',
            language: 'sql',
        })
        const pos = new vscode.Position(0, 7) // on 'my_col'

        const astData = { type: 'select' }
        const index = makeSymbolIndex()
        const mockNav = new MockAstNavigator({ ast: astData, index })

        const result = getNavigationContext(doc, pos, mockNav as unknown as AstNavigator)
        assert.ok(result !== null, 'should return a NavigationContext')
        if (result !== null) {
            assert.strictEqual(result.word, 'my_col', 'word should match')
            assert.deepStrictEqual(result.ast, astData, 'ast should match')
            assert.strictEqual(result.index, index, 'index should match')
        }
    })
})

// ============================================================================
// SqlDefinitionProvider
// ============================================================================
suite('SqlDefinitionProvider', () => {

    test('getDefinition returns null when enableNavigation is false', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'SELECT my_col FROM my_table',
            language: 'sql',
        })
        const pos = new vscode.Position(0, 7)
        const mockNav = new MockAstNavigator(null)
        const provider = new SqlDefinitionProvider(mockNav as unknown as AstNavigator)

        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const originalValue = config.get<boolean>('enableNavigation', true)

        try {
            await config.update('enableNavigation', false, vscode.ConfigurationTarget.Global)
            getConfigManager().invalidate()

            const cancelToken = new vscode.CancellationTokenSource().token
            const result = provider.provideDefinition(doc, pos, cancelToken)
            assert.strictEqual(result, null, 'should return null when navigation disabled')
        } finally {
            await config.update('enableNavigation', originalValue, vscode.ConfigurationTarget.Global)
            getConfigManager().invalidate()
        }
    })

    test('getDefinition returns null when position has no valid word', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'SELECT 1',
            language: 'sql',
        })
        const pos = new vscode.Position(0, 6) // whitespace
        const mockNav = new MockAstNavigator(null)
        const provider = new SqlDefinitionProvider(mockNav as unknown as AstNavigator)

        const cancelToken = new vscode.CancellationTokenSource().token
        const result = provider.provideDefinition(doc, pos, cancelToken)
        assert.strictEqual(result, null, 'should return null when no word at position')
    })
})

// ============================================================================
// SqlReferenceProvider
// ============================================================================
suite('SqlReferenceProvider', () => {

    test('provideReferences returns null when enableNavigation is false', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'SELECT my_col FROM my_table',
            language: 'sql',
        })
        const pos = new vscode.Position(0, 7)
        const mockNav = new MockAstNavigator(null)
        const provider = new SqlReferenceProvider(mockNav as unknown as AstNavigator)

        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const originalValue = config.get<boolean>('enableNavigation', true)

        try {
            await config.update('enableNavigation', false, vscode.ConfigurationTarget.Global)
            getConfigManager().invalidate()

            const cancelToken = new vscode.CancellationTokenSource().token
            const refContext: vscode.ReferenceContext = { includeDeclaration: true }
            const result = provider.provideReferences(doc, pos, refContext, cancelToken)
            assert.strictEqual(result, null, 'should return null when navigation disabled')
        } finally {
            await config.update('enableNavigation', originalValue, vscode.ConfigurationTarget.Global)
            getConfigManager().invalidate()
        }
    })
})

// ============================================================================
// SqlRenameProvider - prepareRename
// ============================================================================
suite('SqlRenameProvider - prepareRename', () => {

    test('prepareRename returns null when enableNavigation is false', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'SELECT my_col FROM my_table',
            language: 'sql',
        })
        const pos = new vscode.Position(0, 7)
        const mockNav = new MockAstNavigator(null)
        const provider = new SqlRenameProvider(mockNav as unknown as AstNavigator)

        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const originalValue = config.get<boolean>('enableNavigation', true)

        try {
            await config.update('enableNavigation', false, vscode.ConfigurationTarget.Global)
            getConfigManager().invalidate()

            const cancelToken = new vscode.CancellationTokenSource().token
            const result = provider.prepareRename(doc, pos, cancelToken)
            assert.strictEqual(result, null, 'should return null when navigation disabled')
        } finally {
            await config.update('enableNavigation', originalValue, vscode.ConfigurationTarget.Global)
            getConfigManager().invalidate()
        }
    })
})