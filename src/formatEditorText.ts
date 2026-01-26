import { FormatOptionsWithLanguage, format } from "./formatter/sqlFormatter"

export function formatEditorText(
    text: string,
    config: FormatOptionsWithLanguage,
): string {
    return format(text, config) + (endsWithNewline(text) ? "\n" : "")
}

const endsWithNewline = (text: string) => /\n$/.test(text)
