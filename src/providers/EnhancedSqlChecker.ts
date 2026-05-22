import * as vscode from "vscode"
import { AstEnhancedChecker } from "./AstEnhancedChecker"
import { toSqlDialect } from "../core/sqlDialects"

export class EnhancedSqlChecker {
    public checkEnhancedIssues(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const dialect = toSqlDialect(document.languageId)
        const astChecker = new AstEnhancedChecker()
        return astChecker.check(text, dialect)
    }
}
