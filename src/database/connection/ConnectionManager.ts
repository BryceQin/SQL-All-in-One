import { EventEmitter, Event } from 'vscode';
import { ConnectionConfig, ConnectionState, TestConnectionResult } from './ConnectionConfig';
import { ConnectionStore, getConnectionStore } from './ConnectionStore';
import { AdapterFactory, DatabaseAdapter } from '../adapters/AdapterFactory';
import { IPoolStatus } from '../adapters/IDatabaseAdapter';
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

interface ConnectionRuntimeState {
    adapter?: DatabaseAdapter;
    state: ConnectionState;
    retryAttempts: number;
    retryTimer?: ReturnType<typeof setTimeout>;
    sshTunnel?: SshTunnel;
    healthCheckTimer?: ReturnType<typeof setInterval>;
    consecutiveHealthFailures: number;
    isHealthChecking: boolean;
}

export class ConnectionManager {
    private connectionStore: ConnectionStore;
    private runtimeStates = new Map<string, ConnectionRuntimeState>();
    private activeConnectionId?: string;

    private readonly _onDidChangeConnections = new EventEmitter<ConnectionEvent>();
    private readonly _onDidChangeConnectionState = new EventEmitter<ConnectionStateEvent>();
    private readonly _onDidChangeActiveConnection = new EventEmitter<ActiveConnectionEvent>();

    readonly onDidChangeConnections: Event<ConnectionEvent> = this._onDidChangeConnections.event;
    readonly onDidChangeConnectionState: Event<ConnectionStateEvent> = this._onDidChangeConnectionState.event;
    readonly onDidChangeActiveConnection: Event<ActiveConnectionEvent> = this._onDidChangeActiveConnection.event;

    constructor() {
        this.connectionStore = getConnectionStore();
    }

    private getOrCreateRuntime(id: string): ConnectionRuntimeState {
        let runtime = this.runtimeStates.get(id);
        if (!runtime) {
            runtime = {
                state: 'disconnected',
                retryAttempts: 0,
                consecutiveHealthFailures: 0,
                isHealthChecking: false,
            };
            this.runtimeStates.set(id, runtime);
        }
        return runtime;
    }

    async initialize(): Promise<void> {
        await this.connectionStore.load();
        // Fire `onDidChangeConnections` for each connection loaded from disk so
        // that view-layer listeners (e.g. DatabaseTreeProvider) refresh their
        // state. Without this, the tree only shows connections after a manual
        // refresh because `ConnectionStore.load()` mutates internal maps
        // without emitting events.
        const loaded = this.connectionStore.getConnections();
        for (const conn of loaded) {
            this._onDidChangeConnections.fire({ type: 'add', connectionId: conn.id });
        }
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

        // disconnect() already stops health check and retry timers;
        // clean up runtime state to prevent memory leak from accumulated entries
        this.runtimeStates.delete(id);
    }

    async updateConnection(id: string, config: ConnectionConfig, password?: string): Promise<void> {
        const runtime = this.runtimeStates.get(id);
        const oldState = runtime?.state || 'disconnected';
        if (oldState !== 'disconnected') {
            await this.disconnect(id);
        }

        await this.connectionStore.updateConnection(id, config, password);
        this._onDidChangeConnections.fire({ type: 'update', connectionId: id });
    }

