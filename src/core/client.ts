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
import { getNetworkDuration } from "../utils/retryAnalytics";
import { buildProfile } from "../utils/profiler";
import { runDevWarnings } from "../utils/devWarnings";
import { SolvixBus } from "./bus";
import { RequestGroup } from "./group";
import { dependencyRegistry } from "./dependencyRegistry";

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

        // Register this request if it has id or is a dependency for another request
        if (ctx.options.id) {
            dependencyRegistry.create(ctx.options.id);
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

            SolvixBus.emit({
                type: "request:start",
                context: ctx,
                timestamp: Date.now()
            });

            const signal = ctx.options.fetch?.signal ?? undefined;
            if (signal?.aborted) {
                markTimeline(ctx, "failed");

                const error = new SolvixError({
                    message: "Request aborted",
                    isRetryable: false
                });

                if (ctx.options.group instanceof RequestGroup) {
                    ctx.options.group.markFailed();
                }

                SolvixBus.emit({
                    type: "request:error",
                    context: ctx,
                    timestamp: Date.now()
                });

                throw error;
            }

            const host = new URL(ctx.url).host;

            if (breaker) {
                markTimeline(ctx, "breakerCheck");
                if (!breaker.canRequest(host)) {
                    markTimeline(ctx, "failed");

                    const error = new SolvixError({
                        message: "Circuit breaker is OPEN",
                        isRetryable: false
                    });

                    if (ctx.options.group instanceof RequestGroup) {
                        ctx.options.group.markFailed();
                    }

                    SolvixBus.emit({
                        type: "request:error",
                        context: ctx,
                        timestamp: Date.now()
                    });

                    throw error;
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

                    if (!solvixError.isRetryable || attempt >= retryConfig.retries) {

                        markTimeline(ctx, "failed");

                        if (breaker) {
                            breaker.recordFailure(host);
                        }

                        if (ctx.options.group instanceof RequestGroup) {
                            ctx.options.group.markFailed();
                        }

                        if (ctx.options.id) {
                            dependencyRegistry.reject(ctx.options.id, solvixError);
                        }

                        globalOptions.hooks?.onError?.(solvixError, ctx);

                        SolvixBus.emit({
                            type: "request:error",
                            context: ctx,
                            timestamp: Date.now()
                        });

                        throw solvixError;
                    }

                    attempt++;
                    ctx.meta.retries = attempt;

                    globalOptions.hooks?.onRetry?.(ctx, attempt);

                    SolvixBus.emit({
                        type: "request:retry",
                        context: ctx,
                        timestamp: Date.now()
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

            if (ctx.options.group instanceof RequestGroup) {
                ctx.options.group.markComplete();
            }

            if (ctx.options.id) {
                dependencyRegistry.resolve(ctx.options.id, response);
            }

            SolvixBus.emit({
                type: "request:complete",
                context: ctx,
                timestamp: Date.now()
            });

            return response;
        };

        // Dependency wait (before scheduling)
        if (ctx.options.dependsOn?.length) {
            for (const depId of ctx.options.dependsOn) {

                if (!dependencyRegistry.has(depId)) {
                    throw new SolvixError({
                        message: `Dependency not found: ${depId}`,
                        isRetryable: false
                    });
                }

                try {
                    await dependencyRegistry.waitFor(depId);
                } catch (error) {
                    throw new SolvixError({
                        message: `Dependency failed: ${depId}`,
                        isRetryable: false
                    });
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
        options: methodFactory("OPTIONS")
    };
}