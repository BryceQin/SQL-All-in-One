export function isAstNode(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && 'type' in value
}

export interface AstVisitor {
    enter?(node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): void
    leave?(node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): void
}

export function walkAst(
    node: unknown,
    visitor: AstVisitor,
    parent: Record<string, unknown> | null = null,
    key: string | null = null,
): void {
    if (!isAstNode(node)) {
        return
    }
    visitor.enter?.(node, parent, key)
    for (const [childKey, childValue] of Object.entries(node)) {
        if (childKey === 'type' || childKey === 'loc') {
            continue
        }
        if (Array.isArray(childValue)) {
            for (const item of childValue) {
                walkAst(item, visitor, node, childKey)
            }
        } else if (isAstNode(childValue)) {
            walkAst(childValue, visitor, node, childKey)
        }
    }
    visitor.leave?.(node, parent, key)
}

export function findNodes<T extends Record<string, unknown>>(root: unknown, predicate: (node: Record<string, unknown>) => node is T): T[] {
    const result: T[] = []
    walkAst(root, {
        enter(node) {
            if (predicate(node)) {
                result.push(node)
            }
        },
    })
    return result
}

export function findNodesOfType<T extends Record<string, unknown>>(root: unknown, type: string): T[] {
    return findNodes<T>(root, (node): node is T => {
        return isAstNode(node) && (node as Record<string, unknown>).type === type
    })
}
