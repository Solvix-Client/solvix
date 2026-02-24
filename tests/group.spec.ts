import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("Request Group", () => {

    it("should abort all requests in group", async () => {

        const { RequestGroup } = await import("../src");

        const group = new RequestGroup("test-group");

        global.fetch = vi.fn(() => new Promise(() => { })) as unknown as typeof fetch;

        const client = createClient({ baseURL: "https://api.example.com" });

        const p1 = client.get("/a", { group });
        const p2 = client.get("/b", { group });

        group.abort();

        await expect(p1).rejects.toThrow();
        await expect(p2).rejects.toThrow();
    });

});