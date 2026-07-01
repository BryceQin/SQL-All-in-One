import type { TransformContext, AstNodeTransformer } from '../AstTransformEngine'
import type { AstFunctionNameMapping } from '../functionMappings'
import { conversionRules, type StructuralRewrite } from '../conversionRules'

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

        // Structural rewrites (e.g. mysql->hive IF -> CASE/WHEN) are
        // registered as callbacks in conversionRules.ts. Try the callback
        // first; if it handles the node, we're done.
        const rewriter = conversionRules.get<StructuralRewrite>(ctx.from, ctx.to, 'structuralRewrite')
        if (rewriter && rewriter(node, ctx)) {
            return
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
