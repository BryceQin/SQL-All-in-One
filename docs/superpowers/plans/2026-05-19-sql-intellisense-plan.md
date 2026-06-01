# SQL IntelliSense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive SQL auto-completion (keywords, functions with signatures, snippets, CTE names, table/column names) to the SQL All in One VS Code extension across all 4 dialects (hive/mysql/spark/sql).

**Architecture:** Hybrid approach — pre-computed arrays for keywords/functions/snippets, regex for CTE names, Token stream analysis for table/column context inference. No AST modifications needed.

**Tech Stack:** TypeScript, VS Code Extension API (CompletionItemProvider), nearley (existing parser), Mocha + vscode-test.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/completion/functionSignatures.ts` | Create | FunctionSignature type + utils |
| `src/completion/keywordCompletion.ts` | Create | Keyword + data type completions |
| `src/completion/functionCompletion.ts` | Create | Function completions with SnippetString params |
| `src/completion/snippetCompletion.ts` | Create | Snippet-based completions from snippets/sql.json |
| `src/completion/cteCompletion.ts` | Create | CTE name completions via regex |
| `src/completion/identifierCompletion.ts` | Create | Table/column context completions |
| `src/completion/SqlCompletionProvider.ts` | Create | Main CompletionItemProvider orchestrator |
| `src/languages/allDialects.ts` | Modify | Export keyword + function sig data |
| `src/languages/hive/hive.functions.ts` | Modify | Add functionSignatures[] export |
| `src/languages/mysql/mysql.functions.ts` | Modify | Add functionSignatures[] export |
| `src/languages/spark/spark.functions.ts` | Modify | Add functionSignatures[] export |
| `src/languages/sql/sql.functions.ts` | Modify | Add functionSignatures[] export |
| `src/extension.ts` | Modify | Register SqlCompletionProvider |
| `package.json` | Modify | Add 6 configuration properties |
| `src/test/completion.test.ts` | Create | Unit tests |

---

### Task 1: FunctionSignature Type Definition

**Files:**
- Create: `src/completion/functionSignatures.ts`

- [ ] **Step 1: Create type definition file**

```typescript
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

export function signatureToString(fn: FunctionSignature): string {
    return `${fn.name}(${fn.params.join(', ')})`
}

