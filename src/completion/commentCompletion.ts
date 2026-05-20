import * as vscode from 'vscode'

export function getCommentCompletionItems(
    doc: vscode.TextDocument,
    pos: vscode.Position
): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = []

    items.push(createHeaderItem(doc, pos))
    items.push(createColItem(doc, pos))
    items.push(createTblItem(doc, pos))

    return items
}

function createHeaderItem(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem {
    const item = new vscode.CompletionItem('header - 文件头注释', vscode.CompletionItemKind.Snippet)
    item.filterText = 'header'
    item.sortText = '0_header'
    item.detail = '注释片段 (header)'

    const config = vscode.workspace.getConfiguration('Hive-Formatter')
    const author = config.get<string>('headerAuthor', '')
    const modifier = config.get<string>('headerModifier', '') || author
    const fileName = doc.fileName.split('/').pop()?.replace(/\.\w+$/, '') || 'script_name'
    const today = new Date().toISOString().slice(0, 10)

    const existingHeader = doc.getText(new vscode.Range(0, 0, Math.min(doc.lineCount, 10), 0))
    const existingDateMatch = existingHeader.match(/创建时间[：:]\s*(\d{4}-\d{2}-\d{2})/)
    const createDate = existingDateMatch ? existingDateMatch[1] : today

    const { inputTables, outputTables } = extractTableDependencies(doc.getText())

    const inputTableLines = inputTables.length > 0
        ? inputTables.map(t => `--     - ${t}`).join('\n')
        : '--     （未检测到表依赖，请手动填写）'

    const outputTableLines = outputTables.length > 0
        ? outputTables.map(t => `--     - ${t}`).join('\n')
        : '--     （未检测到输出表，请手动填写）'

    const snippet = new vscode.SnippetString()
    const lines = [
        '-- ============================================================',
        `-- 脚本名称：\${1:${fileName}}`,
        '-- 功能描述：$2',
        `-- 作者：\${3:${author}}`,
        `-- 创建时间：\${4:${createDate}}`,
        '-- ============================================================',
        '-- 修改记录：',
        '--   日期         修改人       修改内容',
        `--   \${5:${today}}  \${6:${modifier}}     \${7:初始版本}`,
        '-- ============================================================',
        '-- 上游依赖：',
        '--   输入表：',
        inputTableLines,
        '--   输出表：',
        outputTableLines,
        '-- ============================================================',
    ]
    snippet.appendText(lines.join('\n') + '\n')
    snippet.appendTabstop(0)

    item.insertText = snippet
    return item
}

function createColItem(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem {
    const item = new vscode.CompletionItem('col - 列 COMMENT', vscode.CompletionItemKind.Snippet)
    item.filterText = 'col'
    item.sortText = '0_col'
    item.detail = '注释片段 (col)'

    const line = doc.lineAt(pos.line).text
    const trimmed = line.trimEnd()

    if (/COMMENT\s+'/.test(line)) {
        const snippet = new vscode.SnippetString()
        snippet.appendTabstop(0)
        item.insertText = snippet
        return item
    }

    const hasComma = trimmed.endsWith(',')
    const snippet = new vscode.SnippetString()

    if (hasComma) {
        snippet.appendText(" COMMENT '")
        snippet.appendPlaceholder('列说明', 1)
        snippet.appendText("',")
        const commaIndex = line.lastIndexOf(',')
        const deleteRange = new vscode.Range(
            pos.line, commaIndex,
            pos.line, commaIndex + 1
        )
        item.additionalTextEdits = [vscode.TextEdit.delete(deleteRange)]
    } else {
        snippet.appendText(" COMMENT '")
        snippet.appendPlaceholder('列说明', 1)
        snippet.appendText("'")
    }

    item.insertText = snippet
    return item
}

function createTblItem(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem {
    const item = new vscode.CompletionItem('tbl - 表 COMMENT', vscode.CompletionItemKind.Snippet)
    item.filterText = 'tbl'
    item.sortText = '0_tbl'
    item.detail = '注释片段 (tbl)'

    const snippet = new vscode.SnippetString()
    snippet.appendText("COMMENT '")
    snippet.appendPlaceholder('表说明', 1)
    snippet.appendText("'")
    item.insertText = snippet
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
        truncated.push(`（共 ${sortedInput.length} 个表，此处仅展示前20个）`)
        return { inputTables: truncated, outputTables: sortedOutput }
    }

    return { inputTables: sortedInput, outputTables: sortedOutput }
}

function removeCommentsAndStrings(text: string): string {
    let result = text
    result = result.replace(/\/\*[\s\S]*?\*\//g, '')
    result = result.replace(/--[^\n]*/g, '')
    result = result.replace(/'[^']*'/g, "''")
    result = result.replace(/"[^"]*"/g, '""')
    return result
}

function isSqlKeyword(name: string): boolean {
    const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'AS', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INTO', 'VALUES', 'SET', 'WITH', 'OVER', 'PARTITION', 'BY']
    return keywords.includes(name.toUpperCase())
}
