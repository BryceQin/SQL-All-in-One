/**
 * Minimal type declarations for the `oracledb` npm package (v6.x).
 *
 * The oracledb 6.x package ships without bundled TypeScript type definitions.
 * This ambient declaration file covers only the surface area used by the
 * Oracle database adapter (thin mode pool/connection/execute). It is not a
 * complete binding; extend it as additional APIs are required.
 */

declare module 'oracledb' {
    export const version: number;
    /** Default is `true` in 6.x (thin mode). Set to `false` to force thick mode via initOracleClient. */
    export const thin: boolean;

    export const OUT_FORMAT_ARRAY: number;
    export const OUT_FORMAT_OBJECT: number;
    /** Alias for OUT_FORMAT_OBJECT kept for backwards compatibility. */
    export const OBJECT: number;

    export const POOL_STATUS_OPEN: number;
    export const POOL_STATUS_DRAINING: number;
    export const POOL_STATUS_CLOSED: number;

    export interface InitOracleClientOptions {
        libDir?: string;
        configDir?: string;
        errorUrl?: string;
        driverName?: string;
    }

    /**
     * Initialise the thick (native) mode. May only be called once per process;
     * subsequent calls throw DPI-1074. The adapter guards this with a flag.
     */
    export function initOracleClient(options?: InitOracleClientOptions): void;

    export interface PoolAttributes {
        user?: string;
        password?: string;
        connectString: string;
        poolAlias?: string;
        poolMin?: number;
        poolMax?: number;
        poolIncrement?: number;
        poolTimeout?: number;
        poolPingInterval?: number;
        poolPingTimeout?: number;
        stmtCacheSize?: number;
        connectTimeout?: number;
        edition?: string;
        events?: boolean;
        externalAuth?: boolean;
        homogeneous?: boolean;
        enableStatistics?: boolean;
        sessionCallback?: (connection: Connection, requestedTag: string, callback: (err: Error | null) => void) => void;
        configDir?: string;
        ssl?: boolean;
        sslServerCertDN?: string;
        sslServerCertDNMatch?: boolean;
        sslAllowWeakDNMatch?: boolean;
        walletLocation?: string;
        walletPassword?: string;
        externalConfig?: boolean;
        accessToken?: () => Promise<{ token: string }>;
        privateKey?: () => Promise<{ privateKey: string }>;
    }

    export interface ExecuteOptions {
        autoCommit?: boolean;
        extendedMetaData?: boolean;
        fetchArraySize?: number;
        fetchInfo?: Record<string, { type?: number; dir?: number }>;
        maxRows?: number;
        outFormat?: number;
        resultSet?: boolean;
        fetchAsString?: number[];
        fetchAsBuffer?: number[];
        bindDefs?: BindDefinition | BindDefinition[];
    }

    export interface BindDefinition {
        type?: number;
        maxSize?: number;
        dir?: number;
        val?: unknown;
    }

    export interface Result<T> {
        rows?: T[];
        outBinds?: unknown | unknown[];
        rowsAffected?: number;
        implicitResults?: unknown;
        lastRowid?: string;
        metaData?: Metadata[];
        resultSet?: ResultSet<T>;
        warning?: Error;
    }

    export interface Metadata {
        name: string;
        fetchType?: number;
        dbType?: number;
        nullable?: boolean;
        byteSize?: number;
        precision?: number;
        scale?: number;
        domainSchema?: string;
        domainName?: string;
        annotations?: Record<string, string>;
    }

    export interface ResultSet<T> {
        getRows(numRows: number): Promise<T[]>;
        getRows(): Promise<T[]>;
        getMetaData(): Promise<Metadata[]>;
        close(): Promise<void>;
        toQueryStream(): NodeJS.ReadableStream;
    }

    export interface Connection {
        execute<T = unknown>(sql: string, options?: ExecuteOptions): Promise<Result<T>>;
        execute<T = unknown>(sql: string, binds: unknown | unknown[], options?: ExecuteOptions): Promise<Result<T>>;
        executeMany<T = unknown>(sql: string, bindsOrNumIters: unknown[] | number, options?: ExecuteOptions): Promise<Result<T>>;
        commit(): Promise<void>;
        rollback(): Promise<void>;
        close(): Promise<void>;
        close(drop: boolean): Promise<void>;
        ping(): Promise<void>;
        break(): Promise<void>;
        breakExecution(): Promise<void>;
        changePassword(user: string, password: string, newPassword: string): Promise<void>;
        currentSchema: string;
        action: string;
        clientId: string;
        callTimeout: number;
        dbOp: string;
        stmtCacheSize: number;
        thin: boolean;
        externalName: string;
        dbDomain: string;
        dbName: string;
        hostName: string;
        port: number;
        protocol: string;
        connectString: string;
    }

    export interface Pool {
        getConnection(): Promise<Connection>;
        close(): Promise<void>;
        close(a1: number): Promise<void>;
        getStatistics(): Promise<PoolStatistics>;
        status: number;
        connectionsInUse: number;
        connectionsOpen: number;
        connectString: string;
        thin: boolean;
        edition: string;
        enableStatistics: boolean;
        events: boolean;
        externalAuth: boolean;
        homogeneous: boolean;
        poolAlias: string;
        poolIncrement: number;
        poolMax: number;
        poolMaxPerShard: number;
        poolMin: number;
        poolPingInterval: number;
        poolPingTimeout: number;
        poolTimeout: number;
        stmtCacheSize: number;
        user: string;
    }

    export interface PoolStatistics {
        gathersTime: Date;
        upTime: number;
        upTimeSince: Date;
        connectionRequests: number;
        requestsEnqueued: number;
        requestsDequeued: number;
        requestsFailed: number;
        requestsTimeout: number;
        connectionTimeouts: number;
        maxQueueLength: number;
        sumQueueTime: number;
        avgQueueTime: number;
        minQueueTime: number;
        maxQueueTimeInUse: number;
        connectionsInUse: number;
        connectionsOpen: number;
        poolMin: number;
        poolMax: number;
        poolIncrement: number;
        poolTimeout: number;
    }

    export function createPool(poolAttrs: PoolAttributes): Promise<Pool>;
    export function getConnection(connAttrs: PoolAttributes): Promise<Connection>;
}