    async connect(id: string): Promise<void> {
        const runtime = this.getOrCreateRuntime(id);
        if (runtime.state === 'connected' || runtime.state === 'connecting') {
            return;
        }

        this.updateConnectionState(id, 'connecting');

        const config = this.connectionStore.getConnection(id);
        if (!config) {
            this.updateConnectionState(id, 'disconnected');
            throw new Error(t('database.connectionNotFoundWithId', id));
        }

        const password = await this.connectionStore.getPassword(id);
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

                runtime.sshTunnel = tunnel;
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

            connectConfig.password = undefined;

            runtime.adapter = adapter;
            this.updateConnectionState(id, 'connected');
            runtime.retryAttempts = 0;

            this.startHealthCheck(id, connectConfig);

            if (!this.activeConnectionId) {
                this.setActiveConnection(id);
            }
        } catch (error: unknown) {
            connectConfig.password = undefined;
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
        const runtime = this.runtimeStates.get(id);
        const oldState = runtime?.state || 'disconnected';
        this.stopHealthCheck(id);
        if (oldState === 'disconnected') {
            return;
        }

        if (runtime?.adapter) {
            try {
                await runtime.adapter.disconnect();
            } catch (e) {
                handleError(e, 'ConnectionManager.disconnect', ErrorCategory.FEATURE);
            }
            runtime.adapter = undefined;
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
        const ids = Array.from(this.runtimeStates.keys());
        const results = await Promise.allSettled(
            ids.map(id => this.disconnect(id))
        );
        for (const result of results) {
            if (result.status === 'rejected') {
                console.error('Failed to disconnect:', result.reason);
            }
        }
    }

    /**
     * 强制断开指定连接并同步更新 runtimeStates 状态。
     *
     * 与 {@link disconnect} 的区别：本方法用于 adapter 可能已被外部代码
     * （例如 DataEditService.rollback 失败路径）显式断开、或需要从外部
     * 统一触发断开的场景。本方法会：
     *   1. 调用 adapter.disconnect()（若存在 adapter），失败时仅记录日志；
     *   2. 清理 adapter 引用、关闭 SSH tunnel、停止健康检查与重试计时器；
     *   3. 将状态置为 `disconnected` 并触发 active 连接变更事件。
     *
     * 调用方应使用本方法而非直接调用 `adapter.disconnect()`，以避免
     * ConnectionManager 状态与 adapter 实际状态不一致（状态仍显示
     * connected 但 adapter 已 disconnected，后续查询会失败）。
     */
    async forceDisconnect(id: string): Promise<void> {
        const runtime = this.runtimeStates.get(id);
        this.stopHealthCheck(id);

        if (runtime?.adapter) {
            try {
                await runtime.adapter.disconnect();
            } catch (e) {
                handleError(e, 'ConnectionManager.forceDisconnect', ErrorCategory.FEATURE);
            }
            runtime.adapter = undefined;
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
                const connectConfig: ConnectionConfig = { ...config, password: pass, host: tunnelResult.localHost, port: tunnelResult.localPort };
                try {
                    const adapter = AdapterFactory.create(config.dialect, connectConfig);
                    const result = await adapter.testConnection(connectConfig);
                    connectConfig.password = undefined;
                    return result;
                } finally {
                    await tunnel.close();
                }
            } catch (error: unknown) {
                return { success: false, error: t('database.sshTunnelFailed', error instanceof Error ? error.message : String(error)) };
            }
        }

        const connectConfig: ConnectionConfig = { ...config, password: pass };
        const adapter = AdapterFactory.create(config.dialect, connectConfig);
        const result = await adapter.testConnection(connectConfig);
        connectConfig.password = undefined;
        return result;
    }

    getAdapter(id: string): DatabaseAdapter | undefined {
        return this.runtimeStates.get(id)?.adapter;
    }

    getState(id: string): ConnectionState {
        return this.runtimeStates.get(id)?.state || 'disconnected';
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
        const adapter = this.runtimeStates.get(id)?.adapter;
        if (!adapter) return undefined;
        return adapter.getPoolStatus();
    }

    private updateConnectionState(id: string, newState: ConnectionState): void {
        const runtime = this.getOrCreateRuntime(id);
        const oldState = runtime.state;
        if (oldState === newState) {
            return;
        }

        runtime.state = newState;
        this._onDidChangeConnectionState.fire({ connectionId: id, oldState, newState });
    }

    private scheduleRetry(id: string): void {
        const maxAttempts = 3;
        const maxDelay = 30000;
        const runtime = this.getOrCreateRuntime(id);
        const attempts = runtime.retryAttempts + 1;
        if (attempts > maxAttempts) {
            return;
        }

        runtime.retryAttempts = attempts;
        const delay = Math.min(Math.pow(2, attempts) * 1000, maxDelay);

        if (runtime.retryTimer) {
            clearTimeout(runtime.retryTimer);
        }

        runtime.retryTimer = setTimeout(async () => {
            runtime.retryTimer = undefined;
            if (runtime.state === 'error') {
                try {
                    await this.connect(id);
                } catch (e) {
                    handleError(e, 'ConnectionManager.retryConnection', ErrorCategory.FEATURE);
                }
            }
        }, delay);
    }

