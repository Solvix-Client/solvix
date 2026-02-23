import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";
import { offlineQueue } from "../src/store/offlineQueue";

describe("Offline Mode", () => {

    it("should enqueue request when offline", async () => {

        // Simulate browser
        (global as any).window = {};
        Object.defineProperty(global, 'navigator', {
            value: { onLine: false },
            writable: true,
            configurable: true
        });

        const enqueueSpy = vi.spyOn(offlineQueue, "enqueue");

        const client = createClient({ baseURL: "https://api.example.com" });

        const promise = client.get("/offline", {
            offline: { enabled: true }
        });

        expect(enqueueSpy).toHaveBeenCalled();

        // Should not resolve immediately
        let resolved = false;
        promise.then(() => resolved = true);

        await new Promise(r => setTimeout(r, 10));

        expect(resolved).toBe(false);
    });

    it("should execute when back online", async () => {

        (global as any).window = {};
        Object.defineProperty(global, 'navigator', {
            value: { onLine: false },
            writable: true,
            configurable: true
        });

        let queuedTask: any;

        vi.spyOn(offlineQueue, "enqueue")
            .mockImplementation((task) => {
                queuedTask = task;
            });

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            json: async () => ({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        const promise = client.get("/offline", {
            offline: { enabled: true }
        });

        // Now simulate going online
        (global as any).navigator.onLine = true;

        await queuedTask();

        const result = await promise;

        expect(result.status).toBe(200);
    });

    it("should execute immediately when online", async () => {

        (global as any).window = {};
        Object.defineProperty(global, 'navigator', {
            value: { onLine: true },
            writable: true,
            configurable: true
        });

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            json: async () => ({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.get("/online", {
            offline: { enabled: true }
        });

        expect(res.status).toBe(200);
    });

});

afterEach(() => {
    delete (global as any).window;
    delete (global as any).navigator;
    vi.restoreAllMocks();
});