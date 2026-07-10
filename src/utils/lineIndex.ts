export function precomputeLineStarts(text: string): number[] {
    const starts: number[] = [0];
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) {
            starts.push(i + 1);
        }
    }
    return starts;
}

export function lineFromOffset(lineStarts: number[], offset: number): number {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        if (lineStarts[mid] <= offset) {
            if (mid + 1 >= lineStarts.length || lineStarts[mid + 1] > offset) {
                return mid + 1;
            }
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return 1;
}
