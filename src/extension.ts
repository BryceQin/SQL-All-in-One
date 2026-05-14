import * as vscode from "vscode"
import { SqlFormattingProvider } from "./SqlFormattingProvider"
import { sqlDialects } from "./sqlDialects"
import { formatSelection } from "./formatSelection"
import { SqlDiagnosticsProvider } from "./SqlDiagnosticsProvider"

let diagnosticsProvider: SqlDiagnosticsProvider

/**
 * 插件激活时调用
 * 注册格式化命令和文档格式化提供者
 */
export function activate(context: vscode.ExtensionContext) {
    console.log(
        'Congratulations, your extension "hive-formatter" is now active!',
    )

    // 初始化诊断提供者
    diagnosticsProvider = new SqlDiagnosticsProvider()

    context.subscriptions.push(
        // 注册"格式化选择"命令
        vscode.commands.registerCommand(
            "hive-formatter.format-selection",
            formatSelection,
        ),
        // 为每种SQL方言注册文档格式化提供者
        ...registerFormattingProviderForEachDialect(),
        // 注册文档变化监听器用于语法诊断
        vscode.workspace.onDidChangeTextDocument((event) => {
            const document = event.document
            if (isSqlDocument(document)) {
                diagnosticsProvider.provideDiagnostics(document)
            }
        }),
        // 注册文档打开监听器
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (isSqlDocument(document)) {
                diagnosticsProvider.provideDiagnostics(document)
            }
        }),
        // 注册文档保存监听器
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (isSqlDocument(document)) {
                diagnosticsProvider.provideDiagnostics(document)
            }
        }),
        // 诊断提供者的清理
        diagnosticsProvider,
    )

    // 对已打开的文档进行诊断
    vscode.workspace.textDocuments.forEach((document) => {
        if (isSqlDocument(document)) {
            diagnosticsProvider.provideDiagnostics(document)
        }
    })
}

/**
 * 判断文档是否为 SQL 文档
 */
function isSqlDocument(document: vscode.TextDocument): boolean {
    const sqlLanguages = Object.keys(sqlDialects)
    return sqlLanguages.includes(document.languageId)
}

/**
 * 为每种支持的SQL方言注册文档格式化提供者
 */
function registerFormattingProviderForEachDialect() {
    return Object.entries(sqlDialects).map(([vscodeLang, sqlDialectName]) =>
        vscode.languages.registerDocumentFormattingEditProvider(
            vscodeLang,
            new SqlFormattingProvider(sqlDialectName),
        ),
    )
}

/**
 * 插件停用时调用
 * 当前无需要清理的资源
 */
export function deactivate() {
    if (diagnosticsProvider) {
        diagnosticsProvider.dispose()
    }
}
