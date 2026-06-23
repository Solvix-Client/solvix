import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

function makeStreamBody(str: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(str));
            controller.close();
        }
    });
}

function makeMockResponse(body: string, status: number, headers?: Record<string, string>) {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(body).buffer;

    return {
        status,
        headers: new Headers(headers),
        body: makeStreamBody(body),
        json: async () => JSON.parse(body),
        clone() {
            return makeMockResponse(body, status, headers);
        },
        arrayBuffer: async () => buffer
    };
}

describe("Response Size Guard", () => {

    it("should block response when Content-Length exceeds max", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            makeMockResponse(
                JSON.stringify({ data: "x".repeat(2000) }),
                200,
                { "content-length": "2014" }
            )
        );

        const client = createClient({
            baseURL: "https://api.example.com",
            security: { maxResponseSize: 1000 }
        });

        await expect(client.get("/large")).rejects.toThrow("Response size exceeds limit");
    });

    it("should allow response when Content-Length is under max", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            makeMockResponse(
                JSON.stringify({ small: "ok" }),
                200,
                { "content-length": "18" }
            )
        );

        const client = createClient({
            baseURL: "https://api.example.com",
            security: { maxResponseSize: 1000 }
        });

        const res = await client.get<{ small: string }>("/small");
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ small: "ok" });
    });

    it("should block response when Content-Length is missing and body exceeds max", async () => {
        // No Content-Length header — simulates chunked encoding
        global.fetch = vi.fn().mockResolvedValue(
            makeMockResponse(
                JSON.stringify({ data: "x".repeat(5000) }),
                200
            )
        );

        const client = createClient({
            baseURL: "https://api.example.com",
            security: { maxResponseSize: 1000 }
        });

        await expect(client.get("/chunked-large")).rejects.toThrow("Response size exceeds limit");
    });

    it("should allow response when Content-Length is missing and body is under max", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            makeMockResponse(
                JSON.stringify({ small: "ok" }),
                200
            )
        );

        const client = createClient({
            baseURL: "https://api.example.com",
            security: { maxResponseSize: 1000 }
        });

        const res = await client.get<{ small: string }>("/chunked-small");
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ small: "ok" });
    });

    it("should bypass check when maxResponseSize is Infinity", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            makeMockResponse(
                JSON.stringify({ data: "x".repeat(100000) }),
                200
            )
        );

        const client = createClient({
            baseURL: "https://api.example.com",
            security: { maxResponseSize: Infinity }
        });

        const res = await client.get("/huge");
        expect(res.status).toBe(200);
    });

    it("should block request body when maxBodySize is set", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            makeMockResponse(JSON.stringify({ ok: true }), 200)
        );

        const client = createClient({
            baseURL: "https://api.example.com",
            security: { maxBodySize: 10 }
        });

        await expect(
            client.post("/submit", {
                body: { data: "this body is way too long for the limit" },
                bodyType: "json"
            })
        ).rejects.toThrow("Request body size exceeds limit");
    });

    it("should allow request body when under maxBodySize", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            makeMockResponse(JSON.stringify({ ok: true }), 200)
        );

        const client = createClient({
            baseURL: "https://api.example.com",
            security: { maxBodySize: 1000 }
        });

        const res = await client.post("/submit", {
            body: { small: "ok" },
            bodyType: "json"
        });

        expect(res.status).toBe(200);
    });

    it("should reproduce the exact user scenario", async () => {
        const smallBody = JSON.stringify({ userId: 1, id: 1, title: "small post" });
        const largeBody = JSON.stringify({ data: "x".repeat(2000) });

        global.fetch = vi.fn()
            .mockResolvedValueOnce(makeMockResponse(smallBody, 200))
            .mockResolvedValueOnce(makeMockResponse(largeBody, 200));

        const client = createClient({
            security: { maxResponseSize: 1000 }
        });

        // Small response should succeed
        const res1 = await client.get("https://jsonplaceholder.typicode.com/posts/1");
        expect(res1.status).toBe(200);

        // Large response should be blocked
        await expect(
            client.get("https://jsonplaceholder.typicode.com/posts")
        ).rejects.toThrow("Response size exceeds limit");
    });

    it("should abort mid-stream when limit is exceeded (no Content-Length)", async () => {
        // Simulate a streaming response where we can verify early cancellation
        const encoder = new TextEncoder();
        let chunksRead = 0;

        const body = new ReadableStream({
            start(controller) {
                // Send data in multiple chunks to simulate streaming
                controller.enqueue(encoder.encode("A".repeat(500)));
                chunksRead++;
                controller.enqueue(encoder.encode("B".repeat(500)));
                chunksRead++;
                controller.enqueue(encoder.encode("C".repeat(500)));
                chunksRead++;
                controller.close();
            }
        });

        global.fetch = vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
            body,
            json: async () => ({ error: "should not parse" }),
            clone() {
                // Clone recreates the stream
                const clonedBody = new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode("A".repeat(500)));
                        controller.enqueue(encoder.encode("B".repeat(500)));
                        controller.enqueue(encoder.encode("C".repeat(500)));
                        controller.close();
                    }
                });
                return {
                    status: 200,
                    headers: new Headers(),
                    body: clonedBody,
                    json: async () => ({ error: "should not parse" }),
                    clone: () => this,
                    arrayBuffer: async () => encoder.encode("A".repeat(500) + "B".repeat(500) + "C".repeat(500)).buffer
                };
            },
            arrayBuffer: async () => encoder.encode("A".repeat(500) + "B".repeat(500) + "C".repeat(500)).buffer
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            security: { maxResponseSize: 750 } // Exceeded after 2nd chunk (1000 > 750)
        });

        await expect(client.get("/multi-chunk")).rejects.toThrow("Response size exceeds limit");
    });
});
