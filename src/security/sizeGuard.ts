import { SolvixError } from "../errors";

export function checkBodySize(
    body: BodyInit | null | undefined,
    maxSize: number
) {
    if (!body || maxSize === Infinity) return;

    let size = 0;

    if (typeof body === "string") {
        size = new TextEncoder().encode(body).length;
    } else if (body instanceof Blob) {
        size = body.size;
    } else if (body instanceof ArrayBuffer) {
        size = body.byteLength;
    }

    if (size > maxSize) {
        throw new SolvixError({
            message: `Request body size exceeds limit (${size} bytes)`,
            isRetryable: false
        });
    }
}

/**
 * Reads and validates response body size.
 * Returns the collected chunks if within limit (caller must reconstruct the Response),
 * or throws if the size exceeds maxSize.
 * Returns undefined when the check was trivially satisfied (Content-Length under limit).
 */
export async function checkResponseSize(
    response: Response,
    maxSize: number
): Promise<Uint8Array[] | undefined> {
    if (maxSize === Infinity) return;

    // Fast path: check Content-Length header
    const contentLength = response.headers.get("content-length");

    if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (!isNaN(size) && size > maxSize) {
            throw new SolvixError({
                message: `Response size exceeds limit (${size} bytes)`,
                isRetryable: false
            });
        }
        return; // Body not consumed, caller uses original response
    }

    // No Content-Length header (chunked encoding, streaming, etc).
    // Consume the original body stream directly so that reader.cancel()
    // actually stops network transfer. Collect chunks; if within limit,
    // return them so the caller can reconstruct the Response for parsing.
    if (!response.body) return;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            totalSize += value.byteLength;

            if (totalSize > maxSize) {
                await reader.cancel();
                throw new SolvixError({
                    message: `Response size exceeds limit (${totalSize} bytes)`,
                    isRetryable: false
                });
            }
        }
    } finally {
        reader.releaseLock();
    }

    return chunks;
}
