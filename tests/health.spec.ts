import { describe, it, expect, vi } from "vitest";
import { HealthChecker } from "../src/core/healthChecker";

describe("Health checks", () => {

    it("should call the health endpoint on start", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            headers: new Headers(),
            json: async () => ({ status: "ok" }),
            text: async () => JSON.stringify({ status: "ok" }),
            clone() { return this; }
        });

        const checker = new HealthChecker(
            { endpoint: "/health", interval: 60000 },
            fetchMock
        );

        checker.start();

        // Give the async check time to settle
        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalled();
        });
    });

    it("should report healthy when endpoint returns 200", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            headers: new Headers(),
            json: async () => ({ status: "ok" }),
            text: async () => JSON.stringify({ status: "ok" }),
            clone() { return this; }
        });

        const checker = new HealthChecker(
            { endpoint: "/health", interval: 60000 },
            fetchMock
        );

        checker.start();

        await vi.waitFor(() => {
            expect(checker.healthy).toBe(true);
        });
    });

    it("should report unhealthy when endpoint fails", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("connection refused"));

        const checker = new HealthChecker(
            { endpoint: "/health", interval: 60000 },
            fetchMock
        );

        checker.start();

        await vi.waitFor(() => {
            expect(checker.healthy).toBe(false);
        });
    });

    it("should call onStatusChange on state flip", async () => {
        const onStatusChange = vi.fn();

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                status: 200, ok: true, headers: new Headers(),
                json: async () => ({}), text: async () => "",
                clone() { return this; }
            })
            .mockRejectedValueOnce(new Error("down"));

        const checker = new HealthChecker(
            {
                endpoint: "/health",
                interval: 100,
                onStatusChange
            },
            fetchMock
        );

        checker.start();

        // Wait for the first check (healthy)
        await vi.waitFor(() => {
            expect(checker.healthy).toBe(true);
        });

        // Wait for the interval to trigger the second check (unhealthy)
        await vi.waitFor(() => {
            expect(checker.healthy).toBe(false);
        });

        expect(onStatusChange).toHaveBeenCalledWith(false);
    });

    it("should not start without explicit start()", () => {
        const fetchMock = vi.fn();

        const checker = new HealthChecker(
            { endpoint: "/health", interval: 60000 },
            fetchMock
        );
        // Don't call start()

        expect(fetchMock).not.toHaveBeenCalled();
        expect(checker.healthy).toBe(true);
    });

    it("should stop future checks when stop() is called", async () => {
        let callCount = 0;
        const fetchMock = vi.fn().mockImplementation(async () => {
            callCount++;
            return {
                status: 200, ok: true, headers: new Headers(),
                json: async () => ({}), text: async () => "",
                clone() { return this; }
            };
        });

        const checker = new HealthChecker(
            { endpoint: "/health", interval: 50 },
            fetchMock
        );

        checker.start();

        // Wait for first check
        await vi.waitFor(() => {
            expect(callCount).toBeGreaterThanOrEqual(1);
        });

        const countAfterFirst = callCount;
        checker.stop();

        // Wait a bit — should not increase
        await new Promise((r) => setTimeout(r, 150));
        expect(callCount).toBe(countAfterFirst);
    });

    it("should work through createClient", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            headers: new Headers(),
            json: async () => ({ status: "ok" }),
            text: async () => JSON.stringify({ status: "ok" }),
            clone() { return this; }
        });

        const { createClient } = await import("../src");
        const client = createClient({
            baseURL: "https://api.example.com",
            healthCheck: { enabled: true, endpoint: "/health", interval: 60000 }
        });

        await vi.waitFor(() => {
            expect((client as any).healthCheck).not.toBeNull();
        });
    });
});
