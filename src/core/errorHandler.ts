import * as vscode from 'vscode';
import { t } from '../i18n';
import { getContainer, Tokens } from './diContainer';

export enum ErrorLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    FATAL = 'fatal',
}

export enum ErrorCategory {
    CRITICAL = 'critical',
    FEATURE = 'feature',
    SUB_ITEM = 'sub_item',
    PARSE = 'parse',
    FORMAT = 'format',
    CONFIG = 'config',
}

export interface FormatterError {
    message: string;
    originalError?: unknown;
    context: string;
    level: ErrorLevel;
    category: ErrorCategory;
    timestamp: number;
    stack?: string;
}

export class ErrorHandler {
    private listeners: ((error: FormatterError) => void)[] = [];
    private errorHistory: FormatterError[] = [];
    private historyStart = 0;
    private historyCount = 0;
    private maxHistorySize = 100;
    private showNotifications = true;
    private outputChannel: vscode.OutputChannel | undefined

    private logToOutputChannel(error: FormatterError): void {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('SQL All in One Errors')
        }
        const timestamp = new Date(error.timestamp).toISOString()
        const level = error.level.toUpperCase()
        const category = error.category.toUpperCase()
        this.outputChannel.appendLine(`[${timestamp}] [${level}] [${category}] ${error.context}: ${error.message}`)
        if (error.stack) {
            this.outputChannel.appendLine(error.stack)
        }
    }

    handle(
        error: unknown,
        context: string,
        level: ErrorLevel = ErrorLevel.ERROR,
        category: ErrorCategory = ErrorCategory.FEATURE
    ): FormatterError {
        const formattedError = this.normalizeError(error, context, level, category);
        this.logError(formattedError);
        this.logToOutputChannel(formattedError);
        this.notifyListeners(formattedError);
        this.maybeShowNotification(formattedError);
        return formattedError;
    }

    try<T>(
        fn: () => T,
        context: string,
        options: {
            fallback?: T;
            level?: ErrorLevel;
            category?: ErrorCategory;
            rethrow?: boolean;
        } = {}
    ): T | undefined {
        const {
            fallback,
            level = ErrorLevel.ERROR,
            category = ErrorCategory.FEATURE,
            rethrow = false,
        } = options;

        try {
            return fn();
        } catch (error) {
            const formattedError = this.handle(error, context, level, category);

            if (rethrow) {
                throw formattedError;
            }

            return fallback;
        }
    }

    async tryAsync<T>(
        fn: () => Promise<T>,
        context: string,
        options: {
            fallback?: T;
            level?: ErrorLevel;
            category?: ErrorCategory;
            rethrow?: boolean;
        } = {}
    ): Promise<T | undefined> {
        const {
            fallback,
            level = ErrorLevel.ERROR,
            category = ErrorCategory.FEATURE,
            rethrow = false,
        } = options;

        try {
            return await fn();
        } catch (error) {
            const formattedError = this.handle(error, context, level, category);

            if (rethrow) {
                throw formattedError;
            }

            return fallback;
        }
    }

    addListener(listener: (error: FormatterError) => void): () => void {
        this.listeners.push(listener);
        return () => {
            const idx = this.listeners.indexOf(listener);
            if (idx >= 0) {
                this.listeners.splice(idx, 1);
            }
        };
    }

    getHistory(): FormatterError[] {
        const result: FormatterError[] = [];
        for (let i = 0; i < this.historyCount; i++) {
            const idx = (this.historyStart + i) % this.errorHistory.length;
            result.push(this.errorHistory[idx]);
        }
        return result;
    }

    clearHistory(): void {
        this.errorHistory.length = 0;
        this.historyStart = 0;
        this.historyCount = 0;
    }

    private normalizeError(
        error: unknown,
        context: string,
        level: ErrorLevel,
        category: ErrorCategory
    ): FormatterError {
        let message = 'Unknown error';
        let stack: string | undefined;

        if (error instanceof Error) {
            message = error.message;
            stack = error.stack;
        } else if (typeof error === 'string') {
            message = error;
        } else {
            try {
                message = JSON.stringify(error);
            } catch {
                message = String(error);
            }
        }

        return {
            message,
            originalError: error,
            context,
            level,
            category,
            timestamp: Date.now(),
            stack,
        };
    }

    private logError(error: FormatterError): void {
        const logPrefix = `[SQL All in One] [${error.level.toUpperCase()}]`;
        const logMessage = `${logPrefix} [${error.context}] ${error.message}`;

        switch (error.level) {
            case ErrorLevel.DEBUG:
                console.debug(logMessage, error.originalError);
                break;
            case ErrorLevel.INFO:
                console.info(logMessage, error.originalError);
                break;
            case ErrorLevel.WARNING:
                console.warn(logMessage, error.originalError);
                break;
            case ErrorLevel.ERROR:
            case ErrorLevel.FATAL:
                console.error(logMessage, error.originalError);
                break;
        }

        this.errorHistory.push(error);
        this.historyCount++;
        if (this.historyCount > this.maxHistorySize) {
            this.historyStart = (this.historyStart + 1) % this.errorHistory.length;
            this.historyCount = this.maxHistorySize;
        }
    }

    private notifyListeners(error: FormatterError): void {
        for (const listener of this.listeners) {
            try {
                listener(error);
            } catch (listenerError) {
                console.warn('[SQL All in One] Error in listener:', listenerError);
            }
        }
    }

    private maybeShowNotification(error: FormatterError): void {
        if (!this.showNotifications) {
            return;
        }

        switch (error.level) {
            case ErrorLevel.FATAL:
                vscode.window.showErrorMessage(
                    t('notification.error', `${error.context}: ${error.message}`)
                );
                break;
            case ErrorLevel.ERROR:
                if (error.category === ErrorCategory.CRITICAL) {
                    vscode.window.showErrorMessage(
                        t('notification.error', `${error.context}: ${error.message}`)
                    );
                }
                break;
            case ErrorLevel.WARNING:
                if (error.category === ErrorCategory.CRITICAL) {
                    vscode.window.showWarningMessage(
                        t('notification.warning', `${error.context}: ${error.message}`)
                    );
                }
                break;
        }
    }

    showOutputChannel(): void {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('SQL All in One Errors');
        }
        this.outputChannel.show(true);
    }

    getOutputChannel(): vscode.OutputChannel | undefined {
        return this.outputChannel;
    }

    dispose(): void {
        if (this.outputChannel) {
            this.outputChannel.dispose()
        }
        this.listeners.length = 0
        this.errorHistory.length = 0
        this.historyStart = 0
        this.historyCount = 0
    }
}

export function createErrorHandler(): ErrorHandler {
    return new ErrorHandler();
}

export function getErrorHandler(): ErrorHandler {
    return getContainer().get<ErrorHandler>(Tokens.ErrorHandler);
}

export function handleError(error: unknown, context: string, category: ErrorCategory): void {
    const level = category === ErrorCategory.CRITICAL ? ErrorLevel.ERROR : ErrorLevel.WARNING;
    getErrorHandler().handle(error, context, level, category);
}
