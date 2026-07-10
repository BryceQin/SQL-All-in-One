import * as vscode from "vscode";
import { FunctionNameMatchRule } from "./FunctionNameMatchRule";

export class UseCurrentTimestampRule extends FunctionNameMatchRule {
    readonly id = "use_current_timestamp";
    readonly applicableTypes = ["select"];
    readonly name = "linter.useCurrentTimestamp.name";
    readonly description = "linter.useCurrentTimestamp.description";
    readonly category = "best-practices";
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information;
    readonly defaultEnabled = true;

    protected override readonly functionNameSet = new Set(["now", "sysdate", "getdate", "current_date"]);
    protected override readonly messageKey = "linter.useCurrentTimestamp.description";
}
