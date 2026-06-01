const fs = require('fs');

// Fix executionEngine.test.ts - change type to interface
let executionEngine = fs.readFileSync('src/test/executionEngine.test.ts', 'utf-8');
executionEngine = executionEngine.replace(/type SqlStatementDetectorInternal = \{/g, 'interface SqlStatementDetectorInternal {');
executionEngine = executionEngine.replace(/type SafeQueryGuardInternal = \{/g, 'interface SafeQueryGuardInternal {');
executionEngine = executionEngine.replace(/type QueryExecutorInternal = \{/g, 'interface QueryExecutorInternal {');
executionEngine = executionEngine.replace(/type QueryHistoryInternal = \{/g, 'interface QueryHistoryInternal {');
// Remove semicolons after interface members (interface uses no semicolons or semicolons, both are valid)
// Actually interfaces can have semicolons, so no change needed there
fs.writeFileSync('src/test/executionEngine.test.ts', executionEngine, 'utf-8');
console.log('Fixed executionEngine.test.ts type->interface');

// Fix explainPlan.test.ts
let explainPlan = fs.readFileSync('src/test/explainPlan.test.ts', 'utf-8');
explainPlan = explainPlan.replace(/type ExplainPlanInternal = \{/g, 'interface ExplainPlanInternal {');
fs.writeFileSync('src/test/explainPlan.test.ts', explainPlan, 'utf-8');
console.log('Fixed explainPlan.test.ts type->interface');

// Fix converter-hover.test.ts
let converterHover = fs.readFileSync('src/test/converter-hover.test.ts', 'utf-8');
converterHover = converterHover.replace(/type MockTextDocument = \{/g, 'interface MockTextDocument {');
converterHover = converterHover.replace(/type MockPosition = \{/g, 'interface MockPosition {');
converterHover = converterHover.replace(/type MarkdownStringInternal = \{/g, 'interface MarkdownStringInternal {');
fs.writeFileSync('src/test/converter-hover.test.ts', converterHover, 'utf-8');
console.log('Fixed converter-hover.test.ts type->interface');

// Fix array-type in executionEngine.test.ts
executionEngine = fs.readFileSync('src/test/executionEngine.test.ts', 'utf-8');
executionEngine = executionEngine.replace(/Array<\[string, StatementType\]>/g, '[string, StatementType][]');
fs.writeFileSync('src/test/executionEngine.test.ts', executionEngine, 'utf-8');
console.log('Fixed executionEngine.test.ts array-type');

// Fix array-type in queryResult.test.ts
let queryResult = fs.readFileSync('src/test/queryResult.test.ts', 'utf-8');
queryResult = queryResult.replace(/Array<\{ command: string \}>/g, '{ command: string }[]');
queryResult = queryResult.replace(/Array<Record<string, unknown>>/g, 'Record<string, unknown>[]');
fs.writeFileSync('src/test/queryResult.test.ts', queryResult, 'utf-8');
console.log('Fixed queryResult.test.ts array-type');

console.log('All type->interface and array-type fixes done!');
