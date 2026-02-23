import { describe, it, expect, vi } from "vitest";
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