import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionGroup } from './ConnectionConfig';
import { getContainer, Tokens } from '../../core/diContainer';

interface ConnectionsFile {
    version: number;
    groups: ConnectionGroup[];
    connections: ConnectionConfig[];
}

export class ConnectionStore {
    private readonly configDir: string;
    private readonly configFilePath: string;
    private connections = new Map<string, ConnectionConfig>();
    private groups = new Map<string, ConnectionGroup>();
    private secretStorage: vscode.SecretStorage | null = null;

    constructor() {
        this.configDir = path.join(os.homedir(), '.sql-all-in-one');
        this.configFilePath = path.join(this.configDir, 'connections.json');
    }

    async init(): Promise<void> {
        await this.initConfigDir();
    }

    setSecretStorage(secretStorage: vscode.SecretStorage): void {
        this.secretStorage = secretStorage;
    }

    private async initConfigDir(): Promise<void> {
        try {
            await fs.promises.access(this.configDir);
        } catch {
            await fs.promises.mkdir(this.configDir, { recursive: true });
            await this.writeDefaultConfig();
        }
    }

    private async writeDefaultConfig(): Promise<void> {
        const defaultConfig: ConnectionsFile = {
            version: 1,
            groups: [],
            connections: [],
        };
        await this.saveToFile(defaultConfig);
    }

    private async saveToFile(data: ConnectionsFile): Promise<void> {
        const dataStr = JSON.stringify(data, null, 2);
        await fs.promises.writeFile(this.configFilePath, dataStr, 'utf8');
        try {
            await fs.promises.chmod(this.configFilePath, 0o600);
        } catch {
            console.warn('Could not set file permissions for connections.json');
        }
    }

    private async loadFromFile(): Promise<ConnectionsFile> {
        try {
            await fs.promises.access(this.configFilePath);
        } catch {
            await this.writeDefaultConfig();
        }
        try {
            const content = await fs.promises.readFile(this.configFilePath, 'utf8');
            const data = JSON.parse(content) as ConnectionsFile;
            return data;
        } catch (e) {
            console.error('Error loading connections:', e);
            return {
                version: 1,
                groups: [],
                connections: [],
            };
        }
    }

    async load(): Promise<void> {
        const data = await this.loadFromFile();
        this.groups.clear();
        data.groups.forEach((group) => {
            this.groups.set(group.name, group);
        });
        this.connections.clear();
        data.connections.forEach((conn) => {
            this.connections.set(conn.id, conn);
        });
    }

    async save(): Promise<void> {
        const data: ConnectionsFile = {
            version: 1,
            groups: Array.from(this.groups.values()),
            connections: Array.from(this.connections.values()).map((conn) => ({
                ...conn,
                password: undefined,
            })),
        };
        await this.saveToFile(data);
    }

    async addConnection(config: ConnectionConfig, password?: string): Promise<void> {
        if (password && this.secretStorage) {
            await this.secretStorage.store(
                `sql-all-in-one.password.${config.id}`,
                password
            );
        }
        if (config.ssh?.password && this.secretStorage) {
            await this.secretStorage.store(
                `sql-all-in-one.ssh.password.${config.id}`,
                config.ssh.password
            );
        }
        if (config.ssh?.passphrase && this.secretStorage) {
            await this.secretStorage.store(
                `sql-all-in-one.ssh.passphrase.${config.id}`,
                config.ssh.passphrase
            );
        }
        const safeConfig = { ...config, password: undefined };
        if (safeConfig.ssh) {
            safeConfig.ssh = { ...safeConfig.ssh, password: undefined, passphrase: undefined };
        }
        this.connections.set(config.id, safeConfig);
        await this.save();
    }

    async removeConnection(id: string): Promise<void> {
        this.connections.delete(id);
        if (this.secretStorage) {
            await this.secretStorage.delete(`sql-all-in-one.password.${id}`);
            await this.secretStorage.delete(`sql-all-in-one.ssh.password.${id}`);
            await this.secretStorage.delete(`sql-all-in-one.ssh.passphrase.${id}`);
        }
        await this.save();
    }

    async updateConnection(id: string, config: ConnectionConfig, password?: string): Promise<void> {
        if (password !== undefined && this.secretStorage) {
            if (password) {
                await this.secretStorage.store(
                    `sql-all-in-one.password.${id}`,
                    password
                );
            } else {
                await this.secretStorage.delete(`sql-all-in-one.password.${id}`);
            }
        }
        if (config.ssh?.password !== undefined && this.secretStorage) {
            if (config.ssh.password) {
                await this.secretStorage.store(
                    `sql-all-in-one.ssh.password.${id}`,
                    config.ssh.password
                );
            } else {
                await this.secretStorage.delete(`sql-all-in-one.ssh.password.${id}`);
            }
        }
        if (config.ssh?.passphrase !== undefined && this.secretStorage) {
            if (config.ssh.passphrase) {
                await this.secretStorage.store(
                    `sql-all-in-one.ssh.passphrase.${id}`,
                    config.ssh.passphrase
                );
            } else {
                await this.secretStorage.delete(`sql-all-in-one.ssh.passphrase.${id}`);
            }
        }
        const safeConfig = { ...config, password: undefined };
        if (safeConfig.ssh) {
            safeConfig.ssh = { ...safeConfig.ssh, password: undefined, passphrase: undefined };
        }
        this.connections.set(id, safeConfig);
        await this.save();
    }

