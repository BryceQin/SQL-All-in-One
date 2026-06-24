import type { TransformContext, AstNodeTransformer } from '../AstTransformEngine'
import { MYSQL_TO_HIVE_TYPES, HIVE_TO_MYSQL_TYPES, HIVE_COMPLEX_TYPES } from '../typeMappings'

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

        let mapping: Record<string, string>
        if (ctx.from === 'mysql' && ctx.to === 'hive') {
            mapping = MYSQL_TO_HIVE_TYPES
        } else if (ctx.from === 'hive' && ctx.to === 'mysql') {
            mapping = HIVE_TO_MYSQL_TYPES
        } else {
            return
        }

        const mappedType = mapping[upperType]
        if (!mappedType) {
            return
        }

        if (ctx.to === 'mysql' && HIVE_COMPLEX_TYPES.has(upperType)) {
            ctx.warnings.push(`Complex type ${upperType} mapped to JSON, manual adjustment may be needed`)
        }

        applyMappedType(def, mappedType)
    }
}
