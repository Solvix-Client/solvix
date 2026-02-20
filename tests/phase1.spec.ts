import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

it("should perform basic GET request", async () => {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
        headers: new Headers()
    }) as any;

    const api = createClient();

    const res = await api.get("/test");

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.meta.duration).toBeGreaterThanOrEqual(0);
});

it("should retry on 500 error", async () => {
    let callCount = 0;

    global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({}),
            headers: new Headers()
        });
    }) as any;

    const api = createClient();

    await expect(
        api.get("/error", { retry: 2 })
    ).rejects.toBeInstanceOf(Error);

    expect(callCount).toBe(3);
});

it("should not retry on 404", async () => {
    let callCount = 0;

    global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({}),
            headers: new Headers()
        });
    }) as any;

    const api = createClient();

    await expect(api.get("/notfound", { retry: 2 }))
        .rejects.toBeInstanceOf(Error);

    expect(callCount).toBe(1);
});

it("should dedupe concurrent requests", async () => {
    let callCount = 0;

    global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: 1 }),
            headers: new Headers()
        });
    }) as any;

    const api = createClient();

    await Promise.all([
        api.get("/same", { dedupe: true }),
        api.get("/same", { dedupe: true })
    ]);

    expect(callCount).toBe(1);
});

it("should cache GET requests", async () => {
    let callCount = 0;

    global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ cached: true }),
            headers: new Headers()
        });
    }) as any;

    const api = createClient();

    await api.get("/cache", { cache: { ttl: 5000 } });
    await api.get("/cache", { cache: { ttl: 5000 } });

    expect(callCount).toBe(1);
});