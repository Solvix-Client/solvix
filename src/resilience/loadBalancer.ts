import type {
    SolvixTransport,
    LoadBalancerOptions,
    LoadBalanceStrategy,
    BackendState,
    BackendConfig,
} from "../types";

interface InternalBackend extends BackendState {
    healthCheckTimer?: ReturnType<typeof setInterval>;
    failureThreshold: number;
}

/**
 * Create a transport that distributes requests across multiple backends.
 *
 * Drop-in replacement for the default `fetch` transport:
 * ```ts
 * const transport = createLoadBalancer({
 *   backends: [
 *     { url: "https://api-1.example.com", weight: 3 },
 *     { url: "https://api-2.example.com", weight: 2 },
 *   ],
 *   strategy: "weighted",
 * });
 * const client = createClient({ transport });
 * ```
 *
 * Custom strategies receive the backend pool and return the selected backend:
 * ```ts
 * strategy: (backends) => backends.reduce((a, b) => a.latency < b.latency ? a : b)
 * ```
 */
export function createLoadBalancer(options: LoadBalancerOptions): SolvixTransport {
    const backends: InternalBackend[] = options.backends.map((cfg) => ({
        url: cfg.url.replace(/\/+$/, ""),
        weight: cfg.weight ?? 1,
        healthy: true,
        consecutiveFailures: 0,
        lastChecked: 0,
        latency: 0,
        failureThreshold: cfg.healthCheck?.failureThreshold ?? 3,
    }));

    let roundRobinIndex = 0;
    const strategy = options.strategy ?? "round-robin";
    const failoverEnabled = options.failover?.enabled !== false;
    const maxFailoverRetries = options.failover?.maxRetries ?? backends.length - 1;

    // ── Health checks ───────────────────────────────────────────────────────

    function startHealthChecks() {
        for (let i = 0; i < backends.length; i++) {
            const backend = backends[i]!;
            const cfg = options.backends[i]!;
            if (!cfg.healthCheck) continue;

            const endpoint = cfg.healthCheck.endpoint ?? "/health";
            const interval = cfg.healthCheck.interval ?? 30000;
            const timeout = cfg.healthCheck.timeout ?? 5000;
            const expectedStatus = cfg.healthCheck.expectedStatus ?? 200;

            const check = async () => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeout);
                try {
                    const res = await fetch(backend.url + endpoint, {
                        signal: controller.signal,
                    });
                    clearTimeout(timer);
                    if (res.status === expectedStatus) {
                        if (!backend.healthy) {
                            backend.healthy = true;
                            backend.consecutiveFailures = 0;
                            options.onBackendChange?.(backend.url, true);
                        }
                    } else {
                        recordFailure(backend);
                    }
                } catch {
                    clearTimeout(timer);
                    recordFailure(backend);
                }
                backend.lastChecked = Date.now();
            };

            backend.healthCheckTimer = setInterval(check, interval);
            // Don't block process exit
            if (backend.healthCheckTimer?.unref) {
                backend.healthCheckTimer.unref();
            }
            // Run first check immediately
            check();
        }
    }

    function recordFailure(backend: InternalBackend) {
        backend.consecutiveFailures++;
        if (backend.healthy && backend.consecutiveFailures >= backend.failureThreshold) {
            backend.healthy = false;
            options.onBackendChange?.(backend.url, false);
        }
    }

    function recordSuccess(backend: InternalBackend, latency: number) {
        // Rolling average (exponential moving average with alpha=0.3)
        backend.latency = backend.latency === 0
            ? latency
            : backend.latency * 0.7 + latency * 0.3;

        if (!backend.healthy) {
            backend.healthy = true;
            backend.consecutiveFailures = 0;
            options.onBackendChange?.(backend.url, true);
        }
    }

    // ── Strategies ──────────────────────────────────────────────────────────

    function getPool(): InternalBackend[] {
        const healthy = backends.filter((b) => b.healthy);
        return healthy.length > 0 ? healthy : backends;
    }

    function selectBackend(pool: InternalBackend[]): InternalBackend {
        if (typeof strategy === "function") {
            return strategy(pool) as InternalBackend;
        }

        switch (strategy) {
            case "round-robin":
            case "health": {
                const idx = roundRobinIndex % pool.length;
                roundRobinIndex++;
                return pool[idx]!;
            }
            case "random":
                return pool[Math.floor(Math.random() * pool.length)]!;
            case "weighted": {
                const totalWeight = pool.reduce((sum, b) => sum + b.weight, 0);
                let random = Math.random() * totalWeight;
                for (const backend of pool) {
                    random -= backend.weight;
                    if (random <= 0) return backend;
                }
                return pool[pool.length - 1]!;
            }
            default:
                return pool[0]!;
        }
    }

    // ── URL rewriting ───────────────────────────────────────────────────────

    function rewriteOrigin(originalUrl: string, backendUrl: string): string {
        try {
            const orig = new URL(originalUrl);
            const backend = new URL(backendUrl);
            orig.protocol = backend.protocol;
            orig.host = backend.host;
            return orig.toString();
        } catch {
            return backendUrl + originalUrl;
        }
    }

    // ── Transport ───────────────────────────────────────────────────────────

    startHealthChecks();

    const transport: SolvixTransport = async (url, init) => {
        const pool = getPool();
        const maxAttempts = failoverEnabled ? maxFailoverRetries + 1 : 1;

        let lastError: Error | undefined;
        for (let attempt = 0; attempt < maxAttempts && attempt < pool.length; attempt++) {
            const backend = selectBackend(pool);
            const rewrittenUrl = rewriteOrigin(url, backend.url);
            const start = Date.now();

            try {
                const response = await fetch(rewrittenUrl, init);
                const latency = Date.now() - start;
                recordSuccess(backend, latency);

                // Treat 5xx as failures for failover
                if (response.status >= 500 && attempt < maxAttempts - 1) {
                    recordFailure(backend);
                    lastError = new Error(`Backend ${backend.url} returned ${response.status}`);
                    continue;
                }

                return response;
            } catch (err) {
                const latency = Date.now() - start;
                backend.latency = backend.latency === 0
                    ? latency
                    : backend.latency * 0.7 + latency * 0.3;
                recordFailure(backend);
                lastError = err as Error;
            }
        }

        throw lastError ?? new Error("All backends failed");
    };

    // Expose a cleanup function for tests and graceful shutdown
    (transport as any).__cleanup = () => {
        for (const b of backends) {
            if (b.healthCheckTimer) clearInterval(b.healthCheckTimer);
        }
    };

    return transport;
}
