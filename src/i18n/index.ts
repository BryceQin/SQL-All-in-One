import * as vscode from "vscode";
import messagesEn from "./messages.en.json";
import messagesZh from "./messages.zh.json";
import { handleError, ErrorCategory, debugLog } from "../core/errorHandler";

type Language = "zh" | "en";
export type MessageKey = keyof typeof messagesEn;

let currentLang: Language = "zh";
let messages: Record<MessageKey, string> = {} as Record<MessageKey, string>;

const messageBundles: Record<Language, Record<MessageKey, string>> = {
    en: messagesEn as Record<MessageKey, string>,
    zh: messagesZh as Record<MessageKey, string>,
};

const validLanguages: Language[] = ["zh", "en"];

export function initI18n(): void {
    try {
        const config = vscode.workspace.getConfiguration("SQL-All-in-One");
        const userLang = config.get<string>("displayLanguage", "auto");

        if (userLang === "auto") {
            currentLang = vscode.env.language.startsWith("zh") ? "zh" : "en";
        } else if (validLanguages.includes(userLang as Language)) {
            currentLang = userLang as Language;
        } else {
            currentLang = "en";
        }
    } catch (e) {
        // ConfigManager may not be available yet; fall back to Chinese
        handleError(e, "i18n.init", ErrorCategory.FEATURE);
        currentLang = "zh";
    }

    messages = messageBundles[currentLang];
}

export function initI18nForTest(lang: Language = "zh"): void {
    currentLang = lang;
    messages = messageBundles[currentLang];
}

export function t(key: MessageKey, ...args: string[]): string {
    let template = messages[key];
    if (template === undefined) {
        template = messageBundles.en[key]; // fallback to English
    }
    if (template === undefined) {
        debugLog(`Missing translation key: ${key}`, "i18n.translate");
        return key;
    }
    args.forEach((arg, i) => {
        template = template.replaceAll(`{${i}}`, String(arg));
    });
    return template;
}

/**
 * @deprecated Use `t()` with a valid MessageKey instead.
 * If you need dynamic keys, add them to messages.en.json first.
 */
export function tAny(key: string, ...args: string[]): string {
    let template = (messages as Record<string, string>)[key];
    if (template === undefined) {
        template = (messageBundles.en as Record<string, string>)[key]; // fallback to English
    }
    if (template === undefined) {
        debugLog(`Missing translation key: ${key}`, "i18n.translate");
        return key;
    }
    args.forEach((arg, i) => {
        template = template.replaceAll(`{${i}}`, String(arg));
    });
    return template;
}

export function getLanguage(): Language {
    return currentLang;
}
