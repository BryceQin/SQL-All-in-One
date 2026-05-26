import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(
            vscode.extensions.getExtension('bryce-qin.sql-all-in-one'),
            'SQL All in One extension should be installed'
        );
    });

    test('Extension should activate', async function() {
        this.timeout(10000);
        const ext = vscode.extensions.getExtension('bryce-qin.sql-all-in-one');
        if (ext) {
            await ext.activate();
            assert.ok(ext.isActive, 'Extension should be active after activation');
        }
    });
});
