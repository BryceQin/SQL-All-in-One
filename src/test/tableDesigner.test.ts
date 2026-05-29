import * as assert from 'assert';

interface ColumnDesign {
    id: string;
    name: string;
    type: string;
    length: string;
    nullable: boolean;
    defaultValue: string;
    comment: string;
    isPrimaryKey: boolean;
    isAutoIncrement: boolean;
    isUnique: boolean;
    originalName?: string;
}

interface IndexDesign {
    id: string;
    name: string;
    type: string;
    columns: string[];
    isUnique: boolean;
}

interface FkDesign {
    id: string;
    name: string;
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
    onDelete: string;
    onUpdate: string;
}

interface TriggerDesign {
    id: string;
    name: string;
    timing: string;
    event: string;
    statement: string;
}

interface TableOptions {
    engine: string;
    charset: string;
    collation: string;
    autoIncrement: string;
    comment: string;
}

interface TableDesignData {
    tableName: string;
    columns: ColumnDesign[];
    indexes: IndexDesign[];
    foreignKeys: FkDesign[];
    triggers: TriggerDesign[];
    options: TableOptions;
    mode: 'create' | 'edit';
}

interface ColumnInfo {
    name: string;
    type: string;
    length?: number;
    nullable: boolean;
    defaultValue?: any;
    isPrimaryKey: boolean;
    isAutoIncrement: boolean;
    isUnique: boolean;
    comment?: string;
}

interface IndexInfo {
    name: string;
    type: string;
    columns: string[];
    isUnique: boolean;
    isPrimary: boolean;
}

interface ForeignKeyInfo {
    name: string;
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
    onDelete: string;
    onUpdate: string;
}

interface TriggerInfo {
    name: string;
    event: string;
    timing: string;
    statement: string;
}

interface TableStructure {
    columns: ColumnInfo[];
    indexes: IndexInfo[];
    foreignKeys: ForeignKeyInfo[];
    triggers: TriggerInfo[];
    ddl?: string;
    rowCount?: number;
    engine?: string;
    charset?: string;
    comment?: string;
}

function generateCreateDDL(data: TableDesignData): string {
    const lines: string[] = [];

    for (const col of data.columns) {
        let line = `  \`${col.name}\` ${col.type.toUpperCase()}`;
        if (col.length) {
            line += `(${col.length})`;
        }
        if (!col.nullable) {
            line += ' NOT NULL';
        }
        if (col.isAutoIncrement) {
            line += ' AUTO_INCREMENT';
        }
        if (col.defaultValue) {
            if (col.defaultValue.toUpperCase() === 'NULL' ||
                col.defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP' ||
                col.defaultValue.toUpperCase() === 'CURRENT_DATE') {
                line += ` DEFAULT ${col.defaultValue}`;
            } else {
                line += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`;
            }
        }
        if (col.comment) {
            line += ` COMMENT '${col.comment.replace(/'/g, "\\'")}'`;
        }
        lines.push(line);
    }

    const pkColumns = data.columns.filter(c => c.isPrimaryKey);
    if (pkColumns.length > 0) {
        lines.push(`  PRIMARY KEY (${pkColumns.map(c => `\`${c.name}\``).join(', ')})`);
    }

    for (const idx of data.indexes) {
        if (idx.isUnique) {
            lines.push(`  UNIQUE KEY \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')})`);
        } else {
            lines.push(`  KEY \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')})`);
        }
    }

    for (const fk of data.foreignKeys) {
        let fkLine = `  CONSTRAINT \`${fk.name}\` FOREIGN KEY (${fk.columns.map(c => `\`${c}\``).join(', ')}) REFERENCES \`${fk.referencedTable}\` (${fk.referencedColumns.map(c => `\`${c}\``).join(', ')})`;
        if (fk.onDelete) {
            fkLine += ` ON DELETE ${fk.onDelete}`;
        }
        if (fk.onUpdate) {
            fkLine += ` ON UPDATE ${fk.onUpdate}`;
        }
        lines.push(fkLine);
    }

    let ddl = `CREATE TABLE \`${data.tableName}\` (\n${lines.join(',\n')}\n)`;

    const options: string[] = [];
    if (data.options.engine) {
        options.push(`ENGINE=${data.options.engine}`);
    }
    if (data.options.charset) {
        options.push(`DEFAULT CHARSET=${data.options.charset}`);
    }
    if (data.options.collation) {
        options.push(`COLLATE=${data.options.collation}`);
    }
    if (data.options.autoIncrement) {
        options.push(`AUTO_INCREMENT=${data.options.autoIncrement}`);
    }
    if (data.options.comment) {
        options.push(`COMMENT='${data.options.comment.replace(/'/g, "\\'")}'`);
    }

    if (options.length > 0) {
        ddl += ' ' + options.join(' ');
    }

    ddl += ';';

    return ddl;
}

