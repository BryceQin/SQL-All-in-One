export type TypeMapping = Record<string, string>;

export const MYSQL_TO_HIVE_TYPES: TypeMapping = {
  'TINYINT': 'TINYINT',
  'SMALLINT': 'SMALLINT',
  'MEDIUMINT': 'INT',
  'INT': 'INT',
  'INTEGER': 'INT',
  'BIGINT': 'BIGINT',
  'FLOAT': 'FLOAT',
  'DOUBLE': 'DOUBLE',
  'DECIMAL': 'DECIMAL',
  'DATE': 'DATE',
  'DATETIME': 'TIMESTAMP',
  'TIMESTAMP': 'TIMESTAMP',
  'TIME': 'STRING',
  'YEAR': 'INT',
  'CHAR': 'STRING',
  'VARCHAR': 'STRING',
  'TEXT': 'STRING',
  'TINYTEXT': 'STRING',
  'MEDIUMTEXT': 'STRING',
  'LONGTEXT': 'STRING',
  'BINARY': 'BINARY',
  'VARBINARY': 'BINARY',
  'BLOB': 'BINARY',
  'TINYBLOB': 'BINARY',
  'MEDIUMBLOB': 'BINARY',
  'LONGBLOB': 'BINARY',
  'BIT': 'BOOLEAN',
  'BOOLEAN': 'BOOLEAN',
  'BOOL': 'BOOLEAN',
  'JSON': 'STRING'
}

export const HIVE_TO_MYSQL_TYPES: TypeMapping = {
  'STRING': 'VARCHAR(255)',
  'BOOLEAN': 'TINYINT(1)',
  'BINARY': 'BLOB',
  'ARRAY': 'JSON',
  'MAP': 'JSON',
  'STRUCT': 'JSON',
  'UNIONTYPE': 'JSON'
}
