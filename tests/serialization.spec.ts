import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src";
import { createProtobufCodec } from "../src/serialization/protobuf";
import { createMsgpackCodec } from "../src/serialization/msgpack";

// ─── helpers ────────────────────────────────────────────────────────────────

function mockFetch(body?: any, status = 200, headers: Record<string, string> = {}) {
    return vi.fn().mockResolvedValue({
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(headers),
        arrayBuffer: () => Promise.resolve(body instanceof ArrayBuffer ? body : new ArrayBuffer(0)),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
        clone() { return this; },
    } as any);
}

// ─── protobuf ───────────────────────────────────────────────────────────────

describe("protobuf serialization", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it("encodes body with protobuf encoder", async () => {
        const encoder = vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]));
        const decoder = vi.fn();
        const fetch = mockFetch();
        globalThis.fetch = fetch as any;
        const client = createClient({ serialization: { protobuf: { encoder, decoder } } });

        await client.post("https://api.test/data", {
            body: { name: "test" },
            bodyType: "protobuf",
        });

        expect(encoder).toHaveBeenCalledWith({ name: "test" });
        const calls = (fetch as any).mock.calls;
        const init = calls[0][1];
        expect(init.headers.get("Content-Type")).toBe("application/protobuf");
    });

    it("decodes response with protobuf decoder", async () => {
        const encodedData = new Uint8Array([10, 4, 116, 101, 115, 116]);
        const encoder = vi.fn();
        const decoder = vi.fn().mockReturnValue({ name: "test" });
        const fetch = mockFetch(encodedData.buffer);
        globalThis.fetch = fetch as any;
        const client = createClient({ serialization: { protobuf: { encoder, decoder } } });

        const res = await client.post("https://api.test/data", {
            body: {},
            bodyType: "protobuf",
            responseType: "protobuf",
        });

        expect(decoder).toHaveBeenCalled();
        expect(res.data).toEqual({ name: "test" });
    });

    it("throws when bodyType is protobuf but no codec configured", async () => {
        const fetch = mockFetch();
        globalThis.fetch = fetch as any;
        const client = createClient();

        await expect(
            client.post("https://api.test/data", { body: {}, bodyType: "protobuf" })
        ).rejects.toThrow("protobuf");
    });
});

// ─── msgpack ────────────────────────────────────────────────────────────────

describe("msgpack serialization", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it("encodes body with msgpack encoder", async () => {
        const encoder = vi.fn().mockReturnValue(new Uint8Array([0x81]));
        const decoder = vi.fn();
        const fetch = mockFetch();
        globalThis.fetch = fetch as any;
        const client = createClient({ serialization: { msgpack: { encoder, decoder } } });

        await client.post("https://api.test/data", {
            body: { name: "test" },
            bodyType: "msgpack",
        });

        expect(encoder).toHaveBeenCalledWith({ name: "test" });
    });

    it("decodes response with msgpack decoder", async () => {
        const encoder = vi.fn();
        const decoded = { name: "test", values: [1, 2, 3] };
        const decoder = vi.fn().mockReturnValue(decoded);
        const fetch = mockFetch(new ArrayBuffer(8));
        globalThis.fetch = fetch as any;
        const client = createClient({ serialization: { msgpack: { encoder, decoder } } });

        const res = await client.post("https://api.test/data", {
            body: {},
            bodyType: "msgpack",
            responseType: "msgpack",
        });

        expect(decoder).toHaveBeenCalled();
        expect(res.data).toEqual(decoded);
    });

    it("throws when responseType is msgpack but no codec configured", async () => {
        const fetch = mockFetch(new ArrayBuffer(4));
        globalThis.fetch = fetch as any;
        const client = createClient();

        await expect(
            client.post("https://api.test/data", { body: {}, responseType: "msgpack" })
        ).rejects.toThrow("msgpack");
    });
});

// ─── codec helpers ──────────────────────────────────────────────────────────

describe("codec helpers", () => {
    it("createProtobufCodec returns proper options with defaults", () => {
        const codec = createProtobufCodec({
            encoder: () => new Uint8Array(),
            decoder: () => ({}),
        });
        expect(codec.contentType).toBe("application/protobuf");
    });

    it("createProtobufCodec respects custom contentType", () => {
        const codec = createProtobufCodec({
            encoder: () => new Uint8Array(),
            decoder: () => ({}),
            contentType: "application/x-custom-proto",
        });
        expect(codec.contentType).toBe("application/x-custom-proto");
    });

    it("createMsgpackCodec returns proper options with defaults", () => {
        const codec = createMsgpackCodec({
            encoder: () => new Uint8Array(),
            decoder: () => ({}),
        });
        expect(codec.contentType).toBe("application/msgpack");
    });

    it("createMsgpackCodec respects custom contentType", () => {
        const codec = createMsgpackCodec({
            encoder: () => new Uint8Array(),
            decoder: () => ({}),
            contentType: "application/x-custom-msgpack",
        });
        expect(codec.contentType).toBe("application/x-custom-msgpack");
    });
});
