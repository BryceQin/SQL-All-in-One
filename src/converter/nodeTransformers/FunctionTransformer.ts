import type { TransformContext, AstNodeTransformer } from '../AstTransformEngine'
import type { AstFunctionNameMapping } from '../functionMappings'
import { conversionRules } from '../conversionRules'

interface FunctionNameContainer {
    name?: { name?: { type: string; value: string }[] }
}

function extractFunctionName(node: Record<string, unknown>): string | null {
    const nameContainer = (node as unknown as FunctionNameContainer).name
    if (!nameContainer || !nameContainer.name || !Array.isArray(nameContainer.name)) {
        return null
    }
    const first = nameContainer.name[0]
    if (!first || typeof first.value !== 'string') {
        return null
    }
    return first.value
}

function setFunctionName(node: Record<string, unknown>, newName: string): void {
    const container = (node as unknown as FunctionNameContainer).name
    if (!container || !container.name || !Array.isArray(container.name)) {
        return
    }
    const first = container.name[0]
    if (first) {
        first.value = newName
    }
}

function getArgsArray(node: Record<string, unknown>): Record<string, unknown>[] {
    const args = node.args as { type?: string; value?: unknown } | undefined
    if (!args || args.type !== 'expr_list' || !Array.isArray(args.value)) {
        return []
    }
    return args.value as Record<string, unknown>[]
}

function rebuildAsCaseWhen(node: Record<string, unknown>, ctx: TransformContext): void {
    const args = getArgsArray(node)
    if (args.length < 3) {
        return
    }
    const condition = args[0]
    const thenExpr = args[1]
    const elseExpr = args[2]

    Object.keys(node).forEach((key) => {
        delete node[key]
    })

    node.type = 'case'
    node.expr = null
    node.args = [
        {
            type: 'when',
            cond: condition,
            result: thenExpr,
        },
        {
            type: 'else',
            result: elseExpr,
        },
    ]
    void ctx
}

export class FunctionTransformer implements AstNodeTransformer {
    matches(node: Record<string, unknown>): boolean {
        return node.type === 'function'
    }

    transform(node: Record<string, unknown>, _parent: Record<string, unknown> | null, _key: string | null, ctx: TransformContext): void {
        const funcName = extractFunctionName(node)
        if (!funcName) {
            return
        }
        const upperName = funcName.toUpperCase()

        // Structural rewrite that only applies to mysql -> hive. This is
        // intentionally kept hard-coded because it is not a simple name
        // mapping: it rebuilds the node into a CASE/WHEN structure.
        if (ctx.from === 'mysql' && ctx.to === 'hive') {
            if (upperName === 'IF') {
                rebuildAsCaseWhen(node, ctx)
                return
            }
        }

        const mappings = conversionRules.get<AstFunctionNameMapping[]>(ctx.from, ctx.to, 'functionNames')
        if (!mappings) {
            return
        }
        const mapping = mappings.find((m) => m.from === upperName)
        if (mapping && mapping.from !== mapping.to) {
            setFunctionName(node, mapping.to)
        }
    }
}