function generateAlterDDL(data: TableDesignData, originalStructure: TableStructure | undefined): string {
    const statements: string[] = [];
    const original = originalStructure;

    if (!original) {
        return generateCreateDDL(data);
    }

    for (const col of data.columns) {
        const originalCol = original.columns.find(c => c.name === (col.originalName || col.name));

        if (!originalCol && !col.originalName) {
            let addSql = `ALTER TABLE \`${data.tableName}\` ADD COLUMN \`${col.name}\` ${col.type.toUpperCase()}`;
            if (col.length) {
                addSql += `(${col.length})`;
            }
            if (!col.nullable) {
                addSql += ' NOT NULL';
            }
            if (col.isAutoIncrement) {
                addSql += ' AUTO_INCREMENT';
            }
            if (col.defaultValue) {
                if (col.defaultValue.toUpperCase() === 'NULL' ||
                    col.defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP' ||
                    col.defaultValue.toUpperCase() === 'CURRENT_DATE') {
                    addSql += ` DEFAULT ${col.defaultValue}`;
                } else {
                    addSql += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`;
                }
            }
            if (col.comment) {
                addSql += ` COMMENT '${col.comment.replace(/'/g, "\\'")}'`;
            }
            statements.push(addSql + ';');
        } else if (originalCol) {
            const isRenamed = col.originalName && col.originalName !== col.name;
            const isModified =
                originalCol.type.toUpperCase() !== col.type.toUpperCase() ||
                String(originalCol.length || '') !== col.length ||
                originalCol.nullable !== col.nullable ||
                originalCol.isAutoIncrement !== col.isAutoIncrement ||
                String(originalCol.defaultValue || '') !== col.defaultValue ||
                (originalCol.comment || '') !== col.comment;

            if (isRenamed || isModified) {
                let modSql: string;
                if (isRenamed) {
                    modSql = `ALTER TABLE \`${data.tableName}\` CHANGE COLUMN \`${col.originalName}\` \`${col.name}\` ${col.type.toUpperCase()}`;
                } else {
                    modSql = `ALTER TABLE \`${data.tableName}\` MODIFY COLUMN \`${col.name}\` ${col.type.toUpperCase()}`;
                }
                if (col.length) {
                    modSql += `(${col.length})`;
                }
                if (!col.nullable) {
                    modSql += ' NOT NULL';
                }
                if (col.isAutoIncrement) {
                    modSql += ' AUTO_INCREMENT';
                }
                if (col.defaultValue) {
                    if (col.defaultValue.toUpperCase() === 'NULL' ||
                        col.defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP' ||
                        col.defaultValue.toUpperCase() === 'CURRENT_DATE') {
                        modSql += ` DEFAULT ${col.defaultValue}`;
                    } else {
                        modSql += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`;
                    }
                }
                if (col.comment) {
                    modSql += ` COMMENT '${col.comment.replace(/'/g, "\\'")}'`;
                }
                statements.push(modSql + ';');
            }
        }
    }

    for (const origCol of original.columns) {
        const stillExists = data.columns.some(c => c.name === origCol.name || c.originalName === origCol.name);
        if (!stillExists) {
            statements.push(`ALTER TABLE \`${data.tableName}\` DROP COLUMN \`${origCol.name}\`;`);
        }
    }

    const originalIdxNames = new Set(original.indexes.map(i => i.name));
    const newIdxNames = new Set(data.indexes.map(i => i.name));

    for (const idx of data.indexes) {
        if (!originalIdxNames.has(idx.name)) {
            if (idx.isUnique) {
                statements.push(`ALTER TABLE \`${data.tableName}\` ADD UNIQUE KEY \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')});`);
            } else {
                statements.push(`ALTER TABLE \`${data.tableName}\` ADD KEY \`${idx.name}\` (${idx.columns.map(c => `\`${c}\``).join(', ')});`);
            }
        }
    }

    for (const origIdx of original.indexes) {
        if (!newIdxNames.has(origIdx.name) && !origIdx.isPrimary) {
            statements.push(`ALTER TABLE \`${data.tableName}\` DROP INDEX \`${origIdx.name}\`;`);
        }
    }

    const originalFkNames = new Set(original.foreignKeys.map(f => f.name));
    const newFkNames = new Set(data.foreignKeys.map(f => f.name));

    for (const origFk of original.foreignKeys) {
        if (!newFkNames.has(origFk.name)) {
            statements.push(`ALTER TABLE \`${data.tableName}\` DROP FOREIGN KEY \`${origFk.name}\`;`);
        }
    }

    for (const fk of data.foreignKeys) {
        if (!originalFkNames.has(fk.name)) {
            let addFkSql = `ALTER TABLE \`${data.tableName}\` ADD CONSTRAINT \`${fk.name}\` FOREIGN KEY (${fk.columns.map(c => `\`${c}\``).join(', ')}) REFERENCES \`${fk.referencedTable}\` (${fk.referencedColumns.map(c => `\`${c}\``).join(', ')})`;
            if (fk.onDelete) {
                addFkSql += ` ON DELETE ${fk.onDelete}`;
            }
            if (fk.onUpdate) {
                addFkSql += ` ON UPDATE ${fk.onUpdate}`;
            }
            statements.push(addFkSql + ';');
        }
    }

    const originalTrgNames = new Set(original.triggers.map(t => t.name));
    const newTrgNames = new Set(data.triggers.map(t => t.name));

    for (const origTrg of original.triggers) {
        if (!newTrgNames.has(origTrg.name)) {
            statements.push(`DROP TRIGGER \`${origTrg.name}\`;`);
        }
    }

    for (const trg of data.triggers) {
        if (!originalTrgNames.has(trg.name)) {
            statements.push(`CREATE TRIGGER \`${trg.name}\` ${trg.timing} ${trg.event} ON \`${data.tableName}\` FOR EACH ROW ${trg.statement};`);
        }
    }

    if (data.options.comment !== (original.comment || '')) {
        const optionParts: string[] = [];
        if (data.options.engine) {
            optionParts.push(`ENGINE=${data.options.engine}`);
        }
        if (data.options.charset) {
            optionParts.push(`DEFAULT CHARSET=${data.options.charset}`);
        }
        if (data.options.collation) {
            optionParts.push(`COLLATE=${data.options.collation}`);
        }
        if (data.options.comment) {
            optionParts.push(`COMMENT='${data.options.comment.replace(/'/g, "\\'")}'`);
        }
        if (optionParts.length > 0) {
            statements.push(`ALTER TABLE \`${data.tableName}\` ${optionParts.join(' ')};`);
        }
    }

    return statements.join('\n');
}

