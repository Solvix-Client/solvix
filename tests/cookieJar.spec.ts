import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";
import { CookieJar } from "../src/store/cookieJar";

describe("CookieJar", () => {

    it("should store cookies from Set-Cookie header", () => {
        const jar = new CookieJar({ enabled: true });
        const response = new Response(null, {
            headers: { "set-cookie": "session=abc123; Path=/" }
        });

        jar.setFromResponse(response);

        const headers = jar.getRequestHeaders("https://example.com");
        expect(headers.Cookie).toContain("session=abc123");
    });

    it("should attach Cookie header on subsequent requests", () => {
        const jar = new CookieJar({ enabled: true });

        // First response sets a cookie
        const response1 = new Response(null, {
            headers: { "set-cookie": "token=xyz789; Path=/" }
        });
        jar.setFromResponse(response1);

        // Next request should include the cookie
        const headers = jar.getRequestHeaders("https://example.com/data");
        expect(headers.Cookie).toBe("token=xyz789");
    });

    it("should not crash on missing Set-Cookie", () => {
        const jar = new CookieJar({ enabled: true });
        const response = new Response(null, { headers: {} });

        // Should not throw
        jar.setFromResponse(response);

        expect(jar.getRequestHeaders("https://example.com")).toEqual({});
    });

    it("should clear all cookies on clear()", () => {
        const jar = new CookieJar({ enabled: true });
        const response = new Response(null, {
            headers: { "set-cookie": "foo=bar" }
        });

        jar.setFromResponse(response);
        jar.clear();

        expect(jar.getRequestHeaders("https://example.com")).toEqual({});
    });

    it("should work through the client in actual requests", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            callCount++;

            if (callCount === 1) {
                // First response sets a cookie
                return {
                    status: 200,
                    ok: true,
                    headers: new Headers({
                        "content-type": "application/json",
                        "set-cookie": "jar_token=abc123; Path=/"
                    }),
                    json: async () => ({ ok: true }),
                    text: async () => JSON.stringify({ ok: true }),
                    clone() { return this; }
                };
            }

            // Second request should include the cookie
            const reqHeaders = new Headers(init.headers);
            const hasCookie = reqHeaders.has("cookie") && reqHeaders.get("cookie")!.includes("jar_token=abc123");
            return {
                status: 200,
                ok: true,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ cookieSent: hasCookie }),
                text: async () => JSON.stringify({ cookieSent: hasCookie }),
                clone() { return this; }
            };
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            cookieJar: { enabled: true }
        });

        // First request — gets the cookie
        await client.get("/login");

        // Second request — sends the cookie
        const res = await client.get("/profile");
        expect(res.data).toEqual({ cookieSent: true });
    });

    it("should return empty object when no cookies stored", () => {
        const jar = new CookieJar({ enabled: true });
        expect(jar.getRequestHeaders("https://example.com")).toEqual({});
    });
});
