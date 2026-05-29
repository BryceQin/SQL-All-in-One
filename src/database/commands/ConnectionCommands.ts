import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { ConnectionConfig, SSLConfig, SshConfig } from '../connection/ConnectionConfig';
import { DatabaseTreeProvider } from '../../views/databaseExplorer/DatabaseTreeProvider';
import { ConnectionTreeNode } from '../../views/databaseExplorer/treeNodes';

const DIALECT_DEFAULT_PORTS: Record<string, number> = {
    mysql: 3306,
    hive: 10000,
    spark: 10001,
    flinksql: 8083,
    postgresql: 5432,
    bigquery: 443,
    sqlite: 0
};

const DIALECT_DEFAULT_USERNAMES: Record<string, string> = {
    mysql: 'root',
    hive: 'hive',
    spark: 'spark',
    flinksql: 'flink',
    postgresql: 'postgres',
    bigquery: 'bigquery',
    sqlite: ''
};

const DIALECT_OPTIONS = ['mysql', 'hive', 'spark', 'flinksql', 'postgresql', 'bigquery', 'sqlite'];

export function registerConnectionCommands(
    _context: vscode.ExtensionContext,
    treeProvider: DatabaseTreeProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.addConnection', async () => {
            // Step 1: Connection name (required)
            const name = await vscode.window.showInputBox({
                prompt: 'Step 1/9: Connection name',
                placeHolder: 'My Database',
                validateInput: (value) => {
                    if (!value || !value.trim()) {
                        return 'Connection name is required';
                    }
                    return undefined;
                }
            });
            if (!name) {
                return;
            }

            // Step 2: Dialect selection
            const dialect = await vscode.window.showQuickPick(
                DIALECT_OPTIONS.map(d => ({ label: d, description: `Default port: ${DIALECT_DEFAULT_PORTS[d] || 3306}` })),
                {
                    placeHolder: 'Step 2/9: Select database dialect'
                }
            );
            if (!dialect) {
                return;
            }
            const selectedDialect = dialect.label;

            // For SQLite, skip host/port/username
            if (selectedDialect === 'sqlite') {
                const database = await vscode.window.showInputBox({
                    prompt: 'Step 3/9: Database file path',
                    placeHolder: '/path/to/database.db',
                    validateInput: (value) => {
                        if (!value || !value.trim()) {
                            return 'Database file path is required for SQLite';
                        }
                        return undefined;
                    }
                });
                if (database === undefined) {
                    return;
                }

                const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
                const config: ConnectionConfig = {
                    id,
                    name: name.trim(),
                    dialect: selectedDialect,
                    host: 'localhost',
                    port: 0,
                    username: '',
                    database: database.trim()
                };

                try {
                    await getConnectionManager().addConnection(config, undefined);
                    treeProvider.refresh();
                    vscode.window.showInformationMessage(`Connection "${name}" added successfully`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to add connection: ${error}`);
                }
                return;
            }

            // Step 3: Host (defaults to localhost if empty)
            const host = await vscode.window.showInputBox({
                prompt: 'Step 3/9: Host (leave empty for localhost)',
                value: 'localhost',
                placeHolder: 'localhost'
            });
            if (host === undefined) {
                return;
            }

            // Step 4: Port with validation
            const defaultPort = DIALECT_DEFAULT_PORTS[selectedDialect] || 3306;
            const portInput = await vscode.window.showInputBox({
                prompt: 'Step 4/9: Port',
                value: String(defaultPort),
                placeHolder: String(defaultPort),
                validateInput: (value) => {
                    if (!value || !value.trim()) {
                        return 'Port is required';
                    }
                    const num = parseInt(value.trim(), 10);
                    if (isNaN(num) || num < 0 || num > 65535) {
                        return 'Port must be a number between 0 and 65535';
                    }
                    return undefined;
                }
            });
            if (portInput === undefined) {
                return;
            }
            const port = parseInt(portInput.trim(), 10);

            // Step 5: Username with dialect-specific default
            const defaultUsername = DIALECT_DEFAULT_USERNAMES[selectedDialect] || 'root';
            const username = await vscode.window.showInputBox({
                prompt: 'Step 5/9: Username',
                value: defaultUsername,
                placeHolder: defaultUsername
            });
            if (username === undefined) {
                return;
            }

            // Step 6: Password
            const password = await vscode.window.showInputBox({
                prompt: 'Step 6/9: Password',
                password: true,
                placeHolder: 'Enter password (optional)'
            });
            if (password === undefined) {
                return;
            }

            // Step 7: Database (optional)
            const database = await vscode.window.showInputBox({
                prompt: 'Step 7/9: Database name (optional)',
                placeHolder: 'mydb'
            });
            if (database === undefined) {
                return;
            }

            // Step 8: SSL configuration
            const sslChoice = await vscode.window.showQuickPick(
                [
                    { label: 'No', description: 'Connect without SSL', value: false },
                    { label: 'Yes', description: 'Enable SSL connection', value: true }
                ],
                {
                    placeHolder: 'Step 8/9: Enable SSL?'
                }
            );
            if (sslChoice === undefined) {
                return;
            }

            let sslConfig: SSLConfig | undefined;
            if (sslChoice.value) {
                const rejectUnauthorized = await vscode.window.showQuickPick(
                    [
                        { label: 'Yes (recommended)', description: 'Reject unauthorized certificates', value: true },
                        { label: 'No', description: 'Allow self-signed certificates', value: false }
                    ],
                    {
                        placeHolder: 'Reject unauthorized SSL certificates?'
                    }
                );
                if (rejectUnauthorized === undefined) {
                    return;
                }
                sslConfig = {
                    enabled: true,
                    rejectUnauthorized: rejectUnauthorized.value
                };
            }

            // Step 9: SSH tunnel configuration
            const sshChoice = await vscode.window.showQuickPick(
                [
                    { label: 'No', description: 'Connect directly', value: false },
                    { label: 'Yes', description: 'Use SSH tunnel', value: true }
                ],
                {
                    placeHolder: 'Step 9/9: Enable SSH tunnel?'
                }
            );
            if (sshChoice === undefined) {
                return;
            }

            let sshConfig: SshConfig | undefined;
            if (sshChoice.value) {
                const sshHost = await vscode.window.showInputBox({
                    prompt: 'SSH tunnel host',
                    placeHolder: 'ssh.example.com',
                    validateInput: (value) => {
                        if (!value || !value.trim()) {
                            return 'SSH host is required';
                        }
                        return undefined;
                    }
                });
                if (sshHost === undefined) {
                    return;
                }

                const sshPortInput = await vscode.window.showInputBox({
                    prompt: 'SSH tunnel port',
                    value: '22',
                    placeHolder: '22',
                    validateInput: (value) => {
                        const num = parseInt(value.trim(), 10);
                        if (isNaN(num) || num < 1 || num > 65535) {
                            return 'Port must be a number between 1 and 65535';
                        }
                        return undefined;
                    }
                });
                if (sshPortInput === undefined) {
                    return;
                }

                const sshUsername = await vscode.window.showInputBox({
                    prompt: 'SSH tunnel username',
                    placeHolder: 'user',
                    validateInput: (value) => {
                        if (!value || !value.trim()) {
                            return 'SSH username is required';
                        }
                        return undefined;
                    }
                });
                if (sshUsername === undefined) {
                    return;
                }

                const sshAuthMethod = await vscode.window.showQuickPick(
                    [
                        { label: 'Password', description: 'Authenticate with password', value: 'password' as const },
                        { label: 'Private Key', description: 'Authenticate with private key file', value: 'privateKey' as const }
                    ],
                    {
                        placeHolder: 'SSH authentication method'
                    }
                );
                if (sshAuthMethod === undefined) {
                    return;
                }

                let sshPassword: string | undefined;
                let sshPrivateKey: string | undefined;

                if (sshAuthMethod.value === 'password') {
                    sshPassword = await vscode.window.showInputBox({
                        prompt: 'SSH password',
                        password: true,
                        placeHolder: 'Enter SSH password'
                    });
                    if (sshPassword === undefined) {
                        return;
                    }
                } else {
                    sshPrivateKey = await vscode.window.showInputBox({
                        prompt: 'SSH private key path',
                        placeHolder: '~/.ssh/id_rsa',
                        validateInput: (value) => {
                            if (!value || !value.trim()) {
                                return 'Private key path is required';
                            }
                            return undefined;
                        }
                    });
                    if (sshPrivateKey === undefined) {
                        return;
                    }
                }

                const sshPassphrase = await vscode.window.showInputBox({
                    prompt: 'SSH passphrase (leave empty if none)',
                    password: true,
                    placeHolder: 'Optional passphrase for private key'
                });
                if (sshPassphrase === undefined) {
                    return;
                }

                sshConfig = {
                    enabled: true,
                    host: sshHost.trim(),
                    port: parseInt(sshPortInput.trim(), 10),
                    username: sshUsername.trim(),
                    authentication: sshAuthMethod.value,
                    password: sshPassword || undefined,
                    privateKey: sshPrivateKey || undefined,
                    passphrase: sshPassphrase || undefined
                };
            }

            const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

            const config: ConnectionConfig = {
                id,
                name: name.trim(),
                dialect: selectedDialect,
                host: host || 'localhost',
                port,
                username: username || defaultUsername,
                database: database || undefined,
                ssl: sslConfig,
                ssh: sshConfig
            };

            try {
                await getConnectionManager().addConnection(config, password || undefined);
                treeProvider.refresh();
                vscode.window.showInformationMessage(`Connection "${name}" added successfully`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to add connection: ${error}`);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.editConnection', async (node?: ConnectionTreeNode) => {
            const manager = getConnectionManager();
            let connectionId: string | undefined;

            if (node) {
                connectionId = node.connectionId;
            } else {
                const connections = manager.getAllConnections();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage('No connections available');
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map(c => ({ label: c.name, id: c.id })),
                    { placeHolder: 'Select a connection to edit' }
                );
                if (!picked) {
                    return;
                }
                connectionId = picked.id;
            }

            const currentConfig = manager.getAllConnections().find(c => c.id === connectionId);
            if (!currentConfig) {
                vscode.window.showErrorMessage('Connection not found');
                return;
            }

            const fields = [
                { label: 'Name', field: 'name' as const },
                { label: 'Host', field: 'host' as const },
                { label: 'Port', field: 'port' as const },
                { label: 'Username', field: 'username' as const },
                { label: 'Database', field: 'database' as const },
                { label: 'Group', field: 'group' as const }
            ];

            const selected = await vscode.window.showQuickPick(
                fields.map(f => ({ label: f.label, field: f.field, description: String(currentConfig![f.field] ?? '') })),
                { placeHolder: 'Select field to edit' }
            );
            if (!selected) {
                return;
            }

            const currentValue = String(currentConfig[selected.field] ?? '');
            const newValue = await vscode.window.showInputBox({
                prompt: `Edit ${selected.label}`,
                value: currentValue,
                placeHolder: selected.label
            });
            if (newValue === undefined) {
                return;
            }

            const updatedConfig: ConnectionConfig = { ...currentConfig };
            if (selected.field === 'port') {
                const port = parseInt(newValue, 10);
                if (isNaN(port)) {
                    vscode.window.showErrorMessage('Invalid port number');
                    return;
                }
                updatedConfig.port = port;
            } else {
                const value = newValue || undefined;
                switch (selected.field) {
                    case 'name': updatedConfig.name = value as string; break;
                    case 'host': updatedConfig.host = value as string; break;
                    case 'username': updatedConfig.username = value as string; break;
                    case 'database': updatedConfig.database = value; break;
                    case 'group': updatedConfig.group = value; break;
                }
            }

            try {
                await manager.updateConnection(connectionId, updatedConfig);
                treeProvider.refresh();
                vscode.window.showInformationMessage(`Connection "${updatedConfig.name}" updated`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to update connection: ${error}`);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.removeConnection', async (node?: ConnectionTreeNode) => {
            const manager = getConnectionManager();
            let connectionId: string | undefined;
            let connectionName: string | undefined;

            if (node) {
                connectionId = node.connectionId;
                connectionName = node.connectionName;
            } else {
                const connections = manager.getAllConnections();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage('No connections available');
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map(c => ({ label: c.name, id: c.id })),
                    { placeHolder: 'Select a connection to remove' }
                );
                if (!picked) {
                    return;
                }
                connectionId = picked.id;
                connectionName = picked.label;
            }

            const confirmed = await vscode.window.showWarningMessage(
                `Are you sure you want to remove connection "${connectionName}"?`,
                { modal: true },
                'Remove'
            );
            if (confirmed !== 'Remove') {
                return;
            }

            try {
                await manager.removeConnection(connectionId);
                treeProvider.refresh();
                vscode.window.showInformationMessage(`Connection "${connectionName}" removed`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to remove connection: ${error}`);
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.connect', async (node?: ConnectionTreeNode) => {
            if (node) {
                try {
                    await getConnectionManager().connect(node.connectionId);
                    vscode.window.showInformationMessage(`Connected to ${node.connectionName}`);
                    treeProvider.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to connect: ${error}`);
                }
            } else {
                vscode.window.showInformationMessage('Select a connection first');
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.disconnect', async (node?: ConnectionTreeNode) => {
            if (node) {
                try {
                    await getConnectionManager().disconnect(node.connectionId);
                    vscode.window.showInformationMessage(`Disconnected from ${node.connectionName}`);
                    treeProvider.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to disconnect: ${error}`);
                }
            } else {
                vscode.window.showInformationMessage('Select a connection first');
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('sql-all-in-one.testConnection', async (node?: ConnectionTreeNode) => {
            const manager = getConnectionManager();
            let connectionId: string | undefined;

            if (node) {
                connectionId = node.connectionId;
            } else {
                const connections = manager.getAllConnections();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage('No connections available');
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map(c => ({ label: c.name, id: c.id })),
                    { placeHolder: 'Select a connection to test' }
                );
                if (!picked) {
                    return;
                }
                connectionId = picked.id;
            }

            try {
                const result = await manager.testConnection(connectionId);
                if (result.success) {
                    const parts: string[] = ['Connection successful'];
                    if (result.serverVersion) {
                        parts.push(`Server version: ${result.serverVersion}`);
                    }
                    if (result.latency !== undefined) {
                        parts.push(`Latency: ${result.latency}ms`);
                    }
                    vscode.window.showInformationMessage(parts.join(' | '));
                } else {
                    vscode.window.showErrorMessage(`Connection failed: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Test connection failed: ${error}`);
            }
        })
    );

    return disposables;
}
