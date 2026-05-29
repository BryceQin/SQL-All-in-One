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
    private static instance: ConnectionStore;
    private readonly configDir: string;
    private readonly configFilePath: string;
    private connections = new Map<string, ConnectionConfig>();
    private groups = new Map<string, ConnectionGroup>();
    private secretStorage: vscode.SecretStorage | null = null;
    
    private constructor() {
        this.configDir = path.join(os.homedir(), '.sql-all-in-one');
        this.configFilePath = path.join(this.configDir, 'connections.json');
        this.initConfigDir();
    }
    
    static getInstance(): ConnectionStore {
        if (!ConnectionStore.instance) {
            const container = getContainer();
            if (container.hasInstance(Tokens.ConnectionStore)) {
                ConnectionStore.instance = container.get<ConnectionStore>(Tokens.ConnectionStore);
            } else {
                ConnectionStore.instance = new ConnectionStore();
                container.register(Tokens.ConnectionStore, ConnectionStore.instance);
            }
        }
        return ConnectionStore.instance;
    }

    static resetInstance(): void {
        ConnectionStore.instance = undefined as unknown as ConnectionStore;
    }
    
    setSecretStorage(secretStorage: vscode.SecretStorage): void {
        this.secretStorage = secretStorage;
    }
    
    private initConfigDir(): void {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
            this.writeDefaultConfig();
        }
    }
    
    private writeDefaultConfig(): void {
        const defaultConfig: ConnectionsFile = {
            version: 1,
            groups: [],
            connections: []
        };
        this.saveToFile(defaultConfig);
    }
    
    private saveToFile(data: ConnectionsFile): void {
        const dataStr = JSON.stringify(data, null, 2);
        fs.writeFileSync(this.configFilePath, dataStr, 'utf8');
        try {
            fs.chmodSync(this.configFilePath, 0o600);
        } catch {
            console.warn('Could not set file permissions for connections.json');
        }
    }
    
    private loadFromFile(): ConnectionsFile {
        if (!fs.existsSync(this.configFilePath)) {
            this.writeDefaultConfig();
        }
        try {
            const content = fs.readFileSync(this.configFilePath, 'utf8');
            const data = JSON.parse(content) as ConnectionsFile;
            return data;
        } catch (e) {
            console.error('Error loading connections:', e);
            return {
                version: 1,
                groups: [],
                connections: []
            };
        }
    }
    
    async load(): Promise<void> {
        const data = this.loadFromFile();
        this.groups.clear();
        data.groups.forEach(group => {
            this.groups.set(group.name, group);
        });
        this.connections.clear();
        data.connections.forEach(conn => {
            this.connections.set(conn.id, conn);
        });
    }
    
    async save(): Promise<void> {
        const data: ConnectionsFile = {
            version: 1,
            groups: Array.from(this.groups.values()),
            connections: Array.from(this.connections.values()).map(conn => ({
                ...conn,
                password: undefined
            }))
        };
        this.saveToFile(data);
    }
    
    async addConnection(config: ConnectionConfig, password?: string): Promise<void> {
        this.connections.set(config.id, config);
        if (password && this.secretStorage) {
            await this.secretStorage.store(`sql-all-in-one.password.${config.id}`, password);
        }
        if (config.ssh?.password && this.secretStorage) {
            await this.secretStorage.store(`sql-all-in-one.ssh.password.${config.id}`, config.ssh.password);
        }
        if (config.ssh?.passphrase && this.secretStorage) {
            await this.secretStorage.store(`sql-all-in-one.ssh.passphrase.${config.id}`, config.ssh.passphrase);
        }
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
        this.connections.set(id, config);
        if (password !== undefined && this.secretStorage) {
            if (password) {
                await this.secretStorage.store(`sql-all-in-one.password.${id}`, password);
            } else {
                await this.secretStorage.delete(`sql-all-in-one.password.${id}`);
            }
        }
        if (config.ssh?.password !== undefined && this.secretStorage) {
            if (config.ssh.password) {
                await this.secretStorage.store(`sql-all-in-one.ssh.password.${id}`, config.ssh.password);
            } else {
                await this.secretStorage.delete(`sql-all-in-one.ssh.password.${id}`);
            }
        }
        if (config.ssh?.passphrase !== undefined && this.secretStorage) {
            if (config.ssh.passphrase) {
                await this.secretStorage.store(`sql-all-in-one.ssh.passphrase.${id}`, config.ssh.passphrase);
            } else {
                await this.secretStorage.delete(`sql-all-in-one.ssh.passphrase.${id}`);
            }
        }
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
            connections: Array.from(this.connections.values())
        };
        
        if (!includePasswords) {
            data.connections = data.connections.map(conn => ({
                ...conn,
                password: undefined
            }));
        }
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
    
    async importConnections(filePath: string): Promise<{ added: number; skipped: number }> {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content) as ConnectionsFile;
        
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
                
                while (Array.from(this.connections.values()).some(c => c.name === name)) {
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
