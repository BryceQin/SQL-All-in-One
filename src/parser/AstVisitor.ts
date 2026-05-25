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

interface WalkTask {
    node: unknown
    parent: Record<string, unknown> | null
    key: string | null
    phase: 'enter' | 'leave'
}

export const MAX_AST_DEPTH = 1000

export function walkAst(
    node: unknown,
    visitor: AstVisitor,
    _parent?: Record<string, unknown> | null,
    _key?: string | null,
): void {
    const stack: WalkTask[] = [{ node, parent: _parent ?? null, key: _key ?? null, phase: 'enter' }]
    let depth = 0

    while (stack.length > 0) {
        const task = stack.pop()
        if (!task) break

        if (depth > MAX_AST_DEPTH) {
            console.warn('Hive Formatter: AST depth exceeded maximum, stopping traversal')
            return
        }

        if (task.phase === 'leave') {
            if (isAstNode(task.node)) {
                visitor.leave?.(task.node, task.parent, task.key)
            }
            depth--
            continue
        }

        if (!isAstNode(task.node)) {
            if (isPlainObject(task.node)) {
                const entries = Object.entries(task.node as Record<string, unknown>)
                for (let i = entries.length - 1; i >= 0; i--) {
                    const [, childValue] = entries[i]
                    if (Array.isArray(childValue)) {
                        for (let j = childValue.length - 1; j >= 0; j--) {
                            stack.push({ node: childValue[j], parent: task.node, key: task.key, phase: 'enter' })
                        }
                    } else {
                        stack.push({ node: childValue, parent: task.node, key: task.key, phase: 'enter' })
                    }
                }
            }
            continue
        }

        visitor.enter?.(task.node, task.parent, task.key)
        depth++

        stack.push({ node: task.node, parent: task.parent, key: task.key, phase: 'leave' })

        const entries = Object.entries(task.node)
        for (let i = entries.length - 1; i >= 0; i--) {
            const [childKey, childValue] = entries[i]
            if (childKey === 'type' || childKey === 'loc') {
                continue
            }
            if (Array.isArray(childValue)) {
                for (let j = childValue.length - 1; j >= 0; j--) {
                    stack.push({ node: childValue[j], parent: task.node, key: childKey, phase: 'enter' })
                }
            } else if (isAstNode(childValue)) {
                stack.push({ node: childValue, parent: task.node, key: childKey, phase: 'enter' })
            } else if (isPlainObject(childValue)) {
                stack.push({ node: childValue, parent: task.node, key: childKey, phase: 'enter' })
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