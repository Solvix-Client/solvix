import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("Dependency Chain", () => {

    it("should wait for dependency", async () => {

        let resolveFirst: any;

        global.fetch = vi.fn()
            .mockImplementationOnce(() => new Promise(res => resolveFirst = res))
            .mockResolvedValue({
                status: 200,
                headers: new Headers(),
                json: async () => ({ ok: true }),
                clone() { return this; }
            });

        const client = createClient({ baseURL: "https://api.example.com" });

        const p1 = client.get("/a", { id: "first" });
        const p2 = client.get("/b", { dependsOn: ["first"] });

        // Wait a bit for resolveFirst to be captured, then resolve
        await new Promise(r => setTimeout(r, 10));

        resolveFirst({
            status: 200,
            headers: new Headers(),
            json: async () => ({ ok: true }),
            clone() { return this; }
        });

        await p1;
        await p2;
    });

});