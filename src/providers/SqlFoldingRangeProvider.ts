import * as vscode from 'vscode'

export class SqlFoldingRangeProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(
        document: vscode.TextDocument,
        _context: vscode.FoldingContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        const ranges: vscode.FoldingRange[] = []
        const text = document.getText()
        const lines = text.split('\n')
        
        // 跟踪括号和块
        const stack: { type: 'cte' | 'subquery' | 'function' | 'begin' | 'case', line: number, startChar?: number }[] = []
        
        // CTE WITH 块
        const withRegex = /^\s*WITH\s+/i
        // CTE 逗号分隔或 AS 开头
        const cteContinuationRegex = /^\s*,?\s*\w+\s+AS\s*\(/i
        // 函数块（CREATE FUNCTION, CREATE PROCEDURE）
        const functionRegex = /^\s*(CREATE|ALTER)\s+(FUNCTION|PROCEDURE)/i
        // BEGIN/END 块
        const beginRegex = /^\s*BEGIN\b/i
        const endRegex = /^\s*END\b/i
        // CASE 语句
        const caseStartRegex = /\bCASE\b/i
        const caseEndRegex = /\bEND\b/i
        
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum]
            
            // 检查 WITH 块开始
            if (withRegex.test(line)) {
                stack.push({ type: 'cte', line: lineNum })
            }
            
            // 检查 CTE 延续（多个 CTE）
            if (cteContinuationRegex.test(line) && stack.length > 0) {
                // 已经在 CTE 块中，继续
            }
            
            // 检查函数块开始
            if (functionRegex.test(line)) {
                stack.push({ type: 'function', line: lineNum })
            }
            
            // 检查 BEGIN 块
            if (beginRegex.test(line)) {
                stack.push({ type: 'begin', line: lineNum })
            }
            
            // 检查 CASE 开始
            const caseStarts = this.countMatches(line, caseStartRegex)
            const caseEnds = this.countMatches(line, caseEndRegex)
            
            for (let i = 0; i < caseStarts; i++) {
                stack.push({ type: 'case', line: lineNum })
            }
            
            // 检查括号 - 用于子查询
            const openParens = (line.match(/\(/g) || []).length
            const closeParens = (line.match(/\)/g) || []).length
            
            // 处理括号对
            let netOpen = openParens - closeParens
            
            // 先处理闭合
            while (netOpen < 0 && stack.length > 0) {
                const top = stack[stack.length - 1]
                if (top.type === 'subquery') {
                    ranges.push(new vscode.FoldingRange(top.line, lineNum, vscode.FoldingRangeKind.Region))
                    stack.pop()
                    netOpen++
                } else {
                    break
                }
            }
            
            // 处理开括号 - 可能是子查询
            while (netOpen > 0) {
                // 检查是否可能是子查询（括号前面有 SELECT/INSERT/UPDATE/DELETE/WHERE）
                const isSubquery = this.isSubqueryStart(line, openParens - netOpen)
                if (isSubquery) {
                    stack.push({ type: 'subquery', line: lineNum })
                }
                netOpen--
            }
            
            // 检查 END 块闭合
            if (endRegex.test(line)) {
                // 从栈中找到最近的 BEGIN 或 function
                for (let i = stack.length - 1; i >= 0; i--) {
                    const item = stack[i]
                    if (item.type === 'begin' || item.type === 'function') {
                        ranges.push(new vscode.FoldingRange(item.line, lineNum, vscode.FoldingRangeKind.Region))
                        stack.splice(i, 1)
                        break
                    }
                }
            }
            
            // 检查 CASE END 闭合
            for (let i = 0; i < caseEnds; i++) {
                // 从栈中找到最近的 CASE
                for (let j = stack.length - 1; j >= 0; j--) {
                    const item = stack[j]
                    if (item.type === 'case') {
                        ranges.push(new vscode.FoldingRange(item.line, lineNum, vscode.FoldingRangeKind.Region))
                        stack.splice(j, 1)
                        break
                    }
                }
            }
            
            // 检查 CTE 块结束（通常在 FROM 开始或主查询开始）
            const isMainQueryStart = /^\s*(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i.test(line)
            if (isMainQueryStart && stack.length > 0) {
                // 闭合所有 CTE 块直到找到非 CTE
                while (stack.length > 0 && stack[stack.length - 1].type === 'cte') {
                    const cte = stack.pop()
                    if (cte && cte.line < lineNum - 1) {
                        ranges.push(new vscode.FoldingRange(cte.line, lineNum - 1, vscode.FoldingRangeKind.Region))
                    }
                }
            }
        }
        
        // 处理文件末尾的未闭合块
        while (stack.length > 0) {
            const item = stack.pop()
            if (item && item.line < lines.length - 1) {
                ranges.push(new vscode.FoldingRange(item.line, lines.length - 1, vscode.FoldingRangeKind.Region))
            }
        }
        
        // 按起始行排序
        ranges.sort((a, b) => a.start - b.start)
        
        return ranges
    }
    
    private countMatches(str: string, regex: RegExp): number {
        return (str.match(new RegExp(regex.source, 'gi')) || []).length
    }
    
    private isSubqueryStart(line: string, openParenIndex: number): boolean {
        // 简化判断：检查括号前是否有常见子查询关键词
        const substr = line.substring(0, openParenIndex)
        return /\b(SELECT|FROM|WHERE|JOIN|IN|EXISTS|WITH)\b/i.test(substr)
    }
}
