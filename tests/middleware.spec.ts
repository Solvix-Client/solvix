import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";
import type { SolvixMiddleware, SolvixContext } from "../src/types";

describe("User-extensible middleware (use)", () => {

    it("should inject middleware that modifies request headers", async () => {
        let capturedHeader: string | null = null;

        const addHeaderMiddleware: SolvixMiddleware = async (ctx, next) => {
            const headers = new Headers(ctx.options.fetch?.headers);
            headers.set("x-middleware", "injected");
            ctx.options.fetch = { ...ctx.options.fetch, headers };
            await next();
        };

        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            const headers = new Headers(init.headers);
            capturedHeader = headers.get("x-middleware");
            return {
                status: 200, ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({ baseURL: "https://api.example.com" });
        (client as any).use(addHeaderMiddleware);

        await client.get("/test");

        expect(capturedHeader).toBe("injected");
    });

    it("should inject middleware that reads response", async () => {
        let responseStatus = 0;

        const captureResponseMiddleware: SolvixMiddleware = async (ctx, next) => {
            await next();
            responseStatus = ctx.response?.status ?? 0;
        };

        global.fetch = vi.fn().mockResolvedValue({
            status: 201, ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ created: true }),
            text: async () => JSON.stringify({ created: true }),
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });
        (client as any).use(captureResponseMiddleware);

        await client.post("/create", { body: { name: "test" }, bodyType: "json" });

        expect(responseStatus).toBe(201);
    });

    it("should chain multiple middleware in order", async () => {
        const order: number[] = [];

        const mw1: SolvixMiddleware = async (_ctx, next) => {
            order.push(1);
            await next();
            order.push(4);
        };
        const mw2: SolvixMiddleware = async (_ctx, next) => {
            order.push(2);
            await next();
            order.push(3);
        };

        global.fetch = vi.fn().mockResolvedValue({
            status: 200, ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({}),
            text: async () => "{}",
            clone() { return this; }
        });

        const client = createClient({ baseURL: "https://api.example.com" });
        (client as any).use(mw1);
        (client as any).use(mw2);

        await client.get("/chain");

        // Order: mw1 before next → mw2 before next → fetch → mw2 after next → mw1 after next
        expect(order).toEqual([1, 2, 3, 4]);
    });

    it("should handle error-throwing middleware", async () => {
        const errorMw: SolvixMiddleware = async (_ctx, _next) => {
            throw new Error("middleware error");
        };

        global.fetch = vi.fn().mockResolvedValue({
            status: 200, ok: true,
            headers: new Headers(),
            json: async () => ({}),
            text: async () => "{}",
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            retry: { retries: 0 }
        });
        (client as any).use(errorMw);

        await expect(client.get("/error")).rejects.toThrow("middleware error");
    });

    it("should not call fetch if middleware does not call next()", async () => {
        const blockMw: SolvixMiddleware = async (_ctx, _next) => {
            // Never calls next() — fetch should be skipped
        };

        const fetchMock = vi.fn();
        global.fetch = fetchMock;

        const client = createClient({
            baseURL: "https://api.example.com",
            retry: { retries: 0 }
        });
        (client as any).use(blockMw);

        await expect(client.get("/blocked")).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
