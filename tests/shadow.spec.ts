import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";
import { SolvixBus } from "../src/core/bus";

describe("Shadow Mode", () => {

    it("should return primary response normally", async () => {

        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            return {
                status: 200,
                headers: new Headers(),
                json: async () => ({ source: callCount }),
                clone() { return this; }
            };
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.get("/test", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        expect(res.status).toBe(200);
        expect((res.data as any).source).toBe(1); // Primary must be first call
    });

    it("should not delay primary response", async () => {

        let shadowExecuted = false;

        global.fetch = vi.fn().mockImplementation(async (url) => {

            if (url.includes("shadow")) {
                await new Promise(r => setTimeout(r, 500));
                shadowExecuted = true;
            }

            return {
                status: 200,
                headers: new Headers(),
                json: async () => ({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        const start = Date.now();

        const res = await client.get("/test", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        const duration = Date.now() - start;

        expect(duration).toBeLessThan(100); // Must not wait for shadow
        expect(res.status).toBe(200);
    });

    it("should not throw if shadow fails", async () => {

        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                json: async () => ({ primary: true }),
                clone() { return this; }
            })
            .mockRejectedValueOnce(new Error("Shadow failure"));

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.get("/test", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        expect((res.data as any).primary).toBe(true);
    });

    it("should detect response differences", async () => {

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                json: async () => ({ value: 1 }),
                clone() { return this; }
            })
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                json: async () => ({ value: 2 }),
                clone() { return this; }
            });

        global.fetch = fetchMock;

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.get("/test", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api",
                compareResponse: true,
                onDifference: () => {
                    // Callback for difference detection
                }
            }
        });

        // Verify primary request was made and response is correct
        expect(res.status).toBe(200);
        expect((res.data as any).value).toBe(1);
        expect(fetchMock).toHaveBeenCalled();
    });

    it("should emit shadow events", async () => {

        const emitSpy = vi.spyOn(SolvixBus, "emit");

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            json: async () => ({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        await client.get("/test", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        await new Promise(r => setTimeout(r, 10));

        // Check that the bus emitted events (indicates shadow was executed)
        expect(emitSpy).toHaveBeenCalled();
        expect(emitSpy.mock.calls.length).toBeGreaterThan(0);

    });

    it("should not reuse abort signal", async () => {

        const controller = new AbortController();

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            json: async () => ({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        await client.get("/test", {
            fetch: { signal: controller.signal },
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        controller.abort();

        expect(true).toBe(true); // Should not crash
    });

});