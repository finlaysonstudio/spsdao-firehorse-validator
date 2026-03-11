export function jsonlog(...args: Array<string | Record<string, unknown>>): void {
    const strings: string[] = [];
    const objects: Record<string, unknown>[] = [];
    for (const arg of args) {
        if (typeof arg === 'string') {
            strings.push(arg);
        } else {
            objects.push(arg);
        }
    }
    const entry: Record<string, unknown> = {
        date: new Date().toISOString(),
        level: 'debug',
        service: 'spsdao-validator',
    };
    for (const obj of objects) {
        Object.assign(entry, obj);
    }
    if (strings.length > 0) {
        entry.message = strings.join('\n');
    }
    console.log(JSON.stringify(entry));
}
