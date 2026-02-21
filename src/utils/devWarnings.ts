import type { SolvixContext } from "../types";

function warn(message: string) {
    if (typeof console !== "undefined") {
        console.warn(`[Solvix Warning] ${message}`);
    }
}

export function runDevWarnings(
    ctx: SolvixContext<any>
) {

    if (!ctx.options.devMode) return;

    const method =
        ctx.options.fetch?.method ?? "GET";

    const isIdempotent =
        ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]
            .includes(method);

    // Retry on POST/PATCH
    if (
        ctx.options.retry &&
        !isIdempotent
    ) {
        warn(
            `Retry enabled on non-idempotent method (${method}). This may cause duplicate side effects.`
        );
    }

    // Cache on non-GET
    if (
        ctx.options.cache &&
        method !== "GET"
    ) {
        warn(
            `Cache is enabled on ${method}. Caching non-GET requests is usually unsafe.`
        );
    }

    // Dedupe on non-idempotent
    if (
        ctx.options.dedupe &&
        !isIdempotent
    ) {
        warn(
            `Deduplication on ${method} may hide duplicate mutations.`
        );
    }

    // Profiling without timeline
    if (
        ctx.options.profiling?.enabled &&
        !ctx.options.timeline?.enabled
    ) {
        warn(
            `Profiling enabled without timeline. Enable timeline for accurate profiling.`
        );
    }

    // Stream + responseType conflict
    if (
        ctx.options.stream &&
        ctx.options.responseType &&
        ctx.options.responseType !== "stream"
    ) {
        warn(
            `Stream mode enabled but responseType is '${ctx.options.responseType}'.`
        );
    }

    // Adaptive retry without timeline
    if (
        typeof ctx.options.retry === "object" &&
        ctx.options.retry?.adaptive &&
        !ctx.options.timeline?.enabled
    ) {
        warn(
            `Adaptive retry works best with timeline enabled.`
        );
    }

}