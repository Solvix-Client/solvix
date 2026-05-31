import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("ETag handling", () => {

    it("should return cached response when the server replies 304", async () => {

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
                json: async () => {
                    throw new Error("304 body should not be parsed");
                },
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            etag: { enabled: true }
        });

        const r1 = await client.get("/etag");
        const r2 = await client.get("/etag");

        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect((r2.data as { id: number }).id).toBe(1);

        const calls = vi.mocked(global.fetch).mock.calls;
        expect(calls).toHaveLength(2);

        const headers = new Headers(calls[1]?.[1]?.headers);

        expect(headers.get("If-None-Match")).toBe("123");
    });

});
