import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "../src";

describe("Shadow Mode", () => {

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("should dispatch shadow request to secondary endpoint", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            json: async () => ({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        await client.get("/primary", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        // Primary + shadow = 2 fetch calls
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe("https://api.example.com/primary");
        expect(vi.mocked(global.fetch).mock.calls[1][0]).toBe("https://shadow.api/primary");
    });

    it("should return primary response to caller (not shadow)", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                json: async () => ({ source: "primary", value: 1 }),
                clone() { return this; }
            })
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                json: async () => ({ source: "shadow", value: 2 }),
                clone() { return this; }
            });

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.get<{ source: string; value: number }>("/data", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        // Must receive primary, not shadow
        expect(res.data.source).toBe("primary");
        expect(res.data.value).toBe(1);
    });

    it("should not delay primary response (non-blocking)", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                json: async () => ({ ok: true }),
                clone() { return this; }
            })
            .mockImplementationOnce(async () => {
                await new Promise(r => setTimeout(r, 500));
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

        expect(duration).toBeLessThan(100);
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
            .mockRejectedValueOnce(new Error("Shadow network failure"));

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.get<{ primary: boolean }>("/test", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        // Primary still succeeds despite shadow failure
        expect(res.data.primary).toBe(true);
        expect(vi.mocked(global.fetch).mock.calls).toHaveLength(2);
    });

    it("should detect response differences via callback", async () => {
        global.fetch = vi.fn()
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

        const onDiff = vi.fn();

        const client = createClient({ baseURL: "https://api.example.com" });

        await client.get("/test", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api",
                compareResponse: true,
                onDifference: onDiff
            }
        });

        // Wait for shadow (fire-and-forget)
        await vi.waitFor(() => {
            expect(onDiff).toHaveBeenCalledTimes(1);
        });

        const [primary, secondary] = onDiff.mock.calls[0];
        expect(primary.data).toEqual({ value: 1 });
        expect(secondary.data).toEqual({ value: 2 });
    });

    it("should not call onDifference when responses match", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                json: async () => ({ value: 42 }),
                clone() { return this; }
            })
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
                json: async () => ({ value: 42 }),
                clone() { return this; }
            });

        const onDiff = vi.fn();

        const client = createClient({ baseURL: "https://api.example.com" });

        await client.get("/test", {
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api",
                compareResponse: true,
                onDifference: onDiff
            }
        });

        // Give shadow time to complete
        await new Promise(r => setTimeout(r, 10));
        expect(onDiff).not.toHaveBeenCalled();
    });

    it("should strip sensitive headers from shadow request when preventShadowTokenLeak is enabled", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            json: async () => ({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            security: { preventShadowTokenLeak: true }
        });

        await client.get("/data", {
            fetch: {
                headers: {
                    Authorization: "Bearer secret-token",
                    "X-Api-Key": "test-key",
                    "X-Custom": "safe-header"
                }
            },
            shadow: {
                enabled: true,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        const shadowInit = vi.mocked(global.fetch).mock.calls[1][1];
        const shadowHeaders = new Headers(shadowInit?.headers);
        expect(shadowHeaders.get("Authorization")).toBeNull();
        expect(shadowHeaders.get("X-Api-Key")).toBeNull();
        expect(shadowHeaders.get("X-Custom")).toBe("safe-header");
    });

    it("should not dispatch shadow when enabled is false", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            json: async () => ({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        await client.get("/test", {
            shadow: {
                enabled: false,
                secondaryBaseURL: "https://shadow.api"
            }
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
