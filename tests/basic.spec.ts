import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("Basic API functionality", () => {

    it("should perform simple GET request", async () => {

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            json: async () => ({ id: 1 }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.get("/test");

        expect(res.status).toBe(200);
        expect((res.data as { id: number }).id).toBe(1);
    });

    it("should serialize JSON body", async () => {

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            json: async () => ({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });

        await client.post("/test", {
            body: { name: "Solvix" },
            bodyType: "json"
        });

        expect(global.fetch).toHaveBeenCalled();
    });

});