import { EventEmitter, Event } from 'vscode';
import { ConnectionConfig, ConnectionState, TestConnectionResult } from './ConnectionConfig';
import { ConnectionStore, getConnectionStore } from './ConnectionStore';
import { AdapterFactory } from '../adapters/AdapterFactory';
import { IDatabaseAdapter, IPoolStatus } from '../adapters/IDatabaseAdapter';
import { SshTunnel } from './SshTunnel';
import { handleError, ErrorCategory } from '../../core/errorHandler';
import { getContainer, Tokens } from '../../core/diContainer';
import { t } from '../../i18n/index';

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
    private consecutiveHealthFailures = new Map<string, number>();
    private isHealthChecking = new Map<string, boolean>();

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

        this.updateConnectionState(id, 'connecting');

        const config = this.connectionStore.getConnection(id);
        if (!config) {
            this.updateConnectionState(id, 'disconnected');
            throw new Error(t('database.connectionNotFoundWithId', id));
        }

        const password = await this.connectionStore.getPassword(id);
        // SECURITY: connectConfig contains the password — never log or serialize this object.
        const connectConfig: ConnectionConfig = { ...config, password };

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
                    config.port,
                    config.connectTimeout
                );

                this.sshTunnels.set(id, tunnel);
                connectConfig.host = tunnelResult.localHost;
                connectConfig.port = tunnelResult.localPort;
            } catch (error: unknown) {
                this.updateConnectionState(id, 'error');
                throw new Error(t('database.sshTunnelFailed', error instanceof Error ? error.message : String(error)));
            }
        }

        try {
            const adapter = AdapterFactory.create(config.dialect, connectConfig);
            await adapter.connect(connectConfig);

            // Clear password from the local config copy after connection is established
            // to reduce the window in which it is held in memory.
            connectConfig.password = undefined;

            this.adapters.set(id, adapter);
            this.updateConnectionState(id, 'connected');
            this.retryAttempts.delete(id);

            this.startHealthCheck(id, connectConfig);

            if (!this.activeConnectionId) {
                this.setActiveConnection(id);
            }
        } catch (error: unknown) {
            await this.closeSshTunnel(id);
            this.updateConnectionState(id, 'error');
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isAuthError = /access denied|authentication failed|invalid password|login failed/i.test(errorMessage);
            if (!isAuthError) {
                this.scheduleRetry(id);
            }
            throw error;
        }
    }

    async disconnect(id: string): Promise<void> {
        const oldState = this.connectionStates.get(id) || 'disconnected';
        this.stopHealthCheck(id);
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

        await this.closeSshTunnel(id);

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
    }

    async testConnection(id: string): Promise<TestConnectionResult>;
    async testConnection(config: ConnectionConfig, password?: string): Promise<TestConnectionResult>;
    async testConnection(arg: string | ConnectionConfig, password?: string): Promise<TestConnectionResult> {
        let config: ConnectionConfig;
        let pass: string | undefined;

        if (typeof arg === 'string') {
            const conn = this.connectionStore.getConnection(arg);
            if (!conn) {
                throw new Error(t('database.connectionNotFoundWithId', arg));
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
                // SECURITY: connectConfig contains the password — never log or serialize this object.
                const connectConfig: ConnectionConfig = { ...config, password: pass, host: tunnelResult.localHost, port: tunnelResult.localPort };
                try {
                    const adapter = AdapterFactory.create(config.dialect, connectConfig);
                    const result = await adapter.testConnection(connectConfig);
                    // Clear password after use
                    connectConfig.password = undefined;
                    return result;
                } finally {
                    await tunnel.close();
                }
            } catch (error: unknown) {
                return { success: false, error: t('database.sshTunnelFailed', error instanceof Error ? error.message : String(error)) };
            }
        }

        // SECURITY: connectConfig contains the password — never log or serialize this object.
        const connectConfig: ConnectionConfig = { ...config, password: pass };
        const adapter = AdapterFactory.create(config.dialect, connectConfig);
        const result = await adapter.testConnection(connectConfig);
        // Clear password after use
        connectConfig.password = undefined;
        return result;
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

    private async closeSshTunnel(id: string): Promise<void> {
        const tunnel = this.sshTunnels.get(id);
        if (tunnel) {
            try {
                await tunnel.close();
            } catch (e) {
                handleError(e, 'ConnectionManager.closeSshTunnel', ErrorCategory.FEATURE);
            }
            this.sshTunnels.delete(id);
        }
    }

    private async handleUnhealthyConnection(id: string, adapter: IDatabaseAdapter): Promise<void> {
        this.stopHealthCheck(id);
        try {
            await adapter.disconnect();
        } catch {
            // ignore disconnect error on unhealthy connection
        }
        this.adapters.delete(id);
        await this.closeSshTunnel(id);
        this.updateConnectionState(id, 'error');
        this.scheduleRetry(id);
    }

    private startHealthCheck(id: string, config: ConnectionConfig): void {
        this.stopHealthCheck(id);
        const interval = config.poolConfig?.keepAliveInterval ?? 30000;
        const timer = setInterval(async () => {
            if (this.isHealthChecking.get(id)) {
                return;
            }
            this.isHealthChecking.set(id, true);
            try {
                const adapter = this.adapters.get(id);
                if (!adapter) {
                    this.stopHealthCheck(id);
                    return;
                }
                try {
                    const healthy = await adapter.checkConnectionHealth();
                    if (healthy) {
                        this.consecutiveHealthFailures.set(id, 0);
                    } else {
                        const failures = (this.consecutiveHealthFailures.get(id) ?? 0) + 1;
                        this.consecutiveHealthFailures.set(id, failures);
                        if (failures >= 2) {
                            await this.handleUnhealthyConnection(id, adapter);
                        }
                    }
                } catch {
                    const failures = (this.consecutiveHealthFailures.get(id) ?? 0) + 1;
                    this.consecutiveHealthFailures.set(id, failures);
                    console.warn(`Health check failed for connection ${id}:`);
                    if (failures >= 2) {
                        await this.handleUnhealthyConnection(id, adapter);
                    }
                }
            } finally {
                this.isHealthChecking.set(id, false);
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
        this.isHealthChecking.delete(id);
    }

    async dispose(): Promise<void> {
        for (const timer of this.retryTimers.values()) {
            clearTimeout(timer);
        }
        this.retryTimers.clear();

        for (const timer of this.healthCheckTimers.values()) {
            clearInterval(timer);
        }
        this.healthCheckTimers.clear();

        await Promise.allSettled(
            Array.from(this.adapters.values()).map(adapter =>
                adapter.disconnect().catch((_e) => undefined)
            )
        );
        this.adapters.clear();

        await Promise.allSettled(
            Array.from(this.sshTunnels.values()).map(tunnel =>
                tunnel.close().catch((_e) => undefined)
            )
        );
        this.sshTunnels.clear();

        this._onDidChangeConnections.dispose();
        this._onDidChangeConnectionState.dispose();
        this._onDidChangeActiveConnection.dispose();

        this.connectionStates.clear();
        this.retryAttempts.clear();
        this.consecutiveHealthFailures.clear();
        this.isHealthChecking.clear();
    }
}

export function createConnectionManager(): ConnectionManager {
    return new ConnectionManager();
}

export function getConnectionManager(): ConnectionManager {
    return getContainer().get<ConnectionManager>(Tokens.ConnectionManager);
}
