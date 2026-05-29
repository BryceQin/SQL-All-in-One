import { IDatabaseAdapter, ConnectionConfig } from './IDatabaseAdapter';

type AdapterConstructor = new (config: ConnectionConfig) => IDatabaseAdapter;

const adapters = new Map<string, AdapterConstructor>();

export const AdapterFactory = {
    register(dialect: string, adapterClass: AdapterConstructor): void {
        adapters.set(dialect, adapterClass);
    },

    create(dialect: string, config: ConnectionConfig): IDatabaseAdapter {
        const AdapterClass = adapters.get(dialect);
        if (!AdapterClass) {
            throw new Error(`No adapter registered for dialect: ${dialect}`);
        }
        return new AdapterClass(config);
    },

    has(dialect: string): boolean {
        return adapters.has(dialect);
    },

    getRegisteredDialects(): string[] {
        return Array.from(adapters.keys());
    }
};