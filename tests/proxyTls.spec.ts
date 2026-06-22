import { describe, it, expect, vi } from "vitest";

describe("Node transport (proxy/TLS)", () => {

    it("should return null in non-Node environment (browser)", async () => {
        // Simulate browser by removing process.versions.node
        const origVersions = (process as any).versions;
        delete (process as any).versions;

        try {
            const { createNodeTransport } = await import("../src/node/nodeTransport");
            const transport = await createNodeTransport(
                { rejectUnauthorized: false },
                { host: "proxy.example.com", port: 8080 }
            );
            expect(transport).toBeNull();
        } finally {
            (process as any).versions = origVersions;
        }
    });

    it("should return null when neither TLS nor proxy is configured", async () => {
        const { createNodeTransport } = await import("../src/node/nodeTransport");
        const transport = await createNodeTransport(undefined, undefined);
        expect(transport).toBeNull();
    });

    it("should export expected types", async () => {
        // Verify the module can be loaded and exports the expected function
        const mod = await import("../src/node/nodeTransport");
        expect(mod.createNodeTransport).toBeDefined();
        expect(typeof mod.createNodeTransport).toBe("function");
    });

    it("should accept TLS config without crashing", async () => {
        const { createNodeTransport } = await import("../src/node/nodeTransport");
        // Should not throw
        const transport = await createNodeTransport({ rejectUnauthorized: false }, undefined);
        // Will be null because undici might not be installed
        // But the function should not throw
        expect(transport === null || typeof transport === "function").toBe(true);
    });

    it("should accept proxy config without crashing", async () => {
        const { createNodeTransport } = await import("../src/node/nodeTransport");
        const transport = await createNodeTransport(undefined, {
            host: "proxy.example.com",
            port: 8080
        });
        expect(transport === null || typeof transport === "function").toBe(true);
    });

    it("should create a transport when client has proxy option", async () => {
        // This test verifies the client doesn't crash when proxy is configured
        // even if undici is not available (graceful fallback)
        const { createClient } = await import("../src");

        global.fetch = vi.fn().mockResolvedValue({
            status: 200, ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ proxied: true }),
            text: async () => JSON.stringify({ proxied: true }),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            proxy: { host: "gateway.mycompany.com", port: 8080 }
        });

        // Wait for the async init to resolve
        await new Promise((r) => setTimeout(r, 100));

        const res = await client.get("/test");
        expect(res.status).toBe(200);
    });

    it("should create a transport when client has tls option", async () => {
        const { createClient } = await import("../src");

        global.fetch = vi.fn().mockResolvedValue({
            status: 200, ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ secure: true }),
            text: async () => JSON.stringify({ secure: true }),
            clone() { return this; }
        });

        const client = createClient({
            baseURL: "https://api.example.com",
            tls: { rejectUnauthorized: false }
        });

        await new Promise((r) => setTimeout(r, 100));

        const res = await client.get("/secure");
        expect(res.status).toBe(200);
    });
});
