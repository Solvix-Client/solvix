import { checkBodySize, checkResponseSize } from "../security/sizeGuard";
import { redactSnapshotData } from "../security/redactor";
import { resolveSecurity } from "../security/resolveSecurity";
import { buildQueryString } from "../utils/queryBuilder";
import { executeShadow } from "../core/shadowExecutor";
import { setupOfflineListener } from "../core/offlineManager";
import { offlineQueue } from "../store/offlineQueue";
import { handleStream } from "../streaming/streamHandler";
import { applyCorrelationId } from "./correlation";
import { createMetricsCollector } from "./metricsCollector";
import { applyTracing } from "./tracer";
import { HealthChecker } from "./healthChecker";
import { applyCSRF } from "../security/csrfProtector";
import { CookieJar } from "../store/cookieJar";
import { PriorityQueue } from "../resilience/priorityQueue";
import { RateLimiter } from "../resilience/rateLimiter";
import { CircuitBreaker } from "../resilience/circuitBreaker";
import { resolveUrl } from "../utils/resolveUrl";
import { compose } from "./compose";
import { createContext } from "./context";
import { transportMiddleware } from "./transport";
import { timeoutMiddleware } from "./timeout";
import { SolvixBus } from "./bus";
import { SolvixError } from "../errors";
import { sleep } from "../utils/sleep";
import {
    normalizeRetry,
    computeBackoff,
    normalizeError
} from "../utils/retryHelpers";

import type {
    SolvixOptions,
    SolvixMiddleware,
    SolvixResponse,
    HttpMethod
} from "../types";

import { generateFingerprint } from "../utils/fingerprint";
import {
    getInflight,
    setInflight,
    clearInflight
} from "../store/inflight";
import {
    getCache,
    peekCache,
    setCache
} from "../store/cache";

import { buildRequestBody } from "../core/bodyBuilder";
import { parseResponse } from "../core/responseParser";
import { markTimeline } from "../utils/timeline";
import { getNetworkDuration } from "../utils/retryAnalytics";
import { buildProfile } from "../utils/profiler";
import { runDevWarnings } from "../utils/devWarnings";
import { RequestGroup } from "./group";
import { dependencyRegistry } from "./dependencyRegistry";
import { buildSnapshot } from "../utils/snapshotBuilder";
import { tokenOrchestrator } from "./tokenOrchestrator";
import { getETag, setETag, clearETag } from "../store/etagStore";
import { defaultTransport } from "../core/defaultTransport";
import { sanitizeRawHeaders } from "../security/headerSanitizer";
import { trackDownloadProgress, trackUploadProgress } from "./progressReport";

