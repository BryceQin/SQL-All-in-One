import * as assert from 'assert';

suite('Data Editor - SQL Generation', () => {

    function formatSqlVal(val: any): string {
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'boolean') return String(val);
        return "'" + String(val).replace(/'/g, "''") + "'";
    }

    function generateUpdateSql(tableName: string, primaryKey: Record<string, any>, changes: Record<string, { old: any; new: any }>): string {
        const setClauses = Object.entries(changes)
            .map(([k, v]) => '`' + k + '` = ' + formatSqlVal(v.new))
            .join(', ');
        const where = Object.entries(primaryKey)
            .map(([k, v]) => '`' + k + '` = ' + formatSqlVal(v))
            .join(' AND ');
        return 'UPDATE `' + tableName + '` SET ' + setClauses + ' WHERE ' + where;
    }

    function generateDeleteSql(tableName: string, primaryKey: Record<string, any>): string {
        const where = Object.entries(primaryKey)
            .map(([k, v]) => '`' + k + '` = ' + formatSqlVal(v))
            .join(' AND ');
        return 'DELETE FROM `' + tableName + '` WHERE ' + where;
    }

    function generateInsertSql(tableName: string, colNames: string[], values: any[]): string {
        const cols = colNames.map(c => '`' + c + '`').join(', ');
        const vals = values.map(v => formatSqlVal(v)).join(', ');
        return 'INSERT INTO `' + tableName + '` (' + cols + ') VALUES (' + vals + ')';
    }

    test('should generate UPDATE SQL with single column change', () => {
        const sql = generateUpdateSql('users', { id: 1 }, { name: { old: 'Alice', new: 'Bob' } });
        assert.strictEqual(sql, "UPDATE `users` SET `name` = 'Bob' WHERE `id` = 1");
    });

    test('should generate UPDATE SQL with multiple column changes', () => {
        const sql = generateUpdateSql('users', { id: 2 }, {
            name: { old: 'Alice', new: 'Bob' },
            age: { old: 25, new: 30 },
        });
        assert.ok(sql.includes("`name` = 'Bob'"));
        assert.ok(sql.includes("`age` = 30"));
        assert.ok(sql.includes("WHERE `id` = 2"));
    });

    test('should generate UPDATE SQL with NULL value', () => {
        const sql = generateUpdateSql('users', { id: 1 }, { email: { old: 'a@b.com', new: null } });
        assert.ok(sql.includes("`email` = NULL"));
    });

    test('should generate UPDATE SQL with string containing single quote', () => {
        const sql = generateUpdateSql('users', { id: 1 }, { name: { old: 'Bob', new: "O'Brien" } });
        assert.ok(sql.includes("'O''Brien'"));
    });

    test('should generate DELETE SQL with primary key', () => {
        const sql = generateDeleteSql('users', { id: 5 });
        assert.strictEqual(sql, "DELETE FROM `users` WHERE `id` = 5");
    });

    test('should generate DELETE SQL with composite primary key', () => {
        const sql = generateDeleteSql('order_items', { order_id: 1, item_id: 3 });
        assert.ok(sql.includes("`order_id` = 1"));
        assert.ok(sql.includes("`item_id` = 3"));
    });

    test('should generate INSERT SQL', () => {
        const sql = generateInsertSql('users', ['id', 'name', 'age'], [1, 'Alice', 30]);
        assert.strictEqual(sql, "INSERT INTO `users` (`id`, `name`, `age`) VALUES (1, 'Alice', 30)");
    });

    test('should generate INSERT SQL with NULL values', () => {
        const sql = generateInsertSql('users', ['id', 'name'], [1, null]);
        assert.strictEqual(sql, "INSERT INTO `users` (`id`, `name`) VALUES (1, NULL)");
    });

    test('should sort changes in DELETE -> UPDATE -> INSERT order', () => {
        const changes = [
            { type: 'insert' as const, rowIndex: 2 },
            { type: 'update' as const, rowIndex: 0 },
            { type: 'delete' as const, rowIndex: 1 },
        ];
        const sorted = [...changes].sort((a, b) => {
            const order: Record<string, number> = { delete: 0, update: 1, insert: 2 };
            return order[a.type] - order[b.type];
        });
        assert.strictEqual(sorted[0].type, 'delete');
        assert.strictEqual(sorted[1].type, 'update');
        assert.strictEqual(sorted[2].type, 'insert');
    });
});