export function getCategoryLabel(category: FunctionCategory): string {
    const labels: Record<FunctionCategory, string> = {
        'string': '字符串', 'math': '数学', 'date': '日期',
        'aggregate': '聚合', 'conditional': '条件', 'window': '窗口',
        'collection': '集合', 'json': 'JSON', 'type-conversion': '类型转换',
        'encryption': '加密/哈希', 'table': '表生成', 'other': '其他',
    }
    return labels[category]
}
```

- [ ] **Step 2: Compile**

Run: `npx tsc -p ./ --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/completion/functionSignatures.ts
git commit -m "feat: add FunctionSignature type for IntelliSense"
```

---

### Task 2: Hive Function Signature Data

**Files:**
- Modify: `src/languages/hive/hive.functions.ts`

**Context:** Keep the existing `export const functions: string[]` (218 entries) completely unchanged — it's used by Tokenizer. Add a new `export const functionSignatures: FunctionSignature[]` below it.

- [ ] **Step 1: Add import and export**

At top of file, add:
```typescript
import type { FunctionSignature } from '../../completion/functionSignatures'
```

At bottom of file (after the existing `functions: string[]`), add the full `functionSignatures` export with all ~167 Hive functions organized by category. Each entry follows this pattern:
```typescript
{ name: 'FUNC_NAME', params: ['type1 arg1', 'type2 arg2'], returnType: 'ret_type', description: '中文描述', category: 'category' }
```

Categories and key functions to include:

**math (36 entries):** ABS, ACOS, ASIN, ATAN, BIN, BROUND, CBRT, CEIL, CEILING, CONV, COS, DEGREES, EXP, FACTORIAL, FLOOR, GREATEST, HEX, LEAST, LN, LOG, LOG10, LOG2, NEGATIVE, PI, PMOD, POSITIVE, POW, POWER, RADIANS, RAND, ROUND, SHIFTLEFT, SHIFTRIGHT, SHIFTRIGHTUNSIGNED, SIGN, SIN, SQRT, TAN, WIDTH_BUCKET

**collection (5):** ARRAY_CONTAINS, MAP_KEYS, MAP_VALUES, SIZE, SORT_ARRAY

**type-conversion (1):** CAST

**date (24):** ADD_MONTHS, DATE_ADD, DATE_FORMAT, DATE_SUB, DATEDIFF, DAY, DAYNAME, DAYOFMONTH, EXTRACT, FROM_UNIXTIME, FROM_UTC_TIMESTAMP, HOUR, LAST_DAY, MINUTE, MONTH, MONTHS_BETWEEN, NEXT_DAY, QUARTER, SECOND, TO_DATE, TO_UTC_TIMESTAMP, TRUNC, UNIX_TIMESTAMP, WEEKOFYEAR, YEAR

**conditional (7):** ASSERT_TRUE, COALESCE, IF, ISNOTNULL, ISNULL, NULLIF, NVL

**string (42):** ASCII, BASE64, CONCAT, CONCAT_WS, DECODE, ELT, ENCODE, FIELD, FIND_IN_SET, FORMAT_NUMBER, INITCAP, INSTR, LCASE, LENGTH, LEVENSHTEIN, LOCATE, LOWER, LPAD, LTRIM, OCTET_LENGTH, REGEXP_EXTRACT, REGEXP_REPLACE, REPEAT, REVERSE, RPAD, RTRIM, SENTENCES, SOUNDEX, SPACE, SPLIT, STR_TO_MAP, SUBSTR, SUBSTRING, TRANSLATE, TRIM, UCASE, UNBASE64, UPPER

**encryption (13):** AES_DECRYPT, AES_ENCRYPT, CRC32, MASK, MASK_FIRST_N, MASK_HASH, MASK_LAST_N, MASK_SHOW_FIRST_N, MASK_SHOW_LAST_N, MD5, SHA, SHA1, SHA2

**other (8):** CURRENT_DATABASE, CURRENT_USER, HASH, JAVA_METHOD, LOGGED_IN_USER, REFLECT, SURROGATE_KEY, VERSION

**aggregate (22):** AVG, COLLECT_LIST, COLLECT_SET, CORR, COUNT, COVAR_POP, COVAR_SAMP, HISTOGRAM_NUMERIC, MAX, MIN, PERCENTILE, PERCENTILE_APPROX, REGR_AVGX, REGR_AVGY, REGR_COUNT, REGR_INTERCEPT, REGR_R2, REGR_SLOPE, REGR_SXX, REGR_SXY, REGR_SYY, STDDEV_POP, STDDEV_SAMP, SUM, VAR_POP, VAR_SAMP, VARIANCE

**table (5):** EXPLODE, INLINE, JSON_TUPLE, POSEXPLODE, STACK

**window (9):** LEAD, LAG, FIRST_VALUE, LAST_VALUE, RANK, ROW_NUMBER, DENSE_RANK, CUME_DIST, PERCENT_RANK

**json:** GET_JSON_OBJECT (included under string)

Example entry format:
```typescript
{ name: 'SUBSTR', params: ['string str', 'int start', 'int length'], returnType: 'string', description: '返回从 start 开始指定长度的子串', category: 'string' },
```

- [ ] **Step 2: Compile**

Run: `npx tsc -p ./ --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/languages/hive/hive.functions.ts
git commit -m "feat: add Hive FunctionSignature data (167 functions)"
```

---

### Task 3: MySQL Function Signature Data

**Files:**
- Modify: `src/languages/mysql/mysql.functions.ts`

Same pattern as Task 2. Keep existing `export const functions: string[]` (424 entries) unchanged. Add import and `export const functionSignatures: FunctionSignature[]` with ~85 functions.

Categories: math (18), string (25), date (22), aggregate (12), window (10), conditional (4), type-conversion (2), encryption (8), json (6).

Example: `{ name: 'GROUP_CONCAT', params: ['T col', 'string sep'], returnType: 'string', description: '将组内值连接为字符串', category: 'aggregate' }`

- [ ] **Step 1: Add functionSignatures export**
- [ ] **Step 2: Compile and verify**
- [ ] **Step 3: Commit**

```bash
git add src/languages/mysql/mysql.functions.ts
git commit -m "feat: add MySQL FunctionSignature data"
```

---

### Task 4: SparkSQL Function Signature Data

**Files:**
- Modify: `src/languages/spark/spark.functions.ts`

Same pattern as Task 2. Keep existing `export const functions: string[]` (330 entries) unchanged. Add import and `export const functionSignatures: FunctionSignature[]` with ~80 functions.

Categories: math (18), string (20), date (18), aggregate (10), window (12), conditional (7), type-conversion (1), encryption (7), json (4), table/collection (12).

- [ ] **Step 1: Add functionSignatures export**
- [ ] **Step 2: Compile and verify**
- [ ] **Step 3: Commit**

```bash
git add src/languages/spark/spark.functions.ts
git commit -m "feat: add SparkSQL FunctionSignature data"
```

---

### Task 5: Standard SQL Function Signature Data

**Files:**
- Modify: `src/languages/sql/sql.functions.ts`

Same pattern. Keep existing `export const functions: string[]` (107 entries) unchanged. Add import and `export const functionSignatures: FunctionSignature[]` with ~50 functions.

Categories: math (8), string (11), date (4), aggregate (15), window (5), conditional (2), type-conversion (1).

- [ ] **Step 1: Add functionSignatures export**
- [ ] **Step 2: Compile and verify**
- [ ] **Step 3: Commit**

```bash
git add src/languages/sql/sql.functions.ts
git commit -m "feat: add Standard SQL FunctionSignature data"
```

---

### Task 6: Keyword Completion Module

**Files:**
- Create: `src/completion/keywordCompletion.ts`

- [ ] **Step 1: Create the module**

```typescript
import * as vscode from 'vscode'

