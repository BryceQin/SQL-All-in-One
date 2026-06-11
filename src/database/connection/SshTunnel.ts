import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client, ClientChannel } from 'ssh2';
import type { SshConfig } from './ConnectionConfig';
import { t } from '../../i18n';

export interface SshConnectOptions {
    host: string;
    port: number;
    username: string | undefined;
    password?: string;
    privateKey?: Buffer | string;
    passphrase?: string;
    readyTimeout: number;
}

export interface TunnelResult {
    localHost: string;
    localPort: number;
}

export class SshTunnel {
    private client: Client | null = null;
    private server: net.Server | null = null;
    private _localPort = 0;
    private _isOpen = false;
    private activeSockets = new Set<net.Socket>();

    async open(
        sshConfig: SshConfig,
        targetHost: string,
        targetPort: number,
        timeout?: number
    ): Promise<TunnelResult> {
        if (this._isOpen) {
            return { localHost: '127.0.0.1', localPort: this._localPort };
        }

        const client = new Client();

        const connectOptions: SshConnectOptions = {
            host: sshConfig.host!,
            port: sshConfig.port || 22,
            username: sshConfig.username,
            readyTimeout: timeout ?? 15000,
        };

        if (sshConfig.authentication === 'privateKey' && sshConfig.privateKey) {
            const validatedPath = await this.validateKeyPath(sshConfig.privateKey);
            connectOptions.privateKey = await fs.promises.readFile(validatedPath);
            if (sshConfig.passphrase) {
                connectOptions.passphrase = sshConfig.passphrase;
            }
        } else if (sshConfig.password) {
            connectOptions.password = sshConfig.password;
        }

        await new Promise<void>((resolve, reject) => {
            const onError = (err: Error): void => {
                if (err.message.includes('ECONNREFUSED')) {
                    reject(new Error(t('ssh.connectionRefused')));
                } else if (
                    err.message.includes('All configured authentication methods failed') ||
                    err.message.includes('Authentication failed')
                ) {
                    reject(new Error(t('ssh.authFailed')));
                } else if (err.message.includes('Cannot parse privateKey')) {
                    reject(new Error(t('ssh.keyFormatError')));
                } else {
                    reject(new Error(t('ssh.connectionError', err.message)));
                }
            };

            client.on('ready', () => {
                client.removeListener('error', onError);
                resolve();
            });

            client.on('error', onError);

            client.connect(connectOptions);
        });

        this.client = client;

        const server = net.createServer((socket) => {
            this.activeSockets.add(socket);
            socket.on('close', () => this.activeSockets.delete(socket));

            client.forwardOut(
                socket.remoteAddress || '127.0.0.1',
                socket.remotePort || 0,
                targetHost,
                targetPort,
                (err, channel: ClientChannel) => {
                    if (err) {
                        socket.destroy();
                        return;
                    }
                    socket.pipe(channel);
                    channel.pipe(socket);
                    socket.on('close', () => channel.close());
                    channel.on('close', () => socket.destroy());
                    socket.on('error', () => channel.close());
                    channel.on('error', () => socket.destroy());
                }
            );
        });

        await new Promise<void>((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                resolve();
            });
            server.on('error', (err) => {
                reject(new Error(`Port forwarding failed: ${err.message}. Check target database address and port.`));
            });
        });

        const addr = server.address() as net.AddressInfo;
        this._localPort = addr.port;
        this.server = server;
        this._isOpen = true;

        return { localHost: '127.0.0.1', localPort: this._localPort };
    }

    async close(): Promise<void> {
        for (const socket of this.activeSockets) {
            socket.destroy();
        }
        this.activeSockets.clear();

        if (this.server) {
            await new Promise<void>((resolve) => {
                if (this.server) {
                    this.server.close(() => resolve());
                } else {
                    resolve();
                }
            });
            this.server = null;
        }

        if (this.client) {
            this.client.end();
            this.client = null;
        }

        this._isOpen = false;
        this._localPort = 0;
    }

    getLocalPort(): number {
        return this._localPort;
    }

    private async validateKeyPath(keyPath: string): Promise<string> {
        const resolved = path.resolve(keyPath);
        let realPath: string;
        try {
            realPath = await fs.promises.realpath(resolved);
        } catch {
            throw new Error(`SSH private key path does not exist: ${keyPath}`);
        }
        const homeDir = os.homedir();
        const allowedDirs = [
            homeDir,
            path.join(homeDir, '.ssh'),
            '/etc/ssh',
        ];
        const realAllowedDirs: string[] = [];
        for (const dir of allowedDirs) {
            try {
                realAllowedDirs.push(await fs.promises.realpath(dir));
            } catch {
                realAllowedDirs.push(dir);
            }
        }
        const isAllowed = realAllowedDirs.some(allowedDir => {
            const relative = path.relative(allowedDir, realPath);
            return !relative.startsWith('..') && !path.isAbsolute(relative);
        });
        if (!isAllowed) {
            throw new Error(`SSH private key path not allowed: ${keyPath}. Key must be located in your home directory, .ssh folder, or /etc/ssh.`);
        }
        return realPath;
    }

    isOpen(): boolean {
        return this._isOpen;
    }
}
