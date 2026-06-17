function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAstNode(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && 'type' in value
}

export interface AstVisitor {
    enter?(node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): void
    leave?(node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): void
}

export const MAX_AST_DEPTH = 1000

export function walkAst(
    node: unknown,
    visitor: AstVisitor,
    _parent?: Record<string, unknown> | null,
    _key?: string | null,
): void {
    // Flat array: each task uses 4 consecutive slots [node, parent, key, phase]
    // phase: 0 = enter, 1 = leave
    const stack: unknown[] = []
    stack.push(node, _parent ?? null, _key ?? null, 0)

    while (stack.length > 0) {
        const phase = stack.pop() as number
        const key = stack.pop()
        const parent = stack.pop()
        const currentNode = stack.pop()

        if (stack.length / 4 > 10000) {
            console.warn('SQL All in One: AST depth exceeded maximum, stopping traversal')
            return
        }

        if (phase === 1) {
            if (isAstNode(currentNode)) {
                visitor.leave?.(currentNode, parent as Record<string, unknown> | null, key as string | null)
            }
            continue
        }

        if (!isAstNode(currentNode)) {
            if (isPlainObject(currentNode)) {
                const entries = Object.entries(currentNode as Record<string, unknown>)
                for (let i = entries.length - 1; i >= 0; i--) {
                    const [, childValue] = entries[i]
                    if (Array.isArray(childValue)) {
                        for (let j = childValue.length - 1; j >= 0; j--) {
                            stack.push(childValue[j], currentNode, key, 0)
                        }
                    } else {
                        stack.push(childValue, currentNode, key, 0)
                    }
                }
            }
            continue
        }

        visitor.enter?.(currentNode, parent as Record<string, unknown> | null, key as string | null)

        stack.push(currentNode, parent, key, 1)

        const entries = Object.entries(currentNode)
        for (let i = entries.length - 1; i >= 0; i--) {
            const [childKey, childValue] = entries[i]
            if (childKey === 'type' || childKey === 'loc') {
                continue
            }
            if (typeof childValue === 'string' || typeof childValue === 'number' || typeof childValue === 'boolean') {
                continue
            }
            if (Array.isArray(childValue)) {
                for (let j = childValue.length - 1; j >= 0; j--) {
                    stack.push(childValue[j], currentNode, childKey, 0)
                }
            } else if (isAstNode(childValue)) {
                stack.push(childValue, currentNode, childKey, 0)
            } else if (isPlainObject(childValue)) {
                stack.push(childValue, currentNode, childKey, 0)
            }
        }
    }
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