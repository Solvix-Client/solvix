import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";

describe("Header Sanitizer", () => {
    let capturedInit: RequestInit | undefined;

    beforeEach(() => {
        capturedInit = undefined;
        global.fetch = vi.fn().mockImplementation(async (_url, init) => {
            capturedInit = init;
            return {
                status: 200,
                headers: new Headers({ "content-type": "application/json" }),
                json: async () => ({ ok: true }),
                clone() { return this; }
            };
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("blockInsecureHeaders (GET requests — the bug)", () => {
        it("should strip Authorization on GET when blockInsecureHeaders is true", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: true }
            });

            await client.get("/data", {
                fetch: { headers: { Authorization: "Bearer secret" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("Authorization")).toBeNull();
        });

        it("should strip Cookie on GET when blockInsecureHeaders is true", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: true }
            });

            await client.get("/data", {
                fetch: { headers: { Cookie: "session=abc123" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("Cookie")).toBeNull();
        });

        it("should strip Proxy-Authorization on GET when blockInsecureHeaders is true", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: true }
            });

            await client.get("/data", {
                fetch: { headers: { "Proxy-Authorization": "Basic test" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("Proxy-Authorization")).toBeNull();
        });

        it("should strip X-Forwarded-For on GET when blockInsecureHeaders is true", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: true }
            });

            await client.get("/data", {
                fetch: { headers: { "X-Forwarded-For": "1.2.3.4" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("X-Forwarded-For")).toBeNull();
        });

        it("should strip X-Api-Key on GET when blockInsecureHeaders is true", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: true }
            });

            await client.get("/data", {
                fetch: { headers: { "X-Api-Key": "test-key" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("X-Api-Key")).toBeNull();
        });

        it("should strip all insecure headers in a single GET request", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: true }
            });

            await client.get("/data", {
                fetch: {
                    headers: {
                        Authorization: "Bearer secret-token",
                        Cookie: "session=abc123",
                        "Proxy-Authorization": "Basic test",
                        "X-Forwarded-For": "1.2.3.4",
                        "X-Api-Key": "test-key"
                    }
                }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("Authorization")).toBeNull();
            expect(sentHeaders.get("Cookie")).toBeNull();
            expect(sentHeaders.get("Proxy-Authorization")).toBeNull();
            expect(sentHeaders.get("X-Forwarded-For")).toBeNull();
            expect(sentHeaders.get("X-Api-Key")).toBeNull();
        });
    });

    describe("blockInsecureHeaders (POST/PUT requests)", () => {
        it("should strip insecure headers on POST when blockInsecureHeaders is true", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: true }
            });

            await client.post("/submit", {
                body: { key: "value" },
                bodyType: "json",
                fetch: { headers: { Authorization: "Bearer secret" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("Authorization")).toBeNull();
        });
    });

    describe("blockInsecureHeaders: false", () => {
        it("should allow insecure headers to pass through", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: false }
            });

            await client.get("/data", {
                fetch: { headers: { Authorization: "Bearer secret" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("Authorization")).toBe("Bearer secret");
        });
    });

    describe("default (no security config)", () => {
        it("should allow insecure headers by default", async () => {
            const client = createClient({
                baseURL: "https://api.example.com"
            });

            await client.get("/data", {
                fetch: { headers: { Authorization: "Bearer secret" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("Authorization")).toBe("Bearer secret");
        });
    });

    describe("forbidden headers (always stripped)", () => {
        it("should strip Host header regardless of blockInsecure", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: false }
            });

            await client.get("/data", {
                fetch: { headers: { Host: "evil.com" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("Host")).toBeNull();
        });

        it("should strip Content-Length header regardless of blockInsecure", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: false }
            });

            await client.get("/data", {
                fetch: { headers: { "Content-Length": "99999" } }
            });

            const sentHeaders = new Headers(capturedInit?.headers);
            expect(sentHeaders.get("Content-Length")).toBeNull();
        });
    });

    describe("CRLF injection (always throws)", () => {
        it("should throw on CRLF injection in header value", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: false }
            });

            await expect(
                client.get("/data", {
                    fetch: { headers: { "X-Custom": "valid\r\nInjected: true" } }
                })
            ).rejects.toThrow("Invalid header value detected");
        });

        it("should throw on CRLF injection even when blockInsecureHeaders is true", async () => {
            const client = createClient({
                baseURL: "https://api.example.com",
                security: { blockInsecureHeaders: true }
            });

            await expect(
                client.get("/data", {
                    fetch: { headers: { "X-Custom": "valid\nInjected: true" } }
                })
            ).rejects.toThrow("Invalid header value detected");
        });
    });
});