export function getKeywordItems(
    keywords: string[],
    dataTypes: string[],
    dialectName: string
): vscode.CompletionItem[] {
    const keywordItems = keywords.map((k) => {
        const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword)
        item.insertText = k
        item.detail = `${dialectName.toUpperCase()} 关键字`
        item.sortText = `1_${k}`
        return item
    })
    const dataTypeItems = dataTypes.map((dt) => {
        const item = new vscode.CompletionItem(dt, vscode.CompletionItemKind.TypeParameter)
        item.insertText = dt
        item.detail = `${dialectName.toUpperCase()} 数据类型`
        item.sortText = `1_${dt}`
        return item
    })
    return [...keywordItems, ...dataTypeItems]
}
```

- [ ] **Step 2: Compile**

Run: `npx tsc -p ./ --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/completion/keywordCompletion.ts
git commit -m "feat: add keyword completion module"
```

---

### Task 7: Function Completion Module

**Files:**
- Create: `src/completion/functionCompletion.ts`

- [ ] **Step 1: Create the module**

```typescript
import * as vscode from 'vscode'
import type { FunctionSignature } from './functionSignatures'
import { signatureToString, getCategoryLabel } from './functionSignatures'

export function getFunctionItems(functions: FunctionSignature[]): vscode.CompletionItem[] {
    return functions.map((fn) => {
        const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function)
        item.insertText = new vscode.SnippetString(
            `${fn.name}(${fn.params.map((_, i) => `$\{${i + 1}:${fn.params[i]}}`).join(', ')})`
        )
        item.detail = `${getCategoryLabel(fn.category)} | ${signatureToString(fn)}`
        const md = new vscode.MarkdownString()
        md.appendMarkdown(`### ${fn.name}\n\n${fn.description}\n\n`)
        md.appendCodeblock(signatureToString(fn), 'sql')
        if (fn.returnType) {
            md.appendMarkdown(`\n\n返回类型: \`${fn.returnType}\``)
        }
        item.documentation = md
        item.sortText = `2_${fn.name}`
        return item
    })
}
```

- [ ] **Step 2: Compile**
- [ ] **Step 3: Commit**

```bash
git add src/completion/functionCompletion.ts
git commit -m "feat: add function completion module with SnippetString"
```

---

### Task 8: Snippet Completion Module

**Files:**
- Create: `src/completion/snippetCompletion.ts`

- [ ] **Step 1: Create the module**

```typescript
import * as vscode from 'vscode'

