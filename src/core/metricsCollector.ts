import type { MetricsOptions, MetricsSnapshot, SolvixEvent } from "../types";

const DEFAULT_BUCKETS = [50, 100, 200, 500, 1000, 3000, 5000];

type DurationBucket = { threshold: number; label: string; count: number };

function createBuckets(thresholds: number[]): DurationBucket[] {
    const sorted = [...thresholds].sort((a, b) => a - b);
    const buckets: DurationBucket[] = [];
    for (let i = 0; i < sorted.length; i++) {
        const label = i === sorted.length - 1 ? `${sorted[i]}+` : `${sorted[i]}`;
        buckets.push({ threshold: sorted[i]!, label, count: 0 });
    }
    return buckets;
}

function recordDuration(durationMs: number, buckets: DurationBucket[]): void {
    for (const bucket of buckets) {
        if (durationMs <= bucket.threshold) {
            bucket.count++;
            return;
        }
    }
    // If it exceeds all thresholds, increment the last bucket
    const last = buckets[buckets.length - 1];
    if (last) last.count++;
}

export function createMetricsCollector(options: MetricsOptions | undefined) {
    if (!options?.enabled) {
        return {
            getMetrics: () => null,
            destroy: () => {}
        };
    }

    const thresholds = options.durationBuckets ?? DEFAULT_BUCKETS;
    const buckets = createBuckets(thresholds);
    const startTime = Date.now();

    let activeRequests = 0;
    let totalRequests = 0;
    let successCount = 0;
    let failureCount = 0;
    let retryCount = 0;

    function getMetrics(): MetricsSnapshot {
        const histogram: Record<string, number> = {};
        for (const b of buckets) {
            histogram[b.label] = b.count;
        }
        return {
            totalRequests,
            activeRequests,
            successCount,
            failureCount,
            retryCount,
            durationHistogram: histogram,
            startTime
        };
    }

    function onStart(_event: SolvixEvent) {
        totalRequests++;
        activeRequests++;
    }

    function onComplete(event: SolvixEvent) {
        activeRequests = Math.max(0, activeRequests - 1);
        successCount++;

        const ctx = event.context;
        if (ctx?.meta.duration !== undefined) {
            recordDuration(ctx.meta.duration, buckets);
        }
    }

    function onError(event: SolvixEvent) {
        activeRequests = Math.max(0, activeRequests - 1);
        failureCount++;

        const ctx = event.context;
        if (ctx?.meta.duration !== undefined) {
            recordDuration(ctx.meta.duration, buckets);
        }
    }

    function onRetry(_event: SolvixEvent) {
        retryCount++;
    }

    return {
        getMetrics,
        onStart,
        onComplete,
        onError,
        onRetry,
        destroy: () => {
            // Cleanup if we had bus subscriptions — caller manages this
        }
    };
}

export type MetricsCollector = ReturnType<typeof createMetricsCollector>;
