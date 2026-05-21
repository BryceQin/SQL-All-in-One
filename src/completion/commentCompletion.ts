import * as vscode from 'vscode'
import { t } from '../i18n'

export function getCommentCompletionItems(
    doc: vscode.TextDocument,
    _pos: vscode.Position
): vscode.CompletionItem[] {
    try {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        const author = config.get<string>('headerAuthor', '')
        const modifier = config.get<string>('headerModifier', '') || author
        const { inputTables, outputTables } = extractTableDependencies(doc.getText())

        return [createHeaderItem(doc, author, modifier, inputTables, outputTables)]
    } catch {
        // 如果出错，返回一个绝对可靠的简单 header 作为 fallback
        const item = new vscode.CompletionItem('header', vscode.CompletionItemKind.Snippet)
        item.filterText = 'header'
        item.sortText = '0_header'
        item.detail = t('completion.headerCommentSafe')
        item.documentation = new vscode.MarkdownString(t('completion.headerCommentTemplate'))

        const fileName = doc.fileName.split('/').pop()?.replace(/\.\w+$/, '') || 'script_name'
        const today = new Date().toISOString().slice(0, 10)

        const snippetStr = [
            '-- ============================================================',
            `-- ${t('completion.scriptName')}：\${1:${fileName}}`,
            `-- ${t('completion.functionDesc')}：$2`,
            `-- ${t('completion.author')}：\${3:author}`,
            `-- ${t('completion.createdTime')}：\${4:${today}}`,
            '-- ============================================================',
            `-- ${t('completion.modifiedRecord')}：`,
            `--   ${t('completion.date')}         ${t('completion.modifierPerson')}       ${t('completion.modifyContent')}`,
            `--   \${5:${today}}  \${6:modifier}     \${7:${t('completion.initialVersion')}}`,
            '-- ============================================================',
            '$0'
        ].join('\n')

        item.insertText = new vscode.SnippetString(snippetStr)
        return [item]
    }
}

function createHeaderItem(
    doc: vscode.TextDocument,
    author: string,
    modifier: string,
    inputTables: string[],
    outputTables: string[]
): vscode.CompletionItem {
    const item = new vscode.CompletionItem('header', vscode.CompletionItemKind.Snippet)
    item.filterText = 'header'
    item.sortText = '0_header'
    item.detail = t('completion.headerCommentAuto')
    item.documentation = new vscode.MarkdownString(t('completion.headerCommentAutoDesc'))

    const fileName = doc.fileName.split('/').pop()?.replace(/\.\w+$/, '') || 'script_name'
    const today = new Date().toISOString().slice(0, 10)

    const existingHeader = doc.getText(new vscode.Range(0, 0, Math.min(doc.lineCount, 10), 0))
    const existingDateMatch = existingHeader.match(/创建时间[：:]\s*(\d{4}-\d{2}-\d{2})/)
    const createDate = existingDateMatch ? existingDateMatch[1] : today

    const authorPlaceholder = author || 'author'
    const modifierPlaceholder = modifier || 'modifier'

    const inputTableLines = inputTables.length > 0
        ? inputTables.map(tbl => `--     - ${tbl}`).join('\n')
        : `--     ${t('completion.noTableDepsDetected')}`

    const outputTableLines = outputTables.length > 0
        ? outputTables.map(tbl => `--     - ${tbl}`).join('\n')
        : `--     ${t('completion.noOutputTableDetected')}`

    const snippetStr = [
        '-- ============================================================',
        `-- ${t('completion.scriptName')}：\${1:${fileName}}`,
        `-- ${t('completion.functionDesc')}：$2`,
        `-- ${t('completion.author')}：\${3:${authorPlaceholder}}`,
        `-- ${t('completion.createdTime')}：\${4:${createDate}}`,
        '-- ============================================================',
        `-- ${t('completion.modifiedRecord')}：`,
        `--   ${t('completion.date')}         ${t('completion.modifierPerson')}       ${t('completion.modifyContent')}`,
        `--   \${5:${today}}  \${6:${modifierPlaceholder}}     \${7:${t('completion.initialVersion')}}`,
        '-- ============================================================',
        `-- ${t('completion.upstreamDeps')}：`,
        `--   ${t('completion.inputTable')}：`,
        inputTableLines,
        `--   ${t('completion.outputTable')}：`,
        outputTableLines,
        '-- ============================================================',
    ].join('\n') + '\n$0'

    item.insertText = new vscode.SnippetString(snippetStr)
    return item
}

function extractTableDependencies(text: string): { inputTables: string[]; outputTables: string[] } {
    const inputTables = new Set<string>()
    const outputTables = new Set<string>()

    const strippedText = removeCommentsAndStrings(text)

    const fromPattern = /(?:FROM|JOIN)\s+([\w.]+)/gi
    let match
    while ((match = fromPattern.exec(strippedText)) !== null) {
        const tableName = match[1]
        if (!isSqlKeyword(tableName)) {
            inputTables.add(tableName.toLowerCase())
        }
    }

    const insertPattern = /(?:INSERT\s+INTO|INSERT\s+OVERWRITE\s+TABLE)\s+([\w.]+)/gi
    while ((match = insertPattern.exec(strippedText)) !== null) {
        outputTables.add(match[1].toLowerCase())
    }

    const ctasPattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.]+)\s+AS\b/gi
    while ((match = ctasPattern.exec(strippedText)) !== null) {
        outputTables.add(match[1].toLowerCase())
    }

    const sortedInput = Array.from(inputTables).sort()
    const sortedOutput = Array.from(outputTables).sort()

    if (sortedInput.length > 20) {
        const truncated = sortedInput.slice(0, 20)
        truncated.push(t('completion.tableCountTruncated', `${sortedInput.length}`))
        return { inputTables: truncated, outputTables: sortedOutput }
    }

    return { inputTables: sortedInput, outputTables: sortedOutput }
}

function removeCommentsAndStrings(text: string): string {
    let result = text
    result = result.replace(/'(?:[^']|'')*'/g, "''")
    result = result.replace(/"(?:[^"]|"")*"/g, '""')
    result = result.replace(/\/\*[\s\S]*?\*\//g, '')
    result = result.replace(/--[^\n]*/g, '')
    return result
}

function isSqlKeyword(name: string): boolean {
    const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'AS', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INTO', 'VALUES', 'SET', 'WITH', 'OVER', 'PARTITION', 'BY']
    return keywords.includes(name.toUpperCase())
}
