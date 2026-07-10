import * as vscode from "vscode";
import { FunctionNameMatchRule } from "./FunctionNameMatchRule";

export class UseCoalesceOverIsNullRule extends FunctionNameMatchRule {
    readonly id = "use_coalesce_over_isnull";
    readonly applicableTypes = ["select"];
    readonly name = "linter.useCoalesce.name";
    readonly description = "linter.useCoalesce.description";
    readonly category = "best-practices";
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information;
    readonly defaultEnabled = false;

    protected override readonly functionNameSet = new Set(["ifnull", "isnull"]);
    protected override readonly messageKey = "linter.useCoalesce.description";
}
