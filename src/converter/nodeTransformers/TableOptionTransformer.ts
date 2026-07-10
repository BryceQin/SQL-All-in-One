import type { TransformContext, AstNodeTransformer } from "../AstTransformEngine";
import { conversionRules } from "../conversionRules";

function getOptionKeyword(option: unknown): string | null {
    if (typeof option === "object" && option !== null && "keyword" in option) {
        return String((option as { keyword: unknown }).keyword);
    }
    return null;
}

function isUnsupported(keyword: string, unsupported: Set<string>): boolean {
    const upper = keyword.toUpperCase();
    for (const unsupportedKeyword of unsupported) {
        if (upper === unsupportedKeyword || upper.startsWith(unsupportedKeyword)) {
            return true;
        }
    }
    return false;
}

export class TableOptionTransformer implements AstNodeTransformer {
    matches(_node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): boolean {
        if (key !== "table_options" || !parent) {
            return false;
        }
        const options = parent.table_options;
        return Array.isArray(options);
    }

    transform(_node: Record<string, unknown>, parent: Record<string, unknown> | null, _key: string | null, ctx: TransformContext): void {
        if (!parent || !Array.isArray(parent.table_options)) {
            return;
        }

        const unsupported = conversionRules.get<Set<string>>(ctx.from, ctx.to, "unsupportedTableOptions");
        if (!unsupported || unsupported.size === 0) {
            return;
        }

        parent.table_options = parent.table_options.filter((option) => {
            const keyword = getOptionKeyword(option);
            if (!keyword) return true;
            return !isUnsupported(keyword, unsupported);
        });
    }
}
