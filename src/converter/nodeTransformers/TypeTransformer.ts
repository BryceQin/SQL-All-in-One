import type { TransformContext, AstNodeTransformer } from '../AstTransformEngine'
import type { TypeMapping } from '../typeMappings'
import { conversionRules } from '../conversionRules'

interface DefinitionNode {
    dataType?: string
    length?: number
    parentheses?: boolean
    suffix?: unknown
}

function applyMappedType(def: DefinitionNode, mappedType: string): void {
    if (mappedType === 'STRING') {
        def.dataType = mappedType
        delete def.length
        delete def.parentheses
        return
    }

    const match = mappedType.match(/^(\w+)\((\d+)\)$/)
    if (match) {
        def.dataType = match[1]
        def.length = Number(match[2])
        def.parentheses = true
        return
    }

    def.dataType = mappedType
}

export class TypeTransformer implements AstNodeTransformer {
    matches(node: Record<string, unknown>): boolean {
        return typeof node.dataType === 'string'
    }

    transform(node: Record<string, unknown>, _parent: Record<string, unknown> | null, _key: string | null, ctx: TransformContext): void {
        const def = node as unknown as DefinitionNode
        const upperType = def.dataType?.toUpperCase()
        if (!upperType) {
            return
        }

        const mapping = conversionRules.get<TypeMapping>(ctx.from, ctx.to, 'types')
        if (!mapping) {
            return
        }

        const mappedType = mapping[upperType]
        if (!mappedType) {
            return
        }

        // Complex-type warning. The complexTypes rule is registered only
        // for hive -> mysql, so the lookup itself encodes the direction —
        // no hard-coded dialect check needed.
        const complexTypes = conversionRules.get<Set<string>>(ctx.from, ctx.to, 'complexTypes')
        if (complexTypes?.has(upperType)) {
            ctx.warnings.push(`Complex type ${upperType} mapped to JSON, manual adjustment may be needed`)
        }

        applyMappedType(def, mappedType)
    }
}
