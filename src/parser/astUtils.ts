import * as vscode from 'vscode'
import type { AstLocation, AstNode } from './astTypes'
import { isAstNode } from './AstVisitor'

export function getNodeLocation(node: AstNode): AstLocation | null {
    const loc = (node as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
    if (loc?.start?.line !== undefined && loc?.start?.column !== undefined) {
        return {
            line: loc.start.line,
            column: loc.start.column,
        }
    }
    return null
}

export function getStatementEndLocation(node: AstNode): AstLocation | null {
    const loc = (node as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
    if (loc?.end?.line !== undefined && loc?.end?.column !== undefined) {
        return {
            line: loc.end.line,
            column: loc.end.column,
        }
    }
    return null
}

export function getFunctionName(node: AstNode): string | null {
    const name = node.name
    if (typeof name === 'string') {
        return name
    }
    if (isAstNode(name)) {
        const nameNode = name as AstNode
        if (typeof nameNode.value === 'string') {
            return nameNode.value
        }
        if (Array.isArray(nameNode.name) && nameNode.name.length > 0) {
            const firstEntry = nameNode.name[0] as Record<string, unknown>
            if (typeof firstEntry.value === 'string') {
                return firstEntry.value
            }
        }
    }
    if (name != null && typeof name === 'object') {
        const nameObj = name as Record<string, unknown>
        if (Array.isArray(nameObj.name) && nameObj.name.length > 0) {
            const firstEntry = nameObj.name[0] as Record<string, unknown>
            if (typeof firstEntry.value === 'string') {
                return firstEntry.value
            }
        }
        if (typeof nameObj.value === 'string') {
            return nameObj.value
        }
    }
    return null
}

export function getColumnLoc(col: Record<string, unknown>): AstLocation | null {
    const loc = col.loc as { start?: AstLocation; end?: AstLocation } | undefined
    if (loc?.start?.line !== undefined && loc?.start?.column !== undefined) {
        return loc.start
    }
    const expr = col.expr
    if (expr != null && typeof expr === 'object') {
        const exprLoc = (expr as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
        if (exprLoc?.start?.line !== undefined && exprLoc?.start?.column !== undefined) {
            return exprLoc.start
        }
    }
    return null
}

export function getLocFromAny(obj: Record<string, unknown>): AstLocation | null {
    const loc = obj.loc as { start?: AstLocation; end?: AstLocation } | undefined
    if (loc?.start?.line !== undefined && loc?.start?.column !== undefined) {
        return loc.start
    }
    return null
}

export function createDiagnostic(
    loc: AstLocation,
    length: number,
    code: string,
    message: string,
    severity: vscode.DiagnosticSeverity,
    source = 'Hive Formatter',
): vscode.Diagnostic {
    const diagnostic = new vscode.Diagnostic(
        new vscode.Range(loc.line - 1, loc.column - 1, loc.line - 1, loc.column - 1 + length),
        message,
        severity,
    )
    diagnostic.source = source
    diagnostic.code = code
    return diagnostic
}