interface SnippetDefinition {
    prefix: string
    body: string[]
    description: string
}

export function getSnippetItems(
    snippets: Record<string, SnippetDefinition>
): vscode.CompletionItem[] {
    return Object.values(snippets).map((s) => {
        const item = new vscode.CompletionItem(s.description, vscode.CompletionItemKind.Snippet)
        item.insertText = new vscode.SnippetString(s.body.join('\n'))
        item.filterText = s.prefix
        item.detail = `代码片段 (${s.prefix})`
        item.sortText = `0_${s.prefix}`
        return item
    })
}
```

- [ ] **Step 2: Compile**
- [ ] **Step 3: Commit**

```bash
git add src/completion/snippetCompletion.ts
git commit -m "feat: add snippet completion module"
```

---

### Task 9: CTE Name Completion Module

**Files:**
- Create: `src/completion/cteCompletion.ts`

- [ ] **Step 1: Create the module**

```typescript
import * as vscode from 'vscode'

export function getCTEItems(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.CompletionItem[] {
    const textBeforeCursor = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
    )
    if (!textBeforeCursor.trim()) return []

    const cteNames = extractCTENames(textBeforeCursor)
    if (cteNames.length === 0) return []

    return cteNames.map((name) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable)
        item.detail = 'CTE (公共表表达式)'
        item.sortText = `3_${name}`
        return item
    })
}

function extractCTENames(text: string): string[] {
    const names = new Set<string>()
    const cteRegex = /(\w+)\s+AS\s*\(/gi
    let match: RegExpExecArray | null
    while ((match = cteRegex.exec(text)) !== null) {
        const n = match[1].toLowerCase()
        const reserved = ['select', 'with', 'from', 'where', 'join', 'on', 'and', 'or']
        if (!reserved.includes(n)) names.add(n)
    }
    return [...names]
}
```

- [ ] **Step 2: Compile**
- [ ] **Step 3: Commit**

```bash
git add src/completion/cteCompletion.ts
git commit -m "feat: add CTE name completion module"
```

---

### Task 10: Identifier Completion Module

**Files:**
- Create: `src/completion/identifierCompletion.ts`

- [ ] **Step 1: Create the module**

```typescript
import * as vscode from 'vscode'
import Tokenizer from '../lexer/Tokenizer'
import { TokenType } from '../lexer/token'

type ClauseContext = 'from' | 'select' | 'where' | 'unknown'

const RESERVED_COLS = new Set([
    'AS','FROM','WHERE','AND','OR','NOT','IN','IS','NULL','CASE',
    'WHEN','THEN','ELSE','END','JOIN','LEFT','RIGHT','INNER','OUTER',
    'CROSS','ON','LIMIT','ORDER','GROUP','BY','HAVING','UNION','ALL',
    'DISTINCT','SELECT','INSERT','UPDATE','DELETE','CREATE','DROP',
    'ALTER','TABLE','INTO','SET','VALUES'
])

export function getIdentifierItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    tokenizer: Tokenizer
): vscode.CompletionItem[] {
    const text = document.getText()
    if (!text.trim()) return []

    const offset = document.offsetAt(position)
    const line = document.lineAt(position.line).text
    const beforeCursor = line.substring(0, position.character)

    const dotMatch = beforeCursor.match(/(\w+)\.$/)
    if (dotMatch) {
        return getColumnCompletionForAlias(dotMatch[1].toLowerCase(), text)
    }

    const ctx = getClauseContext(text, offset, tokenizer)
    return getCompletionForContext(ctx, text)
}

