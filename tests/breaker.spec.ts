import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("Circuit Breaker", () => {

    it("should open breaker after failures", async () => {

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
                rollingWindow: 1000,
                minimumRequests: 2,
                resetTimeout: 1000
            }
        });

        await expect(client.get("/fail")).rejects.toThrow();
        await expect(client.get("/fail")).rejects.toThrow();

        await expect(client.get("/fail")).rejects.toThrow("Circuit breaker is OPEN");
    });

});