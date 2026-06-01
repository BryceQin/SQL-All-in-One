import { EventEmitter, Event } from 'vscode';
import { ConnectionConfig, ConnectionState, TestConnectionResult } from './ConnectionConfig';
import { ConnectionStore, getConnectionStore } from './ConnectionStore';
import { AdapterFactory } from '../adapters/AdapterFactory';
import { IDatabaseAdapter, IPoolStatus } from '../adapters/IDatabaseAdapter';
import { SshTunnel } from './SshTunnel';
import { handleError, ErrorCategory } from '../../core/errorHandler';
import { getContainer, Tokens } from '../../core/diContainer';

export interface ConnectionEvent {
    type: 'add' | 'remove' | 'update';
    connectionId: string;
}

export interface ConnectionStateEvent {
    connectionId: string;
    oldState: ConnectionState;
    newState: ConnectionState;
}

export interface ActiveConnectionEvent {
    oldId?: string;
    newId?: string;
}

export class ConnectionManager {
    private connectionStore: ConnectionStore;
    private adapters = new Map<string, IDatabaseAdapter>();
    private connectionStates = new Map<string, ConnectionState>();
    private activeConnectionId?: string;
    private retryAttempts = new Map<string, number>();
    private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private sshTunnels = new Map<string, SshTunnel>();
    private healthCheckTimers = new Map<string, ReturnType<typeof setInterval>>();
    private idleCheckTimers = new Map<string, ReturnType<typeof setInterval>>();
    private connectionLastActivity = new Map<string, number>();
    private consecutiveHealthFailures = new Map<string, number>();

    private readonly _onDidChangeConnections = new EventEmitter<ConnectionEvent>();
    private readonly _onDidChangeConnectionState = new EventEmitter<ConnectionStateEvent>();
    private readonly _onDidChangeActiveConnection = new EventEmitter<ActiveConnectionEvent>();

    readonly onDidChangeConnections: Event<ConnectionEvent> = this._onDidChangeConnections.event;
    readonly onDidChangeConnectionState: Event<ConnectionStateEvent> = this._onDidChangeConnectionState.event;
    readonly onDidChangeActiveConnection: Event<ActiveConnectionEvent> = this._onDidChangeActiveConnection.event;

    constructor() {
        this.connectionStore = getConnectionStore();
    }

    async initialize(): Promise<void> {
        await this.connectionStore.load();
    }

    async addConnection(config: ConnectionConfig, password?: string): Promise<void> {
        await this.connectionStore.addConnection(config, password);
        this._onDidChangeConnections.fire({ type: 'add', connectionId: config.id });
    }

    async removeConnection(id: string): Promise<void> {
        await this.disconnect(id);
        await this.connectionStore.removeConnection(id);

        if (this.activeConnectionId === id) {
            const oldId = this.activeConnectionId;
            this.activeConnectionId = undefined;
            this._onDidChangeActiveConnection.fire({ oldId });
        }

        this._onDidChangeConnections.fire({ type: 'remove', connectionId: id });
    }

    async updateConnection(id: string, config: ConnectionConfig, password?: string): Promise<void> {
        const oldState = this.connectionStates.get(id) || 'disconnected';
        if (oldState !== 'disconnected') {
            await this.disconnect(id);
        }

        await this.connectionStore.updateConnection(id, config, password);
        this._onDidChangeConnections.fire({ type: 'update', connectionId: id });
    }

