import type { SolvixContext, CSRFOptions, HttpMethod } from "../types";

const CSRF_METHODS: HttpMethod[] = ["POST", "PUT", "PATCH", "DELETE"];
const DEFAULT_COOKIE_NAME = "XSRF-TOKEN";
const DEFAULT_HEADER_NAME = "X-XSRF-TOKEN";

function readCookieFromDocument(name: string): string | null {
    if (typeof document === "undefined") return null;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=(.*?)(?:;|$)`));
    return match ? match[1] ?? null : null;
}

/**
 * Injects a CSRF token from a cookie into a request header for state-changing methods.
 * Called inside the retry loop, after header sanitization, before transport.
 * If `headers` is provided, it mutates it in-place instead of creating a new Headers.
 */
export function applyCSRF(
    ctx: SolvixContext,
    options: CSRFOptions | undefined,
    headers?: Headers
): void {
    if (!options?.enabled) return;

    const methods = options.methods ?? CSRF_METHODS;
    const method = (ctx.options.fetch?.method as HttpMethod) || "GET";

    if (!methods.includes(method)) return;

    const headerName = options.headerName || DEFAULT_HEADER_NAME;
    const cookieName = options.cookieName || DEFAULT_COOKIE_NAME;

    const h = headers ?? new Headers(ctx.options.fetch?.headers);

    // Don't overwrite user-supplied header
    if (h.has(headerName.toLowerCase())) return;

    const getCookie = options.getCookie ?? (() => readCookieFromDocument(cookieName));
    const token = getCookie();

    if (token) {
        h.set(headerName, token);
        if (!headers) {
            ctx.options.fetch = { ...ctx.options.fetch, headers: h };
        }
    }
}
