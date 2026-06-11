import * as vscode from 'vscode';

export class InMemoryDocument implements vscode.TextDocument {
    readonly uri: vscode.Uri;
    readonly languageId: string;
    readonly version: number = 0;
    readonly isDirty: boolean = false;
    readonly isUntitled: boolean = true;
    readonly isClosed: boolean = false;
    readonly eol: vscode.EndOfLine = vscode.EndOfLine.LF;
    readonly fileName: string = '';
    readonly encoding: string = 'utf8';

    private readonly _lines: string[];
    private readonly _lineCount: number;

    constructor(content: string, languageId: string) {
        this.uri = vscode.Uri.parse(`sql-all-in-one://virtual/${Date.now()}.sql`);
        this.languageId = languageId;
        this._lines = content.split('\n');
        this._lineCount = this._lines.length;
    }

    get lineCount(): number {
        return this._lineCount;
    }

    getText(range?: vscode.Range): string {
        const fullText = this._lines.join('\n');
        if (!range) return fullText;
        const startOffset = this.offsetAt(range.start);
        const endOffset = this.offsetAt(range.end);
        return fullText.substring(startOffset, endOffset);
    }

    lineAt(lineOrPosition: number | vscode.Position): vscode.TextLine {
        const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
        if (line < 0 || line >= this._lines.length) {
            throw new Error(`Line ${line} out of range (0-${this._lines.length - 1})`);
        }
        const text = this._lines[line];
        return {
            lineNumber: line,
            text,
            range: new vscode.Range(line, 0, line, text.length),
            rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1 > this._lines.length ? line : line + 1, 0),
            firstNonWhitespaceCharacterIndex: text.search(/\S/),
            isEmptyOrWhitespace: text.trim().length === 0,
        };
    }

    offsetAt(position: vscode.Position): number {
        let offset = 0;
        for (let i = 0; i < position.line && i < this._lines.length; i++) {
            offset += this._lines[i].length + 1;
        }
        if (position.line < this._lines.length) {
            offset += Math.min(position.character, this._lines[position.line].length);
        }
        return offset;
    }

    positionAt(offset: number): vscode.Position {
        let remaining = offset;
        for (let i = 0; i < this._lines.length; i++) {
            if (remaining <= this._lines[i].length) {
                return new vscode.Position(i, remaining);
            }
            remaining -= this._lines[i].length + 1;
        }
        return new vscode.Position(this._lines.length - 1, this._lines[this._lines.length - 1].length);
    }

    getWordRangeAtPosition(_position: vscode.Position, _regex?: RegExp): vscode.Range | undefined {
        return undefined;
    }

    validateRange(range: vscode.Range): vscode.Range {
        return range;
    }

    validatePosition(position: vscode.Position): vscode.Position {
        return position;
    }

    save(): Thenable<boolean> {
        return Promise.resolve(true);
    }
}
