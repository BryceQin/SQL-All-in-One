import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface WebviewPanelConfig {
    viewType: string;
    title: string;
    htmlFileName: string;
    cssFileName: string;
    jsFileName: string;
    additionalResourceRoots?: vscode.Uri[];
}

export abstract class BaseWebviewPanel implements vscode.Disposable {
    private static readonly _instances = new Map<string, BaseWebviewPanel>();

    protected readonly _panel: vscode.WebviewPanel;
    protected readonly _extensionUri: vscode.Uri;
    protected _disposables: vscode.Disposable[] = [];
    protected _cachedHtml: string | undefined;
    private _isDisposed = false;

    protected abstract readonly panelConfig: WebviewPanelConfig;

    protected constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    protected static getExistingInstance<T extends BaseWebviewPanel>(viewType: string): T | undefined {
        const instance = BaseWebviewPanel._instances.get(viewType);
        return instance as T | undefined;
    }

    protected static registerInstance(instance: BaseWebviewPanel): void {
        BaseWebviewPanel._instances.set(instance.panelConfig.viewType, instance);
    }

    protected static unregisterInstance(viewType: string): void {
        BaseWebviewPanel._instances.delete(viewType);
    }

    protected static hasInstance(viewType: string): boolean {
        return BaseWebviewPanel._instances.has(viewType);
    }

    protected static revealExisting(viewType: string, viewColumn?: vscode.ViewColumn): boolean {
        const instance = BaseWebviewPanel._instances.get(viewType);
        if (instance && !instance._isDisposed) {
            instance._panel.reveal(viewColumn);
            return true;
        }
        return false;
    }

    protected static createWebviewPanel(
        viewType: string,
        title: string,
        extensionUri: vscode.Uri,
        options?: {
            viewColumn?: vscode.ViewColumn;
            additionalResourceRoots?: vscode.Uri[];
        }
    ): vscode.WebviewPanel {
        const resourceRoots = [
            vscode.Uri.joinPath(extensionUri, 'media'),
        ];
        if (options?.additionalResourceRoots) {
            resourceRoots.push(...options.additionalResourceRoots);
        }

        return vscode.window.createWebviewPanel(
            viewType,
            title,
            options?.viewColumn ?? vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: resourceRoots,
                retainContextWhenHidden: true,
            }
        );
    }

    protected async loadHtml(injections?: Array<{ placeholder: string; value: string }>): Promise<string> {
        if (this._cachedHtml) {
            return this._cachedHtml;
        }

        try {
            const cfg = this.panelConfig;
            const htmlPath = path.join(this._extensionUri.fsPath, 'media', cfg.htmlFileName);
            let html = await fs.promises.readFile(htmlPath, 'utf-8');

            const cssUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', cfg.cssFileName)
            );
            const jsUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', cfg.jsFileName)
            );

            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{JS_URI}}', jsUri.toString());
            html = html.replace(/\{\{CSP_SOURCE\}\}/g, this._panel.webview.cspSource);

            const nonce = crypto.randomUUID();
            html = html.replace(/\{\{CSP_NONCE\}\}/g, nonce);

            if (injections) {
                for (const injection of injections) {
                    html = html.replace(injection.placeholder, injection.value);
                }
            }

            html = html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
            html = html.replace(/<style(?=[\s>])/g, `<style nonce="${nonce}"`);

            this._cachedHtml = html;
            return html;
        } catch (error) {
            console.error(`Failed to load ${this.panelConfig.viewType} HTML:`, error);
            return `<html><body><h2>Failed to load panel</h2><p>Please reinstall the extension.</p></body></html>`;
        }
    }

    protected updateHtml(html: string): void {
        this._panel.webview.html = html;
    }

    protected async initializeHtml(injections?: Array<{ placeholder: string; value: string }>): Promise<void> {
        if (this._cachedHtml) {
            this._panel.webview.html = this._cachedHtml;
            return;
        }
        const html = await this.loadHtml(injections);
        this._panel.webview.html = html;
    }

    protected postMessage(message: unknown): void {
        if (this._isDisposed) {
            return;
        }
        try {
            this._panel.webview.postMessage(message);
        } catch {
            // Webview may be disposed between the check and the call
        }
    }

    protected onDidReceiveMessage(handler: (message: unknown) => void | Promise<void>): void {
        this._disposables.push(
            this._panel.webview.onDidReceiveMessage(handler, null, this._disposables)
        );
    }

    protected invalidateHtmlCache(): void {
        this._cachedHtml = undefined;
    }

    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    public dispose(): void {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        BaseWebviewPanel.unregisterInstance(this.panelConfig.viewType);
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            x?.dispose();
        }
        this._cachedHtml = undefined;
    }
}