function getClauseContext(text: string, offset: number, tokenizer: Tokenizer): ClauseContext {
    try {
        const tokens = tokenizer.tokenize(text, {})
        for (let i = tokens.length - 1; i >= 0; i--) {
            const t = tokens[i]
            if (t.start > offset) continue
            const valid = [TokenType.RESERVED_CLAUSE, TokenType.RESERVED_SELECT, TokenType.RESERVED_KEYWORD]
            if (!valid.includes(t.type as any)) continue
            const kw = t.text.toUpperCase()
            if (kw === 'FROM' || kw === 'JOIN') return 'from'
            if (kw === 'SELECT') return 'select'
            if (kw === 'WHERE') return 'where'
        }
    } catch { /* fall through to unknown */ }
    return 'unknown'
}

function getColumnCompletionForAlias(alias: string, text: string): vscode.CompletionItem[] {
    const fromMatch = text.match(new RegExp(`\\bFROM\\s+(\\w+)\\s+(?:AS\\s+)?${alias}\\b`, 'i'))
    const joinMatch = text.match(new RegExp(`\\bJOIN\\s+(\\w+)\\s+(?:AS\\s+)?${alias}\\b`, 'i'))
    if (!fromMatch && !joinMatch) return []

    const columns = findColumns(text)
    return columns.map((col) => {
        const item = new vscode.CompletionItem(col, vscode.CompletionItemKind.Field)
        item.detail = `${alias}.${col}`
        item.sortText = `4_${col}`
        return item
    })
}

function findColumns(text: string): string[] {
    const selectMatch = /\bSELECT\b/i.exec(text)
    const fromMatch = /\bFROM\b/i.exec(text)
    if (!selectMatch || !fromMatch) return []

    const between = text.substring(selectMatch.index + 6, fromMatch.index)
    const cols = new Set<string>()
    const colRegex = /(\w+)(?:\s*,|\s+FROM|\s*$)/gi
    let m: RegExpExecArray | null
    while ((m = colRegex.exec(between)) !== null) {
        const c = m[1].toUpperCase()
        if (!RESERVED_COLS.has(c)) cols.add(m[1].toLowerCase())
    }
    return [...cols]
}

function getCompletionForContext(ctx: ClauseContext, text: string): vscode.CompletionItem[] {
    if (ctx === 'from') {
        return extractTableNames(text).map((t) => {
            const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.Class)
            item.detail = '表名'
            item.sortText = `4_${t}`
            return item
        })
    }
    if (ctx === 'select' || ctx === 'where') {
        return findColumns(text).map((col) => {
            const item = new vscode.CompletionItem(col, vscode.CompletionItemKind.Field)
            item.detail = '列名'
            item.sortText = `4_${col}`
            return item
        })
    }
    return []
}

function extractTableNames(text: string): string[] {
    const names = new Set<string>()
    const regex = /\b(?:FROM|JOIN)\s+(\w+)/gi
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
        names.add(m[1].toLowerCase())
    }
    return [...names]
}
```

- [ ] **Step 2: Compile**
- [ ] **Step 3: Commit**

```bash
git add src/completion/identifierCompletion.ts
git commit -m "feat: add table/column context completion module"
```

---

### Task 11: Update allDialects Exports

**Files:**
- Modify: `src/languages/allDialects.ts`

- [ ] **Step 1: Add keyword and function signature exports**

```typescript
export { hive } from "./hive/hive.formatter"
export { mysql } from "./mysql/mysql.formatter"
export { spark } from "./spark/spark.formatter"
export { sql } from "./sql/sql.formatter"

