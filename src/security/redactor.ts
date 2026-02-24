import type { SolvixContext } from "../types";

const SENSITIVE_HEADER_KEYS = [
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "proxy-authorization"
];

function maskValue(value: string) {
    if (value.length <= 8) return "*****";
    return value.slice(0, 4) + "*****";
}

function redactHeaderObject(headers?: HeadersInit): HeadersInit | undefined {
    if (!headers) return headers;

    const redacted = new Headers(headers);

    redacted.forEach((value, key) => {
        if (SENSITIVE_HEADER_KEYS.includes(key.toLowerCase())) {
            redacted.set(key, maskValue(value));
        }
    });

    return redacted;
}

export function redactSnapshotData<T>(
    ctx: SolvixContext<T>
) {
    if (!ctx.meta.snapshot) return;

    const snapshot = ctx.meta.snapshot as any;

    // Redact request headers if exist
    if (snapshot.headers) {
        snapshot.headers = redactHeaderObject(snapshot.headers);
    }

    // Redact response headers if exist
    if (snapshot.response?.headers) {
        snapshot.response.headers = redactHeaderObject(snapshot.response.headers);
    }
}