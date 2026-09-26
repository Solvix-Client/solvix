import type { CacheNormalizationOptions } from "../types";

interface CacheEntry {
    entity: any;
    timestamp: number;
}

function defaultKeyFn(keyFields: string[]) {
    return (entity: Record<string, any>): string | null => {
        const parts: string[] = [];
        for (const field of keyFields) {
            const value = entity[field];
            if (value === undefined || value === null) return null;
            parts.push(String(value));
        }
        return parts.join(":");
    };
}

/**
 * Normalized entity cache for GraphQL responses.
 *
 * Walks response data recursively, extracts entities keyed by
 * `{__typename}:{id}`, and stores them with TTL. On read,
 * reconstructs the response from stored entities.
 */
export class NormalizedCache {
    private store = new Map<string, CacheEntry>();
    private keyFn: (entity: Record<string, any>) => string | null;
    private ttl: number;

    constructor(options: CacheNormalizationOptions = {}) {
        this.ttl = options.ttl ?? 300000;
        this.keyFn = options.keyFn ?? defaultKeyFn(options.keyFields ?? ["__typename", "id"]);
    }

    /**
     * Write a GraphQL response into the normalized cache.
     * Recursively walks arrays and objects to extract entities.
     */
    write(queryKey: string, data: any): void {
        if (!data || typeof data !== "object") return;
        this.extractEntities(data);
    }

    /**
     * Read a cached response by reconstructing from normalized entities.
     * Returns null if any referenced entity is missing or expired.
     */
    read(queryKey: string): any | null {
        // We store the raw response alongside entities
        const entry = this.store.get(`__response:${queryKey}`);
        if (!entry) return null;
        if (this.isExpired(entry)) {
            this.store.delete(`__response:${queryKey}`);
            return null;
        }
        return this.reconstruct(entry.entity);
    }

    /**
     * Invalidate entities matching a predicate.
     */
    evict(predicate: (key: string) => boolean): void {
        for (const key of this.store.keys()) {
            if (predicate(key)) {
                this.store.delete(key);
            }
        }
    }

    /**
     * Clear all normalized cache.
     */
    clear(): void {
        this.store.clear();
    }

    get size(): number {
        return this.store.size;
    }

    // ── Internal ──────────────────────────────────────────────────────────

    private extractEntities(value: any): any {
        if (Array.isArray(value)) {
            return value.map((item) => this.extractEntities(item));
        }

        if (value && typeof value === "object") {
            // Try to normalize this object as an entity
            const key = this.keyFn(value);
            if (key) {
                const normalized = { ...value };
                // Recursively normalize nested objects
                for (const [k, v] of Object.entries(normalized)) {
                    normalized[k] = this.extractEntities(v);
                }
                this.store.set(key, { entity: normalized, timestamp: Date.now() });
                return { __ref: key };
            }

            // Not an entity — recurse into its properties
            const result: any = Array.isArray(value) ? [] : {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = this.extractEntities(v);
            }
            return result;
        }

        return value;
    }

    private reconstruct(value: any): any {
        if (value && typeof value === "object") {
            if (value.__ref) {
                const entry = this.store.get(value.__ref);
                if (!entry || this.isExpired(entry)) return null;
                return this.reconstruct(entry.entity);
            }

            if (Array.isArray(value)) {
                return value.map((item) => this.reconstruct(item));
            }

            const result: any = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = this.reconstruct(v);
            }
            return result;
        }

        return value;
    }

    private isExpired(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp > this.ttl;
    }
}
