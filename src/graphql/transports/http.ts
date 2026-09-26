import type { GraphQLSubscriptionTransport } from "../../types";

/**
 * HTTP/SSE transport adapter for GraphQL subscriptions.
 *
 * Uses Server-Sent Events to receive real-time updates over standard HTTP.
 * Works in all environments (Node.js, browser, Deno, Bun).
 *
 * @example
 * ```ts
 * import { createHTTPTransport } from "@solvix/client";
 *
 * const transport = createHTTPTransport({
 *   headers: { Authorization: "Bearer token" },
 * });
 *
 * for await (const event of graphql.subscribe("{ updates { id } }", { transport })) {
 *   console.log(event);
 * }
 * ```
 */
export function createHTTPTransport(options?: {
    headers?: Record<string, string>;
}): GraphQLSubscriptionTransport {
    let controller: AbortController | null = null;

    return {
        async *subscribe(url: string, payload: any) {
            controller = new AbortController();

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                    ...options?.headers,
                },
                body: JSON.stringify({
                    ...payload,
                    extensions: {
                        ...payload.extensions,
                        subscription: true,
                    },
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                throw new Error(`GraphQL subscription failed: ${res.status} ${res.statusText}`);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("Response body is not readable");

            const decoder = new TextDecoder();
            let buffer = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const data = line.slice(6).trim();
                            if (data === "[DONE]") return;
                            try {
                                yield JSON.parse(data);
                            } catch {
                                yield data;
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        },

        close() {
            controller?.abort();
            controller = null;
        },
    };
}