    cancelRetry(id: string): void {
        const runtime = this.runtimeStates.get(id);
        if (!runtime) return;
        if (runtime.retryTimer) {
            clearTimeout(runtime.retryTimer);
            runtime.retryTimer = undefined;
        }
        runtime.retryAttempts = 0;
    }

    private async closeSshTunnel(id: string): Promise<void> {
        const runtime = this.runtimeStates.get(id);
        if (runtime?.sshTunnel) {
            try {
                await runtime.sshTunnel.close();
            } catch (e) {
                handleError(e, 'ConnectionManager.closeSshTunnel', ErrorCategory.FEATURE);
            }
            runtime.sshTunnel = undefined;
        }
    }

    private async handleUnhealthyConnection(id: string, adapter: DatabaseAdapter): Promise<void> {
        this.stopHealthCheck(id);
        try {
            await adapter.disconnect();
        } catch (e) {
            // ignore disconnect error on unhealthy connection; log for debugging
            console.debug('[SQL All in One] ConnectionManager.handleUnhealthyConnection disconnect failed:', e)
        }
        const runtime = this.runtimeStates.get(id);
        if (runtime) {
            runtime.adapter = undefined;
        }
        await this.closeSshTunnel(id);
        this.updateConnectionState(id, 'error');
        this.scheduleRetry(id);
    }

    private startHealthCheck(id: string, config: ConnectionConfig): void {
        this.stopHealthCheck(id);
        const interval = config.poolConfig?.keepAliveInterval ?? 30000;
        const timer = setInterval(async () => {
            const runtime = this.runtimeStates.get(id);
            if (!runtime) {
                this.stopHealthCheck(id);
                return;
            }
            if (runtime.isHealthChecking) {
                return;
            }
            runtime.isHealthChecking = true;
            try {
                const adapter = runtime.adapter;
                if (!adapter) {
                    this.stopHealthCheck(id);
                    return;
                }
                try {
                    const healthy = await adapter.checkConnectionHealth();
                    if (healthy) {
                        runtime.consecutiveHealthFailures = 0;
                    } else {
                        runtime.consecutiveHealthFailures += 1;
                        if (runtime.consecutiveHealthFailures >= 2) {
                            await this.handleUnhealthyConnection(id, adapter);
                        }
                    }
                } catch (e) {
                    runtime.consecutiveHealthFailures += 1;
                    console.warn(`Health check failed for connection ${id}:`, e);
                    if (runtime.consecutiveHealthFailures >= 2) {
                        await this.handleUnhealthyConnection(id, adapter);
                    }
                }
            } finally {
                runtime.isHealthChecking = false;
            }
        }, interval);
        const runtime = this.getOrCreateRuntime(id);
        runtime.healthCheckTimer = timer;
    }

    private stopHealthCheck(id: string): void {
        const runtime = this.runtimeStates.get(id);
        if (runtime) {
            if (runtime.healthCheckTimer) {
                clearInterval(runtime.healthCheckTimer);
                runtime.healthCheckTimer = undefined;
            }
            runtime.consecutiveHealthFailures = 0;
            runtime.isHealthChecking = false;
        }
    }

    async dispose(): Promise<void> {
        for (const runtime of this.runtimeStates.values()) {
            if (runtime.retryTimer) {
                clearTimeout(runtime.retryTimer);
            }
            if (runtime.healthCheckTimer) {
                clearInterval(runtime.healthCheckTimer);
            }
        }

        await Promise.allSettled(
            Array.from(this.runtimeStates.values())
                .filter(r => r.adapter)
                .map(r => r.adapter!.disconnect().catch((_e) => undefined))
        );

        await Promise.allSettled(
            Array.from(this.runtimeStates.values())
                .filter(r => r.sshTunnel)
                .map(r => r.sshTunnel!.close().catch((_e) => undefined))
        );

        this._onDidChangeConnections.dispose();
        this._onDidChangeConnectionState.dispose();
        this._onDidChangeActiveConnection.dispose();

        this.runtimeStates.clear();
    }
}

export function createConnectionManager(): ConnectionManager {
    return new ConnectionManager();
}

export function getConnectionManager(): ConnectionManager {
    return getContainer().get<ConnectionManager>(Tokens.ConnectionManager);
}
