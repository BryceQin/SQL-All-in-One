import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_IDS = ['bryce-qin.sql-all-in-one', 'bryce-qin.hive-formatter'];

function findExtension(): vscode.Extension<any> | undefined {
    for (const id of EXTENSION_IDS) {
        const ext = vscode.extensions.getExtension(id);
        if (ext) return ext;
    }
    return undefined;
}

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', async function() {
        this.timeout(15000);
        let ext = findExtension();
        if (!ext) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            ext = findExtension();
        }
        assert.ok(ext, 'SQL All in One extension should be installed');
    });

    test('Extension should activate', async function() {
        this.timeout(15000);
        const ext = findExtension();
        if (ext) {
            await ext.activate();
            assert.ok(ext.isActive, 'Extension should be active after activation');
        }
    });
});
