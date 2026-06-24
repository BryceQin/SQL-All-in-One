import type { AST } from 'node-sql-parser'
import { walkAst } from '../parser/AstVisitor'
import type { SqlDialect } from '../parser/dialectMapper'
import { FunctionTransformer } from './nodeTransformers/FunctionTransformer'
import { TypeTransformer } from './nodeTransformers/TypeTransformer'
import { ColumnAttrTransformer } from './nodeTransformers/ColumnAttrTransformer'
import { TableOptionTransformer } from './nodeTransformers/TableOptionTransformer'
import { ClauseTransformer } from './nodeTransformers/ClauseTransformer'
import { ConstraintTransformer } from './nodeTransformers/ConstraintTransformer'

export interface TransformContext {
    from: SqlDialect
    to: SqlDialect
    warnings: string[]
}

export interface AstNodeTransformer {
    matches(node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): boolean
    transform(node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null, ctx: TransformContext): void
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function walkAllObjects(
    node: unknown,
    visitor: { enter(node: Record<string, unknown>, parent: Record<string, unknown> | null, key: string | null): void },
    parent: Record<string, unknown> | null = null,
    key: string | null = null,
): void {
    if (!isPlainObject(node)) {
        return
    }

    visitor.enter(node, parent, key)

    const childKeys = Object.keys(node)
    for (const childKey of childKeys) {
        if (childKey === 'type' || childKey === 'loc') {
            continue
        }
        const childValue = node[childKey]
        if (Array.isArray(childValue)) {
            for (const item of childValue) {
                walkAllObjects(item, visitor, node, childKey)
            }
        } else if (isPlainObject(childValue)) {
            walkAllObjects(childValue, visitor, node, childKey)
        }
    }
}

export class AstTransformEngine {
    private transformers: AstNodeTransformer[]

    constructor() {
        this.transformers = [
            new FunctionTransformer(),
            new TypeTransformer(),
            new ColumnAttrTransformer(),
            new TableOptionTransformer(),
            new ConstraintTransformer(),
            new ClauseTransformer(),
        ]
    }

    transform(ast: AST[] | AST, from: SqlDialect, to: SqlDialect): { warnings: string[] } {
        const ctx: TransformContext = { from, to, warnings: [] }

        if (Array.isArray(ast)) {
            for (const stmt of ast) {
                walkAllObjects(stmt, {
                    enter: (node, parent, key) => {
                        for (const t of this.transformers) {
                            if (t.matches(node, parent, key)) {
                                t.transform(node, parent, key, ctx)
                            }
                        }
                    },
                })
            }
        } else {
            walkAllObjects(ast, {
                enter: (node, parent, key) => {
                    for (const t of this.transformers) {
                        if (t.matches(node, parent, key)) {
                            t.transform(node, parent, key, ctx)
                        }
                    }
                },
            })
        }

        void walkAst
        return { warnings: ctx.warnings }
    }
}
