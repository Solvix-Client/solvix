import type { SolvixResponse } from "../types";

interface CacheEntry {
    data: SolvixResponse<any>;
    expiry: number;
}

const cacheMap = new Map<string, CacheEntry>();

export function getCache(key: string) {
    const entry = cacheMap.get(key);

    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
        cacheMap.delete(key);
        return undefined;
    }

    return entry.data;
}

export function setCache(
    key: string,
    value: SolvixResponse<any>,
    ttl: number
) {
    cacheMap.set(key, {
        data: value,
        expiry: Date.now() + ttl
    });
}