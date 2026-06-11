import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import { SelectFormatter } from './SelectFormatter';
import { DDLFormatter } from './DDLFormatter';
import { InsertFormatter } from './InsertFormatter';

export class FormatterFactory {
    private instances = new Map<string, SelectFormatter | DDLFormatter | InsertFormatter>();

    getSelectFormatter(cfg: FormatOptions, indent: Indentation): SelectFormatter {
        const key = `select_${indent.getSingleIndent()}`;
        let instance = this.instances.get(key) as SelectFormatter | undefined;
        if (!instance) {
            instance = new SelectFormatter(cfg, indent, this);
            this.instances.set(key, instance);
        } else {
            instance.reset(cfg, indent);
        }
        return instance;
    }

    getDDLFormatter(cfg: FormatOptions, indent: Indentation): DDLFormatter {
        const key = `ddl_${indent.getSingleIndent()}`;
        let instance = this.instances.get(key) as DDLFormatter | undefined;
        if (!instance) {
            instance = new DDLFormatter(cfg, indent, this);
            this.instances.set(key, instance);
        } else {
            instance.reset(cfg, indent);
        }
        return instance;
    }

    getInsertFormatter(cfg: FormatOptions, indent: Indentation): InsertFormatter {
        const key = `insert_${indent.getSingleIndent()}`;
        let instance = this.instances.get(key) as InsertFormatter | undefined;
        if (!instance) {
            instance = new InsertFormatter(cfg, indent, this);
            this.instances.set(key, instance);
        } else {
            instance.reset(cfg, indent);
        }
        return instance;
    }

    clear(): void {
        this.instances.clear();
    }
}

export { FormatterFactory as default };