function validateDesign(data: TableDesignData): string | null {
    if (!data.tableName || data.tableName.trim() === '') {
        return 'Table name is required';
    }

    if (!data.columns || data.columns.length === 0) {
        return 'At least one column is required';
    }

    const emptyNames = data.columns.filter(c => !c.name || c.name.trim() === '');
    if (emptyNames.length > 0) {
        return 'Column names cannot be empty';
    }

    const names = data.columns.map(c => c.name.toLowerCase());
    const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
    if (duplicates.length > 0) {
        return `Duplicate column names: ${[...new Set(duplicates)].join(', ')}`;
    }

    return null;
}

function makeColumn(overrides: Partial<ColumnDesign> = {}): ColumnDesign {
    return {
        id: `col_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: 'id',
        type: 'INT',
        length: '11',
        nullable: false,
        defaultValue: '',
        comment: '',
        isPrimaryKey: true,
        isAutoIncrement: true,
        isUnique: false,
        ...overrides,
    };
}

function makeDesign(overrides: Partial<TableDesignData> = {}): TableDesignData {
    return {
        tableName: 'users',
        columns: [
            makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false }),
            makeColumn({ name: 'name', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false, comment: 'user name' }),
        ],
        indexes: [],
        foreignKeys: [],
        triggers: [],
        options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'user table' },
        mode: 'create',
        ...overrides,
    };
}

suite('Table Designer - Validation', () => {

    test('should pass validation for valid design', () => {
        const data = makeDesign();
        assert.strictEqual(validateDesign(data), null);
    });

    test('should fail validation for empty table name', () => {
        const data = makeDesign({ tableName: '' });
        assert.strictEqual(validateDesign(data), 'Table name is required');
    });

    test('should fail validation for whitespace-only table name', () => {
        const data = makeDesign({ tableName: '   ' });
        assert.strictEqual(validateDesign(data), 'Table name is required');
    });

    test('should fail validation for no columns', () => {
        const data = makeDesign({ columns: [] });
        assert.strictEqual(validateDesign(data), 'At least one column is required');
    });

    test('should fail validation for empty column name', () => {
        const data = makeDesign({
            columns: [makeColumn({ name: '' })],
        });
        assert.strictEqual(validateDesign(data), 'Column names cannot be empty');
    });

    test('should fail validation for whitespace-only column name', () => {
        const data = makeDesign({
            columns: [makeColumn({ name: '  ' })],
        });
        assert.strictEqual(validateDesign(data), 'Column names cannot be empty');
    });

    test('should fail validation for duplicate column names', () => {
        const data = makeDesign({
            columns: [
                makeColumn({ name: 'id' }),
                makeColumn({ name: 'id' }),
            ],
        });
        const result = validateDesign(data);
        assert.ok(result);
        assert.ok(result.includes('Duplicate column names'));
        assert.ok(result.includes('id'));
    });

    test('should fail validation for duplicate column names (case insensitive)', () => {
        const data = makeDesign({
            columns: [
                makeColumn({ name: 'Name' }),
                makeColumn({ name: 'name' }),
            ],
        });
        const result = validateDesign(data);
        assert.ok(result);
        assert.ok(result.includes('Duplicate column names'));
    });

    test('should pass validation with single column', () => {
        const data = makeDesign({
            columns: [makeColumn({ name: 'id' })],
        });
        assert.strictEqual(validateDesign(data), null);
    });
});

suite('Table Designer - CREATE TABLE DDL', () => {

    test('should generate basic CREATE TABLE with single column', () => {
        const data: TableDesignData = {
            tableName: 'test_table',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.startsWith('CREATE TABLE `test_table`'));
        assert.ok(ddl.includes('`id` INT(11) NOT NULL AUTO_INCREMENT'));
        assert.ok(ddl.includes('PRIMARY KEY (`id`)'));
        assert.ok(ddl.includes('ENGINE=InnoDB'));
        assert.ok(ddl.includes('DEFAULT CHARSET=utf8mb4'));
        assert.ok(ddl.endsWith(';'));
    });

    test('should generate CREATE TABLE with multiple columns', () => {
        const data = makeDesign();
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('`id` INT(11) NOT NULL AUTO_INCREMENT'));
        assert.ok(ddl.includes('`name` VARCHAR(255) NOT NULL'));
        assert.ok(ddl.includes("COMMENT 'user name'"));
    });

    test('should generate nullable column', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'email', type: 'VARCHAR', length: '255', nullable: true, isPrimaryKey: false, isAutoIncrement: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('`email` VARCHAR(255)'));
        assert.ok(!ddl.includes('`email` VARCHAR(255) NOT NULL'));
    });

    test('should generate column with string default value', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'status', type: 'VARCHAR', length: '50', nullable: false, defaultValue: 'active', isPrimaryKey: false, isAutoIncrement: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes("DEFAULT 'active'"));
    });

    test('should generate column with NULL default value', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'deleted_at', type: 'DATETIME', length: '', nullable: true, defaultValue: 'NULL', isPrimaryKey: false, isAutoIncrement: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('DEFAULT NULL'));
        assert.ok(!ddl.includes("DEFAULT 'NULL'"));
    });

    test('should generate column with CURRENT_TIMESTAMP default', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'created_at', type: 'TIMESTAMP', length: '', nullable: false, defaultValue: 'CURRENT_TIMESTAMP', isPrimaryKey: false, isAutoIncrement: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('DEFAULT CURRENT_TIMESTAMP'));
        assert.ok(!ddl.includes("DEFAULT 'CURRENT_TIMESTAMP'"));
    });

    test('should escape single quotes in default value', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'note', type: 'VARCHAR', length: '255', nullable: false, defaultValue: "it's fine", isPrimaryKey: false, isAutoIncrement: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes("DEFAULT 'it''s fine'"));
    });

    test('should escape single quotes in column comment', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'note', type: 'VARCHAR', length: '255', nullable: false, comment: "user's note", isPrimaryKey: false, isAutoIncrement: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes("COMMENT 'user\\'s note'"));
    });

    test('should generate column without length when not specified', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'bio', type: 'TEXT', length: '', nullable: true, isPrimaryKey: false, isAutoIncrement: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('`bio` TEXT'));
        assert.ok(!ddl.includes('`bio` TEXT('));
    });

    test('should generate composite primary key', () => {
        const data: TableDesignData = {
            tableName: 'order_items',
            columns: [
                makeColumn({ name: 'order_id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: false, nullable: false }),
                makeColumn({ name: 'product_id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: false, nullable: false }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('PRIMARY KEY (`order_id`, `product_id`)'));
    });

    test('should generate table with table comment', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'user info table' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes("COMMENT='user info table'"));
    });

    test('should generate table with auto increment start value', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '1000', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('AUTO_INCREMENT=1000'));
    });

    test('should generate table with collation', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('COLLATE=utf8mb4_unicode_ci'));
    });
});

suite('Table Designer - CREATE TABLE with Indexes', () => {

    test('should generate non-unique index', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false })],
            indexes: [{ id: 'idx1', name: 'idx_name', type: 'BTREE', columns: ['id'], isUnique: false }],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('KEY `idx_name` (`id`)'));
    });

    test('should generate unique index', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'email', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false })],
            indexes: [{ id: 'idx1', name: 'uk_email', type: 'BTREE', columns: ['email'], isUnique: true }],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('UNIQUE KEY `uk_email` (`email`)'));
    });

    test('should generate composite index', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'first_name', type: 'VARCHAR', length: '100', isPrimaryKey: false, isAutoIncrement: false, nullable: false }),
                makeColumn({ name: 'last_name', type: 'VARCHAR', length: '100', isPrimaryKey: false, isAutoIncrement: false, nullable: false }),
            ],
            indexes: [{ id: 'idx1', name: 'idx_full_name', type: 'BTREE', columns: ['first_name', 'last_name'], isUnique: false }],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('KEY `idx_full_name` (`first_name`, `last_name`)'));
    });
});

suite('Table Designer - CREATE TABLE with Foreign Keys', () => {

    test('should generate foreign key constraint', () => {
        const data: TableDesignData = {
            tableName: 'orders',
            columns: [makeColumn({ name: 'user_id', type: 'INT', length: '11', isPrimaryKey: false, isAutoIncrement: false, nullable: false })],
            indexes: [],
            foreignKeys: [{
                id: 'fk1', name: 'fk_orders_user_id', columns: ['user_id'],
                referencedTable: 'users', referencedColumns: ['id'],
                onDelete: 'CASCADE', onUpdate: 'RESTRICT',
            }],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('CONSTRAINT `fk_orders_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)'));
        assert.ok(ddl.includes('ON DELETE CASCADE'));
        assert.ok(ddl.includes('ON UPDATE RESTRICT'));
    });

    test('should generate foreign key without ON DELETE/UPDATE when empty', () => {
        const data: TableDesignData = {
            tableName: 'orders',
            columns: [makeColumn({ name: 'user_id', type: 'INT', length: '11', isPrimaryKey: false, isAutoIncrement: false, nullable: false })],
            indexes: [],
            foreignKeys: [{
                id: 'fk1', name: 'fk_orders_user_id', columns: ['user_id'],
                referencedTable: 'users', referencedColumns: ['id'],
                onDelete: '', onUpdate: '',
            }],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)'));
        assert.ok(!ddl.includes('ON DELETE'));
        assert.ok(!ddl.includes('ON UPDATE'));
    });

    test('should generate foreign key with SET NULL action', () => {
        const data: TableDesignData = {
            tableName: 'orders',
            columns: [makeColumn({ name: 'user_id', type: 'INT', length: '11', isPrimaryKey: false, isAutoIncrement: false, nullable: true })],
            indexes: [],
            foreignKeys: [{
                id: 'fk1', name: 'fk_orders_user_id', columns: ['user_id'],
                referencedTable: 'users', referencedColumns: ['id'],
                onDelete: 'SET NULL', onUpdate: 'NO ACTION',
            }],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('ON DELETE SET NULL'));
        assert.ok(ddl.includes('ON UPDATE NO ACTION'));
    });
});

