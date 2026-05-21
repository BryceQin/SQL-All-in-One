export interface FunctionMapping {
  pattern: RegExp
  replacement: string
}

export const MYSQL_TO_HIVE_FUNCTIONS: FunctionMapping[] = [
  {
    pattern: /\bIFNULL\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
    replacement: 'COALESCE($1, $2)'
  },
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

export const HIVE_TO_MYSQL_FUNCTIONS: FunctionMapping[] = [
  {
    pattern: /\bCOALESCE\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
    replacement: 'IFNULL($1, $2)'
  },
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
    pattern: /\s*DISTRIBUTE\s+BY\s+[^;]+/gi,
    replacement: ''
  },
  {
    pattern: /\s*SORT\s+BY\s+[^;]+/gi,
    replacement: ''
  },
  {
    pattern: /\s*CLUSTER\s+BY\s+[^;]+/gi,
    replacement: ''
  }
]
