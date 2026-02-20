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

describe("POST Requests", () => {
    it("should perform POST request with body", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({ id: 1, name: "test" }),
            headers: new Headers()
        }) as any;

        const api = createClient();

        const res = await api.post("/users", {
            fetch: {
                body: JSON.stringify({ name: "test" })
            }
        });

        expect(res.status).toBe(201);
        expect(res.data.id).toBe(1);
        expect(global.fetch).toHaveBeenCalledWith(
            "/users",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("should not cache POST requests", async () => {
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

        await api.post("/data", { cache: { ttl: 5000 } });
        await api.post("/data", { cache: { ttl: 5000 } });

        expect(callCount).toBe(2);
    });
});

describe("Timeout Handling", () => {
    it("should timeout when request exceeds limit", async () => {
        const controller = new AbortController();
        global.fetch = vi.fn().mockImplementation(() => {
            return new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new DOMException("aborted", "AbortError"));
                }, 100);
            });
        }) as any;

        const api = createClient();

        await expect(
            api.get("/slow", { timeout: 50 })
        ).rejects.toThrow();
    });

    it("should handle requests within timeout", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ fast: true }),
            headers: new Headers()
        }) as any;

        const api = createClient();

        const res = await api.get("/fast", { timeout: 5000 });

        expect(res.status).toBe(200);
        expect(res.data.fast).toBe(true);
    });
});

describe("Custom Validation", () => {
    it("should accept custom validateStatus", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 204,
            json: async () => ({}),
            headers: new Headers()
        }) as any;

        const api = createClient();

        const res = await api.get("/no-content", {
            validateStatus: (status) => status === 204
        });

        expect(res.status).toBe(204);
    });

    it("should throw on invalid status with custom validator", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: "bad request" }),
            headers: new Headers()
        }) as any;

        const api = createClient();

        await expect(
            api.get("/bad", {
                validateStatus: (status) => status === 200
            })
        ).rejects.toThrow();
    });
});

describe("Retry Configuration", () => {
    it("should accept RetryOptions object", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount < 3) {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: async () => ({}),
                    headers: new Headers()
                });
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
                headers: new Headers()
            });
        }) as any;

        const api = createClient();

        const res = await api.get("/unstable", {
            retry: {
                retries: 3,
                factor: 2,
                minTimeout: 10,
                maxTimeout: 1000
            }
        });

        expect(res.status).toBe(200);
        expect(callCount).toBe(3);
    });

    it("should use global retry options", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount < 2) {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: async () => ({}),
                    headers: new Headers()
                });
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
                headers: new Headers()
            });
        }) as any;

        const api = createClient({ retry: 2 });

        const res = await api.get("/endpoint");

        expect(res.status).toBe(200);
        expect(callCount).toBe(2);
    });
});

describe("Response Metadata", () => {
    it("should include attempt count in meta", async () => {
        let callCount = 0;

        global.fetch = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount < 2) {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: async () => ({}),
                    headers: new Headers()
                });
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({}),
                headers: new Headers()
            });
        }) as any;

        const api = createClient();

        const res = await api.get("/meta-test", { retry: 2 });

        expect(res.meta.attempt).toBe(1);
        expect(res.meta.retries).toBe(1);
        expect(res.meta.duration).toBeGreaterThanOrEqual(0);
    });

    it("should measure request duration", async () => {
        global.fetch = vi.fn().mockImplementation(() => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        ok: true,
                        status: 200,
                        json: async () => ({}),
                        headers: new Headers()
                    });
                }, 50);
            });
        }) as any;

        const api = createClient();

        const res = await api.get("/duration-test");

        expect(res.meta.duration).toBeGreaterThanOrEqual(50);
        expect(res.meta.startTime).toBeLessThanOrEqual(res.meta.endTime!);
    });
});

describe("Error Handling", () => {
    it("should handle network errors", async () => {
        global.fetch = vi.fn().mockRejectedValue(
            new Error("Network error")
        ) as any;

        const api = createClient();

        await expect(api.get("/offline")).rejects.toThrow();
    });

    it("should preserve response headers in result", async () => {
        const headers = new Headers({
            "content-type": "application/json",
            "x-custom": "value"
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ data: true }),
            headers
        }) as any;

        const api = createClient();

        const res = await api.get("/with-headers");

        expect(res.headers.get("content-type")).toBe("application/json");
        expect(res.headers.get("x-custom")).toBe("value");
    });
});

describe("Text Response Parsing", () => {
    it("should parse as text when parseJson is false", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => { throw new Error("Should not call json"); },
            text: async () => "plain text response",
            headers: new Headers()
        }) as any;

        const api = createClient();

        const res = await api.get<string>("/text", {
            parseJson: false
        });

        expect(res.data).toBe("plain text response");
    });

    it("should parse as JSON by default", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ message: "hello" }),
            headers: new Headers()
        }) as any;

        const api = createClient();

        const res = await api.get<{ message: string }>("/json");

        expect(res.data.message).toBe("hello");
    });
});

describe("Global Options", () => {
    it("should merge global and request options", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ merged: true }),
            headers: new Headers()
        }) as any;

        const api = createClient({
            retry: 1,
            timeout: 5000
        });

        const res = await api.get("/merge-test", {
            cache: { ttl: 3000 }
        });

        expect(res.status).toBe(200);
        expect(global.fetch).toHaveBeenCalled();
    });
});