import { randomUUID } from 'crypto';

let counter = 0;

export function generateId(prefix?: string): string {
    const id = randomUUID();
    return prefix ? `${prefix}_${id}` : id;
}

export function generateShortId(prefix?: string): string {
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    const count = (counter++).toString(36);
    return prefix ? `${prefix}-${timestamp}-${rand}-${count}` : `${timestamp}${rand}${count}`;
}
