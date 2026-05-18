import * as vscode from 'vscode'

export class SqlOutlineProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = []
        const text = document.getText()
        const lines = text.split('\n')
        
        // 正则表达式
        const cteRegex = /^\s*(\w+)\s+AS\s*\(/i
        const selectRegex = /^\s*(SELECT)\b/i
        const insertRegex = /^\s*(INSERT)\b/i
        const updateRegex = /^\s*(UPDATE)\b/i
        const deleteRegex = /^\s*(DELETE)\b/i
        const createTableRegex = /^\s*(CREATE\s+TABLE)\s+(?:\w+\.)?(\w+)/i
        const createViewRegex = /^\s*(CREATE\s+VIEW)\s+(?:\w+\.)?(\w+)/i
        const createFunctionRegex = /^\s*(CREATE\s+FUNCTION)\s+(?:\w+\.)?(\w+)/i
        const createProcedureRegex = /^\s*(CREATE\s+PROCEDURE)\s+(?:\w+\.)?(\w+)/i
        const withRegex = /^\s*WITH\s+/i
        
        // 跟踪当前 WITH 块
        let inWithBlock = false
        let withStartLine = -1
        const cteSymbols: vscode.DocumentSymbol[] = []
        
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum]
            
            // 检查 WITH 块开始
            if (withRegex.test(line)) {
                inWithBlock = true
                withStartLine = lineNum
            }
            
            // 在 WITH 块中检查 CTE
            if (inWithBlock) {
                const cteMatch = line.match(cteRegex)
                if (cteMatch) {
                    const cteName = cteMatch[1]
                    const cteSymbol = this.createSymbol(
                        document,
                        cteName,
                        'CTE',
                        vscode.SymbolKind.Constant,
                        lineNum,
                        lineNum
                    )
                    cteSymbols.push(cteSymbol)
                }
                
                // 检查 WITH 块结束
                const isMainQuery = /^\s*(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i.test(line)
                if (isMainQuery && withStartLine >= 0) {
                    if (cteSymbols.length > 0) {
                        const withSymbol = this.createSymbol(
                            document,
                            'WITH Clause',
                            'Common Table Expressions',
                            vscode.SymbolKind.Namespace,
                            withStartLine,
                            lineNum - 1
                        )
                        withSymbol.children = cteSymbols
                        symbols.push(withSymbol)
                    }
                    inWithBlock = false
                    withStartLine = -1
                    // 清空 CTE 列表，它们已被添加到 WITH 块中
                    cteSymbols.length = 0
                }
            }
            
            // 检查主查询语句
            if (selectRegex.test(line)) {
                const symbol = this.createQuerySymbol(document, 'SELECT', lineNum, lines)
                symbols.push(symbol)
            } else if (insertRegex.test(line)) {
                const symbol = this.createQuerySymbol(document, 'INSERT', lineNum, lines)
                symbols.push(symbol)
            } else if (updateRegex.test(line)) {
                const symbol = this.createQuerySymbol(document, 'UPDATE', lineNum, lines)
                symbols.push(symbol)
            } else if (deleteRegex.test(line)) {
                const symbol = this.createQuerySymbol(document, 'DELETE', lineNum, lines)
                symbols.push(symbol)
            }
            
            // 检查 CREATE 语句
            const createTableMatch = line.match(createTableRegex)
            if (createTableMatch) {
                const symbol = this.createSymbol(
                    document,
                    createTableMatch[2],
                    'Table',
                    vscode.SymbolKind.Struct,
                    lineNum,
                    this.findEndOfBlock(lineNum, lines)
                )
                symbols.push(symbol)
            }
            
            const createViewMatch = line.match(createViewRegex)
            if (createViewMatch) {
                const symbol = this.createSymbol(
                    document,
                    createViewMatch[2],
                    'View',
                    vscode.SymbolKind.Interface,
                    lineNum,
                    this.findEndOfBlock(lineNum, lines)
                )
                symbols.push(symbol)
            }
            
            const createFunctionMatch = line.match(createFunctionRegex)
            if (createFunctionMatch) {
                const symbol = this.createSymbol(
                    document,
                    createFunctionMatch[2],
                    'Function',
                    vscode.SymbolKind.Function,
                    lineNum,
                    this.findEndOfBlock(lineNum, lines)
                )
                symbols.push(symbol)
            }
            
            const createProcedureMatch = line.match(createProcedureRegex)
            if (createProcedureMatch) {
                const symbol = this.createSymbol(
                    document,
                    createProcedureMatch[2],
                    'Procedure',
                    vscode.SymbolKind.Method,
                    lineNum,
                    this.findEndOfBlock(lineNum, lines)
                )
                symbols.push(symbol)
            }
        }
        
        // 处理文件末尾的 WITH 块
        if (inWithBlock && withStartLine >= 0 && cteSymbols.length > 0) {
            const withSymbol = this.createSymbol(
                document,
                'WITH Clause',
                'Common Table Expressions',
                vscode.SymbolKind.Namespace,
                withStartLine,
                lines.length - 1
            )
            withSymbol.children = cteSymbols
            symbols.push(withSymbol)
        }
        
        return symbols
    }
    
    private createSymbol(
        document: vscode.TextDocument,
        name: string,
        detail: string,
        kind: vscode.SymbolKind,
        startLine: number,
        endLine: number
    ): vscode.DocumentSymbol {
        const startPos = new vscode.Position(startLine, 0)
        const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length)
        const range = new vscode.Range(startPos, endPos)
        
        return new vscode.DocumentSymbol(
            name,
            detail,
            kind,
            range,
            range
        )
    }
    
    private createQuerySymbol(
        document: vscode.TextDocument,
        type: string,
        startLine: number,
        lines: string[]
    ): vscode.DocumentSymbol {
        let endLine = startLine
        let openParens = 0
        
        // 找到查询的结束（通常在下一个查询、CREATE 语句或文件末尾）
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i]
            
            // 统计括号
            openParens += (line.match(/\(/g) || []).length
            openParens -= (line.match(/\)/g) || []).length
            
            // 检查是否是查询结束
            const isNewStatement = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|MERGE)\b/i.test(line)
            const isEndWithSemicolon = line.includes(';')
            
            if (i > startLine && (isNewStatement || (isEndWithSemicolon && openParens <= 0))) {
                endLine = i
                if (isEndWithSemicolon && !isNewStatement) {
                    endLine = i
                } else {
                    endLine = i - 1
                }
                break
            }
            
            // 如果到文件末尾了
            if (i === lines.length - 1) {
                endLine = i
            }
        }
        
        // 尝试获取表名或更有意义的名称
        let name = type
        const firstLine = lines[startLine]
        const fromMatch = firstLine.match(/FROM\s+(\w+)/i)
        const intoMatch = firstLine.match(/INTO\s+(\w+)/i)
        
        if (fromMatch) {
            name = `${type} - ${fromMatch[1]}`
        } else if (intoMatch) {
            name = `${type} - ${intoMatch[1]}`
        }
        
        return this.createSymbol(
            document,
            name,
            'Query',
            vscode.SymbolKind.Event,
            startLine,
            endLine
        )
    }
    
    private findEndOfBlock(startLine: number, lines: string[]): number {
        let openParens = 0
        let endLine = startLine
        
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i]
            
            openParens += (line.match(/\(/g) || []).length
            openParens -= (line.match(/\)/g) || []).length
            
            // 如果找到分号且括号平衡
            if (line.includes(';') && openParens <= 0) {
                endLine = i
                break
            }
            
            // 如果是新的语句开始
            if (i > startLine && /^\s*(CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE)\b/i.test(line) && openParens <= 0) {
                endLine = i - 1
                break
            }
            
            endLine = i
        }
        
        return endLine
    }
}
