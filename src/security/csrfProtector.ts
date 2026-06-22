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
 */
export function applyCSRF(
    ctx: SolvixContext,
    options: CSRFOptions | undefined
): void {
    if (!options?.enabled) return;

    const methods = options.methods ?? CSRF_METHODS;
    const method = (ctx.options.fetch?.method as HttpMethod) || "GET";

    if (!methods.includes(method)) return;

    const headerName = options.headerName || DEFAULT_HEADER_NAME;
    const cookieName = options.cookieName || DEFAULT_COOKIE_NAME;

    // Don't overwrite user-supplied header
    const existingHeaders = new Headers(ctx.options.fetch?.headers);
    if (existingHeaders.has(headerName.toLowerCase())) return;

    const getCookie = options.getCookie ?? (() => readCookieFromDocument(cookieName));
    const token = getCookie();

    if (token) {
        existingHeaders.set(headerName, token);
        ctx.options.fetch = { ...ctx.options.fetch, headers: existingHeaders };
    }
}
