import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("Concurrency Control", () => {

    it("should respect maxConcurrency", async () => {

        let active = 0;
        let maxSeen = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            active++;
            maxSeen = Math.max(maxSeen, active);

            await new Promise(r => setTimeout(r, 50));

            active--;

            return {
                status: 200,
                headers: new Headers(),
                json: async () => ({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            maxConcurrency: 3
        });

        await Promise.all(
            Array.from({ length: 10 }).map(() =>
                client.get("/test")
            )
        );

        expect(maxSeen).toBeLessThanOrEqual(3);
    });

});