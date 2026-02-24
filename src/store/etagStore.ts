const etagStore = new Map<string, string>();

export function getETag(key: string): string | undefined {
    return etagStore.get(key);
}

export function setETag(key: string, value: string) {
    etagStore.set(key, value);
}

export function clearETag(key: string) {
    etagStore.delete(key);
}