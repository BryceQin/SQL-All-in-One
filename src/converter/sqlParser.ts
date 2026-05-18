export interface CreateTableInfo {
  before: string
  content: string
  tableComment: string
  fullStatement: string
  startIndex: number
}

export class SqlParser {
  static findCreateTable(sql: string): CreateTableInfo | null {
    const createStart = sql.search(/CREATE\s+TABLE/i)
    if (createStart === -1) {
      return null
    }

    const { fullStatement } = this.findStatementEnd(sql, createStart)
    const firstParen = fullStatement.indexOf('(')
    const lastParen = fullStatement.lastIndexOf(')')

    if (firstParen === -1 || lastParen === -1) {
      return null
    }

    const before = fullStatement.substring(0, firstParen + 1)
    const content = fullStatement.substring(firstParen + 1, lastParen)
    const tableComment = this.extractTableComment(fullStatement, lastParen)

    return {
      before,
      content,
      tableComment,
      fullStatement,
      startIndex: createStart
    }
  }

  private static findStatementEnd(sql: string, startIndex: number): { fullStatement: string; endIndex: number } {
    let i = startIndex
    let inString = false
    let stringChar = ''
    let inComment = false
    let depth = 0

    while (i < sql.length) {
      const char = sql[i]
      const nextChar = i + 1 < sql.length ? sql[i + 1] : ''

      if ((char === "'" || char === '"') && !inComment) {
        if (!inString) {
          inString = true
          stringChar = char
        } else if (char === stringChar && sql[i - 1] !== '\\') {
          inString = false
        }
      }

      if (!inString) {
        if (char === '/' && nextChar === '*') {
          inComment = true
          i++
        } else if (char === '*' && nextChar === '/') {
          inComment = false
          i++
        } else if (char === '-' && nextChar === '-') {
          while (i < sql.length && sql[i] !== '\n') i++
        } else if (char === '#') {
          while (i < sql.length && sql[i] !== '\n') i++
        }
      }

      if (!inString && !inComment) {
        if (char === '(') depth++
        if (char === ')') depth--
      }

      if (!inString && !inComment && char === ';' && depth === 0) {
        return {
          fullStatement: sql.substring(startIndex, i + 1),
          endIndex: i + 1
        }
      }

      i++
    }

    return {
      fullStatement: sql.substring(startIndex),
      endIndex: sql.length
    }
  }

  private static extractTableComment(fullStatement: string, lastParen: number): string {
    const afterBracket = fullStatement.substring(lastParen)
    const match = afterBracket.match(/COMMENT\s*(?:=\s*)?'([^']*)'/i)
    return match ? match[1] : ''
  }

  static splitColumnDefinitions(content: string): string[] {
    const items: string[] = []
    let current = ''
    let depth = 0

    for (let i = 0; i < content.length; i++) {
      const char = content[i]

      if (char === '(') depth++
      if (char === ')') depth--

      if (char === ',' && depth === 0) {
        if (current.trim()) {
          items.push(current.trim())
        }
        current = ''
      } else {
        current += char
      }
    }

    if (current.trim()) {
      items.push(current.trim())
    }

    return items
  }
}
