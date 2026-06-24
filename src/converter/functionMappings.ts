export interface FunctionMapping {
  pattern: RegExp
  replacement: string
}

const funcCallRegexCache = new Map<string, RegExp>();
function getFuncCallRegex(funcName: string): RegExp {
    let regex = funcCallRegexCache.get(funcName);
    if (!regex) {
        regex = new RegExp(`\\b${funcName}\\s*\\(`, 'gi');
        funcCallRegexCache.set(funcName, regex);
    }
    return regex;
}

export function matchFunctionCall(sql: string, funcName: string): { index: number; end: number; args: string[] } | null {
  const regex = getFuncCallRegex(funcName)
  const match = regex.exec(sql)
  if (!match) return null

  const callStart = match.index
  const openParen = callStart + match[0].length - 1
  let depth = 1
  let i = openParen + 1
  let inSingleQuote = false
  let inDoubleQuote = false

  while (i < sql.length && depth > 0) {
    const ch = sql[i]

    if (inSingleQuote) {
      if (ch === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
        i += 2
        continue
      }
      if (ch === "'") inSingleQuote = false
      i++
      continue
    }

    if (inDoubleQuote) {
      if (ch === '"') inDoubleQuote = false
      i++
      continue
    }

    if (ch === "'") { inSingleQuote = true; i++; continue }
    if (ch === '"') { inDoubleQuote = true; i++; continue }
    if (ch === '(') depth++
    if (ch === ')') depth--
    i++
  }

  if (depth !== 0) return null

  const callEnd = i
  const innerContent = sql.substring(openParen + 1, callEnd - 1)
  const args = splitTopLevelArgs(innerContent)

  return { index: callStart, end: callEnd, args }
}

function splitTopLevelArgs(content: string): string[] {
  const args: string[] = []
  let current = ''
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]

    if (inSingleQuote) {
      current += ch
      if (ch === "'" && i + 1 < content.length && content[i + 1] === "'") {
        current += content[i + 1]
        i++
      } else if (ch === "'") {
        inSingleQuote = false
      }
      continue
    }

    if (inDoubleQuote) {
      current += ch
      if (ch === '"') inDoubleQuote = false
      continue
    }

    if (ch === "'") { inSingleQuote = true; current += ch; continue }
    if (ch === '"') { inDoubleQuote = true; current += ch; continue }
    if (ch === '(') { depth++; current += ch; continue }
    if (ch === ')') { depth--; current += ch; continue }

    if (ch === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }

  if (current.trim()) {
    args.push(current.trim())
  }

  return args
}

export function replaceFunctionCall(sql: string, funcName: string, replacer: (args: string[]) => string): string {
  let result = sql
  let offset = 0

  while (true) {
    const remaining = result.substring(offset)
    const match = matchFunctionCall(remaining, funcName)
    if (!match) break

    const recursivelyProcessedArgs = match.args.map(arg => replaceFunctionCall(arg, funcName, replacer))
    const replacement = replacer(recursivelyProcessedArgs)
    result = result.substring(0, offset + match.index) + replacement + result.substring(offset + match.end)
    offset += match.index + replacement.length
  }

  return result
}

export const MYSQL_TO_HIVE_FUNCTIONS: FunctionMapping[] = [
  {
    pattern: /\bNOW\s*\(\s*\)/gi,
    replacement: 'CURRENT_TIMESTAMP'
  },
  {
    pattern: /\bCURDATE\s*\(\s*\)/gi,
    replacement: 'CURRENT_DATE'
  },
  {
    pattern: /\bCURTIME\s*\(\s*\)/gi,
    replacement: "FROM_UNIXTIME(UNIX_TIMESTAMP(), 'HH:mm:ss')"
  },
  {
    pattern: /\s*-\s*INTERVAL\s+(\d+)\s+(DAY|WEEK|MONTH|YEAR|HOUR|MINUTE|SECOND)/gi,
    replacement: " - INTERVAL '$1' $2"
  }
]

export function convertIfnullToCoalesce(sql: string): string {
  return replaceFunctionCall(sql, 'IFNULL', (args) => `COALESCE(${args.join(', ')})`)
}

export const HIVE_TO_MYSQL_FUNCTIONS: FunctionMapping[] = [
  {
    pattern: /\bCURRENT_TIMESTAMP\s*(?:\(\s*\))?/gi,
    replacement: 'NOW()'
  },
  {
    pattern: /\bCURRENT_DATE\s*(?:\(\s*\))?/gi,
    replacement: 'CURDATE()'
  },
  {
    pattern: /\s*-\s*INTERVAL\s+'([^']+)'\s+(\w+)/gi,
    replacement: " - INTERVAL $1 $2"
  },
  {
    pattern: /\s*DISTRIBUTE\s+BY\s+((?:(?!LIMIT|ORDER\s+BY|CLUSTER\s+BY|SORT\s+BY|;).)+)/gi,
    replacement: ''
  },
  {
    pattern: /\s*SORT\s+BY\s+((?:(?!LIMIT|ORDER\s+BY|CLUSTER\s+BY|DISTRIBUTE\s+BY|;).)+)/gi,
    replacement: ''
  },
  {
    pattern: /\s*CLUSTER\s+BY\s+((?:(?!LIMIT|ORDER\s+BY|SORT\s+BY|DISTRIBUTE\s+BY|;).)+)/gi,
    replacement: ''
  }
]

export function convertCoalesceToIfnull(sql: string): string {
  return replaceFunctionCall(sql, 'COALESCE', (args) => {
    if (args.length === 2) return `IFNULL(${args.join(', ')})`
    return `COALESCE(${args.join(', ')})`
  })
}
