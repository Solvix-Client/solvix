import { SolvixError } from "../errors";

/** Connection-level headers the client should never let users override. */
const FORBIDDEN_HEADERS = [
    "host",
    "content-length",
    "connection"
];

/** Sensitive headers that are stripped when blockInsecureHeaders is enabled.
 *  These carry credentials, session data, or can be used for spoofing. */
const INSECURE_HEADERS = [
    "authorization",
    "cookie",
    "set-cookie",
    "proxy-authorization",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-real-ip",
    "x-api-key"
];

function isValidHeaderName(name: string) {
    return /^[a-zA-Z0-9\-]+$/.test(name);
}

function containsInvalidChars(value: string) {
    return /[\r\n]/.test(value);
}

/** Sanitize raw header entries (plain object or Headers) before they
 *  reach the transport. This runs at the plain-object layer to avoid
 *  Fetch API quirks where the Headers constructor silently drops
 *  forbidden headers like `Cookie` or throws before we can check. */
export function sanitizeRawHeaders(
    headers: Record<string, string>,
    blockInsecure: boolean
): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();

        // CRLF injection — always an attack, always throw
        if (containsInvalidChars(value)) {
            throw new SolvixError({
                message: `Invalid header value detected in: ${key}`,
                isRetryable: false
            });
        }

        // Invalid header name — always malformed, always throw
        if (!isValidHeaderName(key)) {
            throw new SolvixError({
                message: `Invalid header name: ${key}`,
                isRetryable: false
            });
        }

        // Forbidden connection-level headers — silently strip (protocol protection)
        if (FORBIDDEN_HEADERS.includes(lowerKey)) {
            continue;
        }

        // Insecure sensitive headers — silently strip when blockInsecure is enabled
        if (blockInsecure && INSECURE_HEADERS.includes(lowerKey)) {
            continue;
        }

        result[key] = value;
    }

    return result;
}
