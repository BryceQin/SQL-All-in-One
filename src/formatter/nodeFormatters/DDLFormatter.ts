import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import Layout, { WS } from '../Layout';
import { formatKeyword } from './CommonFormatter';
import { ExpressionFormatter } from './ExpressionFormatter';
import { SelectFormatter } from './SelectFormatter';
import { CommonLayoutHelper } from './CommonLayoutHelper';

export class DDLFormatter {
    private cfg: FormatOptions;
    private indent: Indentation;
    private layout: Layout;
    private exprFmt: ExpressionFormatter;
    private helper: CommonLayoutHelper;

    constructor(cfg: FormatOptions, indent: Indentation) {
        this.cfg = cfg;
        this.indent = indent;
        this.layout = new Layout(indent);
        this.exprFmt = new ExpressionFormatter(cfg, indent, (expr) => {
            const selectFmt = new SelectFormatter(this.cfg, this.indent);
            return selectFmt.format(expr);
        });
        this.helper = new CommonLayoutHelper(cfg, indent, this.layout);
    }

    public format(stmt: any): string {
        switch (stmt.type) {
            case 'create':
                return this.formatCreate(stmt);
            case 'alter':
                return this.formatAlter(stmt);
            case 'drop':
                return this.formatDrop(stmt);
            default:
                return this.formatUnknown(stmt);
        }
    }

    private formatCreate(stmt: any): string {
        this.layout.add(formatKeyword('CREATE', this.cfg.keywordCase));

        if (stmt.temporary) {
            this.layout.add(WS.SPACE, formatKeyword('TEMPORARY', this.cfg.keywordCase));
        }

        const keyword = stmt.keyword ? stmt.keyword.toUpperCase() : 'TABLE';
        this.layout.add(WS.SPACE, formatKeyword(keyword, this.cfg.keywordCase));

        if (stmt.if_not_exists) {
            this.layout.add(WS.SPACE, formatKeyword('IF NOT EXISTS', this.cfg.keywordCase));
        }

        this.formatCreateTarget(stmt);

        if (stmt.like) {
            this.layout.add(WS.SPACE, formatKeyword('LIKE', this.cfg.keywordCase), WS.SPACE);
            this.layout.add(stmt.like.table);
            return this.layout.toString().trimEnd();
        }

        if (stmt.create_definitions && stmt.create_definitions.length > 0) {
            this.formatCreateDefinitions(stmt.create_definitions);
        }

        if (stmt.table_options && stmt.table_options.length > 0) {
            this.formatTableOptions(stmt.table_options);
        }

        if (stmt.query_expr) {
            this.layout.add(WS.SPACE, formatKeyword('AS', this.cfg.keywordCase));
            this.layout.add(WS.NEWLINE, WS.INDENT);
            const selectFmt = new SelectFormatter(this.cfg, this.indent);
            this.layout.add(selectFmt.format(stmt.query_expr));
        }

        return this.layout.toString().trimEnd();
    }

    private formatCreateTarget(stmt: any): void {
        const table = stmt.table;
        if (table) {
            this.layout.add(WS.SPACE);
            if (Array.isArray(table)) {
                const tableStrs = table.map((t: any) => this.formatTableName(t));
                this.layout.add(tableStrs.join(', '));
            } else {
                this.layout.add(this.formatTableName(table));
            }
        }

        if (stmt.index) {
            this.layout.add(WS.SPACE);
            if (typeof stmt.index === 'object' && stmt.index.name) {
                this.layout.add(stmt.index.name);
            } else {
                this.layout.add(String(stmt.index));
            }
        }

        if (stmt.on_kw) {
            this.layout.add(WS.SPACE, formatKeyword('ON', this.cfg.keywordCase), WS.SPACE);
        }

        if (stmt.index_columns) {
            const colStrs = stmt.index_columns.map((c: any) => this.exprFmt.format(c));
            this.layout.add('(' + colStrs.join(', ') + ')');
        }
    }

    private formatTableName(table: any): string {
        return this.helper.formatTableName(table, this.exprFmt);
    }

    private formatCreateDefinitions(defs: any[]): void {
        this.layout.add(WS.SPACE, '(');
        this.indent.increaseBlockLevel();
        this.layout.add(WS.NEWLINE, WS.INDENT);

        defs.forEach((def, i) => {
            if (i > 0) {
                this.layout.add(WS.NO_SPACE, ',', WS.NEWLINE, WS.INDENT);
            }

            if (def.resource === 'column') {
                this.formatColumnDefinition(def);
            } else if (def.resource === 'index') {
                this.formatIndexDefinition(def);
            } else if (def.resource === 'constraint') {
                this.formatConstraintDefinition(def);
            } else {
                this.layout.add(JSON.stringify(def));
            }
        });

        this.indent.decreaseBlockLevel();
        this.layout.add(WS.NEWLINE, WS.INDENT, ')');
    }

