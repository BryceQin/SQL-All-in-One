// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode"
import { SqlFormattingProvider } from "./SqlFormattingProvider"
import { sqlDialects } from "./sqlDialects"
import { formatSelection } from "./formatSelection"
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log(
        'Congratulations, your extension "hive-formatter" is now active!',
    )

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "hive-formatter.format-selection",
            formatSelection,
        ),

        ...registerFormattingProviderForEachDialect(),
    )
}

function registerFormattingProviderForEachDialect() {
    return Object.entries(sqlDialects).map(([vscodeLang, sqlDialectName]) =>
        vscode.languages.registerDocumentFormattingEditProvider(
            vscodeLang,
            new SqlFormattingProvider(sqlDialectName),
        ),
    )
}
// This method is called when your extension is deactivated
export function deactivate() {
    // 暂无需要清理的资源，保留空函数用于后续扩展
}
