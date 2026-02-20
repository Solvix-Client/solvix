import { SolvixError } from "../errors";
import type { RetryOptions } from "../types";

export function normalizeRetry(
    retry?: number | RetryOptions
): RetryOptions {

    if (!retry) {
        return { retries: 0 };
    }

    if (typeof retry === "number") {
        return {
            retries: retry,
            factor: 2,
            minTimeout: 200
        };
    }

    const config: RetryOptions = {
        retries: retry.retries,
        factor: retry.factor ?? 2,
        minTimeout: retry.minTimeout ?? 200
    };

    if (retry.maxTimeout !== undefined) {
        config.maxTimeout = retry.maxTimeout;
    }

    return config;
}

export function computeBackoff(
    attempt: number,
    config: RetryOptions
) {
    const base = config.minTimeout ?? 200;
    const factor = config.factor ?? 2;

    let delay = base * Math.pow(factor, attempt - 1);

    if (config.maxTimeout) {
        delay = Math.min(delay, config.maxTimeout);
    }

    return delay;
}

export function normalizeError(
    err: unknown,
    attempt: number
): SolvixError {

    if (err instanceof SolvixError) return err;

    const isTimeout =
        err instanceof Error && err.name === "AbortError";

    const isNetworkError =
        err instanceof Error &&
        err.message.includes("fetch");

    return new SolvixError({
        message:
            err instanceof Error
                ? err.message
                : "Unknown error",
        cause: err,
        isTimeout,
        isNetworkError,
        isRetryable: isNetworkError || isTimeout,
        attempts: attempt
    });
}