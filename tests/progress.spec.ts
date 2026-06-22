import { describe, it, expect, vi } from "vitest";
import { trackDownloadProgress, trackUploadProgress } from "../src/core/progressReport";
import { createClient } from "../src";

function makeMockResponse(body: string, status = 200, headers?: Record<string, string>): Response {
    const encoded = new TextEncoder().encode(body);
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoded);
            controller.close();
        }
    });

    return new Response(stream, {
        status,
        headers: {
            ...headers,
            ...(headers?.["content-length"]
                ? {}
                : { "content-length": String(encoded.length) })
        }
    });
}

describe("Upload progress tracking", () => {

    it("should report progress for Blob body", async () => {
        const calls: { loaded: number; total?: number }[] = [];

        const blob = new Blob(["hello world"]);
        const wrapped = trackUploadProgress(blob, (p) => calls.push(p));

        // Consume the stream
        const reader = (wrapped as ReadableStream).getReader();
        while (!(await reader.read()).done) { /* drain */ }

        expect(calls.length).toBeGreaterThan(0);
        const last = calls[calls.length - 1]!;
        expect(last.loaded).toBe(11);
        expect(last.total).toBe(11);
    });

    it("should report progress for string body", async () => {
        const calls: { loaded: number; total?: number }[] = [];

        const wrapped = trackUploadProgress("test data", (p) => calls.push(p));

        const reader = (wrapped as ReadableStream).getReader();
        while (!(await reader.read()).done) { /* drain */ }

        expect(calls.length).toBeGreaterThan(0);
        const last = calls[calls.length - 1]!;
        expect(last.total).toBe(9);
    });

    it("should not wrap FormData (no progress available)", () => {
        const fd = new FormData();
        fd.append("key", "value");

        const wrapped = trackUploadProgress(fd as unknown as BodyInit, vi.fn());
        expect(wrapped).toBe(fd);
    });

    it("should not wrap ReadableStream (no progress available)", () => {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("data"));
                controller.close();
            }
        });

        const wrapped = trackUploadProgress(stream, vi.fn());
        expect(wrapped).toBe(stream);
    });
});

describe("Download progress tracking", () => {

    it("should report progress for each chunk", async () => {
        const calls: { loaded: number; total?: number }[] = [];

        const response = makeMockResponse("Hello Solvix", 200);
        const tracked = trackDownloadProgress(response, (p) => calls.push(p));

        await tracked.text();

        expect(calls.length).toBeGreaterThan(0);
        const last = calls[calls.length - 1]!;
        expect(last.loaded).toBe(12);
        expect(last.total).toBe(12);
    });

    it("should report progress for larger payload", async () => {
        const calls: { loaded: number; total?: number }[] = [];
        const bigData = "x".repeat(10000);

        const response = makeMockResponse(bigData, 200);
        const tracked = trackDownloadProgress(response, (p) => calls.push(p));

        await tracked.text();

        const last = calls[calls.length - 1]!;
        expect(last.loaded).toBe(10000);
        expect(last.total).toBe(10000);
    });

    it("should propagate headers from original response", async () => {
        const calls: { loaded: number; total?: number }[] = [];

        const response = new Response("hello", {
            status: 201,
            headers: { "x-custom": "val" }
        });

        const tracked = trackDownloadProgress(response, (p) => calls.push(p));

        expect(tracked.status).toBe(201);
        expect(tracked.headers.get("x-custom")).toBe("val");
    });

    it("should pass through response without body", () => {
        const response = new Response(null, { status: 204 });
        const tracked = trackDownloadProgress(response, vi.fn());
        expect(tracked.status).toBe(204);
    });
});

describe("Progress via client hooks", () => {

    it("should fire onDownloadProgress for a GET request", async () => {
        const progressCalls: number[] = [];

        global.fetch = vi.fn().mockImplementation(async () => {
            const body = JSON.stringify({ msg: "ok" });
            return new Response(body, {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            hooks: {
                onDownloadProgress: (p) => {
                    progressCalls.push(p.loaded);
                }
            }
        });

        const res = await client.get("/data");
        expect(res.status).toBe(200);
        expect(progressCalls.length).toBeGreaterThan(0);
        expect(progressCalls[progressCalls.length - 1]!).toBeGreaterThan(0);
    });

    it("should fire onUploadProgress for a POST with body", async () => {
        const progressCalls: { loaded: number; total?: number }[] = [];

        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            if (init.body instanceof ReadableStream) {
                const reader = init.body.getReader();
                while (!(await reader.read()).done) { /* drain */ }
            }

            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            hooks: {
                onUploadProgress: (p) => {
                    progressCalls.push({ loaded: p.loaded, ...(p.total !== undefined && { total: p.total }) });
                }
            }
        });

        const payload = { name: "Solvix", version: "1.0" };
        await client.post("/upload", {
            body: JSON.stringify(payload),
            bodyType: "text"
        });

        expect(progressCalls.length).toBeGreaterThan(0);
        const last = progressCalls[progressCalls.length - 1]!;
        expect(last.loaded).toBeGreaterThan(0);
    });

    it("should handle progress percent when total is known", async () => {
        const calls: { loaded: number; total?: number; percent?: number }[] = [];

        const client = createClient({
            baseURL: "https://api.example.com",
            hooks: {
                onUploadProgress: (p) => {
                    const percent = p.total ? Math.round((p.loaded / p.total) * 100) : undefined;
                    calls.push({
                        loaded: p.loaded,
                        ...(p.total !== undefined && { total: p.total }),
                        ...(percent !== undefined && { percent })
                    });
                }
            }
        });

        const body = "exact size payload";
        global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            if (init.body instanceof ReadableStream) {
                const reader = init.body.getReader();
                while (!(await reader.read()).done) { /* drain */ }
            }
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        });

        await client.post("/test", { body, bodyType: "text" });

        const last = calls[calls.length - 1];
        expect(last?.percent).toBe(100);
    });
});
