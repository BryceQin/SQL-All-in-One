import { DdlSuffixSlot, extractDdlSuffix, restoreDdlSuffix } from "./DdlSuffixAdapter";

export interface StarRocksAdapterState {
    suffixSlots: DdlSuffixSlot[];
}

// StarRocks extends MySQL DDL after the column list; the MySQL grammar rejects
// these clauses. Replace the whole trailing suffix with one placeholder and
// restore it after the header/columns have been formatted.
const createTableSuffixClauses: RegExp[] = [
    /\bENGINE\s*=/gi,
    /\b(?:DUPLICATE|PRIMARY|UNIQUE|AGGREGATE)\s+KEY\b/gi,
    /\bCOMMENT\s+'/gi,
    /\bDISTRIBUTED\s+BY\b/gi,
    /\bPARTITION\s+BY\b/gi,
    /\bPROPERTIES\s*\(/gi,
    /\bORDER\s+BY\s*\(/gi,
    /\bSORT\s+KEY\b/gi,
    /\bBUCKETS\s+\d+/gi,
];

export function preprocessStarRocksSql(sql: string): { processedSql: string; state: StarRocksAdapterState } {
    const counter = { value: 0 };
    const createPattern = /\bCREATE\s+(?:EXTERNAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.`"]+/gi;
    const { processedSql, slots } = extractDdlSuffix(sql, createPattern, createTableSuffixClauses, () => `__sr_ddl_${counter.value++}__`);

    return { processedSql, state: { suffixSlots: slots } };
}

export function postprocessStarRocksSql(formatted: string, state: StarRocksAdapterState): string {
    return restoreDdlSuffix(formatted, state.suffixSlots);
}