suite('Table Designer - ALTER TABLE DDL', () => {

    const originalStructure: TableStructure = {
        columns: [
            { name: 'id', type: 'INT', length: 11, nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
            { name: 'name', type: 'VARCHAR', length: 255, nullable: false, isPrimaryKey: false, isAutoIncrement: false, isUnique: false, comment: 'user name' },
        ],
        indexes: [
            { name: 'idx_name', type: 'BTREE', columns: ['name'], isUnique: false, isPrimary: false },
        ],
        foreignKeys: [],
        triggers: [],
        engine: 'InnoDB',
        charset: 'utf8mb4',
        comment: 'user table',
    };

    test('should generate ADD COLUMN for new column', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'name', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false, comment: 'user name', originalName: 'name' }),
                makeColumn({ name: 'email', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: true }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'user table' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('ADD COLUMN `email` VARCHAR(255)'));
        assert.ok(!ddl.includes('DROP COLUMN'));
        assert.ok(!ddl.includes('MODIFY COLUMN'));
    });

    test('should generate DROP COLUMN for removed column', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'user table' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('DROP COLUMN `name`'));
    });

    test('should generate MODIFY COLUMN for changed column type', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'name', type: 'TEXT', length: '', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'name' }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'user table' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('MODIFY COLUMN `name` TEXT'));
    });

    test('should generate MODIFY COLUMN for changed nullable', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'name', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: true, originalName: 'name', comment: 'user name' }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'user table' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('MODIFY COLUMN `name`'));
    });

    test('should generate CHANGE COLUMN for renamed column', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'full_name', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'name', comment: 'user name' }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'user table' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('CHANGE COLUMN `name` `full_name`'));
    });

    test('should not generate DDL when no changes detected', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'name', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'name', comment: 'user name' }),
            ],
            indexes: [{ id: 'idx1', name: 'idx_name', type: 'BTREE', columns: ['name'], isUnique: false }],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'user table' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.strictEqual(ddl, '');
    });

    test('should fall back to CREATE TABLE when no original structure', () => {
        const data = makeDesign();
        const ddl = generateAlterDDL(data, undefined);
        assert.ok(ddl.startsWith('CREATE TABLE'));
    });
});

