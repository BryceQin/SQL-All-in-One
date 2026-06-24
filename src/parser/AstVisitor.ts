import { debugLog } from '../core/errorHandler';

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
const MAX_STACK_DEPTH = 40000

export function walkAst(
    node: unknown,
    visitor: AstVisitor,
    _parent?: Record<string, unknown> | null,
    _key?: string | null,
): void {
    const stack: unknown[] = []
    stack.push(node, _parent ?? null, _key ?? null, 0)

    while (stack.length > 0) {
        if (stack.length > MAX_STACK_DEPTH) {
            debugLog('AST depth exceeded maximum, stopping traversal', 'AstVisitor.traverse')
            return
        }

        const phase = stack.pop() as number
        const key = stack.pop()
        const parent = stack.pop()
        const currentNode = stack.pop()

        if (phase === 1) {
            if (isAstNode(currentNode)) {
                visitor.leave?.(currentNode, parent as Record<string, unknown> | null, key as string | null)
            }
            continue
        }

        if (!isAstNode(currentNode)) {
            if (isPlainObject(currentNode)) {
                const childKeys = Object.keys(currentNode)
                for (let i = childKeys.length - 1; i >= 0; i--) {
                    const childKey = childKeys[i]
                    const childValue = (currentNode as Record<string, unknown>)[childKey]
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

        const childKeys = Object.keys(currentNode)
        for (let i = childKeys.length - 1; i >= 0; i--) {
            const childKey = childKeys[i]
            if (childKey === 'type' || childKey === 'loc') {
                continue
            }
            const childValue = currentNode[childKey]
            const childType = typeof childValue
            if (childType === 'string' || childType === 'number' || childType === 'boolean') {
                continue
            }
            if (childValue == null) {
                continue
            }
            if (Array.isArray(childValue)) {
                for (let j = childValue.length - 1; j >= 0; j--) {
                    stack.push(childValue[j], currentNode, childKey, 0)
                }
            } else if (childType === 'object') {
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