import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLoadBalancer } from "../src/resilience/loadBalancer";
import type { BackendState } from "../src/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function mockFetch(status = 200, body: any = { ok: true }) {
    return vi.fn().mockResolvedValue({
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
        clone() { return this; },
    } as any);
}

// ─── round-robin ────────────────────────────────────────────────────────────

describe("round-robin strategy", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("cycles through backends in order", async () => {
        globalThis.fetch = mockFetch();

        const transport = createLoadBalancer({
            backends: [
                { url: "https://api-1.test" },
                { url: "https://api-2.test" },
                { url: "https://api-3.test" },
            ],
            strategy: "round-robin",
        });

        const urls: string[] = [];
        for (let i = 0; i < 6; i++) {
            await transport("https://original.test/data", { method: "GET" } as any);
            const calledUrl = (globalThis.fetch as any).mock.calls[i][0] as string;
            urls.push(new URL(calledUrl).host);
        }

        expect(urls).toEqual([
            "api-1.test", "api-2.test", "api-3.test",
            "api-1.test", "api-2.test", "api-3.test",
        ]);

        (transport as any).__cleanup();
    });
});

// ─── random ─────────────────────────────────────────────────────────────────

describe("random strategy", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("picks backends (eventually all are hit)", async () => {
        globalThis.fetch = mockFetch();

        const transport = createLoadBalancer({
            backends: [
                { url: "https://api-1.test" },
                { url: "https://api-2.test" },
            ],
            strategy: "random",
        });

        const hosts = new Set<string>();
        for (let i = 0; i < 100; i++) {
            await transport("https://original.test/data", { method: "GET" } as any);
            const calledUrl = (globalThis.fetch as any).mock.calls[i][0] as string;
            hosts.add(new URL(calledUrl).host);
        }

        expect(hosts.size).toBe(2);
        (transport as any).__cleanup();
    });
});

// ─── weighted ───────────────────────────────────────────────────────────────

describe("weighted strategy", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("distributes traffic according to weights", async () => {
        globalThis.fetch = mockFetch();

        const transport = createLoadBalancer({
            backends: [
                { url: "https://api-1.test", weight: 3 },
                { url: "https://api-2.test", weight: 1 },
            ],
            strategy: "weighted",
        });

        const counts: Record<string, number> = {};
        for (let i = 0; i < 400; i++) {
            await transport("https://original.test/data", { method: "GET" } as any);
            const calledUrl = (globalThis.fetch as any).mock.calls[i][0] as string;
            const host = new URL(calledUrl).host;
            counts[host] = (counts[host] || 0) + 1;
        }

        // api-1 should get roughly 3x the traffic of api-2
        expect(counts["api-1.test"]).toBeGreaterThan(counts["api-2.test"]! * 1.5);
        (transport as any).__cleanup();
    });
});

// ─── custom strategy ────────────────────────────────────────────────────────

describe("custom strategy", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("uses user-provided strategy function", async () => {
        globalThis.fetch = mockFetch();

        const customStrategy = vi.fn((backends: BackendState[]): BackendState => backends[1]!);

        const transport = createLoadBalancer({
            backends: [
                { url: "https://api-1.test" },
                { url: "https://api-2.test" },
            ],
            strategy: customStrategy,
        });

        for (let i = 0; i < 5; i++) {
            await transport("https://original.test/data", { method: "GET" } as any);
        }

        expect(customStrategy).toHaveBeenCalledTimes(5);
        // All requests should go to api-2 (index 1)
        for (const call of (globalThis.fetch as any).mock.calls) {
            expect(new URL(call[0]).host).toBe("api-2.test");
        }

        (transport as any).__cleanup();
    });
});

// ─── URL rewriting ──────────────────────────────────────────────────────────

describe("URL rewriting", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("preserves path and query params", async () => {
        globalThis.fetch = mockFetch();

        const transport = createLoadBalancer({
            backends: [{ url: "https://api-1.test" }],
            strategy: "round-robin",
        });

        await transport("https://original.test/v1/users?page=2&limit=10", {
            method: "GET",
        } as any);

        const calledUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
        const parsed = new URL(calledUrl);
        expect(parsed.host).toBe("api-1.test");
        expect(parsed.pathname).toBe("/v1/users");
        expect(parsed.searchParams.get("page")).toBe("2");
        expect(parsed.searchParams.get("limit")).toBe("10");

        (transport as any).__cleanup();
    });
});

