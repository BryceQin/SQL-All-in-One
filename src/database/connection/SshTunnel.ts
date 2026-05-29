import * as net from 'net';
import * as fs from 'fs';
import { Client, ClientChannel } from 'ssh2';
import type { SshConfig } from './ConnectionConfig';

export interface TunnelResult {
    localHost: string;
    localPort: number;
}

export class SshTunnel {
    private client: Client | null = null;
    private server: net.Server | null = null;
    private _localPort = 0;
    private _isOpen = false;

    async open(
        sshConfig: SshConfig,
        targetHost: string,
        targetPort: number
    ): Promise<TunnelResult> {
        if (this._isOpen) {
            return { localHost: '127.0.0.1', localPort: this._localPort };
        }

        const client = new Client();

        const connectOptions: any = {
            host: sshConfig.host,
            port: sshConfig.port || 22,
            username: sshConfig.username,
            readyTimeout: 10000,
        };

        if (sshConfig.authentication === 'privateKey' && sshConfig.privateKey) {
            connectOptions.privateKey = fs.readFileSync(sshConfig.privateKey);
            if (sshConfig.passphrase) {
                connectOptions.passphrase = sshConfig.passphrase;
            }
        } else if (sshConfig.password) {
            connectOptions.password = sshConfig.password;
        }

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('SSH connection timeout. Check SSH server address and port.'));
            }, 15000);

            client.on('ready', () => {
                clearTimeout(timeout);
                resolve();
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                if (err.message.includes('ECONNREFUSED')) {
                    reject(new Error('SSH connection refused. Check SSH server address and port.'));
                } else if (
                    err.message.includes('All configured authentication methods failed') ||
                    err.message.includes('Authentication failed')
                ) {
                    reject(new Error('SSH authentication failed. Check username and password/key.'));
                } else if (err.message.includes('Cannot parse privateKey')) {
                    reject(new Error('SSH private key format error. Check the key file format.'));
                } else {
                    reject(new Error(`SSH connection error: ${err.message}`));
                }
            });

            client.connect(connectOptions);
        });

        this.client = client;

        const server = net.createServer((socket) => {
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

    isOpen(): boolean {
        return this._isOpen;
    }
}
