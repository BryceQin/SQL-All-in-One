import * as vscode from 'vscode';
import { BaseWebviewPanel, type WebviewPanelConfig } from '../BaseWebviewPanel';
import { getConnectionManager } from '../../database/connection/ConnectionManager';
import { getSchemaCache } from '../../database/schema/SchemaCache';
import type { IDatabaseAdapter, TableStructure, DataTypeCategory } from '../../database/adapters/IDatabaseAdapter';
import { getLanguage } from '../../i18n/index.js';

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
    originalStructure?: TableStructure;
}

interface DesignerMessage {
    command: string;
    data?: TableDesignData;
    table?: string;
    sql?: string;
}

export class TableDesignerPanel extends BaseWebviewPanel {
    public static readonly viewType = 'sqlAllInOneTableDesigner';

    protected readonly panelConfig: WebviewPanelConfig = {
        viewType: TableDesignerPanel.viewType,
        htmlFileName: 'table-designer.html',
        cssFileName: 'table-designer.css',
        jsFileName: 'table-designer.js',
    };

    private _mode: 'create' | 'edit' = 'create';
    private _database = '';
    private _tableName = '';
    private _originalStructure?: TableStructure;

    public static createOrShow(extensionUri: vscode.Uri, _context: vscode.ExtensionContext): TableDesignerPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const existing = BaseWebviewPanel.getExistingInstance<TableDesignerPanel>(TableDesignerPanel.viewType);
        if (existing) {
            BaseWebviewPanel.revealExisting(TableDesignerPanel.viewType, column || vscode.ViewColumn.Two);
            return existing;
        }

        const panel = BaseWebviewPanel.createWebviewPanel(
            TableDesignerPanel.viewType,
            'Table Designer',
            extensionUri,
            { viewColumn: column ? column + 1 : vscode.ViewColumn.Two }
        );

