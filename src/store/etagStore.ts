const etagStore = new Map<string, string>();
const MAX_ETAG_SIZE = 1000;

export function getETag(key: string): string | undefined {
    return etagStore.get(key);
}

export function setETag(key: string, value: string) {
    if (etagStore.size >= MAX_ETAG_SIZE) {
        // Evict oldest entry (Map preserves insertion order)
        const oldest = etagStore.keys().next().value;
        if (oldest !== undefined) {
            etagStore.delete(oldest);
        }
    }

    etagStore.set(key, value);
}

export function clearETag(key: string) {
    etagStore.delete(key);
}