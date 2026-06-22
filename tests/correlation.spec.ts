import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";
import { applyCorrelationId } from "../src/core/correlation";
import type { SolvixContext } from "../src/types";

describe("Correlation IDs", () => {

    it("should add X-Request-ID header when enabled", async () => {
        const captured: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            const headers = new Headers(init.headers);
            captured.push(headers.get("x-request-id") ?? "");
            return {
                status: 200,
                ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            correlation: { enabled: true }
        });

        await client.get("/test");

        expect(captured.length).toBe(1);
        expect(captured[0]).toBeTruthy();
        expect(captured[0]!.length).toBeGreaterThan(0);
    });

    it("should store correlationId in ctx.meta", () => {
        // Direct unit test of the function
        const ctx = {
            url: "https://api.example.com/test",
            options: {},
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as SolvixContext;

        applyCorrelationId(ctx, { enabled: true });

        expect(ctx.meta.correlationId).toBeTruthy();
        expect(typeof ctx.meta.correlationId).toBe("string");
    });

    it("should use custom header name", async () => {
        const captured: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            const headers = new Headers(init.headers);
            captured.push(headers.get("x-trace-id") ?? "");
            return {
                status: 200,
                ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            correlation: { enabled: true, headerName: "x-trace-id" }
        });

        await client.get("/custom-header");

        expect(captured.length).toBe(1);
        expect(captured[0]).toBeTruthy();
    });

    it("should use custom generator function", () => {
        const ctx = {
            url: "https://api.example.com/test",
            options: {},
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as SolvixContext;

        applyCorrelationId(ctx, { enabled: true, generator: () => "custom-id-123" });

        expect(ctx.meta.correlationId).toBe("custom-id-123");
    });

    it("should not overwrite user-supplied header", async () => {
        const captured: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            const headers = new Headers(init.headers);
            captured.push(headers.get("x-request-id") ?? "");
            return {
                status: 200,
                ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            fetch: { headers: { "x-request-id": "user-supplied" } },
            correlation: { enabled: true }
        });

        await client.get("/no-overwrite");

        expect(captured[0]).toBe("user-supplied");
    });

    it("should work when correlation is not configured", async () => {
        const captured: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            const headers = new Headers(init.headers);
            captured.push(headers.get("x-request-id") ?? "(none)");
            return {
                status: 200,
                ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com"
            // No correlation config
        });

        await client.get("/no-config");

        expect(captured[0]).toBe("(none)");
    });
});
