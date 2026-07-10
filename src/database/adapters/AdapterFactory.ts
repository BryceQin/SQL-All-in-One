import type {
    DialectMetadata,
    IConnectionAdapter,
    IQueryAdapter,
    IMetadataAdapter,
    ISchemaAdapter,
    ConnectionConfig,
} from "./IDatabaseAdapter";

/**
 * Aggregated database adapter type returned by {@link AdapterFactory.create}.
 *
 * After the P0-2 adapter consolidation, {@link BaseDatabaseAdapter} owns the
 * connection-lifecycle + status surface ({@link IConnectionAdapter}) directly
 * and exposes the query / metadata / schema surfaces as public sub-adapter
 * fields rather than 25 forwarding methods. Callers therefore reach those
 * surfaces via `adapter.queryAdapter.execute(...)`,
 * `adapter.metadataAdapter.listTables(...)` and
 * `adapter.schemaAdapter.describeTable(...)`, etc.
 *
 * This type alias is the public contract that {@link AdapterFactory.create}
 * returns and that {@link ConnectionManager.getAdapter} exposes; it captures
 * both halves of the surface (base-owned connection methods + sub-adapter
 * fields) in a single named type so callers do not have to spell out the
 * intersection everywhere.
 */
export type DatabaseAdapter = IConnectionAdapter & {
    queryAdapter: IQueryAdapter;
    metadataAdapter: IMetadataAdapter;
    schemaAdapter: ISchemaAdapter;
};

type AdapterConstructor = new (config: ConnectionConfig) => DatabaseAdapter;
type MetadataProvider = () => DialectMetadata;

/**
 * Per-dialect adapter instantiation counters.
 *
 * Used to observe which dialect adapters are actually exercised at runtime.
 * The factory itself stays synchronous and backward-compatible; these counts
 * are pure side-effects for diagnostics and have no impact on control flow.
 *
 * Rationale: in the current CJS single-bundle esbuild setup, dynamic
 * `import()` of adapter modules yields negligible cold-start savings because
 * the driver npm packages are already `external` + lazily imported inside the
 * sub-adapters, and the adapter TS sources themselves only contain class
 * definitions at module top level. Exposing these counters lets us measure
 * real adapter usage before deciding whether bundle-splitting (which VSCode
 * CJS extensions do not support today) is worth pursuing.
 */
const instantiationCounts = new Map<string, number>();

const adapters = new Map<string, AdapterConstructor>();
const metadataProviders = new Map<string, MetadataProvider>();

export const AdapterFactory = {
    register(dialect: string, adapterClass: AdapterConstructor, metadataProvider?: MetadataProvider): void {
        adapters.set(dialect, adapterClass);
        if (metadataProvider) {
            metadataProviders.set(dialect, metadataProvider);
        }
    },

    create(dialect: string, config: ConnectionConfig): DatabaseAdapter {
        const AdapterClass = adapters.get(dialect);
        if (!AdapterClass) {
            throw new Error(`No adapter registered for dialect: ${dialect}`);
        }
        const count = (instantiationCounts.get(dialect) ?? 0) + 1;
        instantiationCounts.set(dialect, count);
        // console.debug keeps this quiet by default in the extension host and
        // avoids pulling in vscode APIs (which are unavailable during some
        // unit-test setups).
        console.debug(`[AdapterFactory] instantiated '${dialect}' adapter (count=${count})`);
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
    },

    /**
     * Returns a snapshot of how many times each dialect adapter has been
     * instantiated via {@link create} since process start. Intended for
     * diagnostics / cold-start analysis only.
     */
    getInstantiationStats(): Record<string, number> {
        const result: Record<string, number> = {};
        for (const [dialect, count] of instantiationCounts) {
            result[dialect] = count;
        }
        return result;
    },

    /**
     * Resets the instantiation counters. Intended for unit tests that assert
     * on {@link getInstantiationStats}. Has no effect on registered adapters.
     */
    resetInstantiationStats(): void {
        instantiationCounts.clear();
    },
};
