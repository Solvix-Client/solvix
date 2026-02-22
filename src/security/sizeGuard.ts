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

export async function checkResponseSize(
    response: Response,
    maxSize: number
) {
    if (maxSize === Infinity) return;

    const contentLength = response.headers.get("content-length");

    if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (!isNaN(size) && size > maxSize) {
            throw new SolvixError({
                message: `Response size exceeds limit (${size} bytes)`,
                isRetryable: false
            });
        }
    }
}