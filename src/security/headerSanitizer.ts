import { SolvixError } from "../errors";

const FORBIDDEN_HEADERS = [
    "host",
    "content-length",
    "connection"
];

function isValidHeaderName(name: string) {
    return /^[a-zA-Z0-9\-]+$/.test(name);
}

function containsInvalidChars(value: string) {
    return /[\r\n]/.test(value);
}

export function sanitizeHeaders(
    headers: Headers,
    blockInsecure: boolean
) {
    for (const [key, value] of headers.entries()) {

        const lowerKey = key.toLowerCase();

        // Validate header name
        if (!isValidHeaderName(key)) {
            if (blockInsecure) {
                throw new SolvixError({
                    message: `Invalid header name: ${key}`,
                    isRetryable: false
                });
            } else {
                headers.delete(key);
                continue;
            }
        }

        // Prevent CRLF injection
        if (containsInvalidChars(value)) {
            if (blockInsecure) {
                throw new SolvixError({
                    message: `Invalid header value detected in: ${key}`,
                    isRetryable: false
                });
            } else {
                headers.set(key, value.replace(/[\r\n]/g, ""));
            }
        }

        // Block forbidden headers
        if (FORBIDDEN_HEADERS.includes(lowerKey)) {
            if (blockInsecure) {
                throw new SolvixError({
                    message: `Forbidden header override: ${key}`,
                    isRetryable: false
                });
            } else {
                headers.delete(key);
            }
        }
    }

    return headers;
}