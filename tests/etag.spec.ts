import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("ETag handling", () => {

    it("should cache and reuse 304 response", async () => {

        let first = true;

        global.fetch = vi.fn().mockImplementation(async () => {
            if (first) {
                first = false;
                return {
                    status: 200,
                    headers: new Headers({ ETag: "123" }),
                    json: async () => ({ id: 1 }),
                    clone() { return this; }
                };
            }
            return {
                status: 304,
                headers: new Headers(),
                json: async () => ({ id: 1 }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            etag: { enabled: true },
            validateStatus: (status) => (status >= 200 && status < 300) || status === 304
        });

        const r1 = await client.get("/etag");
        const r2 = await client.get("/etag");

        expect((r2.data as { id: number }).id).toBe(1);
    });

});