import * as vscode from "vscode";
import { QueryHistoryEntry } from "../query/QueryResult";
import { generateShortId } from "../../utils/idGenerator";

const STORAGE_KEY = "hive-formatter.queryHistory";
const MAX_SQL_LENGTH = 2000;

export class QueryHistory {
    private context: vscode.ExtensionContext | null = null;
    private cachedEntries: QueryHistoryEntry[] | null = null;

    initialize(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    async add(entry: Omit<QueryHistoryEntry, "id">): Promise<void> {
        if (!this.context) return;

        const entries = this.getAll();
        const newEntry: QueryHistoryEntry = {
            ...entry,
            id: this.generateId(),
            sql: this.truncateSql(entry.sql),
        };

        entries.unshift(newEntry);

        const maxEntries = this.getMaxEntries();
        while (entries.length > maxEntries) {
            entries.pop();
        }

        this.cachedEntries = entries;
        await this.context.globalState.update(STORAGE_KEY, entries);
    }

    getAll(): QueryHistoryEntry[] {
        if (!this.context) return [];
        if (this.cachedEntries !== null) return this.cachedEntries;
        this.cachedEntries = this.context.globalState.get<QueryHistoryEntry[]>(STORAGE_KEY, []);
        return this.cachedEntries;
    }

    getRecent(count: number): QueryHistoryEntry[] {
        return this.getAll().slice(0, count);
    }

    search(keyword: string): QueryHistoryEntry[] {
        const lowerKeyword = keyword.toLowerCase();
        return this.getAll().filter((entry) => entry.sql.toLowerCase().includes(lowerKeyword));
    }

    async clear(): Promise<void> {
        if (!this.context) return;
        this.cachedEntries = [];
        await this.context.globalState.update(STORAGE_KEY, []);
    }

    async deleteEntry(id: string): Promise<void> {
        if (!this.context) return;
        const entries = this.getAll().filter((e) => e.id !== id);
        this.cachedEntries = entries;
        await this.context.globalState.update(STORAGE_KEY, entries);
    }

    private generateId(): string {
        return generateShortId("h");
    }

    private getMaxEntries(): number {
        const config = vscode.workspace.getConfiguration("SQL-All-in-One");
        return config.get<number>("history.maxEntries", 500);
    }

    private truncateSql(sql: string): string {
        if (sql.length <= MAX_SQL_LENGTH) {
            return sql;
        }
        return sql.substring(0, MAX_SQL_LENGTH) + "...(truncated)";
    }
}
