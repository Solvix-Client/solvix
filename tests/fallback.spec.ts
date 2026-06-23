import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

function makeTransportOk(data: unknown) {
    return vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => data,
        text: async () => JSON.stringify(data),
        clone() { return this; }
    });
}

function makeTransportFail(status = 500) {
    return vi.fn().mockResolvedValue({
        status,
        ok: false,
        headers: new Headers(),
        json: async () => ({ error: "fail" }),
        text: async () => JSON.stringify({ error: "fail" }),
        clone() { return this; }
    });
}

describe("Graceful fallback URLs", () => {

    it("should use primary URL when it succeeds", async () => {
        global.fetch = makeTransportOk({ ok: true });

        const client = createClient({
            baseURL: "https://primary.example.com",
            fallbackURLs: ["https://backup.example.com/alt"]
        });

        const res = await client.get("/data");
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ ok: true });
    });

    it("should try fallback URL when primary fails with retryable error", async () => {
        let calls = 0;

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            calls++;
            // Primary URL fails for all retry attempts
            if (calls <= 2) {
                return makeTransportFail(500)();
            }
            // Fallback URL succeeds
            return makeTransportOk({ from: "backup", url })();
        });

        const client = createClient({
            baseURL: "https://primary.example.com",
            retry: { retries: 1 }, // 2 attempts on primary
            fallbackURLs: ["https://backup.example.com/alt"]
        });

        const res = await client.get("/data");
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ from: "backup", url: "https://backup.example.com/alt" });
    });

    it("should not try fallback for non-retryable errors (4xx)", async () => {
        global.fetch = makeTransportFail(400);

        const client = createClient({
            baseURL: "https://primary.example.com",
            fallbackURLs: ["https://backup.example.com/alt"]
        });

        await expect(
            client.get("/bad-request")
        ).rejects.toThrow();
    });

    it("should throw when all fallback URLs exhausted", async () => {
        global.fetch = makeTransportFail(500);

        const client = createClient({
            baseURL: "https://primary.example.com",
            retry: { retries: 0 }, // no retries, go straight to fallback
            fallbackURLs: ["https://fallback1.example.com", "https://fallback2.example.com"]
        });

        await expect(
            client.get("/all-dead")
        ).rejects.toThrow();
    });

    it("should use fallback URL for POST requests", async () => {
        let callIdx = 0;

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            callIdx++;
            if (callIdx <= 2) {
                return makeTransportFail(500)();
            }
            return makeTransportOk({ from: "backup", url })();
        });

        const client = createClient({
            baseURL: "https://primary.example.com",
            retry: { retries: 1 },
            fallbackURLs: ["https://backup.example.com/post-alt"]
        });

        const res = await client.post("/submit", {
            body: { data: "test" }
        });
        expect(res.data).toEqual({ from: "backup", url: "https://backup.example.com/post-alt" });
    });

    it("should work correctly with no fallbackURLs configured", async () => {
        global.fetch = makeTransportOk({ ok: true });

        const client = createClient({
            baseURL: "https://api.example.com"
        });

        const res = await client.get("/normal");
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ ok: true });
    });
});
