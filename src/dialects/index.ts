// Barrel re-export for the dialects aggregation directory.
// Consumers should import from '../dialects' (or '../../dialects' etc.)
// rather than reaching into individual subdirectories.

export { expandPhrases, expandSinglePhrase } from './expandPhrases'
export { createDialect } from './dialect'
export type { Dialect, DialectOptions, DialectFormatOptions, ProcessedDialectFormatOptions } from './dialect'
export * as allDialects from './allDialects'
export { keywordMap, functionSigMap } from './dialectData'
export { getKeywordsForDialect } from './keywords'