        const instance = new TableDesignerPanel(panel, extensionUri);
        BaseWebviewPanel.registerInstance(instance);
        return instance;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        super(panel, extensionUri);
        this._initialize();
    }

    private async _initialize(): Promise<void> {
        const configData = {
            mode: this._mode,
            database: this._database,
            tableName: this._tableName,
            lang: getLanguage(),
        };
        const configScript = '<script>window.__TABLE_DESIGNER_CONFIG__ = ' + JSON.stringify(configData) + ';</script>';
        await this.initializeHtml([
            { placeholder: '{{CONFIG_INJECT}}', value: configScript },
        ]);
        this.onDidReceiveMessage(async (message: unknown) => {
            const msg = message as DesignerMessage;
            switch (msg.command) {
                case 'save':
                    if (msg.data) {
                        await this._handleSave(msg.data);
                    }
                    break;
                case 'requestTableList':
                    await this._handleRequestTableList();
                    break;
                case 'requestColumnList':
                    await this._handleRequestColumnList(msg.table ?? '');
                    break;
                case 'exportSql':
                    if (msg.sql) {
                        await this._handleExportSql(msg.sql);
                    }
                    break;
                case 'close':
                    this.dispose();
                    break;
            }
        });
    }

    public async openForCreate(database: string): Promise<void> {
        this._mode = 'create';
        this._database = database;
        this._tableName = '';
        this._originalStructure = undefined;
        this._panel.title = '\u{1F4CB} New Table - Table Designer';

        const adapter = this._getAdapter();
        let dataTypes: DataTypeCategory[] = [];
        if (adapter) {
            try {
                dataTypes = adapter.getSupportedDataTypes();
            } catch {
                dataTypes = [];
            }
        }

        const emptyData: TableDesignData = {
            tableName: '',
            columns: [this._createDefaultColumn()],
            indexes: [],
            foreignKeys: [],
            triggers: [],
            options: {
                engine: 'InnoDB',
                charset: 'utf8mb4',
                collation: 'utf8mb4_general_ci',
                autoIncrement: '',
                comment: '',
            },
            mode: 'create',
        };

        this.postMessage({
            command: 'tableStructure',
            data: emptyData,
            dataTypes: dataTypes,
        });
    }

    public async openForEdit(database: string, table: string): Promise<void> {
        this._mode = 'edit';
        this._database = database;
        this._tableName = table;
        this._panel.title = `\u{1F4CB} ${table} - Table Designer`;

        const adapter = this._getAdapter();
        if (!adapter) {
            vscode.window.showErrorMessage('No active database connection');
            return;
        }

        let dataTypes: DataTypeCategory[] = [];
        try {
            dataTypes = adapter.getSupportedDataTypes();
        } catch {
            dataTypes = [];
        }

        let structure: TableStructure;
        try {
            structure = await adapter.describeTable(database, table);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load table structure: ${(error as Error).message}`);
            return;
        }

        this._originalStructure = structure;

        const columns: ColumnDesign[] = structure.columns.map((col, idx) => ({
            id: `col_${idx}_${Date.now()}`,
            name: col.name,
            type: col.type,
            length: col.length !== undefined ? String(col.length) : '',
            nullable: col.nullable,
            defaultValue: col.defaultValue !== undefined ? String(col.defaultValue) : '',
            comment: col.comment || '',
            isPrimaryKey: col.isPrimaryKey,
            isAutoIncrement: col.isAutoIncrement,
            isUnique: col.isUnique,
            originalName: col.name,
        }));

        const indexes: IndexDesign[] = structure.indexes.map((idx, i) => ({
            id: `idx_${i}_${Date.now()}`,
            name: idx.name,
            type: idx.type,
            columns: [...idx.columns],
            isUnique: idx.isUnique,
        }));

        const foreignKeys: FkDesign[] = structure.foreignKeys.map((fk, i) => ({
            id: `fk_${i}_${Date.now()}`,
            name: fk.name,
            columns: [...fk.columns],
            referencedTable: fk.referencedTable,
            referencedColumns: [...fk.referencedColumns],
            onDelete: fk.onDelete,
            onUpdate: fk.onUpdate,
        }));

        const triggers: TriggerDesign[] = structure.triggers.map((trg, i) => ({
            id: `trg_${i}_${Date.now()}`,
            name: trg.name,
            timing: trg.timing,
            event: trg.event,
            statement: trg.statement,
        }));

        const designData: TableDesignData = {
            tableName: table,
            columns,
            indexes,
            foreignKeys,
            triggers,
            options: {
                engine: structure.engine || 'InnoDB',
                charset: structure.charset || 'utf8mb4',
                collation: '',
                autoIncrement: '',
                comment: structure.comment || '',
            },
            mode: 'edit',
            originalStructure: structure,
        };

        this.postMessage({
            command: 'tableStructure',
            data: designData,
            dataTypes: dataTypes,
        });
    }

    public override dispose(): void {
        this._originalStructure = undefined;
        super.dispose();
    }

    private _getAdapter(): IDatabaseAdapter | undefined {
        const connectionManager = getConnectionManager();
        const activeConn = connectionManager.getActiveConnection();
        if (!activeConn) {
            return undefined;
        }
        return connectionManager.getAdapter(activeConn.id);
    }

    private _createDefaultColumn(): ColumnDesign {
        return {
            id: `col_0_${Date.now()}`,
            name: '',
            type: 'INT',
            length: '',
            nullable: false,
            defaultValue: '',
            comment: '',
            isPrimaryKey: false,
            isAutoIncrement: false,
            isUnique: false,
        };
    }

    private _validateDesign(data: TableDesignData): string | null {
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

    private async _handleSave(data: TableDesignData): Promise<void> {
        const validationError = this._validateDesign(data);
        if (validationError) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: validationError,
            });
            return;
        }

        const adapter = this._getAdapter();
        if (!adapter) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: 'No active database connection',
            });
            return;
        }

        let sql: string;
        try {
            if (this._mode === 'create') {
                sql = this._generateCreateDDL(data);
            } else {
                sql = this._generateAlterDDL(data);
            }
        } catch (error) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: `Failed to generate DDL: ${(error as Error).message}`,
            });
            return;
        }

        if (!sql || sql.trim() === '') {
            vscode.window.showInformationMessage('No changes detected');
            return;
        }

        const confirmed = await vscode.window.showWarningMessage(
            'Execute the following SQL?',
            { modal: true, detail: sql },
            'Execute'
        );

        if (confirmed !== 'Execute') {
            return;
        }

        try {
            const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
            for (const stmt of statements) {
                await adapter.execute(stmt);
            }

            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (activeConn) {
                getSchemaCache().invalidate(activeConn.id, 'table', this._database);
            }

            this.dispose();
            vscode.window.showInformationMessage(
                this._mode === 'create'
                    ? `Table \`${data.tableName}\` created successfully`
                    : `Table \`${data.tableName}\` updated successfully`
            );
        } catch (error) {
            this.postMessage({
                command: 'saveResult',
                success: false,
                error: (error as Error).message,
            });
        }
    }

    private async _handleRequestTableList(): Promise<void> {
        const adapter = this._getAdapter();
        if (!adapter) {
            this.postMessage({
                command: 'tableList',
                tables: [],
            });
            return;
        }

        try {
            const tables = await adapter.listTables(this._database);
            this.postMessage({
                command: 'tableList',
                tables: tables.map(t => t.name),
            });
        } catch {
            this.postMessage({
                command: 'tableList',
                tables: [],
            });
        }
    }

    private async _handleRequestColumnList(table: string): Promise<void> {
        const adapter = this._getAdapter();
        if (!adapter) {
            this.postMessage({
                command: 'columnList',
                table: table,
                columns: [],
            });
            return;
        }

        try {
            const structure = await adapter.describeTable(this._database, table);
            this.postMessage({
                command: 'columnList',
                table: table,
                columns: structure.columns.map(c => c.name),
            });
        } catch {
            this.postMessage({
                command: 'columnList',
                table: table,
                columns: [],
            });
        }
    }

    private async _handleExportSql(sql: string): Promise<void> {
        if (!sql) return;
        const document = await vscode.workspace.openTextDocument({
            content: sql,
            language: 'sql',
        });
        await vscode.window.showTextDocument(document);
    }

    private _generateCreateDDL(data: TableDesignData): string {
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

    private _generateAlterDDL(data: TableDesignData): string {
        const statements: string[] = [];
        const original = this._originalStructure;

        if (!original) {
            return this._generateCreateDDL(data);
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
}
