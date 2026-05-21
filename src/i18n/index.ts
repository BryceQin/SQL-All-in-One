import * as vscode from 'vscode';

type Language = 'zh' | 'en';
type MessageKey = string;

let currentLang: Language = 'zh';
let messages: Record<MessageKey, string> = {};

export function initI18n(): void {
    const config = vscode.workspace.getConfiguration('Hive-Formatter');
    const userLang = config.get<string>('displayLanguage', 'auto');

    if (userLang === 'auto') {
        currentLang = vscode.env.language === 'zh-cn' ? 'zh' : 'en';
    } else {
        currentLang = userLang as Language;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    messages = require(`./messages.${currentLang}.json`);
}

export function t(key: MessageKey, ...args: string[]): string {
    let template = messages[key];
    if (template === undefined) {
        console.warn(`[i18n] Missing translation key: ${key}`);
        return key;
    }
    args.forEach((arg, i) => {
        template = template.replace(`{${i}}`, arg);
    });
    return template;
}

export function getLanguage(): Language {
    return currentLang;
}
