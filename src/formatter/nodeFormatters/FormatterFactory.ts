import type { FormatOptions } from '../FormatOptions';
import Indentation from '../Indentation';
import { SelectFormatter } from './SelectFormatter';
import { DDLFormatter } from './DDLFormatter';
import { InsertFormatter } from './InsertFormatter';

/**
 * Build a cache key that uniquely identifies a formatter configuration.
 *
 * The key must include every field that affects formatting output, otherwise
 * a cached instance from a different configuration could be reused via
 * `reset()` — and while `reset()` does update `cfg`, relying on that is
 * fragile (any future field added to FormatOptions but forgotten in
 * `reset()` would silently produce wrong output).
 *
 * Using a stable JSON serialization of the full config (excluding `params`
 * / `paramTypes` which are handled by the tokenizer, not the formatter
 * body) guarantees correctness at the cost of a slightly longer key.
 */
function buildCacheKey(type: string, cfg: FormatOptions, indent: Indentation): string {
    // Omit `params` and `paramTypes`: they affect tokenization, not the
    // formatter layout decisions, and they may contain large arrays.
    const { params: _params, paramTypes: _paramTypes, ...cfgBody } = cfg;
    return `${type}_${indent.getSingleIndent()}_${JSON.stringify(cfgBody)}`;
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
    // Reverse index: instance → key, so releaseInstance is O(1) instead of
    // scanning every cached entry on every formatter release.
    private instanceToKey = new WeakMap<SelectFormatter | DDLFormatter | InsertFormatter, string>();

    getSelectFormatter(cfg: FormatOptions, indent: Indentation): SelectFormatter {
        const key = buildCacheKey('select', cfg, indent);
        const entry = this.instances.get(key);
        if (!entry) {
            const instance = new SelectFormatter(cfg, indent, this);
            this.instances.set(key, { instance, inUse: true });
            this.instanceToKey.set(instance, key);
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
            this.instanceToKey.set(instance, key);
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
            this.instanceToKey.set(instance, key);
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
     * reused (via reset) on the next request. O(1) via reverse index.
     */
    releaseInstance(instance: SelectFormatter | DDLFormatter | InsertFormatter): void {
        const key = this.instanceToKey.get(instance);
        if (key !== undefined) {
            const entry = this.instances.get(key);
            if (entry && entry.instance === instance) {
                entry.inUse = false;
            }
        }
    }

    clear(): void {
        this.instances.clear();
        // WeakMap entries are GC'd when instances are no longer referenced,
        // but explicit clear is a no-op for WeakMap — left for symmetry.
    }
}

export { FormatterFactory as default };
