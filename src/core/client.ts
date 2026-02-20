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
    SolvixResponse
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

export function createClient(globalOptions: SolvixOptions = {}) {

    const middlewares: SolvixMiddleware[] = [
        timeoutMiddleware,
        transportMiddleware
    ];

    const run = compose(middlewares);

    async function request<T = unknown>(
        url: string,
        options: SolvixOptions = {}
    ): Promise<SolvixResponse<T>> {

        const mergedOptions: SolvixOptions = {
            ...globalOptions,
            ...options,
            fetch: {
                ...globalOptions.fetch,
                ...options.fetch
            }
        };

        const ctx = createContext<T>(url, mergedOptions);

        const fingerprint = generateFingerprint(
            ctx.url,
            ctx.options.fetch
        );

        const method = ctx.options.fetch?.method ?? "GET";

        // 🔹 1. Deduplication (concurrent only)
        if (ctx.options.dedupe) {
            const existing = getInflight(fingerprint);
            if (existing) {
                return existing as Promise<SolvixResponse<T>>;
            }
        }

        // 🔹 2. Cache (GET only)
        if (
            method === "GET" &&
            ctx.options.cache
        ) {
            const cached = getCache(fingerprint);
            if (cached) {
                return cached as SolvixResponse<T>;
            }
        }

        const requestPromise = (async () => {

            const retryConfig = normalizeRetry(ctx.options.retry);
            let attempt = 0;

            while (attempt <= retryConfig.retries) {
                try {
                    ctx.meta.attempt = attempt;

                    await run(ctx);

                    const validateStatus =
                        ctx.options.validateStatus ??
                        ((status: number) => status >= 200 && status < 300);

                    if (!ctx.response || !validateStatus(ctx.response.status)) {

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

                    const solvixError = normalizeError(err, attempt);

                    if (
                        !solvixError.isRetryable ||
                        attempt >= retryConfig.retries
                    ) {
                        throw solvixError;
                    }

                    attempt++;
                    ctx.meta.retries = attempt;

                    const delay = computeBackoff(attempt, retryConfig);
                    await sleep(delay);
                }
            }

            const data =
                ctx.options.parseJson !== false
                    ? await ctx.response!.json()
                    : await ctx.response!.text();

            ctx.meta.endTime = Date.now();
            ctx.meta.duration =
                ctx.meta.endTime - ctx.meta.startTime;

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

            return response;
        })();

        if (ctx.options.dedupe) {
            setInflight(fingerprint, requestPromise);

            requestPromise.finally(() => {
                clearInflight(fingerprint);
            });
        }

        return requestPromise;
    }

    return {
        request,
        get: <T = unknown>(url: string, opts?: SolvixOptions) =>
            request<T>(url, {
                ...opts,
                fetch: {
                    ...opts?.fetch,
                    method: "GET"
                }
            }),

        post: <T = unknown>(url: string, opts?: SolvixOptions) =>
            request<T>(url, {
                ...opts,
                fetch: {
                    ...opts?.fetch,
                    method: "POST"
                }
            })
    };
}