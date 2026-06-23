import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";
import { applyTracing, generateTraceId, generateSpanId, buildTraceParent } from "../src/core/tracer";
import type { SolvixContext } from "../src/types";

describe("Tracing helpers", () => {

    it("should generate a 32-char hex trace ID", () => {
        const id = generateTraceId();
        expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should generate a 16-char hex span ID", () => {
        const id = generateSpanId();
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should build a valid W3C traceparent", () => {
        const result = buildTraceParent("a".repeat(32), "b".repeat(16));
        expect(result).toBe(`00-${"a".repeat(32)}-${"b".repeat(16)}-01`);
    });
});

describe("Distributed Tracing (applyTracing)", () => {

    it("should inject traceparent header when enabled", () => {
        const ctx = {
            url: "https://api.example.com/test",
            options: {},
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyTracing(ctx, { enabled: true }, 0);

        const headers = new Headers(ctx.options.fetch?.headers);
        const tp = headers.get("traceparent");
        expect(tp).toBeTruthy();
        expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
        expect(ctx.meta.traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(ctx.meta.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should use same traceId across attempts but different spanId", () => {
        const ctx = {
            url: "https://api.example.com/test",
            options: {},
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyTracing(ctx, { enabled: true }, 0);
        const traceId1 = ctx.meta.traceId;
        const spanId1 = ctx.meta.spanId;

        applyTracing(ctx, { enabled: true }, 1);
        expect(ctx.meta.traceId).toBe(traceId1);
        expect(ctx.meta.spanId).not.toBe(spanId1);
    });

    it("should emit traceparent header in actual fetch call", async () => {

        const captured: string[] = [];

        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            const headers = new Headers(init.headers);
            captured.push(headers.get("traceparent") ?? "");
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
            tracing: { enabled: true }
        });

        await client.get("/trace");

        expect(captured.length).toBe(1);
        expect(captured[0]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });

    it("should respect user-supplied trace header", () => {
        const ctx = {
            url: "https://api.example.com/test",
            options: { fetch: { headers: { traceparent: "00-user-supplied-trace-id" } } },
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyTracing(ctx, { enabled: true }, 0);
        const headers = new Headers(ctx.options.fetch?.headers);
        expect(headers.get("traceparent")).toBe("00-user-supplied-trace-id");
    });

    it("should not inject when tracing is not configured", () => {
        const ctx = {
            url: "https://api.example.com/test",
            options: {},
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyTracing(ctx, undefined, 0);
        expect(ctx.meta.traceId).toBeUndefined();
    });

    it("should not inject when disabled", () => {
        const ctx = {
            url: "https://api.example.com/test",
            options: {},
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyTracing(ctx, { enabled: false }, 0);
        expect(ctx.meta.traceId).toBeUndefined();
    });

    it("should use custom trace header name", () => {
        const ctx = {
            url: "https://api.example.com/test",
            options: {},
            meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now() }
        } as unknown as SolvixContext;

        applyTracing(ctx, { enabled: true, traceHeader: "x-cloud-trace-context" }, 0);

        const headers = new Headers(ctx.options.fetch?.headers);
        expect(headers.get("x-cloud-trace-context")).toBeTruthy();
        expect(headers.get("traceparent")).toBeNull();
    });
});