suite('Table Designer - ALTER TABLE Indexes', () => {

    const originalStructure: TableStructure = {
        columns: [
            { name: 'id', type: 'INT', length: 11, nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
            { name: 'name', type: 'VARCHAR', length: 255, nullable: false, isPrimaryKey: false, isAutoIncrement: false, isUnique: false },
        ],
        indexes: [
            { name: 'idx_name', type: 'BTREE', columns: ['name'], isUnique: false, isPrimary: false },
        ],
        foreignKeys: [],
        triggers: [],
    };

    test('should generate ADD INDEX for new index', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'name', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'name' }),
            ],
            indexes: [
                { id: 'idx1', name: 'idx_name', type: 'BTREE', columns: ['name'], isUnique: false },
                { id: 'idx2', name: 'idx_id', type: 'BTREE', columns: ['id'], isUnique: false },
            ],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('ADD KEY `idx_id` (`id`)'));
    });

    test('should generate ADD UNIQUE KEY for new unique index', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'name', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'name' }),
            ],
            indexes: [
                { id: 'idx1', name: 'idx_name', type: 'BTREE', columns: ['name'], isUnique: false },
                { id: 'idx2', name: 'uk_name', type: 'BTREE', columns: ['name'], isUnique: true },
            ],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('ADD UNIQUE KEY `uk_name`'));
    });

    test('should generate DROP INDEX for removed index', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'name', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'name' }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('DROP INDEX `idx_name`'));
    });

    test('should not generate DROP INDEX for primary key', () => {
        const originalWithPk: TableStructure = {
            columns: [
                { name: 'id', type: 'INT', length: 11, nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
            ],
            indexes: [
                { name: 'PRIMARY', type: 'BTREE', columns: ['id'], isUnique: true, isPrimary: true },
            ],
            foreignKeys: [],
            triggers: [],
        };
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalWithPk);
        assert.ok(!ddl.includes('DROP INDEX `PRIMARY`'));
    });
});