export { functionSignatures as hiveFunctionSignatures } from "./hive/hive.functions"
export { functionSignatures as mysqlFunctionSignatures } from "./mysql/mysql.functions"
export { functionSignatures as sparkFunctionSignatures } from "./spark/spark.functions"
export { functionSignatures as sqlFunctionSignatures } from "./sql/sql.functions"

export { keywords as hiveKeywords, dataTypes as hiveDataTypes } from "./hive/hive.keywords"
export { keywords as mysqlKeywords, dataTypes as mysqlDataTypes } from "./mysql/mysql.keywords"
export { keywords as sparkKeywords, dataTypes as sparkDataTypes } from "./spark/spark.keywords"
export { keywords as sqlKeywords, dataTypes as sqlDataTypes } from "./sql/sql.keywords"
```

- [ ] **Step 2: Compile**

- [ ] **Step 3: Commit**

```bash
git add src/languages/allDialects.ts
git commit -m "feat: export keyword and function sig data from allDialects"
```

---

### Task 12: SqlCompletionProvider (Orchestrator)

**Files:**
- Create: `src/completion/SqlCompletionProvider.ts`

- [ ] **Step 1: Create main orchestrator**

```typescript
import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { sqlDialects } from '../core/sqlDialects'
import { createDialect, type Dialect } from '../languages/dialect'
import * as allDialects from '../languages/allDialects'
import { getKeywordItems } from './keywordCompletion'
import { getFunctionItems } from './functionCompletion'
import type { FunctionSignature } from './functionSignatures'
import { getSnippetItems } from './snippetCompletion'
import { getCTEItems } from './cteCompletion'
import { getIdentifierItems } from './identifierCompletion'

interface SnippetDef { prefix: string; body: string[]; description: string }

const keywordMap: Record<string, { keywords: string[]; dataTypes: string[] }> = {
    hive: { keywords: allDialects.hiveKeywords, dataTypes: allDialects.hiveDataTypes },
    mysql: { keywords: allDialects.mysqlKeywords, dataTypes: allDialects.mysqlDataTypes },
    spark: { keywords: allDialects.sparkKeywords, dataTypes: allDialects.sparkDataTypes },
    sql:   { keywords: allDialects.sqlKeywords,   dataTypes: allDialects.sqlDataTypes },
}

