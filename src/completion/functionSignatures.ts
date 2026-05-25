import { t, type MessageKey } from '../i18n'

export interface FunctionSignature {
    name: string
    params: string[]
    returnType?: string
    description: string
    category: FunctionCategory
}

export type FunctionCategory =
    | 'string' | 'math' | 'date' | 'aggregate' | 'conditional'
    | 'window' | 'collection' | 'json' | 'type-conversion'
    | 'encryption' | 'table' | 'other'
    | 'character' | 'conversion' | 'numeric' | 'analytical' | 'xml' | 'system' | 'array' | 'geometric'
    | 'map' | 'bitwise' | 'url' | 'ip'

export function signatureToString(fn: FunctionSignature): string {
    return `${fn.name}(${fn.params.join(', ')})`
}

const categoryKeyMap: Record<FunctionCategory, MessageKey> = {
    'string': 'completion.functionCategory.string',
    'math': 'completion.functionCategory.math',
    'date': 'completion.functionCategory.date',
    'aggregate': 'completion.functionCategory.aggregate',
    'conditional': 'completion.functionCategory.conditional',
    'window': 'completion.functionCategory.window',
    'collection': 'completion.functionCategory.collection',
    'json': 'completion.functionCategory.json',
    'type-conversion': 'completion.functionCategory.cast',
    'encryption': 'completion.functionCategory.crypto',
    'table': 'completion.functionCategory.tableGen',
    'other': 'completion.functionCategory.other',
    'system': 'completion.functionCategory.system',
    'array': 'completion.functionCategory.array',
    'geometric': 'completion.functionCategory.geometric',
    'map': 'completion.functionCategory.map',
    'bitwise': 'completion.functionCategory.bitwise',
    'url': 'completion.functionCategory.url',
    'ip': 'completion.functionCategory.ip',
    'character': 'completion.functionCategory.character',
    'conversion': 'completion.functionCategory.conversion',
    'numeric': 'completion.functionCategory.numeric',
    'analytical': 'completion.functionCategory.analytical',
    'xml': 'completion.functionCategory.xml',
}

export function getCategoryLabel(category: FunctionCategory): string {
    return t(categoryKeyMap[category])
}