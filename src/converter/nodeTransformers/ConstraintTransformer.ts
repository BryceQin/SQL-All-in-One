import type { TransformContext, AstNodeTransformer } from '../AstTransformEngine'
import { conversionRules } from '../conversionRules'

export class ConstraintTransformer implements AstNodeTransformer {
    matches(_node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): boolean {
        if (key !== 'create_definitions' || !parent) {
            return false
        }
        const definitions = parent.create_definitions
        return Array.isArray(definitions)
    }

    transform(_node: Record<string, unknown>, parent: Record<string, unknown> | null, _key: string | null, ctx: TransformContext): void {
        if (!parent || !Array.isArray(parent.create_definitions)) {
            return
        }

        if (!conversionRules.get(ctx.from, ctx.to, 'constraints')) {
            return
        }

        parent.create_definitions = parent.create_definitions.filter((def) => {
            if (typeof def !== 'object' || def === null) {
                return true
            }
            const resource = (def as { resource?: unknown }).resource
            return resource !== 'index' && resource !== 'constraint'
        })
    }
}