    getConnections(): ConnectionConfig[] {
        return Array.from(this.connections.values());
    }

    getConnection(id: string): ConnectionConfig | undefined {
        return this.connections.get(id);
    }

    async getPassword(id: string): Promise<string | undefined> {
        if (this.secretStorage) {
            return await this.secretStorage.get(`sql-all-in-one.password.${id}`);
        }
        return undefined;
    }

    async getSshPassword(id: string): Promise<string | undefined> {
        if (this.secretStorage) {
            return await this.secretStorage.get(`sql-all-in-one.ssh.password.${id}`);
        }
        return undefined;
    }

    async getSshPassphrase(id: string): Promise<string | undefined> {
        if (this.secretStorage) {
            return await this.secretStorage.get(`sql-all-in-one.ssh.passphrase.${id}`);
        }
        return undefined;
    }

    getGroups(): ConnectionGroup[] {
        return Array.from(this.groups.values());
    }

    async addGroup(group: ConnectionGroup): Promise<void> {
        this.groups.set(group.name, group);
        await this.save();
    }

    async removeGroup(name: string): Promise<void> {
        this.groups.delete(name);
        await this.save();
    }

    async updateGroup(name: string, group: ConnectionGroup): Promise<void> {
        this.groups.delete(name);
        this.groups.set(group.name, group);
        await this.save();
    }

    async exportConnections(filePath: string, includePasswords = false): Promise<void> {
        const data: ConnectionsFile = {
            version: 1,
            groups: Array.from(this.groups.values()),
            connections: Array.from(this.connections.values()),
        };

        if (!includePasswords) {
            data.connections = data.connections.map((conn) => ({
                ...conn,
                password: undefined,
                ssh: conn.ssh ? {
                    ...conn.ssh,
                    password: undefined,
                    passphrase: undefined,
                } : undefined,
            }));
        }

        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        if (process.platform !== 'win32') {
            try {
                await fs.promises.chmod(filePath, 0o600);
            } catch {
                console.warn('Could not set file permissions for exported connections file');
            }
        }
    }

    private validateImportData(data: unknown): { valid: boolean; data: ConnectionsFile | null; errors: string[] } {
        const errors: string[] = [];

        if (!data || typeof data !== 'object') {
            return { valid: false, data: null, errors: ['Imported data is not a valid object'] };
        }

        const obj = data as Record<string, unknown>;

        if (typeof obj.version !== 'number') {
            errors.push('Missing or invalid "version" field');
        }

        if (!Array.isArray(obj.groups)) {
            errors.push('Missing or invalid "groups" field');
        } else {
            for (const group of obj.groups) {
                if (!group || typeof group !== 'object') {
                    errors.push('Invalid group entry');
                    continue;
                }
                const g = group as Record<string, unknown>;
                if (typeof g.name !== 'string' || typeof g.color !== 'string') {
                    errors.push(`Invalid group: missing "name" or "color"`);
                }
            }
        }

        if (!Array.isArray(obj.connections)) {
            errors.push('Missing or invalid "connections" field');
        } else {
            for (const conn of obj.connections) {
                if (!conn || typeof conn !== 'object') {
                    errors.push('Invalid connection entry');
                    continue;
                }
                const c = conn as Record<string, unknown>;
                if (typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.dialect !== 'string') {
                    errors.push(`Invalid connection "${c.name || c.id || 'unknown'}": missing required fields (id, name, dialect)`);
                }
                if (typeof c.host !== 'string' || typeof c.port !== 'number' || typeof c.username !== 'string') {
                    errors.push(`Invalid connection "${c.name || c.id || 'unknown'}": missing required fields (host, port, username)`);
                }
            }
        }

        if (errors.length > 0) {
            return { valid: false, data: null, errors };
        }

        return { valid: true, data: obj as unknown as ConnectionsFile, errors: [] };
    }

    async importConnections(filePath: string): Promise<{ added: number; skipped: number }> {
        const content = await fs.promises.readFile(filePath, 'utf8');
        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (_e) {
            throw new Error('Failed to parse connections file: invalid JSON');
        }

        const validation = this.validateImportData(parsed);
        if (!validation.valid || !validation.data) {
            throw new Error(`Invalid connections file format:\n${validation.errors.join('\n')}`);
        }

        const data = validation.data;
        let added = 0;
        let skipped = 0;

        for (const group of data.groups) {
            if (!this.groups.has(group.name)) {
                this.groups.set(group.name, group);
            }
        }

        for (const conn of data.connections) {
            if (!this.connections.has(conn.id)) {
                const newId = conn.id;
                let counter = 1;
                let name = conn.name;

                while (
                    Array.from(this.connections.values()).some((c) => c.name === name)
                ) {
                    name = `${conn.name} (${counter})`;
                    counter++;
                }

                const newConn = { ...conn, id: newId, name };
                this.connections.set(newId, newConn);
                added++;
            } else {
                skipped++;
            }
        }

        await this.save();
        return { added, skipped };
    }
}

export function createConnectionStore(): ConnectionStore {
    return new ConnectionStore();
}

export function getConnectionStore(): ConnectionStore {
    return getContainer().get<ConnectionStore>(Tokens.ConnectionStore);
}
