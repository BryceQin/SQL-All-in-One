import type { TransformContext, AstNodeTransformer } from "../AstTransformEngine";
import { conversionRules } from "../conversionRules";

interface ColumnDefNode {
    resource?: string;
    auto_increment?: unknown;
    nullable?: { type?: string } | null;
    default_val?: { value?: unknown } | null;
    collate?: unknown;
    character_set?: unknown;
    column_format?: unknown;
    storage?: unknown;
    reference_definition?: unknown;
    definition?: { suffix?: unknown };
}

function isDefaultValueNull(val: unknown): boolean {
    if (val === null || val === "null") {
        return true;
    }
    if (typeof val === "object" && val !== null && "type" in val) {
        return (val as { type: string }).type === "null";
    }
    return false;
}

export class ColumnAttrTransformer implements AstNodeTransformer {
    matches(node: Record<string, unknown>): boolean {
        return node.resource === "column";
    }

    transform(node: Record<string, unknown>, _parent: Record<string, unknown> | null, _key: string | null, ctx: TransformContext): void {
        if (!conversionRules.get(ctx.from, ctx.to, "columnAttrs")) {
            return;
        }

        const col = node as unknown as ColumnDefNode;

        if ("auto_increment" in col) {
            delete col.auto_increment;
        }
        if (col.nullable && col.nullable.type === "not null") {
            delete col.nullable;
        }
        if (col.default_val) {
            if (isDefaultValueNull(col.default_val.value)) {
                delete col.default_val;
            }
        }
        if ("collate" in col) {
            delete col.collate;
        }
        if ("character_set" in col) {
            delete col.character_set;
        }
        if ("column_format" in col) {
            delete col.column_format;
        }
        if ("storage" in col) {
            delete col.storage;
        }
        if ("reference_definition" in col) {
            delete col.reference_definition;
        }
        if (col.definition && "suffix" in col.definition) {
            delete col.definition.suffix;
        }
    }
}