export function createClient(globalOptions: SolvixOptions = {}) {

    const priorityQueue = new PriorityQueue(
        globalOptions.maxConcurrency ?? Infinity,
        globalOptions.queue?.maxQueueSize ?? Infinity,
        globalOptions.queue?.strategy ?? "fifo"
    );

    let middlewares: SolvixMiddleware[] = [
        timeoutMiddleware,
        transportMiddleware
    ];

    let run = compose(middlewares);

    // Proxy/TLS transport for Node.js (fire-and-forget init — resolves before first real request)
    if (globalOptions.proxy || globalOptions.tls) {
        import("../node/nodeTransport").then(({ createNodeTransport }) =>
            createNodeTransport(globalOptions.tls, globalOptions.proxy)
        ).then((transport) => {
            if (transport) {
                globalOptions.transport = transport;
            }
        }).catch(() => { /* undici not available — use default transport */ });
    }

    const limiter = globalOptions.rateLimit
        ? new RateLimiter(
            globalOptions.rateLimit.capacity,
            globalOptions.rateLimit.refillRate,
            globalOptions.rateLimit.interval
        )
        : null;

    const breaker = globalOptions.circuitBreaker
        ? new CircuitBreaker({
            failureThreshold: globalOptions.circuitBreaker.failureThreshold,
            failureRate: globalOptions.circuitBreaker.failureRate,
            rollingWindow: globalOptions.circuitBreaker.rollingWindow,
            minimumRequests: globalOptions.circuitBreaker.minimumRequests,
            resetTimeout: globalOptions.circuitBreaker.resetTimeout,
            halfOpenRequests:
                globalOptions.circuitBreaker.halfOpenRequests ?? 1,
            ...(globalOptions.hooks?.onCircuitOpen && {
                onOpen: globalOptions.hooks.onCircuitOpen
            })
        })
        : null;

    // Metrics collector
    const metricsCollector = createMetricsCollector(globalOptions.metrics);
    if (globalOptions.metrics?.enabled) {
        const mc = metricsCollector;
        SolvixBus.on("request:start", mc.onStart!);
        SolvixBus.on("request:complete", mc.onComplete!);
        SolvixBus.on("request:error", mc.onError!);
        SolvixBus.on("request:retry", mc.onRetry!);
    }

    // Health checker
    const healthChecker = globalOptions.healthCheck?.enabled
        ? new HealthChecker(globalOptions.healthCheck, (async (url: string, opts?: Record<string, any>) => {
            // Use a lightweight request that bypasses most features
            return request(url, {
                ...opts,
                method: "GET" as HttpMethod,
                priority: 1,
                // prevent the health check from showing up in user metrics
            });
        }))
        : null;

    if (healthChecker) {
        healthChecker.start();
    }

    // Cookie jar
    const cookieJar = globalOptions.cookieJar?.enabled
        ? new CookieJar(globalOptions.cookieJar)
        : null;

    if (
        typeof window !== "undefined" &&
        globalOptions.offline?.enabled
    ) {
        offlineQueue.setMaxSize(globalOptions.offline.maxQueueSize ?? 100);
        setupOfflineListener();
    }

    async function request<T = unknown>(
        url: string,
        options: SolvixOptions = {}
    ): Promise<SolvixResponse<T>> {

        const DEFAULT_PRIORITY = 5;

        const normalizedMethod =
            (options.method ??
                options.fetch?.method ??
                "GET").toUpperCase();

        const mergedOptions: SolvixOptions = {
            ...globalOptions,
            ...options,
            transport: options.transport ?? globalOptions.transport ?? defaultTransport,
            fetch: {
                ...globalOptions.fetch,
                ...options.fetch,
                method: normalizedMethod
            }
        };

        const security = resolveSecurity(mergedOptions.security);

        if (typeof window !== "undefined") {
            if (!mergedOptions.fetch?.mode) {
                mergedOptions.fetch = {
                    ...mergedOptions.fetch,
                    mode: "cors"
                };
            }

            if (mergedOptions.fetch?.credentials === undefined) {
                mergedOptions.fetch = {
                    ...mergedOptions.fetch,
                    credentials: "same-origin"
                };
            }
        }

        let resolvedUrl = resolveUrl(
            url,
            mergedOptions.baseURL
        );

        // SECURITY — Allowed Methods Enforcement
        if (security.allowedMethods.length > 0) {
            if (!security.allowedMethods.includes(normalizedMethod as HttpMethod)) {
                throw new SolvixError({
                    message: `HTTP method not allowed: ${normalizedMethod}`,
                    isRetryable: false
                });
            }
        }

        // SECURITY — HTTPS Enforcement
        if (security.enforceHTTPS) {
            const parsed = new URL(resolvedUrl);

            const isLocalhost =
                parsed.hostname === "localhost" ||
                parsed.hostname === "127.0.0.1";

            if (parsed.protocol !== "https:" && !isLocalhost) {
                throw new SolvixError({
                    message: `Insecure protocol blocked: ${parsed.protocol}`,
                    isRetryable: false
                });
            }
        }

        // SECURITY — Domain Whitelisting
        if (security.allowedDomains.length > 0) {
            const parsed = new URL(resolvedUrl);

            const isAllowed = security.allowedDomains.some(
                domain => parsed.hostname === domain
            );

            if (!isAllowed) {
                throw new SolvixError({
                    message: `Domain not allowed: ${parsed.hostname}`,
                    isRetryable: false
                });
            }
        }

        // Apply query params BEFORE fingerprinting
        if (mergedOptions.params) {
            resolvedUrl = mergedOptions.paramsSerializer
                ? mergedOptions.paramsSerializer(mergedOptions.params)
                : buildQueryString(
                    resolvedUrl,
                    mergedOptions.params
                );
        }

        if (globalOptions.allowedOrigins) {
            const requestOrigin = new URL(resolvedUrl).origin;

            const allowed = globalOptions.allowedOrigins.some(
                origin => origin === requestOrigin
            );

            if (!allowed) {
                throw new SolvixError({
                    message: `Origin not allowed: ${requestOrigin}`,
                    isRetryable: false
                });
            }
        }

        const ctx = createContext<T>(resolvedUrl, mergedOptions);

        // Offline Handling
        if (
            typeof window !== "undefined" &&
            ctx.options.offline?.enabled &&
            navigator.onLine === false &&
            !ctx.options.__offlineReplay
        ) {
            return new Promise((resolve, reject) => {

                offlineQueue.enqueue(async () => {
                    try {
                        const replayOptions: SolvixOptions = {
                            ...options,
                            __offlineReplay: true
                        };

                        const result = await request<T>(url, replayOptions);
                        resolve(result);
                    } catch (err) {
                        reject(err);
                    }
                });

            });
        }

        // Register this request if it has id or is a dependency for another request
        if (ctx.options.id) {
            dependencyRegistry.create(
                ctx.options.id,
                ctx.options.dependsOn
            );
        }

        let groupController: AbortController | undefined;

        if (ctx.options.group instanceof RequestGroup) {

            groupController = new AbortController();

            const existingSignal =
                ctx.options.fetch?.signal;

            if (existingSignal) {
                existingSignal.addEventListener("abort", () => {
                    groupController?.abort();
                });
            }

            ctx.options.fetch = {
                ...ctx.options.fetch,
                signal: groupController.signal
            };

            ctx.options.group.registerRequest(groupController);
        }

        runDevWarnings(ctx);
        markTimeline(ctx, "created");

        const priority = ctx.options.priority ?? DEFAULT_PRIORITY;

        const needsFingerprint =
            ctx.options.dedupe ||
            ctx.options.cache ||
            ctx.options.etag?.enabled;

        const fingerprint =
            await generateFingerprint(
                ctx.options.fetch?.method ?? "GET",
                ctx.url,
                ctx.options.fetch,
                ctx.options.fingerprint,
                !needsFingerprint
            );

        const method = ctx.options.fetch?.method ?? "GET";

        if (ctx.options.dedupe) {
            const existing = getInflight(fingerprint);
            if (existing) {
                return existing as Promise<SolvixResponse<T>>;
            }
        }

        if (
            method === "GET" &&
            ctx.options.cache
        ) {
            const cached = getCache(fingerprint);
            if (cached) {
                return cached as SolvixResponse<T>;
            }
        }

        const task = async (): Promise<SolvixResponse<T>> => {

            /** Finalize a failed request: snapshot, bus event, hooks, and throw.
             *  Caller must markTimeline("failed") and handle group/breaker first. */
            const finalizeFailure = (error: SolvixError): never => {
                ctx.options.logger?.error?.(`Request failed: ${error.message}`, {
                    url: ctx.url,
                    status: error.status,
                    attempts: ctx.meta.attempt,
                    retries: ctx.meta.retries,
                    runtime: ctx.meta.runtime,
                    correlationId: ctx.meta.correlationId
                });

                if (ctx.options.id) {
                    dependencyRegistry.reject(ctx.options.id, error);
                }

                if (ctx.options.snapshot?.enabled) {
                    ctx.meta.endTime = Date.now();
                    ctx.meta.duration = ctx.meta.endTime - ctx.meta.startTime;

                    ctx.meta.snapshot = {
                        ...buildSnapshot(ctx),
                        error: {
                            message: error.message,
                            ...(error.status !== undefined && { status: error.status })
                        }
                    };

                    if (security.redactSnapshot) {
                        redactSnapshotData(ctx);
                    }
                }

                globalOptions.hooks?.onError?.(error, ctx);

                SolvixBus.emit({
                    type: "request:error",
                    context: ctx,
                    timestamp: Date.now()
                });

                throw error;
            };

            globalOptions.hooks?.onRequestStart?.(ctx);

            SolvixBus.emit({
                type: "request:start",
                context: ctx,
                timestamp: Date.now()
            });

            ctx.options.logger?.info?.("Request started", {
                url: ctx.url,
                method
            });

            const signal = ctx.options.fetch?.signal ?? undefined;
            if (signal?.aborted) {
                markTimeline(ctx, "failed");

                if (ctx.options.group instanceof RequestGroup) {
                    ctx.options.group.markFailed();
                }

                finalizeFailure(new SolvixError({
                    message: "Request aborted",
                    isRetryable: false
                }));
            }

            const host = new URL(ctx.url).host;

            if (breaker) {
                markTimeline(ctx, "breakerCheck");
                if (!breaker.canRequest(host)) {
                    markTimeline(ctx, "failed");

                    if (ctx.options.group instanceof RequestGroup) {
                        ctx.options.group.markFailed();
                    }

                    finalizeFailure(new SolvixError({
                        message: "Circuit breaker is OPEN",
                        isRetryable: false
                    }));
                }
            }

            if (limiter) {
                markTimeline(ctx, "rateLimitWaitStart");
                await limiter.acquire(signal);
                markTimeline(ctx, "rateLimitWaitEnd");
            }

            // Correlation ID — set once per request
            applyCorrelationId(ctx, globalOptions.correlation);

            const retryConfig = normalizeRetry(ctx.options.retry);
            const fallbackURLs = ctx.options.fallbackURLs ?? [];
            let attempt = 0;
            let fallbackIdx = 0;

            while (attempt <= retryConfig.retries) {
                try {
                    ctx.meta.attempt = attempt;

                    // SECURITY — Header Sanitization & Injection Protection (all methods)
                    // Sanitize at the plain-object layer to avoid Fetch API quirks
                    // where the Headers constructor silently drops forbidden headers
                    // like `Cookie` or throws on CRLF before we can intercept.
                    if (ctx.options.fetch?.headers) {
                        const raw = ctx.options.fetch.headers as Record<string, string>;
                        const sanitized = sanitizeRawHeaders(raw, security.blockInsecureHeaders);
                        ctx.options.fetch = { ...ctx.options.fetch, headers: sanitized };
                    }

                    if (ctx.options.body !== undefined) {
                        const headers = new Headers(
                            ctx.options.fetch?.headers
                        );

                        let builtBody = await buildRequestBody(
                            ctx.options.body,
                            ctx.options.bodyType,
                            headers,
                            ctx.options.transformRequest,
                            ctx.options.avoidPreflight
                        );

                        // SECURITY — Body Size Guard
                        checkBodySize(
                            builtBody as BodyInit,
                            security.maxBodySize
                        );

                        // Upload progress tracking
                        if (ctx.options.hooks?.onUploadProgress) {
                            builtBody = trackUploadProgress(
                                builtBody as BodyInit,
                                ctx.options.hooks.onUploadProgress
                            ) as typeof builtBody;
                        }

                        ctx.options.fetch = {
                            ...ctx.options.fetch,
                            body: builtBody,
                            headers
                        };
                    }

                    // Consolidate header mutations — single Headers object
                    const reqHeaders = new Headers(ctx.options.fetch?.headers);

                    // Distributed tracing — new spanId per attempt
                    applyTracing(ctx, globalOptions.tracing, attempt, reqHeaders);

                    // CSRF token injection (for state-changing methods)
                    applyCSRF(ctx, globalOptions.csrf, reqHeaders);

                    // Cookie jar — attach stored cookies
                    if (cookieJar) {
                        const jarHeaders = cookieJar.getRequestHeaders(ctx.url);
                        if (Object.keys(jarHeaders).length > 0) {
                            for (const [key, val] of Object.entries(jarHeaders)) {
                                if (!reqHeaders.has(key.toLowerCase())) {
                                    reqHeaders.set(key, val);
                                }
                            }
                        }
                    }

                    // Apply consolidated headers (mutate in-place, no spread)
                    (ctx.options.fetch as Record<string, any>).headers = reqHeaders;
                    markTimeline(ctx, "transportStart");

                    // ETag Conditional Header
                    if (
                        ctx.options.etag?.enabled &&
                        method === "GET"
                    ) {
                        const storedETag = getETag(fingerprint);

                        if (storedETag) {
                            const headers = new Headers(ctx.options.fetch?.headers);
                            headers.set("If-None-Match", storedETag);

                            ctx.options.fetch = {
                                ...ctx.options.fetch,
                                headers
                            };
                        }
                    }
                    await run(ctx);

                    // Cookie jar — store cookies from response
                    if (cookieJar && ctx.response) {
                        cookieJar.setFromResponse(ctx.response);
                    }

                    // SECURITY — Response Size Guard
                    const sizeChunks = await checkResponseSize(
                        ctx.response!,
                        security.maxResponseSize
                    );

                    if (sizeChunks) {
                        // Body was consumed by the size check — reconstruct
                        // the Response so parseResponse can still read it.
                        ctx.response = new Response(
                            new Blob(sizeChunks as BlobPart[]),
                            {
                                status: ctx.response!.status,
                                statusText: ctx.response!.statusText,
                                headers: ctx.response!.headers
                            }
                        );
                    }

                    // Download progress tracking (wraps response body with a counting stream)
                    if (ctx.options.hooks?.onDownloadProgress && ctx.response) {
                        ctx.response = trackDownloadProgress(
                            ctx.response,
                            ctx.options.hooks.onDownloadProgress
                        );
                    }

                    // Adaptive rate limiting from response headers
                    if (limiter) {
                        const remaining = ctx.response!.headers.get("X-RateLimit-Remaining");
                        const resetVal = ctx.response!.headers.get("X-RateLimit-Reset");
                        if (remaining !== null) {
                            limiter.syncFromHeaders(
                                parseInt(remaining, 10),
                                resetVal !== null ? parseInt(resetVal, 10) : undefined
                            );
                        }

                        // Also handle standard Retry-After for 429 responses
                        const retryAfter = ctx.response!.headers.get("Retry-After");
                        if (retryAfter !== null && ctx.response!.status === 429) {
                            const seconds = parseInt(retryAfter, 10);
                            if (!isNaN(seconds)) {
                                // Schedule next refill after the server-requested delay
                                limiter.syncFromHeaders(0, Math.ceil(Date.now() / 1000) + seconds);
                            }
                        }
                    }

                    // Handle 304 Not Modified
                    if (
                        ctx.options.etag?.enabled &&
                        ctx.response?.status === 304
                    ) {
                        // 304 means "not modified" — use cached data even if TTL expired.
                        // Use peekCache (not getCache) because getCache deletes expired entries.
                        const cached = peekCache(fingerprint);

                        if (cached) {
                            // Renew TTL on 304 hit so the cache doesn't keep expiring
                            const ttl = typeof ctx.options.cache === "boolean"
                                ? 300000
                                : (ctx.options.cache as { ttl: number })?.ttl ?? 300000;

                            setCache(fingerprint, cached, ttl);
                            markTimeline(ctx, "etagHit");

                            if (breaker) {
                                breaker.recordSuccess(host);
                            }

                            return cached as SolvixResponse<T>;
                        }

                        // No cached data at all (ETag stored but cache was never written).
                        // Clear the stale ETag so the next request re-fetches fresh,
                        // and return 304 as a valid response instead of throwing.
                        clearETag(fingerprint);
                        markTimeline(ctx, "etagHit");

                        if (breaker) {
                            breaker.recordSuccess(host);
                        }

                        return {
                            data: undefined as T,
                            status: 304,
                            headers: ctx.response!.headers,
                            meta: ctx.meta
                        } as SolvixResponse<T>;
                    }
                    markTimeline(ctx, "responseReceived");

                    const validateStatus =
                        ctx.options.validateStatus ??
                        ((status: number) =>
                            status >= 200 && status < 300);

                    if (
                        !ctx.response ||
                        !validateStatus(ctx.response.status)
                    ) {
                        const status = ctx.response?.status;

                        throw new SolvixError({
                            message: `HTTP Error: ${status}`,
                            ...(status !== undefined && { status }),
                            isRetryable:
                                status !== undefined && status >= 500,
                            attempts: attempt
                        });
                    }

                    break;

                } catch (err) {

                    const solvixError =
                        normalizeError(err, attempt);

                    if (!solvixError.isRetryable || attempt >= retryConfig.retries) {

                        markTimeline(ctx, "failed");

                        if (breaker) {
                            breaker.recordFailure(host);
                        }

                        if (ctx.options.group instanceof RequestGroup) {
                            ctx.options.group.markFailed();
                        }

                        // Automatic Token Refresh (ONLY after retries exhausted)
                        if (
                            globalOptions.auth &&
                            globalOptions.auth.shouldRefresh?.(solvixError) &&
                            !ctx.options.__tokenRefreshAttempted
                        ) {
                            try {
                                const newToken =
                                    await tokenOrchestrator.handleRefresh(
                                        globalOptions.auth.refreshToken
                                    );

                                if (globalOptions.auth.attachToken) {
                                    globalOptions.auth.attachToken(newToken, ctx);
                                }

                                // Mark refresh attempted to prevent recursion
                                const replayOptions: SolvixOptions = {
                                    ...options,
                                    __tokenRefreshAttempted: true
                                };

                                return await request<T>(url, replayOptions);

                            } catch {
                                // Continue normal failure flow
                            }
                        }

                        // Try fallback URLs before final failure
                        if (solvixError.isRetryable && fallbackIdx < fallbackURLs.length) {
                            ctx.url = fallbackURLs[fallbackIdx++]!;
                            attempt = 0;
                            continue;
                        }

                        finalizeFailure(solvixError);
                    }

                    attempt++;
                    ctx.meta.retries = attempt;

                    globalOptions.hooks?.onRetry?.(ctx, attempt);

                    SolvixBus.emit({
                        type: "request:retry",
                        context: ctx,
                        timestamp: Date.now()
                    });

                    ctx.options.logger?.warn?.("Request retrying", {
                        url: ctx.url,
                        attempt,
                        retries: ctx.meta.retries
                    });

                    const networkTime =
                        ctx.meta.timeline
                            ? getNetworkDuration(ctx.meta.timeline)
                            : undefined;

                    const delay = computeBackoff(
                        attempt,
                        retryConfig,
                        ctx.response,
                        networkTime
                    );

                    if (signal?.aborted) {
                        throw new SolvixError({
                            message: "Request aborted during retry delay",
                            isRetryable: false
                        });
                    }

                    await sleep(delay, signal);
                }
            }

            let data;

            if (ctx.options.stream) {
                data = await handleStream(ctx.response!, {
                    ...(ctx.options.sse !== undefined && {
                        sse: ctx.options.sse
                    }),
                    ...(ctx.options.parseJsonLines !== undefined && {
                        parseJsonLines: ctx.options.parseJsonLines
                    })
                });
            } else {
                markTimeline(ctx, "parseStart");
                data = await parseResponse(
                    ctx.response!,
                    ctx.options.responseType,
                    ctx.options.transformResponse
                );
                markTimeline(ctx, "parseEnd");
            }

            // Response schema validation
            if (ctx.options.validateResponse) {
                try {
                    data = ctx.options.validateResponse(data);
                } catch (err) {
                    throw new SolvixError({
                        message: `Response validation failed: ${err instanceof Error ? err.message : String(err)}`,
                        isRetryable: false
                    });
                }
            }

            ctx.meta.endTime = Date.now();
            ctx.meta.duration =
                ctx.meta.endTime - ctx.meta.startTime;

            if (
                ctx.options.profiling?.enabled &&
                ctx.meta.timeline
            ) {
                ctx.meta.profile = buildProfile(
                    ctx.meta.timeline,
                    ctx.meta.retries,
                    ctx.meta.startTime,
                    ctx.meta.endTime
                );
            }

            markTimeline(ctx, "completed");

            const response: SolvixResponse<T> = {
                data: data as T,
                status: ctx.response!.status,
                headers: ctx.response!.headers,
                meta: ctx.meta
            };

            if (
                method === "GET" &&
                ctx.options.cache
            ) {
                const ttl = typeof ctx.options.cache === "boolean"
                    ? 300000  // default 5 min TTL for cache: true
                    : ctx.options.cache.ttl;

                setCache(fingerprint, response, ttl);
            }

            if (breaker) {
                breaker.recordSuccess(host);
            }

            globalOptions.hooks?.onRequestEnd?.(ctx);

            if (ctx.options.group instanceof RequestGroup) {
                ctx.options.group.markComplete();
            }

            if (ctx.options.id) {
                dependencyRegistry.resolve(ctx.options.id, response);
            }

            if (ctx.options.snapshot?.enabled) {
                ctx.meta.snapshot = buildSnapshot(ctx);
                if (security.redactSnapshot) {
                    redactSnapshotData(ctx);
                }
            }

            SolvixBus.emit({
                type: "request:complete",
                context: ctx,
                timestamp: Date.now()
            });

            ctx.options.logger?.info?.("Request completed", {
                url: ctx.url,
                status: ctx.response!.status,
                duration: ctx.meta.duration,
                runtime: ctx.meta.runtime
            });

            if (
                ctx.options.etag?.enabled &&
                method === "GET"
            ) {
                const responseETag =
                    ctx.response!.headers.get("ETag");

                if (responseETag) {
                    setETag(fingerprint, responseETag);
                }
            }

            // Advanced Shadow Mode (Non-blocking)
            if (ctx.options.shadow?.enabled) {
                // Fire and forget
                executeShadow(
                    ctx,
                    response,
                    ctx.options.shadow
                );
            }

            return response;
        };

        // Dependency wait (before scheduling)
        if (ctx.options.dependsOn?.length) {
            for (const depId of ctx.options.dependsOn) {

                if (!dependencyRegistry.has(depId)) {
                    const error = new SolvixError({
                        message: `Dependency not found: ${depId}`,
                        isRetryable: false
                    });

                    if (ctx.options.snapshot?.enabled) {
                        ctx.meta.endTime = Date.now();
                        ctx.meta.duration = ctx.meta.endTime - ctx.meta.startTime;

                        ctx.meta.snapshot = {
                            ...buildSnapshot(ctx),
                            error: { message: error.message }
                        };
                        if (security.redactSnapshot) {
                            redactSnapshotData(ctx);
                        }
                    }

                    throw error;
                }

                try {
                    await dependencyRegistry.waitFor(depId);
                } catch {
                    const error = new SolvixError({
                        message: `Dependency failed: ${depId}`,
                        isRetryable: false
                    });

                    if (ctx.options.snapshot?.enabled) {
                        ctx.meta.endTime = Date.now();
                        ctx.meta.duration = ctx.meta.endTime - ctx.meta.startTime;

                        ctx.meta.snapshot = {
                            ...buildSnapshot(ctx),
                            error: { message: error.message }
                        };

                        if (security.redactSnapshot) {
                            redactSnapshotData(ctx);
                        }
                    }

                    throw error;
                }
            }
        }

        markTimeline(ctx, "queued");

        const wrappedTask = async () => {
            markTimeline(ctx, "dequeued");
            return task();
        };

        const requestPromise = priorityQueue.add(
            wrappedTask,
            priority
        );

        if (ctx.options.dedupe) {
            setInflight(fingerprint, requestPromise);
            requestPromise.finally(() => {
                clearInflight(fingerprint);
            });
        }

        return requestPromise;
    }

    function methodFactory(method: HttpMethod) {
        return <T = unknown>(
            url: string,
            opts?: SolvixOptions
        ) =>
            request<T>(url, {
                ...opts,
                method
            });
    }

    return {
        request,
        get: methodFactory("GET"),
        post: methodFactory("POST"),
        put: methodFactory("PUT"),
        patch: methodFactory("PATCH"),
        delete: methodFactory("DELETE"),
        head: methodFactory("HEAD"),
        options: methodFactory("OPTIONS"),
        /** Returns aggregated metrics snapshot, or null if metrics are disabled. */
        metrics: () => metricsCollector.getMetrics(),
        /** Health checker controller. Null if health checks are disabled. */
        healthCheck: healthChecker
            ? { isHealthy: () => healthChecker.healthy, stop: () => healthChecker.stop() }
            : null,
        /** Register a custom middleware function in the request pipeline. */
        use: (fn: SolvixMiddleware) => {
            middlewares.splice(middlewares.length - 1, 0, fn);
            run = compose(middlewares);
        }
    };
}