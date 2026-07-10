import { last } from "../lexer/utils";

const INDENT_TYPE_TOP_LEVEL = "top-level";
const INDENT_TYPE_BLOCK_LEVEL = "block-level";

export default class Indentation {
    private indentTypes: string[] = [];

    private indent: string;
    constructor(indent: string) {
        this.indent = indent;
    }

    getSingleIndent(): string {
        return this.indent;
    }

    getLevel(): number {
        return this.indentTypes.length;
    }

    reset(): void {
        this.indentTypes = [];
    }

    increaseTopLevel(): void {
        this.indentTypes.push(INDENT_TYPE_TOP_LEVEL);
    }

    increaseBlockLevel(): void {
        this.indentTypes.push(INDENT_TYPE_BLOCK_LEVEL);
    }

    decreaseTopLevel(): void {
        if (this.indentTypes.length > 0 && last(this.indentTypes) === INDENT_TYPE_TOP_LEVEL) {
            this.indentTypes.pop();
        }
    }

    decreaseBlockLevel(): void {
        while (this.indentTypes.length > 0) {
            const type = this.indentTypes.pop();
            if (type !== INDENT_TYPE_TOP_LEVEL) {
                break;
            }
        }
    }
}
