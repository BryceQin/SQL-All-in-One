// 去除字符串数组中的重复元素
export function dedupe(arr: string[]) {
    return [...new Set(arr)];
};

// 获取数组的最后一个元素
export function last<T>(arr: T[]): T | undefined {
    return arr[arr.length - 1];
};

// 根据字符串的长度排序，长的排在前面
// 如果长度相同，则按字母顺序排序
export function sortByLengthDesc(str: string[]): string[] {
    return str.sort((a, b) => b.length - a.length || a.localeCompare(b));
};

// 获取字符串数组中最长字符串的长度
export function maxLength(str: string[]): number {
    return str.reduce((max, cur) => Math.max(max, cur.length), 0);
};

// 将字符串中的连续空白字符替换为单个空格
export function equalizeWhitespace(str: string): string {
    return str.replace(/\s+/gu, ' ');
};

// 检查字符串是否包含多行
export function isMultiline(s: string): boolean {
    return /\n/.test(s);
}

// 定义一个类型，将类型 T 中的属性 K 设为可选，其余属性保持不变
export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;