import type { SolvixResponse } from "../types";

interface CacheEntry {
    data: SolvixResponse<any>;
    expiry: number;
}

const cacheMap = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 1000;

export function getCache(key: string) {
    const entry = cacheMap.get(key);

    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
        // Don't delete — peekCache may still need it for 304 handling.
        // Entries are naturally replaced by setCache on subsequent requests.
        return undefined;
    }

    return entry.data;
}

/** Returns cached data even if expired — for use with 304 responses
 *  where the server confirms the resource hasn't changed. */
export function peekCache(key: string) {
    const entry = cacheMap.get(key);
    return entry?.data;
}

export function setCache(
    key: string,
    value: SolvixResponse<any>,
    ttl: number
) {
    if (cacheMap.size >= MAX_CACHE_SIZE) {
        // Evict oldest entry (Map preserves insertion order)
        const oldest = cacheMap.keys().next().value;
        if (oldest !== undefined) {
            cacheMap.delete(oldest);
        }
    }

    cacheMap.set(key, {
        data: value,
        expiry: Date.now() + ttl
    });
}