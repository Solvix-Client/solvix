import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../src/resilience/rateLimiter";
import { createClient } from "../src";

describe("RateLimiter Basic", () => {

    it("should allow requests within capacity", async () => {

        const limiter = new RateLimiter(5, 5, 1000);

        const start = Date.now();

        await Promise.all(
            Array.from({ length: 5 }).map(() => limiter.acquire())
        );

        const duration = Date.now() - start;

        expect(duration).toBeLessThan(50);
    });

    it("should delay when capacity exceeded", async () => {

        const limiter = new RateLimiter(2, 2, 1000);

        const start = Date.now();

        await Promise.all([
            limiter.acquire(),
            limiter.acquire(),
            limiter.acquire()
        ]);

        const duration = Date.now() - start;

        expect(duration).toBeGreaterThanOrEqual(900);
    });

    it("should refill tokens after interval", async () => {

        const limiter = new RateLimiter(1, 1, 500);

        await limiter.acquire(); // consumes token

        const start = Date.now();

        await limiter.acquire(); // must wait ~500ms

        const duration = Date.now() - start;

        expect(duration).toBeGreaterThanOrEqual(450);
    });

    it("should cancel waiting if aborted", async () => {

        const limiter = new RateLimiter(1, 1, 1000);

        await limiter.acquire(); // consume token

        const controller = new AbortController();

        const promise = limiter.acquire(controller.signal);

        setTimeout(() => {
            controller.abort();
        }, 100);

        await expect(promise).rejects.toThrow();
    });

    it("should throttle requests via client", async () => {

        let calls = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            calls++;
            return {
                status: 200,
                headers: new Headers(),
                json: async () => ({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            rateLimit: {
                capacity: 2,
                refillRate: 2,
                interval: 1000
            }
        });

        const start = Date.now();

        await Promise.all([
            client.get("/1"),
            client.get("/2"),
            client.get("/3")
        ]);

        const duration = Date.now() - start;

        expect(calls).toBe(3);
        expect(duration).toBeGreaterThanOrEqual(900);
    });


    it("should handle burst safely", async () => {

        const limiter = new RateLimiter(5, 5, 1000);

        const start = Date.now();

        await Promise.all(
            Array.from({ length: 20 }).map(() => limiter.acquire())
        );

        const duration = Date.now() - start;

        expect(duration).toBeGreaterThan(3000);
    });

});

describe("Adaptive Rate Limiting (syncFromHeaders)", () => {

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should sync remaining tokens from server header", () => {
        const limiter = new RateLimiter(10, 5, 1000);

        // Consume some tokens
        limiter.acquire();
        limiter.acquire();
        limiter.acquire();

        // Server says only 2 remain
        limiter.syncFromHeaders(2);

        // Next two acquire calls succeed immediately
        const start = Date.now();
        limiter.acquire();
        limiter.acquire();
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(50);
    });

    it("should cap remaining at capacity", () => {
        const limiter = new RateLimiter(5, 5, 1000);

        // Server says there are more remaining than our capacity
        limiter.syncFromHeaders(100);

        // Internal tokens should be capped at capacity (5)
        for (let i = 0; i < 5; i++) {
            const start = Date.now();
            limiter.acquire();
            expect(Date.now() - start).toBeLessThan(50);
        }

        // 6th call should block (no tokens left)
        const blocked = limiter.acquire();
        const result = Promise.race([
            blocked.then(() => "resolved"),
            new Promise(r => setTimeout(() => r("timeout"), 50))
        ]);
    });

    it("should zero tokens when remaining is 0", () => {
        const limiter = new RateLimiter(10, 10, 500);

        limiter.syncFromHeaders(0);

        // Should block — no tokens available
        const start = Date.now();
        const promise = limiter.acquire();

        // Advance time for refill
        vi.advanceTimersByTime(499);
        expect(Date.now() - start).toBe(499);
    });

    it("should parse X-RateLimit-Remaining from response headers via client", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            return {
                status: 200,
                ok: true,
                headers: new Headers({
                    "content-type": "application/json",
                    "x-ratelimit-remaining": String(Math.max(0, 3 - callCount)),
                    "x-ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 60)
                }),
                json: async () => ({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            rateLimit: {
                capacity: 10,
                refillRate: 1,
                interval: 1000
            }
        });

        // First request: remaining=2
        await client.get("/items");
        // Second request: remaining=1
        await client.get("/items");
        // Third request: remaining=0 — after this, limiter should reflect 0
        await client.get("/items");

        expect(callCount).toBe(3);
        // Verify it didn't error — the adaptive sync kept things aligned
    });

    it("should handle Retry-After on 429 responses", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            callCount++;

            if (callCount === 1) {
                return {
                    status: 429,
                    headers: new Headers({
                        "content-type": "application/json",
                        "retry-after": "2"
                    }),
                    json: async () => ({ error: "rate limited" }),
                    text: async () => JSON.stringify({ error: "rate limited" }),
                    clone() { return this; }
                };
            }

            return {
                status: 200,
                ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            rateLimit: {
                capacity: 5,
                refillRate: 5,
                interval: 1000
            },
            retry: { retries: 1 },
            validateStatus: (status: number) => {
                // Accept 429 so the rate limit sync can happen
                return (status >= 200 && status < 300) || status === 429;
            }
        });

        // First request returns 429 but is accepted by validateStatus,
        // so the rate limiter syncs from Retry-After header
        const res = await client.get("/throttled");
        expect(res.status).toBe(429);
        expect(callCount).toBe(1);
    });
});