    private formatColumnDefinition(def: any): void {
        const colName = this.exprFmt.format(def.column);
        const dataType = this.formatDataType(def.definition);
        this.layout.add(colName, WS.SPACE, dataType);

        if (def.nullable) {
            if (def.nullable.type === 'not null') {
                this.layout.add(WS.SPACE, formatKeyword('NOT NULL', this.cfg.keywordCase));
            } else {
                this.layout.add(WS.SPACE, formatKeyword('NULL', this.cfg.keywordCase));
            }
        }

        if (def.default_val) {
            this.layout.add(WS.SPACE, formatKeyword('DEFAULT', this.cfg.keywordCase), WS.SPACE);
            this.layout.add(this.exprFmt.format(def.default_val.value));
        }

        if (def.auto_increment) {
            this.layout.add(WS.SPACE, formatKeyword('AUTO_INCREMENT', this.cfg.keywordCase));
        }

        if (def.unique) {
            this.layout.add(WS.SPACE, formatKeyword(def.unique.toUpperCase(), this.cfg.keywordCase));
        }

        if (def.primary) {
            this.layout.add(WS.SPACE, formatKeyword(def.primary.toUpperCase(), this.cfg.keywordCase));
        }

        if (def.comment) {
            this.layout.add(WS.SPACE, formatKeyword('COMMENT', this.cfg.keywordCase), WS.SPACE);
            this.layout.add("'" + def.comment.value + "'");
        }
    }

    private formatDataType(def: any): string {
        if (typeof def === 'string') return formatKeyword(def, this.cfg.dataTypeCase);

        let result = formatKeyword(def.dataType || '', this.cfg.dataTypeCase);

        if (def.length != null) {
            result += '(' + def.length;
            if (def.scale != null) {
                result += ',' + def.scale;
            }
            result += ')';
        }

        if (def.suffix) {
            if (Array.isArray(def.suffix)) {
                if (def.suffix.length > 0) {
                    result += ' ' + def.suffix.join(' ');
                }
            } else {
                result += ' ' + String(def.suffix);
            }
        }

        return result;
    }

    private formatIndexDefinition(def: any): void {
        if (def.keyword) {
            this.layout.add(formatKeyword(def.keyword.toUpperCase(), this.cfg.keywordCase), WS.SPACE);
        }
        if (def.index) {
            this.layout.add(def.index, WS.SPACE);
        }
        const colStrs = (def.definition || []).map((c: any) => this.exprFmt.format(c));
        this.layout.add('(' + colStrs.join(', ') + ')');
    }

    private formatConstraintDefinition(def: any): void {
        if (def.keyword === 'constraint' && def.constraint) {
            this.layout.add(formatKeyword('CONSTRAINT', this.cfg.keywordCase), WS.SPACE, def.constraint, WS.SPACE);
        }
        this.layout.add(formatKeyword(def.constraint_type.toUpperCase(), this.cfg.keywordCase));

        if (def.definition) {
            const colStrs = def.definition.map((c: any) => this.exprFmt.format(c));
            this.layout.add(WS.SPACE, '(' + colStrs.join(', ') + ')');
        }
    }

    private formatTableOptions(options: any[]): void {
        for (const opt of options) {
            this.layout.add(WS.SPACE);
            if (typeof opt === 'string') {
                this.layout.add(opt);
            } else if (typeof opt === 'object') {
                const entries = Object.entries(opt);
                for (const [key, val] of entries) {
                    this.layout.add(formatKeyword(key.toUpperCase(), this.cfg.keywordCase));
                    if (val !== undefined && val !== null) {
                        this.layout.add(WS.SPACE, '=', WS.SPACE, String(val));
                    }
                }
            }
        }
    }

    private formatAlter(stmt: any): string {
        this.layout.add(formatKeyword('ALTER', this.cfg.keywordCase), WS.SPACE, formatKeyword('TABLE', this.cfg.keywordCase));

        if (stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            for (const t of tables) {
                this.layout.add(WS.SPACE, this.formatTableName(t));
            }
        }

        if (stmt.expr) {
            const exprs = Array.isArray(stmt.expr) ? stmt.expr : [stmt.expr];
            for (const expr of exprs) {
                this.formatAlterExpression(expr);
            }
        }

        return this.layout.toString().trimEnd();
    }

    private formatAlterExpression(expr: any): void {
        if (expr.action) {
            this.layout.add(WS.SPACE, formatKeyword(expr.action.toUpperCase(), this.cfg.keywordCase));
        }

        if (expr.keyword) {
            this.layout.add(WS.SPACE, formatKeyword(expr.keyword.toUpperCase(), this.cfg.keywordCase));
        }

        if (expr.resource === 'column') {
            if (expr.column) {
                this.layout.add(WS.SPACE, this.exprFmt.format(expr.column));
            }
            if (expr.definition) {
                this.layout.add(WS.SPACE, this.formatDataType(expr.definition));
            }
        } else if (expr.resource === 'index') {
            if (expr.index) {
                this.layout.add(WS.SPACE, String(expr.index));
            }
        }
    }

    private formatDrop(stmt: any): string {
        this.layout.add(formatKeyword('DROP', this.cfg.keywordCase));

        if (stmt.keyword) {
            this.layout.add(WS.SPACE, formatKeyword(stmt.keyword.toUpperCase(), this.cfg.keywordCase));
        }

        if (stmt.name && Array.isArray(stmt.name)) {
            const nameStrs = stmt.name.map((n: any) => {
                if (typeof n === 'object' && n !== null) {
                    if ('table' in n) return this.formatTableName(n);
                    if ('value' in n) return String(n.value);
                    return JSON.stringify(n);
                }
                return String(n);
            });
            this.layout.add(WS.SPACE, nameStrs.join(', '));
        }

        return this.layout.toString().trimEnd();
    }

    private formatUnknown(stmt: any): string {
        return JSON.stringify(stmt);
    }
}
