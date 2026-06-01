import { expandPhrases } from '../formatter/expandPhrases'

export const BASE_RESERVED_SELECT = expandPhrases(['SELECT [ALL | DISTINCT]'])

export const BASE_RESERVED_SET_OPERATIONS = expandPhrases(['UNION [ALL | DISTINCT]'])

export const BASE_RESERVED_JOINS = expandPhrases([
    'JOIN',
    '{LEFT | RIGHT | FULL} [OUTER] JOIN',
    '{INNER | CROSS} JOIN',
])

export const BASE_RESERVED_PHRASES = expandPhrases(['{ROWS | RANGE} BETWEEN'])

export const makeFormatOptions = (
    standardOnelineClauses: string[],
    tabularOnelineClauses: string[]
): { onelineClauses: string[]; tabularOnelineClauses: string[] } => ({
    onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
    tabularOnelineClauses,
})