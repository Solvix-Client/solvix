import { describe, it, expect, vi } from "vitest";
import { createClient, SolvixBus } from "../src";

describe("SolvixBus public API", () => {

    it("should be exported and callable", () => {
        expect(SolvixBus).toBeDefined();
        expect(typeof SolvixBus.on).toBe("function");
        expect(typeof SolvixBus.off).toBe("function");
    });

    it("should fire request:start event", async () => {
        const events: string[] = [];

        const listener = (event: any) => events.push(event.type);
        SolvixBus.on("request:start", listener);

        global.fetch = vi.fn().mockResolvedValue({
            status: 200, ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });
        await client.get("/bus-test");

        SolvixBus.off("request:start", listener);

        expect(events).toContain("request:start");
    });

    it("should fire request:complete event", async () => {
        const events: string[] = [];

        const listener = (event: any) => events.push(event.type);
        SolvixBus.on("request:complete", listener);

        global.fetch = vi.fn().mockResolvedValue({
            status: 200, ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });
        await client.get("/complete");

        SolvixBus.off("request:complete", listener);

        expect(events).toContain("request:complete");
    });

    it("should include context in events", async () => {
        let capturedUrl = "";

        const listener = (event: any) => {
            if (event.context) capturedUrl = event.context.url;
        };
        SolvixBus.on("request:start", listener);

        global.fetch = vi.fn().mockResolvedValue({
            status: 200, ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });
        await client.get("/event-url");

        SolvixBus.off("request:start", listener);

        expect(capturedUrl).toContain("/event-url");
    });
});
