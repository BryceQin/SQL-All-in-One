export interface AstLocation {
    line: number
    column: number
}

export interface AstNode {
    type: string
    loc?: {
        start?: AstLocation
        end?: AstLocation
    }
    [key: string]: unknown
}