    async connect(id: string): Promise<void> {
        const oldState = this.connectionStates.get(id) || 'disconnected';
        if (oldState === 'connected' || oldState === 'connecting') {
            return;
        }

        const config = this.connectionStore.getConnection(id);
        if (!config) {
            throw new Error(`Connection not found: ${id}`);
        }

        const password = await this.connectionStore.getPassword(id);
        const fullConfig = { ...config, password };

        if (config.ssh?.enabled) {
            const tunnel = new SshTunnel();
            try {
                const sshConfig = { ...config.ssh };
                const sshPassword = await this.connectionStore.getSshPassword(id);
                const sshPassphrase = await this.connectionStore.getSshPassphrase(id);
                if (sshPassword) sshConfig.password = sshPassword;
                if (sshPassphrase) sshConfig.passphrase = sshPassphrase;

                const tunnelResult = await tunnel.open(
                    sshConfig,
                    config.host,
                    config.port
                );

                this.sshTunnels.set(id, tunnel);
                fullConfig.host = tunnelResult.localHost;
                fullConfig.port = tunnelResult.localPort;
            } catch (error: unknown) {
                this.updateConnectionState(id, 'error');
                throw new Error(`SSH tunnel failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        this.updateConnectionState(id, 'connecting');

        try {
            const adapter = AdapterFactory.create(config.dialect, fullConfig);
            await adapter.connect(fullConfig);

            this.adapters.set(id, adapter);
            this.updateConnectionState(id, 'connected');
            this.retryAttempts.delete(id);

            this.startHealthCheck(id, fullConfig);
            this.startIdleCheck(id, fullConfig);
            this.connectionLastActivity.set(id, Date.now());

            if (!this.activeConnectionId) {
                this.setActiveConnection(id);
            }
        } catch (error: unknown) {
            const tunnel = this.sshTunnels.get(id);
            if (tunnel) {
                try {
                    await tunnel.close();
                } catch (e) {
                    handleError(e, 'ConnectionManager.closeSshTunnelOnError', ErrorCategory.FEATURE);
                }
                this.sshTunnels.delete(id);
            }
            this.updateConnectionState(id, 'error');
            this.scheduleRetry(id);
            throw error;
        }
    }

    async disconnect(id: string): Promise<void> {
        const oldState = this.connectionStates.get(id) || 'disconnected';
        this.stopHealthCheck(id);
        this.stopIdleCheck(id);
        this.connectionLastActivity.delete(id);
        if (oldState === 'disconnected') {
            return;
        }

        const adapter = this.adapters.get(id);
        if (adapter) {
            try {
                await adapter.disconnect();
            } catch (e) {
                handleError(e, 'ConnectionManager.disconnect', ErrorCategory.FEATURE);
            }
            this.adapters.delete(id);
        }

        const tunnel = this.sshTunnels.get(id);
        if (tunnel) {
            try {
                await tunnel.close();
            } catch (e) {
                handleError(e, 'ConnectionManager.closeSshTunnel', ErrorCategory.FEATURE);
            }
            this.sshTunnels.delete(id);
        }

        this.updateConnectionState(id, 'disconnected');
        this.cancelRetry(id);

        if (this.activeConnectionId === id) {
            const oldId = this.activeConnectionId;
            this.activeConnectionId = undefined;
            this._onDidChangeActiveConnection.fire({ oldId });
        }
    }

    async disconnectAll(): Promise<void> {
        const ids = Array.from(this.adapters.keys());
        const results = await Promise.allSettled(
            ids.map(id => this.disconnect(id))
        );
        for (const result of results) {
            if (result.status === 'rejected') {
                console.error('Failed to disconnect:', result.reason);
            }
        }
        for (const [_id, timer] of this.healthCheckTimers) {
            clearInterval(timer);
        }
        this.healthCheckTimers.clear();
        for (const [_id, timer] of this.idleCheckTimers) {
            clearInterval(timer);
        }
        this.idleCheckTimers.clear();
        this.connectionLastActivity.clear();
        this.consecutiveHealthFailures.clear();
        for (const [_id, timer] of this.retryTimers) {
            clearTimeout(timer);
        }
        this.retryTimers.clear();
    }

    async testConnection(id: string): Promise<TestConnectionResult>;
    async testConnection(config: ConnectionConfig, password?: string): Promise<TestConnectionResult>;
    async testConnection(arg: string | ConnectionConfig, password?: string): Promise<TestConnectionResult> {
        let config: ConnectionConfig;
        let pass: string | undefined;

        if (typeof arg === 'string') {
            const conn = this.connectionStore.getConnection(arg);
            if (!conn) {
                throw new Error(`Connection not found: ${arg}`);
            }
            config = conn;
            pass = await this.connectionStore.getPassword(arg);
        } else {
            config = arg;
            pass = password;
        }

        if (config.ssh?.enabled) {
            const tunnel = new SshTunnel();
            try {
                const sshConfig = { ...config.ssh };
                if (config.ssh?.password) {
                    sshConfig.password = config.ssh.password;
                }
                const tunnelResult = await tunnel.open(sshConfig, config.host, config.port);
                const fullConfig = { ...config, password: pass, host: tunnelResult.localHost, port: tunnelResult.localPort };
                try {
                    const adapter = AdapterFactory.create(config.dialect, fullConfig);
                    const result = await adapter.testConnection(fullConfig);
                    return result;
                } finally {
                    await tunnel.close();
                }
            } catch (error: unknown) {
                return { success: false, error: `SSH tunnel failed: ${error instanceof Error ? error.message : String(error)}` };
            }
        }

        const fullConfig = { ...config, password: pass };
        const adapter = AdapterFactory.create(config.dialect, fullConfig);
        return await adapter.testConnection(fullConfig);
    }

    getAdapter(id: string): IDatabaseAdapter | undefined {
        return this.adapters.get(id);
    }

    getState(id: string): ConnectionState {
        return this.connectionStates.get(id) || 'disconnected';
    }

    getAllConnections(): ConnectionConfig[] {
        return this.connectionStore.getConnections();
    }

    getActiveConnection(): ConnectionConfig | undefined {
        if (!this.activeConnectionId) {
            return undefined;
        }
        return this.connectionStore.getConnection(this.activeConnectionId);
    }

    setActiveConnection(id: string): void {
        const oldId = this.activeConnectionId;
        if (oldId === id) {
            return;
        }

        this.activeConnectionId = id;
        this._onDidChangeActiveConnection.fire({ oldId, newId: id });
    }

    getPoolStatus(id: string): IPoolStatus | undefined {
        const adapter = this.adapters.get(id);
        if (!adapter) return undefined;
        return adapter.getPoolStatus();
    }

    private updateConnectionState(id: string, newState: ConnectionState): void {
        const oldState = this.connectionStates.get(id) || 'disconnected';
        if (oldState === newState) {
            return;
        }

        this.connectionStates.set(id, newState);
        this._onDidChangeConnectionState.fire({ connectionId: id, oldState, newState });
    }

    private scheduleRetry(id: string): void {
        const maxAttempts = 3;
        const maxDelay = 30000;
        const attempts = (this.retryAttempts.get(id) || 0) + 1;
        if (attempts > maxAttempts) {
            return;
        }

        this.retryAttempts.set(id, attempts);
        const delay = Math.min(Math.pow(2, attempts) * 1000, maxDelay);

        const existingTimer = this.retryTimers.get(id);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(async () => {
            this.retryTimers.delete(id);
            const state = this.connectionStates.get(id);
            if (state === 'error') {
                try {
                    await this.connect(id);
                } catch (e) {
                    handleError(e, 'ConnectionManager.retryConnection', ErrorCategory.FEATURE);
                }
            }
        }, delay);

        this.retryTimers.set(id, timer);
    }

    cancelRetry(id: string): void {
        const timer = this.retryTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.retryTimers.delete(id);
        }
        this.retryAttempts.delete(id);
    }

    private startHealthCheck(id: string, config: ConnectionConfig): void {
        this.stopHealthCheck(id);
        const interval = config.poolConfig?.keepAliveInterval ?? 30000;
        const timer = setInterval(async () => {
            const adapter = this.adapters.get(id);
            if (!adapter) {
                this.stopHealthCheck(id);
                return;
            }
            try {
                const healthy = await adapter.checkConnectionHealth();
                if (healthy) {
                    this.consecutiveHealthFailures.set(id, 0);
                    this.connectionLastActivity.set(id, Date.now());
                } else {
                    const failures = (this.consecutiveHealthFailures.get(id) ?? 0) + 1;
                    this.consecutiveHealthFailures.set(id, failures);
                    if (failures >= 2) {
                        this.updateConnectionState(id, 'error');
                        this.scheduleRetry(id);
                    }
                }
            } catch {
                const failures = (this.consecutiveHealthFailures.get(id) ?? 0) + 1;
                this.consecutiveHealthFailures.set(id, failures);
                console.warn(`Health check failed for connection ${id}:`);
                if (failures >= 2) {
                    this.updateConnectionState(id, 'error');
                    this.scheduleRetry(id);
                }
            }
        }, interval);
        this.healthCheckTimers.set(id, timer);
    }

    private stopHealthCheck(id: string): void {
        const timer = this.healthCheckTimers.get(id);
        if (timer) {
            clearInterval(timer);
            this.healthCheckTimers.delete(id);
        }
        this.consecutiveHealthFailures.delete(id);
    }

    private startIdleCheck(id: string, config: ConnectionConfig): void {
        this.stopIdleCheck(id);
        const idleTimeout = config.poolConfig?.idleTimeout ?? 300000;
        if (idleTimeout <= 0) return;
        const checkInterval = config.poolConfig?.reapInterval ?? 60000;
        const timer = setInterval(async () => {
            const lastActivity = this.connectionLastActivity.get(id);
            if (lastActivity === undefined) return;
            const now = Date.now();
            if (now - lastActivity > idleTimeout) {
                const adapter = this.adapters.get(id);
                if (adapter) {
                    const status = adapter.getPoolStatus();
                    if (status.activeConnections === 0) {
                        await this.disconnect(id);
                    }
                }
            }
        }, checkInterval);
        this.idleCheckTimers.set(id, timer);
    }

    private stopIdleCheck(id: string): void {
        const timer = this.idleCheckTimers.get(id);
        if (timer) {
            clearInterval(timer);
            this.idleCheckTimers.delete(id);
        }
    }

    dispose(): void {
        for (const timer of this.retryTimers.values()) {
            clearTimeout(timer);
        }
        this.retryTimers.clear();

        for (const timer of this.healthCheckTimers.values()) {
            clearInterval(timer);
        }
        for (const timer of this.idleCheckTimers.values()) {
            clearInterval(timer);
        }

        this._onDidChangeConnections.dispose();
        this._onDidChangeConnectionState.dispose();
        this._onDidChangeActiveConnection.dispose();
    }
}

export function createConnectionManager(): ConnectionManager {
    return new ConnectionManager();
}

export function getConnectionManager(): ConnectionManager {
    return getContainer().get<ConnectionManager>(Tokens.ConnectionManager);
}
