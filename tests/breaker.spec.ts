import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";
import { CircuitBreaker } from "../src/resilience/circuitBreaker";

describe("Circuit Breaker", () => {

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should open breaker after failures (failureRate as ratio 0-1)", async () => {

        global.fetch = vi.fn().mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            circuitBreaker: {
                failureThreshold: 2,
                failureRate: 1,      // ratio: 1.0 = 100%
                rollingWindow: 10000,
                minimumRequests: 2,
                resetTimeout: 5000
            }
        });

        await expect(client.get("/fail")).rejects.toThrow();
        await expect(client.get("/fail")).rejects.toThrow();

        // Circuit should be OPEN now — third request blocked
        await expect(client.get("/fail")).rejects.toThrow("Circuit breaker is OPEN");
    });

    it("should open breaker with percentage-style failureRate (100 = 100%)", async () => {

        global.fetch = vi.fn().mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            circuitBreaker: {
                failureThreshold: 3,
                failureRate: 100,      // percentage: 100%
                rollingWindow: 10000,
                minimumRequests: 3,
                resetTimeout: 5000,
                halfOpenRequests: 1
            }
        });

        // First 3 requests all fail — 3 failures in window, 100% rate
        await expect(client.get("/fail")).rejects.toThrow("HTTP Error: 500");
        await expect(client.get("/fail")).rejects.toThrow("HTTP Error: 500");
        await expect(client.get("/fail")).rejects.toThrow("HTTP Error: 500");

        // 4th request should be blocked by circuit breaker
        await expect(client.get("/fail")).rejects.toThrow("Circuit breaker is OPEN");
    });

    it("should fire onCircuitOpen hook when circuit opens", async () => {

        global.fetch = vi.fn().mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        const onCircuitOpen = vi.fn();

        const client = createClient({
            baseURL: "https://api.example.com",
            circuitBreaker: {
                failureThreshold: 2,
                failureRate: 1,
                rollingWindow: 10000,
                minimumRequests: 2,
                resetTimeout: 5000
            },
            hooks: {
                onCircuitOpen
            }
        });

        await expect(client.get("/fail")).rejects.toThrow();
        await expect(client.get("/fail")).rejects.toThrow();

        expect(onCircuitOpen).toHaveBeenCalledTimes(1);
        expect(onCircuitOpen).toHaveBeenCalledWith("api.example.com");
    });

    it("should block requests when circuit is OPEN", async () => {

        global.fetch = vi.fn().mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            circuitBreaker: {
                failureThreshold: 2,
                failureRate: 1,
                rollingWindow: 10000,
                minimumRequests: 2,
                resetTimeout: 10000
            }
        });

        // Trip the breaker
        await expect(client.get("/fail")).rejects.toThrow();
        await expect(client.get("/fail")).rejects.toThrow();
        await expect(client.get("/fail")).rejects.toThrow("Circuit breaker is OPEN");

        // Still blocked
        await expect(client.get("/fail")).rejects.toThrow("Circuit breaker is OPEN");

        // fetch should only have been called for the first 2 requests
        // (3rd request triggers the open check but let's count the actual network calls)
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should transition to HALF_OPEN after resetTimeout and allow one request", async () => {

        const fetchMock = vi.fn().mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        global.fetch = fetchMock;

        const client = createClient({
            baseURL: "https://api.example.com",
            circuitBreaker: {
                failureThreshold: 2,
                failureRate: 1,
                rollingWindow: 10000,
                minimumRequests: 2,
                resetTimeout: 5000,
                halfOpenRequests: 1
            }
        });

        // Trip the breaker
        await expect(client.get("/fail")).rejects.toThrow();
        await expect(client.get("/fail")).rejects.toThrow();
        await expect(client.get("/fail")).rejects.toThrow("Circuit breaker is OPEN");

        expect(fetchMock).toHaveBeenCalledTimes(2);

        // Advance time past resetTimeout
        vi.advanceTimersByTime(5000);

        // Should be HALF_OPEN now — one request goes through
        await expect(client.get("/fail")).rejects.toThrow("HTTP Error: 500");

        // Circuit should re-open
        await expect(client.get("/fail")).rejects.toThrow("Circuit breaker is OPEN");
    });

    it("should reset to CLOSED on success in HALF_OPEN state", async () => {

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                status: 500,
                headers: new Headers(),
                clone() { return this; }
            })
            .mockResolvedValueOnce({
                status: 500,
                headers: new Headers(),
                clone() { return this; }
            })
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                clone() { return this; },
                json: () => Promise.resolve({ ok: true })
            });

        global.fetch = fetchMock;

        const client = createClient({
            baseURL: "https://api.example.com",
            circuitBreaker: {
                failureThreshold: 2,
                failureRate: 1,
                rollingWindow: 10000,
                minimumRequests: 2,
                resetTimeout: 5000,
                halfOpenRequests: 1
            }
        });

        // Trip the breaker
        await expect(client.get("/fail")).rejects.toThrow();
        await expect(client.get("/fail")).rejects.toThrow();
        await expect(client.get("/fail")).rejects.toThrow("Circuit breaker is OPEN");

        // Advance time to half-open
        vi.advanceTimersByTime(5000);

        // Success in half-open — circuit resets to CLOSED
        await client.get("/success");

        // Now subsequent failures should accumulate fresh
        fetchMock.mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        await expect(client.get("/fail")).rejects.toThrow("HTTP Error: 500");
        // One more failure doesn't trip yet (needs minimumRequests=2)
        await expect(client.get("/fail")).rejects.toThrow("HTTP Error: 500");

        // fetch calls: 2 failures + 1 success + 2 more failures = 5 total
        // But the 3rd call (first one when OPEN) was blocked, so 4 actual network calls
        expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it("should honor per-host isolation", async () => {

        const fetchMock = vi.fn().mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        global.fetch = fetchMock;

        const client = createClient({
            circuitBreaker: {
                failureThreshold: 2,
                failureRate: 1,
                rollingWindow: 10000,
                minimumRequests: 2,
                resetTimeout: 5000
            }
        });

        // Trip breaker for api.example.com
        await expect(client.get("https://api.example.com/fail")).rejects.toThrow();
        await expect(client.get("https://api.example.com/fail")).rejects.toThrow();

        // Blocked for example.com
        await expect(client.get("https://api.example.com/fail")).rejects.toThrow("Circuit breaker is OPEN");

        // But other hosts are unaffected
        await expect(client.get("https://other-api.com/fail")).rejects.toThrow("HTTP Error: 500");
    });

    it("should handle edge case: failureRate exactly at threshold", async () => {
        // 50% failure rate with 4 requests → 2 failures, 2 successes should NOT open
        // 50% failure rate with 4 requests → 3 failures, 1 success = 75% > 50% → SHOULD open

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                status: 500,
                headers: new Headers(),
                clone() { return this; }
            })
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                clone() { return this; },
                json: () => Promise.resolve({})
            })
            .mockResolvedValueOnce({
                status: 500,
                headers: new Headers(),
                clone() { return this; }
            })
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                clone() { return this; },
                json: () => Promise.resolve({})
            });

        global.fetch = fetchMock;

        const client = createClient({
            baseURL: "https://api.example.com",
            circuitBreaker: {
                failureThreshold: 3,
                failureRate: 0.5,     // 50% ratio
                rollingWindow: 10000,
                minimumRequests: 4,
                resetTimeout: 5000
            }
        });

        // 4 requests: 2 fail, 2 succeed → 50% rate, but only 2 failures < threshold 3
        await expect(client.get("/a")).rejects.toThrow("HTTP Error: 500");
        await client.get("/b");
        await expect(client.get("/c")).rejects.toThrow("HTTP Error: 500");
        await client.get("/d");

        // Minimum requests met (4), but failures (2) < threshold (3)
        // Circuit should still be CLOSED
        fetchMock.mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        // Add one more failure → 3 failures, 5 total → 60% rate
        await expect(client.get("/e")).rejects.toThrow("HTTP Error: 500");

        // 3 failures >= 3 threshold, 60% > 50% rate → OPEN
        await expect(client.get("/f")).rejects.toThrow("Circuit breaker is OPEN");
    });

    it("should reproduce the exact user scenario with failureRate: 100", async () => {

        global.fetch = vi.fn().mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        const onCircuitOpen = vi.fn();

        const client = createClient({
            circuitBreaker: {
                failureThreshold: 3,
                failureRate: 100,     // percentage: 100%
                rollingWindow: 10000,
                minimumRequests: 3,
                resetTimeout: 5000,
                halfOpenRequests: 1,
            },
            hooks: {
                onCircuitOpen,
            },
        });

        // First 3 requests should fail with HTTP errors (hitting network)
        await expect(client.get("https://httpbin.org/status/500")).rejects.toThrow("HTTP Error: 500");
        expect(onCircuitOpen).not.toHaveBeenCalled();

        await expect(client.get("https://httpbin.org/status/500")).rejects.toThrow("HTTP Error: 500");
        expect(onCircuitOpen).not.toHaveBeenCalled();

        await expect(client.get("https://httpbin.org/status/500")).rejects.toThrow("HTTP Error: 500");

        // onCircuitOpen should fire after 3rd failure
        expect(onCircuitOpen).toHaveBeenCalledTimes(1);
        expect(onCircuitOpen).toHaveBeenCalledWith("httpbin.org");

        // 4th request — circuit is OPEN, blocked without hitting network
        await expect(client.get("https://httpbin.org/status/500")).rejects.toThrow("Circuit breaker is OPEN");

        // fetch should have been called exactly 3 times (all 3 failures, blocked after that)
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("should record success after half-open and reset to CLOSED", async () => {

        const fetchMock = vi.fn()
            // 3 failures to trip
            .mockResolvedValueOnce({
                status: 500,
                headers: new Headers(),
                clone() { return this; }
            })
            .mockResolvedValueOnce({
                status: 500,
                headers: new Headers(),
                clone() { return this; }
            })
            .mockResolvedValueOnce({
                status: 500,
                headers: new Headers(),
                clone() { return this; }
            })
            // Half-open success
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                clone() { return this; },
                json: () => Promise.resolve({ recovered: true })
            });
        // Default fallback for any extra calls (post-recovery)
        fetchMock.mockResolvedValue({
            status: 500,
            headers: new Headers(),
            clone() { return this; }
        });

        global.fetch = fetchMock;
        const onCircuitOpen = vi.fn();

        const client = createClient({
            baseURL: "https://api.example.com",
            circuitBreaker: {
                failureThreshold: 3,
                failureRate: 100,
                rollingWindow: 10000,
                minimumRequests: 3,
                resetTimeout: 5000,
                halfOpenRequests: 1,
            },
            hooks: { onCircuitOpen }
        });

        // Trip
        await expect(client.get("/a")).rejects.toThrow("HTTP Error: 500");
        await expect(client.get("/b")).rejects.toThrow("HTTP Error: 500");
        await expect(client.get("/c")).rejects.toThrow("HTTP Error: 500");

        expect(onCircuitOpen).toHaveBeenCalledOnce();

        // Blocked in OPEN state
        await expect(client.get("/d")).rejects.toThrow("Circuit breaker is OPEN");

        // Advance past resetTimeout
        vi.advanceTimersByTime(5000);

        // Half-open: one success → closed
        const resp = await client.get("/recover");
        expect(resp.data).toEqual({ recovered: true });

        // Circuit is CLOSED again, next failure should work normally
        await expect(client.get("/e")).rejects.toThrow("HTTP Error: 500");
    });

    it("should handle direct CircuitBreaker class usage (unit test)", () => {

        const breaker = new CircuitBreaker({
            failureThreshold: 2,
            failureRate: 100,     // percentage
            rollingWindow: 10000,
            minimumRequests: 2,
            resetTimeout: 5000,
            halfOpenRequests: 1
        });

        const host = "api.example.com";

        expect(breaker.canRequest(host)).toBe(true);
        expect(breaker.getMetrics(host).state).toBe("CLOSED");

        breaker.recordFailure(host);
        breaker.recordFailure(host);

        // Should be OPEN now
        expect(breaker.canRequest(host)).toBe(false);
        expect(breaker.getMetrics(host).state).toBe("OPEN");

        // Advance time past resetTimeout
        vi.advanceTimersByTime(5000);

        // Should be HALF_OPEN now
        expect(breaker.canRequest(host)).toBe(true);
        expect(breaker.getMetrics(host).state).toBe("HALF_OPEN");

        // Half-open success → CLOSED
        breaker.recordSuccess(host);
        expect(breaker.getMetrics(host).state).toBe("CLOSED");
    });
});
