export interface SSLConfig {
    enabled: boolean;
    rejectUnauthorized: boolean;
    ca?: string;
    cert?: string;
    key?: string;
}

export interface SshConfig {
    enabled: boolean;
    host?: string;
    port?: number;
    username?: string;
    authentication?: 'password' | 'privateKey';
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

export interface ConnectionPoolConfig {
    minConnections?: number;
    maxConnections?: number;
    acquireTimeout?: number;
    idleTimeout?: number;
    reapInterval?: number;
    enableKeepAlive?: boolean;
    keepAliveInterval?: number;
}

export interface ConnectionConfig {
    id: string;
    name: string;
    dialect: string;
    group?: string;
    color?: string;
    host: string;
    port: number;
    username: string;
    password?: string;
    database?: string;
    ssl?: SSLConfig;
    ssh?: SshConfig;
    connectTimeout?: number;
    poolConfig?: ConnectionPoolConfig;
    options?: Record<string, unknown>;
}

export interface ConnectionGroup {
    name: string;
    color: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TestConnectionResult {
    success: boolean;
    serverVersion?: string;
    latency?: number;
    error?: string;
}
