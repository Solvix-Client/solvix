import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";
import { createMetricsCollector } from "../src/core/metricsCollector";

describe("Metrics collector", () => {

    it("should count total requests", () => {
        const collector = createMetricsCollector({ enabled: true });
        collector.onStart!({ type: "request:start", timestamp: Date.now() });
        collector.onStart!({ type: "request:start", timestamp: Date.now() });

        const metrics = collector.getMetrics()!;
        expect(metrics.totalRequests).toBe(2);
    });

    it("should track active requests", () => {
        const collector = createMetricsCollector({ enabled: true });
        collector.onStart!({ type: "request:start", timestamp: Date.now() });
        collector.onStart!({ type: "request:start", timestamp: Date.now() });
        collector.onComplete!({
            type: "request:complete",
            context: {
                url: "/test",
                options: {},
                meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now(), duration: 100 }
            },
            timestamp: Date.now()
        });

        const metrics = collector.getMetrics()!;
        expect(metrics.activeRequests).toBe(1);
    });

    it("should count successes and failures", () => {
        const collector = createMetricsCollector({ enabled: true });
        collector.onStart!({ type: "request:start", timestamp: Date.now() });
        collector.onComplete!({
            type: "request:complete",
            context: {
                url: "/ok",
                options: {},
                meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now(), duration: 50 }
            },
            timestamp: Date.now()
        });
        collector.onStart!({ type: "request:start", timestamp: Date.now() });
        collector.onError!({
            type: "request:error",
            context: {
                url: "/fail",
                options: {},
                meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now(), duration: 200 }
            },
            timestamp: Date.now()
        });

        const metrics = collector.getMetrics()!;
        expect(metrics.successCount).toBe(1);
        expect(metrics.failureCount).toBe(1);
    });

    it("should track retries", () => {
        const collector = createMetricsCollector({ enabled: true });
        collector.onRetry!({ type: "request:retry", timestamp: Date.now() });
        collector.onRetry!({ type: "request:retry", timestamp: Date.now() });
        collector.onRetry!({ type: "request:retry", timestamp: Date.now() });

        expect(collector.getMetrics()!.retryCount).toBe(3);
    });

    it("should record duration histogram", () => {
        const collector = createMetricsCollector({ enabled: true, durationBuckets: [50, 100, 200] });
        collector.onStart!({ type: "request:start", timestamp: Date.now() });

        collector.onComplete!({
            type: "request:complete",
            context: {
                url: "/fast",
                options: {},
                meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now(), duration: 30 }
            },
            timestamp: Date.now()
        });

        collector.onStart!({ type: "request:start", timestamp: Date.now() });
        collector.onError!({
            type: "request:error",
            context: {
                url: "/slow",
                options: {},
                meta: { attempt: 0, retries: 0, runtime: "node" as const, startTime: Date.now(), duration: 150 }
            },
            timestamp: Date.now()
        });

        const hist = collector.getMetrics()!.durationHistogram;
        expect(hist["50"]).toBe(1);
        expect(hist["100"]).toBe(0);
        expect(hist["200+"]).toBe(1);
    });

    it("should return null when disabled", () => {
        const collector = createMetricsCollector({ enabled: false });
        expect(collector.getMetrics()).toBeNull();
    });

    it("should return null when not configured", () => {
        const collector = createMetricsCollector(undefined);
        expect(collector.getMetrics()).toBeNull();
    });

    it("should track metrics through client", async () => {
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
            metrics: { enabled: true }
        });

        await client.get("/a");
        await client.get("/b");

        const m = (client as any).metrics() as Record<string, unknown>;
        expect(m).not.toBeNull();
        expect(m.totalRequests).toBe(2);
        expect(m.successCount).toBe(2);
    });
});