suite('Table Designer - ALTER TABLE Foreign Keys', () => {

    const originalStructure: TableStructure = {
        columns: [
            { name: 'id', type: 'INT', length: 11, nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
            { name: 'user_id', type: 'INT', length: 11, nullable: false, isPrimaryKey: false, isAutoIncrement: false, isUnique: false },
        ],
        indexes: [],
        foreignKeys: [
            { name: 'fk_user_id', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' },
        ],
        triggers: [],
    };

    test('should generate ADD CONSTRAINT for new foreign key', () => {
        const data: TableDesignData = {
            tableName: 'orders',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'user_id', type: 'INT', length: '11', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'user_id' }),
            ],
            indexes: [],
            foreignKeys: [
                { id: 'fk1', name: 'fk_user_id', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' },
                { id: 'fk2', name: 'fk_product_id', columns: ['product_id'], referencedTable: 'products', referencedColumns: ['id'], onDelete: 'SET NULL', onUpdate: 'CASCADE' },
            ],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('ADD CONSTRAINT `fk_product_id` FOREIGN KEY'));
        assert.ok(ddl.includes('ON DELETE SET NULL'));
        assert.ok(ddl.includes('ON UPDATE CASCADE'));
    });

    test('should generate DROP FOREIGN KEY for removed foreign key', () => {
        const data: TableDesignData = {
            tableName: 'orders',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'user_id', type: 'INT', length: '11', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'user_id' }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('DROP FOREIGN KEY `fk_user_id`'));
    });
});

suite('Table Designer - ALTER TABLE Triggers', () => {

    const originalStructure: TableStructure = {
        columns: [
            { name: 'id', type: 'INT', length: 11, nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
        ],
        indexes: [],
        foreignKeys: [],
        triggers: [
            { name: 'trg_before_insert', timing: 'BEFORE', event: 'INSERT', statement: 'SET NEW.created_at = NOW()' },
        ],
    };

    test('should generate CREATE TRIGGER for new trigger', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' })],
            indexes: [],
            foreignKeys: [],
            triggers: [
                { id: 'trg1', name: 'trg_before_insert', timing: 'BEFORE', event: 'INSERT', statement: 'SET NEW.created_at = NOW()' },
                { id: 'trg2', name: 'trg_after_update', timing: 'AFTER', event: 'UPDATE', statement: 'INSERT INTO audit_log VALUES (NEW.id)' },
            ],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('CREATE TRIGGER `trg_after_update` AFTER UPDATE ON `users`'));
    });

    test('should generate DROP TRIGGER for removed trigger', () => {
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('DROP TRIGGER `trg_before_insert`'));
    });
});