suite('Data Editor - formatSqlVal', () => {

    function formatSqlVal(val: any): string {
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'boolean') return String(val);
        return "'" + String(val).replace(/'/g, "''") + "'";
    }

    test('should format null as NULL', () => {
        assert.strictEqual(formatSqlVal(null), 'NULL');
    });

    test('should format undefined as NULL', () => {
        assert.strictEqual(formatSqlVal(undefined), 'NULL');
    });

    test('should format number without quotes', () => {
        assert.strictEqual(formatSqlVal(42), '42');
        assert.strictEqual(formatSqlVal(0), '0');
        assert.strictEqual(formatSqlVal(-5), '-5');
        assert.strictEqual(formatSqlVal(3.14), '3.14');
    });

    test('should format boolean as string', () => {
        assert.strictEqual(formatSqlVal(true), 'true');
        assert.strictEqual(formatSqlVal(false), 'false');
    });

    test('should format string with single quotes', () => {
        assert.strictEqual(formatSqlVal('hello'), "'hello'");
    });

    test('should escape single quotes in string', () => {
        assert.strictEqual(formatSqlVal("it's"), "'it''s'");
    });

    test('should format empty string', () => {
        assert.strictEqual(formatSqlVal(''), "''");
    });
});

suite('Data Editor - Validation', () => {

    function validateCell(col: { nullable: boolean; type: string; isEnum: boolean; enumValues?: string[] }, value: any): string | null {
        if (value === null || value === undefined || value === '') {
            if (!col.nullable) return 'NOT NULL violation';
            return null;
        }

        const colType = (col.type || '').toUpperCase();
        if (colType.match(/INT|BIGINT|SMALLINT|TINYINT/i)) {
            if (!Number.isInteger(Number(value))) return 'Type mismatch: expected integer';
        } else if (colType.match(/FLOAT|DOUBLE|DECIMAL|NUMERIC/i)) {
            if (isNaN(Number(value))) return 'Type mismatch: expected number';
        }

        const lengthMatch = colType.match(/\((\d+)\)/);
        if (lengthMatch && typeof value === 'string') {
            const maxLen = parseInt(lengthMatch[1]);
            if (value.length > maxLen) return 'Length exceeded: max ' + maxLen;
        }

        if (col.isEnum && col.enumValues && !col.enumValues.includes(value)) {
            return 'Invalid enum value';
        }

        return null;
    }

    test('should reject null for NOT NULL column', () => {
        const col = { nullable: false, type: 'INT', isEnum: false };
        assert.strictEqual(validateCell(col, null), 'NOT NULL violation');
    });

    test('should allow null for nullable column', () => {
        const col = { nullable: true, type: 'INT', isEnum: false };
        assert.strictEqual(validateCell(col, null), null);
    });

    test('should reject non-integer for INT column', () => {
        const col = { nullable: false, type: 'INT', isEnum: false };
        assert.strictEqual(validateCell(col, 'abc'), 'Type mismatch: expected integer');
    });

    test('should accept integer for INT column', () => {
        const col = { nullable: false, type: 'INT', isEnum: false };
        assert.strictEqual(validateCell(col, 42), null);
    });

    test('should reject non-number for FLOAT column', () => {
        const col = { nullable: false, type: 'FLOAT', isEnum: false };
        assert.strictEqual(validateCell(col, 'abc'), 'Type mismatch: expected number');
    });

    test('should accept number for FLOAT column', () => {
        const col = { nullable: false, type: 'FLOAT', isEnum: false };
        assert.strictEqual(validateCell(col, 3.14), null);
    });

    test('should reject string exceeding VARCHAR length', () => {
        const col = { nullable: false, type: 'VARCHAR(5)', isEnum: false };
        assert.strictEqual(validateCell(col, 'abcdef'), 'Length exceeded: max 5');
    });

    test('should accept string within VARCHAR length', () => {
        const col = { nullable: false, type: 'VARCHAR(10)', isEnum: false };
        assert.strictEqual(validateCell(col, 'abc'), null);
    });

    test('should reject invalid enum value', () => {
        const col = { nullable: false, type: 'ENUM', isEnum: true, enumValues: ['active', 'inactive'] };
        assert.strictEqual(validateCell(col, 'pending'), 'Invalid enum value');
    });

    test('should accept valid enum value', () => {
        const col = { nullable: false, type: 'ENUM', isEnum: true, enumValues: ['active', 'inactive'] };
        assert.strictEqual(validateCell(col, 'active'), null);
    });
});

