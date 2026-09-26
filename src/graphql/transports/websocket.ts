import type { GraphQLSubscriptionTransport } from "../../types";

/**
 * WebSocket transport adapter for GraphQL subscriptions.
 *
 * Implements the `graphql-ws` protocol (Apollo-compatible).
 * Handles connection lifecycle, heartbeat, and automatic reconnection.
 *
 * @example
 * ```ts
 * import { createWSTransport } from "@solvix-client/client";
 *
 * const transport = createWSTransport({
 *   url: "wss://api.example.com/graphql",
 *   connectionParams: { authToken: "Bearer token" },
 * });
 *
 * for await (const event of graphql.subscribe("{ updates { id } }", { transport })) {
 *   console.log(event);
 * }
 * ```
 */
export function createWSTransport(options: {
    url: string;
    connectionParams?: Record<string, any>;
    reconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
}): GraphQLSubscriptionTransport {
    let ws: WebSocket | null = null;
    let connected = false;
    let reconnectAttempts = 0;
    const reconnectEnabled = options.reconnect ?? true;
    const reconnectInterval = options.reconnectInterval ?? 3000;
    const maxReconnectAttempts = options.maxReconnectAttempts ?? 5;

    const subscriptions = new Map<string, {
        payload: any;
        queue: any[];
        resolve: ((value: IteratorResult<any>) => void)[];
        done: boolean;
    }>();

    let subscriptionCounter = 0;

    function connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            ws = new WebSocket(options.url, "graphql-transport-ws");

            ws.onopen = () => {
                // Send connection_init
                ws!.send(JSON.stringify({
                    type: "connection_init",
                    payload: options.connectionParams ?? {},
                }));
            };

            ws.onmessage = (event: MessageEvent) => {
                const msg = JSON.parse(event.data as string);

                switch (msg.type) {
                    case "connection_ack":
                        connected = true;
                        reconnectAttempts = 0;
                        resolve();
                        break;

                    case "next": {
                        const sub = subscriptions.get(msg.id);
                        if (sub) {
                            const waiters = sub.resolve.splice(0, 1);
                            if (waiters.length > 0) {
                                waiters[0]!({ value: msg.payload, done: false });
                            } else {
                                sub.queue.push(msg.payload);
                            }
                        }
                        break;
                    }

                    case "complete": {
                        const sub = subscriptions.get(msg.id);
                        if (sub) {
                            sub.done = true;
                            const waiters = sub.resolve.splice(0);
                            for (const w of waiters) {
                                w({ value: undefined, done: true });
                            }
                        }
                        break;
                    }

                    case "error": {
                        const sub = subscriptions.get(msg.id);
                        if (sub) {
                            sub.done = true;
                            const waiters = sub.resolve.splice(0);
                            for (const w of waiters) {
                                w({ value: msg.payload, done: false });
                            }
                        }
                        break;
                    }

                    // Heartbeat (ka) — no action needed
                    case "ping":
                        ws?.send(JSON.stringify({ type: "pong" }));
                        break;
                }
            };

            ws.onclose = () => {
                connected = false;
                if (reconnectEnabled && reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    setTimeout(() => {
                        connect().catch(() => {});
                    }, reconnectInterval);
                }
            };

            ws.onerror = (err: Event) => {
                if (!connected) reject(err);
            };
        });
    }

    return {
        async *subscribe(url: string, payload: any) {
            await connect();

            const id = String(++subscriptionCounter);
            subscriptions.set(id, { payload, queue: [], resolve: [], done: false });

            ws!.send(JSON.stringify({
                id,
                type: "subscribe",
                payload: {
                    query: payload.query,
                    variables: payload.variables,
                    operationName: payload.operationName,
                },
            }));

            const sub = subscriptions.get(id)!;

            try {
                while (!sub.done) {
                    if (sub.queue.length > 0) {
                        yield sub.queue.shift();
                    } else {
                        const result = await new Promise<IteratorResult<any>>((resolve) => {
                            sub.resolve.push(resolve);
                        });
                        if (result.done) return;
                        yield result.value;
                    }
                }
            } finally {
                subscriptions.delete(id);
                if (connected) {
                    ws?.send(JSON.stringify({ id, type: "complete" }));
                }
            }
        },

        close() {
            for (const [id] of subscriptions) {
                ws?.send(JSON.stringify({ id, type: "complete" }));
            }
            subscriptions.clear();
            ws?.close();
            ws = null;
            connected = false;
        },
    };
}