suite('Table Designer - ALTER TABLE Options', () => {

    test('should generate ALTER TABLE for changed comment', () => {
        const originalStructure: TableStructure = {
            columns: [
                { name: 'id', type: 'INT', length: 11, nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            comment: 'old comment',
        };
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'new comment' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('ALTER TABLE `users`'));
        assert.ok(ddl.includes("COMMENT='new comment'"));
    });

    test('should not generate ALTER TABLE when comment unchanged', () => {
        const originalStructure: TableStructure = {
            columns: [
                { name: 'id', type: 'INT', length: 11, nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            comment: 'same comment',
        };
        const data: TableDesignData = {
            tableName: 'users',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'same comment' },
            mode: 'edit',
        };
        const ddl = generateAlterDDL(data, originalStructure);
        assert.strictEqual(ddl, '');
    });
});

suite('Table Designer - Complex Scenarios', () => {

    test('should generate complete CREATE TABLE with all features', () => {
        const data: TableDesignData = {
            tableName: 'orders',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false }),
                makeColumn({ name: 'user_id', type: 'INT', length: '11', isPrimaryKey: false, isAutoIncrement: false, nullable: false, comment: 'FK to users' }),
                makeColumn({ name: 'total', type: 'DECIMAL', length: '10,2', isPrimaryKey: false, isAutoIncrement: false, nullable: false, defaultValue: '0' }),
                makeColumn({ name: 'status', type: 'VARCHAR', length: '50', isPrimaryKey: false, isAutoIncrement: false, nullable: false, defaultValue: 'pending' }),
                makeColumn({ name: 'created_at', type: 'TIMESTAMP', length: '', isPrimaryKey: false, isAutoIncrement: false, nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }),
            ],
            indexes: [
                { id: 'idx1', name: 'idx_user_id', type: 'BTREE', columns: ['user_id'], isUnique: false },
                { id: 'idx2', name: 'uk_user_status', type: 'BTREE', columns: ['user_id', 'status'], isUnique: true },
            ],
            foreignKeys: [
                { id: 'fk1', name: 'fk_orders_users', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' },
            ],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci', autoIncrement: '1000', comment: 'order table' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);

        assert.ok(ddl.startsWith('CREATE TABLE `orders`'));
        assert.ok(ddl.includes('`id` INT(11) NOT NULL AUTO_INCREMENT'));
        assert.ok(ddl.includes('`user_id` INT(11) NOT NULL'));
        assert.ok(ddl.includes("COMMENT 'FK to users'"));
        assert.ok(ddl.includes('`total` DECIMAL(10,2) NOT NULL'));
        assert.ok(ddl.includes("DEFAULT '0'"));
        assert.ok(ddl.includes("DEFAULT 'pending'"));
        assert.ok(ddl.includes('DEFAULT CURRENT_TIMESTAMP'));
        assert.ok(ddl.includes('PRIMARY KEY (`id`)'));
        assert.ok(ddl.includes('KEY `idx_user_id` (`user_id`)'));
        assert.ok(ddl.includes('UNIQUE KEY `uk_user_status` (`user_id`, `status`)'));
        assert.ok(ddl.includes('CONSTRAINT `fk_orders_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)'));
        assert.ok(ddl.includes('ON DELETE CASCADE'));
        assert.ok(ddl.includes('ENGINE=InnoDB'));
        assert.ok(ddl.includes('DEFAULT CHARSET=utf8mb4'));
        assert.ok(ddl.includes('COLLATE=utf8mb4_unicode_ci'));
        assert.ok(ddl.includes('AUTO_INCREMENT=1000'));
        assert.ok(ddl.includes("COMMENT='order table'"));
        assert.ok(ddl.endsWith(';'));
    });

    test('should generate multiple ALTER TABLE statements for mixed changes', () => {
        const originalStructure: TableStructure = {
            columns: [
                { name: 'id', type: 'INT', length: 11, nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
                { name: 'name', type: 'VARCHAR', length: 100, nullable: false, isPrimaryKey: false, isAutoIncrement: false, isUnique: false },
            ],
            indexes: [
                { name: 'idx_name', type: 'BTREE', columns: ['name'], isUnique: false, isPrimary: false },
            ],
            foreignKeys: [],
            triggers: [],
            comment: 'old comment',
        };

        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'BIGINT', length: '20', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'email', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false }),
            ],
            indexes: [
                { id: 'idx1', name: 'idx_email', type: 'BTREE', columns: ['email'], isUnique: true },
            ],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: 'new comment' },
            mode: 'edit',
        };

        const ddl = generateAlterDDL(data, originalStructure);

        assert.ok(ddl.includes('MODIFY COLUMN `id` BIGINT(20)'));
        assert.ok(ddl.includes('ADD COLUMN `email` VARCHAR(255)'));
        assert.ok(ddl.includes('DROP COLUMN `name`'));
        assert.ok(ddl.includes('DROP INDEX `idx_name`'));
        assert.ok(ddl.includes('ADD UNIQUE KEY `idx_email`'));
        assert.ok(ddl.includes("COMMENT='new comment'"));
    });

    test('should handle column with all attributes in ALTER ADD COLUMN', () => {
        const originalStructure: TableStructure = {
            columns: [
                { name: 'id', type: 'INT', length: 11, nullable: false, isPrimaryKey: true, isAutoIncrement: true, isUnique: false },
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
        };

        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false, originalName: 'id' }),
                makeColumn({ name: 'created_at', type: 'TIMESTAMP', length: '', isPrimaryKey: false, isAutoIncrement: false, nullable: false, defaultValue: 'CURRENT_TIMESTAMP', comment: 'creation time' }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };

        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'));
        assert.ok(ddl.includes("COMMENT 'creation time'"));
    });
});

