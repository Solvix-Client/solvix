import type {
    GraphQLResponse,
    GraphQLOperationOptions,
    BatchingOptions,
} from "../types";
import type { createClient } from "../core/client";

type PendingOperation = {
    document: string;
    options?: GraphQLOperationOptions | undefined;
    resolve: (value: GraphQLResponse) => void;
    reject: (reason: any) => void;
};

type SolvixClient = ReturnType<typeof createClient>;

/**
 * Collects multiple GraphQL operations and sends them as a single HTTP request.
 *
 * Operations are queued and flushed after `batchInterval` ms or when
 * `maxBatchSize` is reached, whichever comes first.
 */
export class Batcher {
    private queue: PendingOperation[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    private maxBatchSize: number;
    private batchInterval: number;
    private client: SolvixClient;
    private endpoint: string;

    constructor(
        client: SolvixClient,
        endpoint: string,
        options: BatchingOptions = {},
    ) {
        this.client = client;
        this.endpoint = endpoint;
        this.maxBatchSize = options.maxBatchSize ?? 10;
        this.batchInterval = options.batchInterval ?? 10;
    }

    /**
     * Add an operation to the batch. Returns a promise that resolves
     * when the batch is sent and the response is received.
     */
    add(document: string, options?: GraphQLOperationOptions): Promise<GraphQLResponse> {
        return new Promise<GraphQLResponse>((resolve, reject) => {
            this.queue.push({ document, options, resolve, reject });

            if (this.queue.length >= this.maxBatchSize) {
                this.flush();
            } else if (!this.timer) {
                this.timer = setTimeout(() => this.flush(), this.batchInterval);
            }
        });
    }

    /**
     * Send all queued operations as a single batch request.
     */
    private async flush(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        const batch = this.queue.splice(0);
        if (batch.length === 0) return;

        // If only one operation, send it normally
        if (batch.length === 1) {
            const op = batch[0]!;
            try {
                const body = {
                    query: op.document,
                    variables: op.options?.variables,
                    operationName: op.options?.operationName,
                    extensions: op.options?.extensions,
                };
                const res = await this.client.post(this.endpoint, {
                    body,
                    bodyType: "json",
                    ...op.options?.context,
                    fetch: {
                        ...op.options?.context?.fetch,
                    },
                });
                op.resolve(res.data as GraphQLResponse);
            } catch (err) {
                op.reject(err);
            }
            return;
        }

        // Multiple operations — send as array
        const operations = batch.map((op) => ({
            query: op.document,
            variables: op.options?.variables,
            operationName: op.options?.operationName,
            extensions: op.options?.extensions,
        }));

        try {
            const res = await this.client.post(this.endpoint, {
                body: operations,
                bodyType: "json",
            });

            const responses = res.data as GraphQLResponse[];
            for (let i = 0; i < batch.length; i++) {
                batch[i]!.resolve(responses[i] ?? { errors: [{ message: "Missing response for batched operation" }] });
            }
        } catch (err) {
            for (const op of batch) {
                op.reject(err);
            }
        }
    }

    /**
     * Execute a batch of operations immediately (for the `batch()` method).
     */
    async execute(
        operations: Array<{ document: string; options?: GraphQLOperationOptions }>
    ): Promise<GraphQLResponse[]> {
        // Send all as a single array request
        const body = operations.map((op) => ({
            query: op.document,
            variables: op.options?.variables,
            operationName: op.options?.operationName,
            extensions: op.options?.extensions,
        }));

        const res = await this.client.post(this.endpoint, {
            body,
            bodyType: "json",
        });

        return res.data as GraphQLResponse[];
    }

    get pending(): number {
        return this.queue.length;
    }
}