const functionSigMap: Record<string, FunctionSignature[]> = {
    hive:  allDialects.hiveFunctionSignatures,
    mysql: allDialects.mysqlFunctionSignatures,
    spark: allDialects.sparkFunctionSignatures,
    sql:   allDialects.sqlFunctionSignatures,
}

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
    private dialectCache = new Map<string, Dialect>()
    private snippetItems: vscode.CompletionItem[] = []
    private cfg: Record<string, boolean> = {}

    constructor(extensionPath: string) {
        try {
            const p = path.join(extensionPath, 'snippets', 'sql.json')
            const c = fs.readFileSync(p, 'utf-8')
            this.snippetItems = getSnippetItems(JSON.parse(c) as Record<string, SnippetDef>)
        } catch { this.snippetItems = [] }
        this.loadConfig()
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('SQL-All-in-One')) this.loadConfig()
        })
    }

    private loadConfig(): void {
        const c = vscode.workspace.getConfiguration('SQL-All-in-One')
        this.cfg = {
            enableCompletion: c.get('enableCompletion', true),
            keywords: c.get('completion.keywords', true),
            functions: c.get('completion.functions', true),
            snippets: c.get('completion.snippets', true),
            cteNames: c.get('completion.cteNames', true),
            identifiers: c.get('completion.identifiers', true),
        }
    }

    private getDialect(langId: string): { dialect: Dialect; dName: string } {
        const cached = this.dialectCache.get(langId)
        const dName = sqlDialects[langId as keyof typeof sqlDialects] || 'hive'
        if (cached) return { dialect: cached, dName }
        const dc = allDialects[dName as keyof typeof allDialects] as {
            name: string; tokenizerOptions: any; formatOptions: any
        }
        const dialect = createDialect(dc)
        this.dialectCache.set(langId, dialect)
        return { dialect, dName }
    }

    provideCompletionItems(
        doc: vscode.TextDocument,
        pos: vscode.Position,
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        if (!this.cfg.enableCompletion) return []
        const { dialect, dName } = this.getDialect(doc.languageId)
        const items: vscode.CompletionItem[] = []

        if (this.cfg.keywords) {
            const kd = keywordMap[dName]
            if (kd) items.push(...getKeywordItems(kd.keywords, kd.dataTypes, dName))
        }
        if (this.cfg.functions) {
            const sigs = functionSigMap[dName]
            if (sigs) items.push(...getFunctionItems(sigs))
        }
        if (this.cfg.snippets) items.push(...this.snippetItems)
        if (this.cfg.cteNames && doc.getText().trim()) items.push(...getCTEItems(doc, pos))
        if (this.cfg.identifiers && doc.getText().trim()) items.push(...getIdentifierItems(doc, pos, dialect.tokenizer))

        return items
    }
}
```

- [ ] **Step 2: Compile**

Run: `npx tsc -p ./ --noEmit`
Expected: No errors. If `allDialects` type issues arise from multiple exports, verify all imports resolve.

- [ ] **Step 3: Commit**

```bash
git add src/completion/SqlCompletionProvider.ts
git commit -m "feat: add SqlCompletionProvider orchestrator"
```

---

### Task 13: Register Provider in extension.ts

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Import and register**

Add import at top:
```typescript
import { SqlCompletionProvider } from "./completion/SqlCompletionProvider"
```

In the `activate` function, before `context.subscriptions.push(...)`, add:

```typescript
const completionProvider = new SqlCompletionProvider(context.extensionUri.fsPath)
const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.']
```

Inside the `context.subscriptions.push(...)` block, add:

```typescript
vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'sql' },
    completionProvider, ...triggerChars
),
vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'hive' },
    completionProvider, ...triggerChars
),
```

- [ ] **Step 2: Compile**

Run: `npx tsc -p ./ --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: register CompletionItemProvider for sql and hive"
```

---

### Task 14: Add Configuration Properties

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add 6 config properties**

In `contributes.configuration.properties`, add these entries before the closing `}` of `properties`:

```json
"SQL-All-in-One.enableCompletion": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "是否启用智能补全功能"
},
"SQL-All-in-One.completion.keywords": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "补全列表中是否包含关键字"
},
"SQL-All-in-One.completion.functions": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "补全列表中是否包含函数"
},
"SQL-All-in-One.completion.snippets": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "补全列表中是否包含代码片段"
},
"SQL-All-in-One.completion.cteNames": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "是否提示 CTE 名称"
},
"SQL-All-in-One.completion.identifiers": {
    "type": "boolean",
    "default": true,
    "markdownDescription": "是否提示表名和列名"
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf-8'))" && echo "Valid JSON"`
Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add completion configuration properties"
```

---

### Task 15: Unit Tests

**Files:**
- Create: `src/test/completion.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import * as assert from 'assert'

suite('Completion Module Tests', () => {

    test('FunctionSignature type has required fields', () => {
        const sig = {
            name: 'SUBSTR',
            params: ['string str', 'int start'],
            description: 'test',
            category: 'string'
        }
        assert.strictEqual(sig.name, 'SUBSTR')
        assert.strictEqual(sig.params.length, 2)
        assert.strictEqual(sig.category, 'string')
    })

    test('signatureToString formats correctly', async () => {
        const mod = await import('../completion/functionSignatures')
        const result = mod.signatureToString({
            name: 'SUBSTR',
            params: ['string str', 'int start', 'int length'],
            description: 'substring',
            category: 'string',
        })
        assert.strictEqual(result, 'SUBSTR(string str, int start, int length)')
    })

    test('getCategoryLabel returns Chinese labels', async () => {
        const mod = await import('../completion/functionSignatures')
        assert.strictEqual(mod.getCategoryLabel('string'), '字符串')
        assert.strictEqual(mod.getCategoryLabel('math'), '数学')
        assert.strictEqual(mod.getCategoryLabel('date'), '日期')
        assert.strictEqual(mod.getCategoryLabel('aggregate'), '聚合')
        assert.strictEqual(mod.getCategoryLabel('window'), '窗口')
    })

    test('Hive functionSignatures export is a non-empty array', async () => {
        const hive = await import('../languages/hive/hive.functions')
        assert.ok(Array.isArray(hive.functionSignatures))
        assert.ok(hive.functionSignatures.length > 0)
        const f = hive.functionSignatures[0]
        assert.ok(typeof f.name === 'string')
        assert.ok(Array.isArray(f.params))
        assert.ok(typeof f.description === 'string')
    })
})
```

- [ ] **Step 2: Compile tests**

Run: `npx tsc -p ./ --noEmit`

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/test/completion.test.ts
git commit -m "test: add unit tests for completion modules"
```

---

### Task 16: Integration Verification

- [ ] **Step 1: Launch Extension Host**

Run: Run the VS Code Extension Host from `.vscode/launch.json` or press F5.

- [ ] **Step 2: Manual verification**

| Action | Expected |
|--------|----------|
| Open `.sql` file, type `SEL` | Completion list shows `SELECT`, snippet items |
| Type `SUB` | Shows `SUBSTR(string str, int start, int length)` with detail |
| Type `sel` | Shows 17 snippet items including "Basic SELECT statement" |
| Write `WITH t AS (SELECT ...) SELECT ` then Ctrl+Space | Shows `t` as CTE completion |
| Write `FROM users u WHERE u.` | Shows column completions from SELECT clause |
| Type any Hive keyword prefix | Shows relevant keyword completions |

- [ ] **Step 3: Verify configuration toggle**

Set `"SQL-All-in-One.enableCompletion": false` → completions disabled.
Set individual sub-switches → only relevant categories appear.

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: integration verification fixes"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | FunctionSignature type | `src/completion/functionSignatures.ts` (Create) |
| 2 | Hive function data (~167 sigs) | `src/languages/hive/hive.functions.ts` (Modify) |
| 3 | MySQL function data (~85 sigs) | `src/languages/mysql/mysql.functions.ts` (Modify) |
| 4 | SparkSQL function data (~80 sigs) | `src/languages/spark/spark.functions.ts` (Modify) |
| 5 | Standard SQL function data (~50 sigs) | `src/languages/sql/sql.functions.ts` (Modify) |
| 6 | Keyword completion | `src/completion/keywordCompletion.ts` (Create) |
| 7 | Function completion | `src/completion/functionCompletion.ts` (Create) |
| 8 | Snippet completion | `src/completion/snippetCompletion.ts` (Create) |
| 9 | CTE completion | `src/completion/cteCompletion.ts` (Create) |
| 10 | Identifier completion | `src/completion/identifierCompletion.ts` (Create) |
| 11 | allDialects exports | `src/languages/allDialects.ts` (Modify) |
| 12 | SqlCompletionProvider | `src/completion/SqlCompletionProvider.ts` (Create) |
| 13 | Register in extension.ts | `src/extension.ts` (Modify) |
| 14 | Configuration properties | `package.json` (Modify) |
| 15 | Unit tests | `src/test/completion.test.ts` (Create) |
| 16 | Integration verification | Manual testing |