suite('Table Designer - Data Type Handling', () => {

    test('should generate DECIMAL with precision and scale', () => {
        const data: TableDesignData = {
            tableName: 'products',
            columns: [makeColumn({ name: 'price', type: 'DECIMAL', length: '10,2', isPrimaryKey: false, isAutoIncrement: false, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('`price` DECIMAL(10,2)'));
    });

    test('should generate INT without length when not specified', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'count', type: 'INT', length: '', isPrimaryKey: false, isAutoIncrement: false, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('`count` INT NOT NULL'));
        assert.ok(!ddl.includes('`count` INT('));
    });

    test('should generate DATETIME type', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'created', type: 'DATETIME', length: '', isPrimaryKey: false, isAutoIncrement: false, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('`created` DATETIME NOT NULL'));
    });

    test('should generate BLOB type', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'data', type: 'BLOB', length: '', isPrimaryKey: false, isAutoIncrement: false, nullable: true })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('`data` BLOB'));
    });

    test('should generate JSON type', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'metadata', type: 'JSON', length: '', isPrimaryKey: false, isAutoIncrement: false, nullable: true })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('`metadata` JSON'));
    });
});

suite('Table Designer - Edge Cases', () => {

    test('should handle table name with special characters (backtick escaping)', () => {
        const data: TableDesignData = {
            tableName: 'my-table',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('CREATE TABLE `my-table`'));
    });

    test('should handle column name with special characters', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'column-name', type: 'INT', length: '11', isPrimaryKey: false, isAutoIncrement: false, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('`column-name`'));
    });

    test('should handle empty options gracefully', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: '', charset: '', collation: '', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.startsWith('CREATE TABLE `test`'));
        assert.ok(ddl.endsWith(';'));
        assert.ok(!ddl.includes('ENGINE='));
        assert.ok(!ddl.includes('DEFAULT CHARSET='));
    });

    test('should handle default value CURRENT_DATE', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'date', type: 'DATE', length: '', isPrimaryKey: false, isAutoIncrement: false, nullable: false, defaultValue: 'CURRENT_DATE' })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('DEFAULT CURRENT_DATE'));
        assert.ok(!ddl.includes("DEFAULT 'CURRENT_DATE'"));
    });

    test('should handle numeric default value as string', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'count', type: 'INT', length: '11', isPrimaryKey: false, isAutoIncrement: false, nullable: false, defaultValue: '0' })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes("DEFAULT '0'"));
    });

    test('should handle MyISAM engine', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'MyISAM', charset: 'latin1', collation: 'latin1_swedish_ci', autoIncrement: '', comment: '' },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes('ENGINE=MyISAM'));
        assert.ok(ddl.includes('DEFAULT CHARSET=latin1'));
        assert.ok(ddl.includes('COLLATE=latin1_swedish_ci'));
    });

    test('should handle table comment with single quote', () => {
        const data: TableDesignData = {
            tableName: 'test',
            columns: [makeColumn({ name: 'id', type: 'INT', length: '11', isPrimaryKey: true, isAutoIncrement: true, nullable: false })],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: "user's data" },
            mode: 'create',
        };
        const ddl = generateCreateDDL(data);
        assert.ok(ddl.includes("COMMENT='user\\'s data'"));
    });
});

suite('Table Designer - ALTER TABLE Column Rename Detection', () => {

    test('should detect column rename via originalName', () => {
        const originalStructure: TableStructure = {
            columns: [
                { name: 'old_name', type: 'VARCHAR', length: 255, nullable: false, isPrimaryKey: false, isAutoIncrement: false, isUnique: false },
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
        };

        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'new_name', type: 'VARCHAR', length: '255', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'old_name' }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };

        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(ddl.includes('CHANGE COLUMN `old_name` `new_name`'));
        assert.ok(!ddl.includes('DROP COLUMN `old_name`'));
    });

    test('should not generate DROP COLUMN for renamed column', () => {
        const originalStructure: TableStructure = {
            columns: [
                { name: 'fname', type: 'VARCHAR', length: 100, nullable: false, isPrimaryKey: false, isAutoIncrement: false, isUnique: false },
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
        };

        const data: TableDesignData = {
            tableName: 'users',
            columns: [
                makeColumn({ name: 'first_name', type: 'VARCHAR', length: '100', isPrimaryKey: false, isAutoIncrement: false, nullable: false, originalName: 'fname' }),
            ],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: { engine: 'InnoDB', charset: 'utf8mb4', collation: 'utf8mb4_general_ci', autoIncrement: '', comment: '' },
            mode: 'edit',
        };

        const ddl = generateAlterDDL(data, originalStructure);
        assert.ok(!ddl.includes('DROP COLUMN `fname`'));
        assert.ok(ddl.includes('CHANGE COLUMN `fname` `first_name`'));
    });
});
