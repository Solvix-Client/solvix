import { handleStream } from "../streaming/streamHandler";
import { PriorityQueue } from "../resilience/priorityQueue";
import { RateLimiter } from "../resilience/rateLimiter";
import { CircuitBreaker } from "../resilience/circuitBreaker";
import { resolveUrl } from "../utils/resolveUrl";
import { compose } from "./compose";
import { createContext } from "./context";
import { transportMiddleware } from "./transport";
import { timeoutMiddleware } from "./timeout";
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
    setCache
} from "../store/cache";

import { buildRequestBody } from "../core/bodyBuilder";
import { parseResponse } from "../core/responseParser";
import { markTimeline } from "../utils/timeline";
import { getNetworkDuration } from "@utils/retryAnalytics";
import { buildProfile } from "../utils/profiler";
import { runDevWarnings } from "../utils/devWarnings";

export function createClient(globalOptions: SolvixOptions = {}) {

    const priorityQueue = new PriorityQueue(
        globalOptions.maxConcurrency ?? Infinity,
        globalOptions.queue?.maxQueueSize ?? Infinity,
        globalOptions.queue?.strategy ?? "fifo"
    );

    const middlewares: SolvixMiddleware[] = [
        timeoutMiddleware,
        transportMiddleware
    ];

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

    const run = compose(middlewares);

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
            fetch: {
                ...globalOptions.fetch,
                ...options.fetch,
                method: normalizedMethod
            }
        };

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

        const resolvedUrl = resolveUrl(
            url,
            mergedOptions.baseURL
        );

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
        runDevWarnings(ctx);
        markTimeline(ctx, "created");

        const priority = ctx.options.priority ?? DEFAULT_PRIORITY;

        const fingerprint =
            await generateFingerprint(
                ctx.options.fetch?.method ?? "GET",
                ctx.url,
                ctx.options.fetch,
                ctx.options.fingerprint
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

            globalOptions.hooks?.onRequestStart?.(ctx);

            const signal = ctx.options.fetch?.signal ?? undefined;
            if (signal?.aborted) {
                markTimeline(ctx, "failed");
                throw new SolvixError({
                    message: "Request aborted",
                    isRetryable: false
                });
            }

            const host = new URL(ctx.url).host;

            if (breaker) {
                markTimeline(ctx, "breakerCheck");
                if (!breaker.canRequest(host)) {
                    markTimeline(ctx, "failed");
                    throw new SolvixError({
                        message: "Circuit breaker is OPEN",
                        isRetryable: false
                    });
                }
            }

            if (limiter) {
                markTimeline(ctx, "rateLimitWaitStart");
                await limiter.acquire(signal);
                markTimeline(ctx, "rateLimitWaitEnd");
            }

            const retryConfig = normalizeRetry(ctx.options.retry);
            let attempt = 0;

            while (attempt <= retryConfig.retries) {
                try {
                    ctx.meta.attempt = attempt;

                    if (ctx.options.body !== undefined) {
                        const headers = new Headers(
                            ctx.options.fetch?.headers
                        );

                        const builtBody = await buildRequestBody(
                            ctx.options.body,
                            ctx.options.bodyType,
                            headers,
                            ctx.options.transformRequest,
                            ctx.options.avoidPreflight
                        );

                        ctx.options.fetch = {
                            ...ctx.options.fetch,
                            body: builtBody,
                            headers
                        };
                    }

                    markTimeline(ctx, "transportStart");
                    await run(ctx);
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

                    if (
                        !solvixError.isRetryable ||
                        attempt >= retryConfig.retries
                    ) {
                        markTimeline(ctx, "failed");

                        if (breaker) {
                            breaker.recordFailure(host);
                        }

                        globalOptions.hooks?.onError?.(solvixError, ctx);
                        throw solvixError;
                    }

                    attempt++;
                    ctx.meta.retries = attempt;

                    globalOptions.hooks?.onRetry?.(ctx, attempt);

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
                ctx.options.cache &&
                typeof ctx.options.cache !== "boolean"
            ) {
                setCache(
                    fingerprint,
                    response,
                    ctx.options.cache.ttl
                );
            }

            if (breaker) {
                breaker.recordSuccess(host);
            }

            globalOptions.hooks?.onRequestEnd?.(ctx);

            return response;
        };

        markTimeline(ctx, "queued");
        const requestPromise = priorityQueue.add(task, priority)
            .finally(() => {
                markTimeline(ctx, "dequeued");
            });

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
        options: methodFactory("OPTIONS")
    };
}