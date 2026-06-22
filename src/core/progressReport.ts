export interface ProgressPayload {
    loaded: number;
    total?: number;
}

/**
 * Wraps a Response body with a counting ReadableStream so every chunk
 * read from the body fires `onProgress` with the cumulative byte count.
 *
 * - If `Content-Length` is present, `total` is set once at the start.
 * - The returned Response is fully functional — consumers read from the
 *   new stream as if nothing changed.
 */
export function trackDownloadProgress(
    response: Response,
    onProgress: (p: ProgressPayload) => void
): Response {
    if (!response.body) return response;

    const rawTotal = response.headers.get("content-length");
    const total = rawTotal ? Number(rawTotal) : undefined;
    let loaded = 0;

    const reader = response.body.getReader();

    const stream = new ReadableStream({
        async pull(controller) {
            const { done, value } = await reader.read();

            if (done) {
                controller.close();
                reader.releaseLock();
                return;
            }

            loaded += value.byteLength;
            onProgress({ loaded, ...(total !== undefined && { total }) });
            controller.enqueue(value);
        },

        cancel() {
            reader.cancel();
            reader.releaseLock();
        }
    });

    return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
    });
}

/**
 * Wraps a request body so every byte consumed by the transport fires
 * `onProgress` with the cumulative count.
 *
 * Supported: Blob, ArrayBuffer, string, URLSearchParams.
 * FormData and ReadableStream pass through unchanged (no progress).
 */
export function trackUploadProgress(
    body: BodyInit,
    onProgress: (p: ProgressPayload) => void
): BodyInit {
    if (body instanceof ReadableStream) return body;

    let total: number | undefined;
    let source: Blob | undefined;

    if (body instanceof Blob) {
        total = body.size;
        source = body;
    } else if (body instanceof ArrayBuffer) {
        total = body.byteLength;
        source = new Blob([body]);
    } else if (typeof body === "string") {
        total = new TextEncoder().encode(body).length;
        source = new Blob([body]);
    } else if (body instanceof URLSearchParams) {
        const encoded = new TextEncoder().encode(body.toString());
        total = encoded.length;
        source = new Blob([encoded]);
    } else {
        // FormData or other opaque type — can't wrap, pass through
        return body;
    }

    let loaded = 0;
    const reader = source.stream().getReader();

    return new ReadableStream({
        async pull(controller) {
            const { done, value } = await reader.read();

            if (done) {
                controller.close();
                reader.releaseLock();
                return;
            }

            loaded += value.byteLength;
            onProgress({ loaded, ...(total !== undefined && { total }) });
            controller.enqueue(value);
        },

        cancel() {
            reader.cancel();
            reader.releaseLock();
        }
    }) as BodyInit;
}