suite('Data Editor - BLOB Detection', () => {

    function isBlobType(type: string): boolean {
        return !!type && (type.includes('BLOB') || type.includes('BINARY') || type.includes('VARBINARY'));
    }

    test('should detect BLOB type', () => {
        assert.strictEqual(isBlobType('BLOB'), true);
        assert.strictEqual(isBlobType('LONGBLOB'), true);
        assert.strictEqual(isBlobType('TINYBLOB'), true);
        assert.strictEqual(isBlobType('MEDIUMBLOB'), true);
    });

    test('should detect BINARY type', () => {
        assert.strictEqual(isBlobType('BINARY'), true);
        assert.strictEqual(isBlobType('VARBINARY'), true);
        assert.strictEqual(isBlobType('VARBINARY(255)'), true);
    });

    test('should not detect non-BLOB type', () => {
        assert.strictEqual(isBlobType('VARCHAR'), false);
        assert.strictEqual(isBlobType('INT'), false);
        assert.strictEqual(isBlobType('TEXT'), false);
        assert.strictEqual(isBlobType(''), false);
    });
});

suite('Data Editor - Image Detection', () => {

    function detectImageBuffer(buf: Buffer): boolean {
        if (buf.length < 4) return false;
        const header = buf.subarray(0, 4);
        if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return true;
        if (header[0] === 0xFF && header[1] === 0xD8) return true;
        if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return true;
        return false;
    }

    test('should detect PNG magic bytes', () => {
        const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        assert.strictEqual(detectImageBuffer(buf), true);
    });

    test('should detect JPEG magic bytes', () => {
        const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
        assert.strictEqual(detectImageBuffer(buf), true);
    });

    test('should detect GIF magic bytes', () => {
        const buf = Buffer.from([0x47, 0x49, 0x46, 0x38]);
        assert.strictEqual(detectImageBuffer(buf), true);
    });

    test('should not detect non-image buffer', () => {
        const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
        assert.strictEqual(detectImageBuffer(buf), false);
    });

    test('should not detect image from short buffer', () => {
        const buf = Buffer.from([0x89, 0x50]);
        assert.strictEqual(detectImageBuffer(buf), false);
    });
});

suite('Data Editor - PendingChange Tracking', () => {

    test('should track update change', () => {
        const change = {
            type: 'update' as const,
            table: 'users',
            primaryKey: { id: 1 },
            changes: { name: { old: 'Alice', new: 'Bob' } },
            originalRow: { 0: 1, 1: 'Alice' },
            rowIndex: 0,
        };
        assert.strictEqual(change.type, 'update');
        assert.strictEqual(change.table, 'users');
        assert.deepStrictEqual(change.primaryKey, { id: 1 });
        assert.strictEqual((change.changes as Record<string, { old: string; new: string }>)['name'].old, 'Alice');
        assert.strictEqual((change.changes as Record<string, { old: string; new: string }>)['name'].new, 'Bob');
    });

    test('should track insert change', () => {
        const change = {
            type: 'insert' as const,
            table: 'users',
            primaryKey: { id: null },
            rowIndex: 5,
        };
        assert.strictEqual(change.type, 'insert');
        assert.strictEqual(change.rowIndex, 5);
    });

    test('should track delete change', () => {
        const change = {
            type: 'delete' as const,
            table: 'users',
            primaryKey: { id: 3 },
            originalRow: { 0: 3, 1: 'Charlie' },
            rowIndex: 2,
        };
        assert.strictEqual(change.type, 'delete');
        assert.deepStrictEqual(change.primaryKey, { id: 3 });
    });

    test('should count pending changes by type', () => {
        const pendingChanges = [
            { type: 'update' as const, rowIndex: 0 },
            { type: 'insert' as const, rowIndex: 1 },
            { type: 'delete' as const, rowIndex: 2 },
            { type: 'update' as const, rowIndex: 3 },
        ];
        const updateCount = pendingChanges.filter(c => c.type === 'update').length;
        const insertCount = pendingChanges.filter(c => c.type === 'insert').length;
        const deleteCount = pendingChanges.filter(c => c.type === 'delete').length;
        assert.strictEqual(updateCount, 2);
        assert.strictEqual(insertCount, 1);
        assert.strictEqual(deleteCount, 1);
    });
});
