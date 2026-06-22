import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

function makeTransport(body: unknown, status = 200) {
    return vi.fn().mockResolvedValue({
        status,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
        text: async () => JSON.stringify(body),
        clone() { return this; }
    });
}

describe("Response schema validation", () => {

    it("should pass valid data through the callback", async () => {
        global.fetch = makeTransport({ id: 1, name: "Solvix" });

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.get<{ id: number; name: string }>("/valid", {
            validateResponse: (data: unknown) => {
                const d = data as { id: number; name: string };
                if (typeof d.id !== "number") throw new Error("id must be a number");
                return d;
            }
        });

        expect(res.data.id).toBe(1);
        expect(res.data.name).toBe("Solvix");
    });

    it("should throw SolvixError when validation fails", async () => {
        global.fetch = makeTransport({ id: "not-a-number", name: "Broken" });

        const client = createClient({ baseURL: "https://api.example.com" });

        await expect(
            client.get("/invalid", {
                validateResponse: (data: unknown) => {
                    const d = data as { id: number };
                    if (typeof d.id !== "number") throw new Error("id must be a number");
                    return d;
                }
            })
        ).rejects.toThrow("Response validation failed: id must be a number");
    });

    it("should throw SolvixError with generic message for non-Error throws", async () => {
        global.fetch = makeTransport({ bad: true });

        const client = createClient({ baseURL: "https://api.example.com" });

        await expect(
            client.get("/crash", {
                validateResponse: () => {
                    throw "string error"; // not an Error instance
                }
            })
        ).rejects.toThrow("Response validation failed: string error");
    });

    it("should work with Zod-style validation pattern", async () => {
        global.fetch = makeTransport({ email: "test@example.com" });

        const client = createClient({ baseURL: "https://api.example.com" });

        // Simulated Zod parse — matches how users would use it
        const res = await client.get<{ email: string }>("/zod", {
            validateResponse: (data: unknown) => {
                const d = data as { email: string };
                if (!d.email?.includes("@")) throw new Error("Invalid email");
                return d;
            }
        });

        expect(res.data.email).toBe("test@example.com");
    });

    it("should not affect requests without validateResponse", async () => {
        global.fetch = makeTransport({ ok: true });

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.get<{ ok: boolean }>("/no-validation");
        expect(res.data.ok).toBe(true);
    });

    it("should validate POST response data", async () => {
        global.fetch = makeTransport({ created: true, id: 42 });

        const client = createClient({ baseURL: "https://api.example.com" });

        const res = await client.post<{ created: boolean; id: number }>("/create", {
            body: { name: "test" },
            validateResponse: (data: unknown) => {
                const d = data as { created: boolean; id: number };
                if (!d.created) throw new Error("not created");
                if (typeof d.id !== "number") throw new Error("id must be number");
                return d;
            }
        });

        expect(res.data.created).toBe(true);
        expect(res.data.id).toBe(42);
    });

    it("should fail on invalid POST response", async () => {
        global.fetch = makeTransport({ created: false, id: null });

        const client = createClient({ baseURL: "https://api.example.com" });

        await expect(
            client.post("/create-fail", {
                body: { name: "test" },
                validateResponse: (data: unknown) => {
                    const d = data as { created: boolean };
                    if (!d.created) throw new Error("Server rejected creation");
                    return d;
                }
            })
        ).rejects.toThrow("Response validation failed: Server rejected creation");
    });
});
