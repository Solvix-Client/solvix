import type { SolvixContext, TracingOptions } from "../types";

const DEFAULT_HEADER = "traceparent";

/**
 * Generates a 32-character hex trace ID.
 */
export function generateTraceId(): string {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
}

/**
 * Generates a 16-character hex span ID.
 */
export function generateSpanId(): string {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Builds a W3C traceparent header value.
 * Format: 00-{traceId}-{spanId}-01
 */
export function buildTraceParent(traceId: string, spanId: string): string {
    return `00-${traceId}-${spanId}-01`;
}

/**
 * Injects a W3C traceparent header into the request.
 * Same traceId is used across all retry attempts; a new spanId is generated per attempt.
 * Called inside the retry loop, before transport.
 */
export function applyTracing(
    ctx: SolvixContext,
    options: TracingOptions | undefined,
    attempt: number
): void {
    if (!options?.enabled) return;

    // Same traceId across all retry attempts
    if (!ctx.meta.traceId) {
        ctx.meta.traceId = generateTraceId();
    }

    // New spanId per attempt
    ctx.meta.spanId = generateSpanId();

    const headerName = (options.traceHeader || DEFAULT_HEADER).toLowerCase();
    const headers = new Headers(ctx.options.fetch?.headers);

    // Don't overwrite user-supplied trace header
    if (!headers.has(headerName)) {
        headers.set(headerName, buildTraceParent(ctx.meta.traceId, ctx.meta.spanId));
        ctx.options.fetch = { ...ctx.options.fetch, headers };
    }
}
