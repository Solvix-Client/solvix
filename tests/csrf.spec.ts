import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";
import { applyCSRF } from "../src/security/csrfProtector";
import type { SolvixContext } from "../src/types";

describe("CSRF Protection", () => {

    it("should inject CSRF header for POST when cookie is present", () => {
        const ctx = {
            url: "https://api.example.com/submit",
            options: { fetch: { method: "POST" as const } },
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyCSRF(ctx, {
            enabled: true,
            getCookie: () => "csrf-token-123"
        });

        const headers = new Headers(ctx.options.fetch?.headers);
        expect(headers.get("x-xsrf-token")).toBe("csrf-token-123");
    });

    it("should not inject for GET requests", () => {
        const ctx = {
            url: "https://api.example.com/data",
            options: { fetch: { method: "GET" as const } },
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyCSRF(ctx, {
            enabled: true,
            getCookie: () => "token"
        });

        expect(ctx.options.fetch?.headers).toBeUndefined();
    });

    it("should use custom cookie and header names", () => {
        const ctx = {
            url: "https://api.example.com/submit",
            options: { fetch: { method: "POST" as const } },
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyCSRF(ctx, {
            enabled: true,
            cookieName: "MY_CSRF",
            headerName: "X-MY-CSRF",
            getCookie: () => "my-token"
        });

        const headers = new Headers(ctx.options.fetch?.headers);
        expect(headers.get("x-my-csrf")).toBe("my-token");
    });

    it("should use custom methods list", () => {
        const ctx = {
            url: "https://api.example.com/patch",
            options: { fetch: { method: "PATCH" as const } },
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        // Only POST and PUT specified — PATCH should not get CSRF
        applyCSRF(ctx, {
            enabled: true,
            methods: ["POST", "PUT"],
            getCookie: () => "token"
        });

        expect(ctx.options.fetch?.headers).toBeUndefined();
    });

    it("should not overwrite user-supplied header", () => {
        const ctx = {
            url: "https://api.example.com/submit",
            options: { fetch: { method: "POST" as const, headers: { "x-xsrf-token": "user-token" } } },
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyCSRF(ctx, {
            enabled: true,
            getCookie: () => "should-not-override"
        });

        const headers = new Headers(ctx.options.fetch?.headers);
        expect(headers.get("x-xsrf-token")).toBe("user-token");
    });

    it("should work when CSRF not configured", () => {
        const ctx = {
            url: "https://api.example.com/submit",
            options: { fetch: { method: "POST" as const } },
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyCSRF(ctx, undefined);
        // Should not throw
        expect(ctx.options.fetch?.headers).toBeUndefined();
    });

    it("should inject CSRF header in actual POST request via client", async () => {
        const captured: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            const headers = new Headers(init.headers);
            captured.push(headers.get("x-xsrf-token") ?? "");
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
            csrf: {
                enabled: true,
                getCookie: () => "real-token"
            }
        });

        await client.post("/submit", { body: { name: "test" }, bodyType: "json" });

        expect(captured.length).toBe(1);
        expect(captured[0]).toBe("real-token");
    });
});
