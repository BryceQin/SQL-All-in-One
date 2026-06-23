import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import { SelectFormatter } from './SelectFormatter';
import { DDLFormatter } from './DDLFormatter';
import { InsertFormatter } from './InsertFormatter';

function buildCacheKey(type: string, cfg: FormatOptions, indent: Indentation): string {
    return `${type}_${indent.getSingleIndent()}_${cfg.keywordCase}_${cfg.functionCase}_${cfg.indentStyle}`;
}

/**
 * Tracks whether a cached formatter instance is currently in the middle of
 * formatting. When a formatter requests itself recursively (e.g. a
 * SelectFormatter formatting a subquery), the factory must hand out a fresh
 * temporary instance instead of resetting the in-use one, otherwise the
 * parent's in-progress Layout would be destroyed.
 */
interface CacheEntry {
    instance: SelectFormatter | DDLFormatter | InsertFormatter;
    inUse: boolean;
}

export class FormatterFactory {
    private instances = new Map<string, CacheEntry>();

    getSelectFormatter(cfg: FormatOptions, indent: Indentation): SelectFormatter {
        const key = buildCacheKey('select', cfg, indent);
        const entry = this.instances.get(key);
        if (!entry) {
            const instance = new SelectFormatter(cfg, indent, this);
            this.instances.set(key, { instance, inUse: true });
            return instance;
        }
        if (entry.inUse) {
            // The cached instance is busy formatting a parent query; hand out a
            // throwaway instance that is NOT cached so the parent's state is
            // preserved. The throwaway still receives this factory so deeper
            // recursion can reuse other cached instances.
            return new SelectFormatter(cfg, indent, this);
        }
        entry.inUse = true;
        (entry.instance as SelectFormatter).reset(cfg, indent);
        return entry.instance as SelectFormatter;
    }

    getDDLFormatter(cfg: FormatOptions, indent: Indentation): DDLFormatter {
        const key = buildCacheKey('ddl', cfg, indent);
        const entry = this.instances.get(key);
        if (!entry) {
            const instance = new DDLFormatter(cfg, indent, this);
            this.instances.set(key, { instance, inUse: true });
            return instance;
        }
        if (entry.inUse) {
            return new DDLFormatter(cfg, indent, this);
        }
        entry.inUse = true;
        (entry.instance as DDLFormatter).reset(cfg, indent);
        return entry.instance as DDLFormatter;
    }

    getInsertFormatter(cfg: FormatOptions, indent: Indentation): InsertFormatter {
        const key = buildCacheKey('insert', cfg, indent);
        const entry = this.instances.get(key);
        if (!entry) {
            const instance = new InsertFormatter(cfg, indent, this);
            this.instances.set(key, { instance, inUse: true });
            return instance;
        }
        if (entry.inUse) {
            return new InsertFormatter(cfg, indent, this);
        }
        entry.inUse = true;
        (entry.instance as InsertFormatter).reset(cfg, indent);
        return entry.instance as InsertFormatter;
    }

    /**
     * Marks a cached formatter instance as no longer in use, so it can be
     * reused (via reset) on the next request.
     */
    releaseInstance(instance: SelectFormatter | DDLFormatter | InsertFormatter): void {
        for (const entry of this.instances.values()) {
            if (entry.instance === instance) {
                entry.inUse = false;
                return;
            }
        }
    }

    clear(): void {
        this.instances.clear();
    }
}

export { FormatterFactory as default };
