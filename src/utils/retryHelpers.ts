import { SolvixError } from "../errors";
import type { RetryOptions } from "../types";

export function normalizeRetry(
    retry?: number | RetryOptions
): Required<RetryOptions> {

    if (typeof retry === "number") {
        return {
            retries: Math.min(Math.max(retry, 0), 10),
            factor: 2,
            minTimeout: 100,
            maxTimeout: 5000,
            jitter: true,
            adaptive: false
        };
    }

    return {
        retries: Math.min(
            Math.max(retry?.retries ?? 0, 0),
            10
        ),
        factor: retry?.factor ?? 2,
        minTimeout: retry?.minTimeout ?? 100,
        maxTimeout: retry?.maxTimeout ?? 5000,
        jitter: retry?.jitter ?? true,
        adaptive: retry?.adaptive ?? false
    };
}

export function computeBackoff(
    attempt: number,
    retry: Required<RetryOptions>,
    response?: Response,
    networkTime?: number
): number {

    // Respect Retry-After header
    if (response) {
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter) {
            const parsed = Number(retryAfter);
            if (!isNaN(parsed)) {
                return parsed * 1000;
            }
        }
    }

    // Base exponential backoff
    let delay =
        retry.minTimeout *
        Math.pow(retry.factor, attempt);

    // Adaptive network scaling
    if (retry.adaptive && networkTime) {
        delay += Math.min(networkTime * 0.5, 2000);
    }

    // Clamp to max
    delay = Math.min(delay, retry.maxTimeout);

    // Jitter
    if (retry.jitter) {
        const jitterAmount = delay * 0.3;
        delay =
            delay - jitterAmount +
            Math.random() * jitterAmount;
    }

    return Math.max(delay, retry.minTimeout);
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

    if (
        typeof window !== "undefined" &&
        err instanceof TypeError &&
        err.message.includes("fetch")
    ) {
        return new SolvixError({
            message:
                "Network request failed (possible CORS issue or network block)",
            isRetryable: false
        });
    }

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