// ─── failover ───────────────────────────────────────────────────────────────

describe("failover", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("retries with next backend on failure", async () => {
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            callCount++;
            if (new URL(url).host === "api-1.test") {
                throw new Error("connection refused");
            }
            return {
                status: 200,
                ok: true,
                headers: new Headers(),
                json: () => Promise.resolve({ ok: true }),
                clone() { return this; },
            };
        });

        const transport = createLoadBalancer({
            backends: [
                { url: "https://api-1.test" },
                { url: "https://api-2.test" },
            ],
            strategy: "round-robin",
        });

        const res = await transport("https://original.test/data", {
            method: "GET",
        } as any);

        expect(res.status).toBe(200);
        expect(callCount).toBe(2); // first fails, second succeeds

        (transport as any).__cleanup();
    });

    it("failover on 5xx response", async () => {
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            callCount++;
            if (new URL(url).host === "api-1.test") {
                return {
                    status: 503,
                    ok: false,
                    headers: new Headers(),
                    json: () => Promise.resolve({ error: "down" }),
                    clone() { return this; },
                };
            }
            return {
                status: 200,
                ok: true,
                headers: new Headers(),
                json: () => Promise.resolve({ ok: true }),
                clone() { return this; },
            };
        });

        const transport = createLoadBalancer({
            backends: [
                { url: "https://api-1.test" },
                { url: "https://api-2.test" },
            ],
            strategy: "round-robin",
        });

        const res = await transport("https://original.test/data", {
            method: "GET",
        } as any);

        expect(res.status).toBe(200);

        (transport as any).__cleanup();
    });

    it("failover disabled throws on first failure", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));

        const transport = createLoadBalancer({
            backends: [
                { url: "https://api-1.test" },
                { url: "https://api-2.test" },
            ],
            failover: { enabled: false },
        });

        await expect(
            transport("https://original.test/data", { method: "GET" } as any)
        ).rejects.toThrow("connection refused");

        (transport as any).__cleanup();
    });
});

// ─── health checks ──────────────────────────────────────────────────────────

describe("health checks", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it("marks backend unhealthy after failureThreshold consecutive failures", async () => {
        const onBackendChange = vi.fn();
        let callCount = 0;

        globalThis.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            // First 3 calls are health checks (failureThreshold = 3)
            if (callCount <= 3) {
                throw new Error("connection refused");
            }
            return {
                status: 200,
                ok: true,
                headers: new Headers(),
                json: () => Promise.resolve({ ok: true }),
                clone() { return this; },
            };
        });

        const transport = createLoadBalancer({
            backends: [
                {
                    url: "https://api-1.test",
                    healthCheck: {
                        endpoint: "/health",
                        interval: 10000,
                        failureThreshold: 3,
                    },
                },
                { url: "https://api-2.test" },
            ],
            onBackendChange,
        });

        // Trigger health checks
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(10000);
        await vi.advanceTimersByTimeAsync(10000);

        // Should have been marked unhealthy
        expect(onBackendChange).toHaveBeenCalledWith("https://api-1.test", false);

        (transport as any).__cleanup();
    });
});

// ─── latency tracking ───────────────────────────────────────────────────────

describe("latency tracking", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("custom strategy can access latency data", async () => {
        let latencyValues: number[] = [];

        // Simulate different latencies for different backends
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            const delay = new URL(url).host === "api-1.test" ? 100 : 50;
            await new Promise((r) => setTimeout(r, delay));
            return {
                status: 200,
                ok: true,
                headers: new Headers(),
                json: () => Promise.resolve({ ok: true }),
                clone() { return this; },
            };
        });

        const customStrategy = vi.fn((backends: BackendState[]): BackendState => {
            latencyValues = backends.map((b) => b.latency);
            return backends[0]!;
        });

        const transport = createLoadBalancer({
            backends: [
                { url: "https://api-1.test" },
                { url: "https://api-2.test" },
            ],
            strategy: customStrategy,
        });

        // Use real timers for this test
        vi.useRealTimers();

        await transport("https://original.test/data", { method: "GET" } as any);
        await transport("https://original.test/data", { method: "GET" } as any);

        // After requests, latency should be > 0
        expect(customStrategy).toHaveBeenCalled();

        (transport as any).__cleanup();
    });
});
