import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("paramsSerializer", () => {

    it("should use custom serializer for query params", async () => {
        const capturedUrls: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            capturedUrls.push(url);
            return {
                status: 200, ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            paramsSerializer: (params) => {
                const entries = Object.entries(params);
                const parts = entries.map(([k, v]) => `${encodeURIComponent(k)}[]=${encodeURIComponent(String(v))}`);
                return `https://api.example.com/search?${parts.join("&")}`;
            }
        });

        await client.get("/search", { params: { id: 1, tag: "js" } });

        expect(capturedUrls.length).toBe(1);
        expect(capturedUrls[0]).toContain("id[]=1");
        expect(capturedUrls[0]).toContain("tag[]=js");
    });

    it("should use bracket notation serializer", async () => {
        const capturedUrls: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            capturedUrls.push(url);
            return {
                status: 200, ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            paramsSerializer: (params) => {
                const base = "https://api.example.com/data";
                const parts: string[] = [];
                for (const [key, value] of Object.entries(params)) {
                    if (Array.isArray(value)) {
                        value.forEach(v => parts.push(`${key}[]=${encodeURIComponent(String(v))}`));
                    } else {
                        parts.push(`${key}=${encodeURIComponent(String(value))}`);
                    }
                }
                return `${base}?${parts.join("&")}`;
            }
        });

        await client.get("/data", { params: { ids: [1, 2, 3] } });

        expect(capturedUrls[0]).toContain("ids[]=1");
        expect(capturedUrls[0]).toContain("ids[]=2");
        expect(capturedUrls[0]).toContain("ids[]=3");
    });

    it("should fall back to default serializer when not specified", async () => {
        const capturedUrls: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            capturedUrls.push(url);
            return {
                status: 200, ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({ baseURL: "https://api.example.com" });
        await client.get("/default", { params: { a: 1, b: "hello" } });

        expect(capturedUrls[0]).toContain("a=1");
        expect(capturedUrls[0]).toContain("b=hello");
    });

    it("should use per-request paramsSerializer over global", async () => {
        const capturedUrls: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            capturedUrls.push(url);
            return {
                status: 200, ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            paramsSerializer: () => "https://api.example.com/global-serializer"
        });

        // Per-request override
        await client.get("/test", {
            params: { q: "override" },
            paramsSerializer: (params) => `https://api.example.com/search?q=${params.q}_custom`
        });

        expect(capturedUrls[0]).toBe("https://api.example.com/search?q=override_custom");
    });

    it("should work without any params", async () => {
        const capturedUrl: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (url: string) => {
            capturedUrl.push(url);
            return {
                status: 200, ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                text: async () => JSON.stringify({ ok: true }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            paramsSerializer: (params) => `https://api.example.com/custom?${new URLSearchParams(params).toString()}`
        });

        await client.get("/no-params");

        expect(capturedUrl[0]).toBe("https://api.example.com/no-params");
    });
});
