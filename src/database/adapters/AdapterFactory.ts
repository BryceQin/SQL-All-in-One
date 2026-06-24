import type { DialectMetadata, IDatabaseAdapter, ConnectionConfig } from './IDatabaseAdapter';

type AdapterConstructor = new (config: ConnectionConfig) => IDatabaseAdapter;
type MetadataProvider = () => DialectMetadata;

const adapters = new Map<string, AdapterConstructor>();
const metadataProviders = new Map<string, MetadataProvider>();

export const AdapterFactory = {
    register(dialect: string, adapterClass: AdapterConstructor, metadataProvider?: MetadataProvider): void {
        adapters.set(dialect, adapterClass);
        if (metadataProvider) {
            metadataProviders.set(dialect, metadataProvider);
        }
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
    },

    getDialectMetadata(dialect: string): DialectMetadata | undefined {
        const provider = metadataProviders.get(dialect);
        return provider ? provider() : undefined;
    },

    getAllMetadata(): DialectMetadata[] {
        const result: DialectMetadata[] = [];
        for (const provider of metadataProviders.values()) {
            result.push(provider());
        }
        return result;
    }
};
