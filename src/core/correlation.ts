import type { SolvixContext, CorrelationOptions } from "../types";

const DEFAULT_HEADER = "x-request-id";

/**
 * Injects a unique correlation ID (X-Request-ID) header into the request.
 * Called once per request, before the retry loop.
 * Does NOT overwrite a user-supplied header. Opt-out via { enabled: false }.
 */
export function applyCorrelationId(
    ctx: SolvixContext,
    options: CorrelationOptions | undefined
): void {
    if (!options || options.enabled === false) return;

    const headerName = (options.headerName || DEFAULT_HEADER).toLowerCase();
    const existingHeaders: Record<string, string> =
        (ctx.options.fetch?.headers as Record<string, string>) ?? {};

    // Don't overwrite user-supplied correlation ID
    for (const key of Object.keys(existingHeaders)) {
        if (key.toLowerCase() === headerName) {
            ctx.meta.correlationId = String(existingHeaders[key] ?? "");
            return;
        }
    }

    const id = options.generator ? options.generator() : crypto.randomUUID();
    ctx.meta.correlationId = id;
    existingHeaders[headerName] = id;

    ctx.options.fetch = {
        ...ctx.options.fetch,
        headers: existingHeaders
    };
}
