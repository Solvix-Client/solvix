import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";

describe("ETag handling", () => {

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("should return cached data on 304 after cache expires", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    status: 200,
                    headers: new Headers({ ETag: '"abc123"' }),
                    json: async () => ({ id: 1, name: "Solvix" }),
                    clone() { return this; }
                };
            }
            return {
                status: 304,
                headers: new Headers(),
                json: async () => ({ id: 1, name: "Solvix" }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            etag: { enabled: true },
            cache: { ttl: 1000 }
        });

        // Request 1: 200 → stores cache + ETag
        const r1 = await client.get<{ id: number; name: string }>("/resource");
        expect(r1.status).toBe(200);
        expect(r1.data).toEqual({ id: 1, name: "Solvix" });
        expect(callCount).toBe(1);

        // Advance time past cache TTL so cache expires, but ETag is still stored
        vi.advanceTimersByTime(1001);

        // Request 2: cache expired → sends If-None-Match → 304 → peekCache returns stale data
        const r2 = await client.get<{ id: number; name: string }>("/resource");
        expect(r2.status).toBe(200);             // cached response has original 200
        expect(r2.data).toEqual({ id: 1, name: "Solvix" });
        expect(callCount).toBe(2);                // 1 (200) + 1 (304)
    });

    it("should return fresh data when server returns 200 on second request", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    status: 200,
                    headers: new Headers({ ETag: '"v1"' }),
                    json: async () => ({ version: 1 }),
                    clone() { return this; }
                };
            }
            // Data changed — server returns 200 with new data and new ETag
            return {
                status: 200,
                headers: new Headers({ ETag: '"v2"' }),
                json: async () => ({ version: 2 }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            etag: { enabled: true },
            cache: { ttl: 1000 }
        });

        const r1 = await client.get<{ version: number }>("/data");
        expect(r1.data).toEqual({ version: 1 });

        vi.advanceTimersByTime(1001);

        // Server returns 200 (data changed) — new version stored
        const r2 = await client.get<{ version: number }>("/data");
        expect(r2.status).toBe(200);
        expect(r2.data).toEqual({ version: 2 });
        expect(callCount).toBe(2);
    });

    it("should not throw on 304 when cache is not configured", async () => {
        let first = true;

        global.fetch = vi.fn().mockImplementation(async () => {
            if (first) {
                first = false;
                return {
                    status: 200,
                    headers: new Headers({ ETag: '"no-cache-etag"' }),
                    json: async () => ({ ok: true }),
                    clone() { return this; }
                };
            }
            return {
                status: 304,
                headers: new Headers(),
                json: async () => ({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            etag: { enabled: true }
            // NOTE: no cache option set
        });

        const r1 = await client.get<{ ok: boolean }>("/no-cache");
        expect(r1.status).toBe(200);
        expect(r1.data).toEqual({ ok: true });

        // With the fix, 304 without cache returns valid 304 response (not an error)
        const r2 = await client.get<{ ok: boolean }>("/no-cache");
        expect(r2.status).toBe(304);
        expect(r2.data).toBeUndefined();
        // Test passes by reaching here without throwing
    });

    it("should support ETag without cache via custom validateStatus", async () => {
        let first = true;

        global.fetch = vi.fn().mockImplementation(async () => {
            if (first) {
                first = false;
                return {
                    status: 200,
                    headers: new Headers({ ETag: "123" }),
                    json: async () => ({ id: 1 }),
                    clone() { return this; }
                };
            }
            return {
                status: 304,
                headers: new Headers(),
                json: async () => ({ id: 1 }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            etag: { enabled: true },
            validateStatus: (status) => (status >= 200 && status < 300) || status === 304
        });

        const r1 = await client.get<{ id: number }>("/etag");
        expect(r1.data.id).toBe(1);
        expect(r1.status).toBe(200);

        // Second request: 304 with no cache → returns 304 with undefined data
        const r2 = await client.get<{ id: number }>("/etag");
        expect(r2.status).toBe(304);
        expect(r2.data).toBeUndefined();
    });

    it("should send If-None-Match on subsequent requests after cache expires", async () => {
        let callIndex = 0;

        global.fetch = vi.fn().mockImplementation(async (url, init) => {
            callIndex++;
            return {
                status: 200,
                headers: new Headers({ ETag: '"etag-value"' }),
                json: async () => ({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            etag: { enabled: true },
            cache: { ttl: 1000 }
        });

        // First request — stores ETag, no If-None-Match
        await client.get("/item");
        const firstInit = vi.mocked(global.fetch).mock.calls[0]![1];
        expect(new Headers(firstInit?.headers).get("If-None-Match")).toBeNull();

        // Advance time past cache TTL
        vi.advanceTimersByTime(1001);

        // Second request — cache expired, should send If-None-Match
        await client.get("/item");
        const secondInit = vi.mocked(global.fetch).mock.calls[1]![1];
        expect(new Headers(secondInit?.headers).get("If-None-Match")).toBe('"etag-value"');
    });

    it("should populate cache on first 200 and return from cache on second hit", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            return {
                status: 200,
                headers: new Headers({ ETag: '"cached-etag"' }),
                json: async () => ({ cached: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            etag: { enabled: true },
            cache: true
        });

        const r1 = await client.get<{ cached: boolean }>("/test");
        expect(r1.data.cached).toBe(true);
        expect(callCount).toBe(1);

        // Second request hits cache at top-level check — no network call
        const r2 = await client.get<{ cached: boolean }>("/test");
        expect(r2.data.cached).toBe(true);
        expect(callCount).toBe(1);
    });

    it("should handle rapid cache hits without 304 network calls", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            return {
                status: 200,
                headers: new Headers({ ETag: '"rapid-etag"' }),
                json: async () => ({ data: "value" }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            etag: { enabled: true },
            cache: { ttl: 60000 }
        });

        // First request: cache miss → network
        await client.get("/rapid");
        expect(callCount).toBe(1);

        // Next 10 requests within TTL: all cache hits, zero network calls
        for (let i = 0; i < 10; i++) {
            await client.get("/rapid");
        }
        expect(callCount).toBe(1);
    });
});
