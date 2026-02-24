import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("Retry Logic", () => {

    it("should retry failed request", async () => {

        let calls = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            calls++;
            if (calls < 3) {
                return { status: 500, headers: new Headers(), clone() { return this; } };
            }
            return {
                status: 200,
                headers: new Headers(),
                json: async () => ({ success: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            retry: { retries: 2 }
        });

        const res = await client.get("/retry");

        expect(calls).toBe(3);
        expect(res.status).toBe(200);
    });

});