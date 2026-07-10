import type { TransformContext, AstNodeTransformer } from "../AstTransformEngine";
import { conversionRules } from "../conversionRules";

const HIVE_CLAUSE_FIELDS = ["distributeby", "sortby", "clusterby"] as const;

export class ClauseTransformer implements AstNodeTransformer {
    matches(node: Record<string, unknown>): boolean {
        return node.type === "select";
    }

    transform(node: Record<string, unknown>, _parent: Record<string, unknown> | null, _key: string | null, ctx: TransformContext): void {
        if (!conversionRules.get(ctx.from, ctx.to, "clauses")) {
            return;
        }

        for (const field of HIVE_CLAUSE_FIELDS) {
            if (field in node) {
                delete node[field];
            }
        }
    }
}
