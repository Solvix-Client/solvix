import type { SolvixTransport, TLSOptions, ProxyOptions } from "../types";

/**
 * Creates a Node.js-specific transport with optional TLS configuration and/or
 * HTTP proxy support. Uses `undici` (bundled with Node 18+) for fine-grained
 * control over TLS certificates and proxy routing.
 *
 * Falls back gracefully to default `globalThis.fetch` when:
 * - Not running in Node.js (browser/deno/edge)
 * - The `undici` module is not available (not installed)
 * - Neither TLS nor proxy is configured
 *
 * @returns A SolvixTransport function, or null if running outside Node.js
 */
export async function createNodeTransport(
    tls?: TLSOptions,
    proxy?: ProxyOptions
): Promise<SolvixTransport | null> {
    // Only for Node.js
    if (typeof process === "undefined" || !process.versions?.node) {
        return null;
    }

    // Nothing to configure
    if (!tls && !proxy) {
        return null;
    }

    let undici: any;
    try {
        undici = await import("undici");
    } catch {
        // undici not available — log a dev warning but don't crash
        return null;
    }

    // Build connect options for TLS
    const connect: Record<string, any> = {};
    if (tls) {
        if (tls.rejectUnauthorized !== undefined) {
            connect.rejectUnauthorized = tls.rejectUnauthorized;
        }
        if (tls.ca) connect.ca = tls.ca;
        if (tls.cert) connect.cert = tls.cert;
        if (tls.key) connect.key = tls.key;
        if (tls.passphrase) connect.passphrase = tls.passphrase;
    }

    const hasTlsConfig = Object.keys(connect).length > 0;

    if (proxy) {
        // Build proxy URI with optional auth
        let proxyUri = `${proxy.protocol || "http"}://`;
        if (proxy.auth) {
            proxyUri += `${encodeURIComponent(proxy.auth.username)}:${encodeURIComponent(proxy.auth.password)}@`;
        }
        proxyUri += `${proxy.host}:${proxy.port}`;

        const proxyAgent = new undici.ProxyAgent({
            uri: proxyUri,
            ...(hasTlsConfig ? { connect } : {})
        });

        return (url: string, init: RequestInit) =>
            fetch(url, { ...init, dispatcher: proxyAgent } as RequestInit);
    }

    if (hasTlsConfig) {
        const agent = new undici.Agent({ connect });
        return (url: string, init: RequestInit) =>
            fetch(url, { ...init, dispatcher: agent } as RequestInit);
    }

    return null;
}
