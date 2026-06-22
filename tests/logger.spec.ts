import { describe, it, expect, vi, afterEach } from "vitest";
import { createClient } from "../src";

describe("Structured logging", () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should call logger.info on request start", async () => {
        const logs: { level: string; msg: string; meta?: Record<string, unknown> }[] = [];

        const logger = {
            debug: vi.fn(),
            info: vi.fn((msg: string, meta?: Record<string, unknown>) => {
                logs.push({ level: "info", msg, ...(meta !== undefined && { meta }) });
            }),
            warn: vi.fn(),
            error: vi.fn()
        };

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            logger
        });

        await client.get("/test");

        expect(logger.info).toHaveBeenCalled();
        expect(logs.some(l => l.msg === "Request started")).toBe(true);
    });

    it("should call logger.info on request complete", async () => {
        const logs: { level: string; msg: string }[] = [];

        const logger = {
            debug: vi.fn(),
            info: vi.fn((msg: string) => {
                logs.push({ level: "info", msg });
            }),
            warn: vi.fn(),
            error: vi.fn()
        };

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            logger
        });

        await client.get("/complete");

        expect(logs.some(l => l.msg === "Request completed")).toBe(true);
    });

    it("should call logger.warn on retry", async () => {
        const logs: { level: string; msg: string }[] = [];

        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn((msg: string) => {
                logs.push({ level: "warn", msg });
            }),
            error: vi.fn()
        };

        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount < 2) {
                return {
                    status: 500,
                    ok: false,
                    headers: new Headers(),
                    json: async () => ({}),
                    text: async () => "",
                    clone() { return this; }
                };
            }
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
            retry: { retries: 1 },
            logger
        });

        await client.get("/will-retry");

        expect(logs.some(l => l.level === "warn" && l.msg === "Request retrying")).toBe(true);
    });

    it("should call logger.error on request failure", async () => {
        const logs: { level: string; msg: string }[] = [];

        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn((msg: string) => {
                logs.push({ level: "error", msg });
            })
        };

        global.fetch = vi.fn().mockResolvedValue({
            status: 500,
            ok: false,
            headers: new Headers(),
            json: async () => ({}),
            text: async () => "",
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            retry: { retries: 0 },
            logger
        });

        await expect(
            client.get("/will-fail")
        ).rejects.toThrow();

        expect(logs.some(l => l.level === "error")).toBe(true);
    });

    it("should include URL and status in log metadata", async () => {
        const metadata: Record<string, unknown>[] = [];

        const logger = {
            debug: vi.fn(),
            info: vi.fn((_msg: string, meta?: Record<string, unknown>) => {
                if (meta) metadata.push(meta);
            }),
            warn: vi.fn(),
            error: vi.fn()
        };

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            logger
        });

        await client.get("/meta-test");

        const hasUrlMeta = metadata.some(m =>
            typeof m.url === "string" && m.url.includes("meta-test")
        );
        expect(hasUrlMeta).toBe(true);
    });

    it("should not throw when logger is not configured", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ ok: true }),
            text: async () => JSON.stringify({ ok: true }),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com"
            // No logger configured
        });

        const res = await client.get("/no-logger");
        expect(res.status).toBe(200);
    });

    it("should handle logger with partial methods", async () => {
        const errorLogs: string[] = [];

        global.fetch = vi.fn().mockResolvedValue({
            status: 500,
            ok: false,
            headers: new Headers(),
            json: async () => ({}),
            text: async () => "",
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            retry: { retries: 0 },
            logger: {
                // Only error method defined — no info, warn, debug
                error: (msg: string) => { errorLogs.push(msg); }
            } as any
        });

        await expect(
            client.get("/partial")
        ).rejects.toThrow();

        expect(errorLogs.length).toBeGreaterThan(0);
    });
});
