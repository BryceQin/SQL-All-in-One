import type * as vscode from 'vscode';
import type { DIContainer } from './diContainer';

/**
 * Creates a lazy provider factory that defers service instantiation until first
 * use.
 *
 * Wraps the DI container's `get` method with lazy initialization and automatic
 * subscription management. The returned getter caches the instance on first
 * access and registers it with the extension context for proper disposal.
 *
 * @typeParam T - The type of the service to be provided
 * @param container - The DI container to resolve dependencies from
 * @param token - The token string used to register the service in the container
 * @param context - The VSCode extension context for subscription management
 * @returns A getter function that returns the cached service instance
 */
export function createLazyProvider<T>(
    container: DIContainer,
    token: string,
    context: vscode.ExtensionContext,
): () => T {
    let instance: T | undefined;
    return () => {
        if (!instance) {
            instance = container.get<T>(token);
            if (instance) {
                context.subscriptions.push(instance as unknown as vscode.Disposable);
            }
        }
        return instance;
    };
}
