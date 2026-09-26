import type {
    GraphQLClient as IGraphQLClient,
    GraphQLOptions,
    GraphQLOperationOptions,
    GraphQLResponse,
    SolvixOptions,
} from "../types";
import type { createClient } from "../core/client";
import { GraphQLClientError } from "./errors";
import { createPersistedQueryHash } from "./persistedQuery";
import { NormalizedCache } from "./normalizer";
import { Batcher } from "./batcher";

type SolvixClient = ReturnType<typeof createClient>;

/**
 * Create a first-class GraphQL client that wraps an existing Solvix client.
 *
 * All HTTP concerns (retry, circuit breaker, rate limiting, metrics, tracing,
 * auth, correlation, dedup, cache) are delegated to the underlying client.
 *
 * @example
 * ```ts
 * import { createClient, createGraphQLClient } from "@solvix-client/client";
 *
 * const client = createClient({ baseURL: "https://api.example.com" });
 * const graphql = createGraphQLClient(client, { endpoint: "/graphql" });
 *
 * const { data } = await graphql.query(`{ users { id name } }`);
 * const { data: created } = await graphql.mutate(
 *   `mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }`,
 *   { variables: { input: { name: "Alice" } } }
 * );
 * ```
 */
export function createGraphQLClient(
    client: SolvixClient,
    options: GraphQLOptions = {}
): IGraphQLClient {
    const endpoint = options.endpoint ?? "/graphql";
    const defaultMethod = options.defaultMethod ?? "POST";
    const throwOnError = options.throwOnError ?? false;

    const normalizer = options.cacheNormalization?.enabled
        ? new NormalizedCache(options.cacheNormalization)
        : null;

    const batcher = options.batching?.enabled
        ? new Batcher(client, endpoint, options.batching)
        : null;

    // ── Execute ───────────────────────────────────────────────────────────

    async function execute<T = any>(
        document: string,
        opts: GraphQLOperationOptions = {},
        method: "GET" | "POST" = "POST"
    ): Promise<GraphQLResponse<T>> {
        const actualMethod = opts.method ?? method;
        const body: Record<string, any> = {
            query: document,
        };

        if (opts.variables) body.variables = opts.variables;
        if (opts.operationName) body.operationName = opts.operationName;
        if (opts.extensions) body.extensions = opts.extensions;

        // APQ: send hash only on first attempt
        if (options.persistedQueries?.enabled && actualMethod === "GET") {
            const hash = await createPersistedQueryHash(document);
            body.extensions = {
                ...body.extensions,
                persistedQuery: { sha256Hash: hash },
            };
            // Remove query for initial APQ attempt
            delete body.query;
        }

        // Check normalized cache for queries
        const cacheKey = JSON.stringify({ query: document, variables: opts.variables });
        if (normalizer && actualMethod === "GET") {
            const cached = normalizer.read(cacheKey);
            if (cached) return cached as GraphQLResponse<T>;
        }

        const solvixOpts: Partial<SolvixOptions> = {
            ...opts.context,
            fetch: {
                ...opts.context?.fetch,
                headers: {
                    ...options.headers,
                    ...(opts.context?.fetch?.headers as Record<string, string>),
                },
            },
        };

        let res: { data: any };

        if (actualMethod === "GET") {
            const params: Record<string, string> = {};
            if (body.query) params.query = body.query;
            if (body.variables) params.variables = JSON.stringify(body.variables);
            if (body.operationName) params.operationName = body.operationName;
            if (body.extensions) params.extensions = JSON.stringify(body.extensions);

            res = await client.get(endpoint, { ...solvixOpts, params });
        } else {
            res = await client.post(endpoint, {
                ...solvixOpts,
                body,
                bodyType: "json",
            });
        }

        let graphqlRes = res.data as GraphQLResponse<T>;

        // APQ retry: if server says persisted query not found, resend with full query
        if (
            options.persistedQueries?.enabled &&
            graphqlRes.errors?.some((e) =>
                e.message?.includes("PersistedQueryNotFound")
            )
        ) {
            const hash = await createPersistedQueryHash(document);
            const retryBody = {
                query: document,
                variables: opts.variables,
                operationName: opts.operationName,
                extensions: {
                    ...opts.extensions,
                    persistedQuery: { sha256Hash: hash },
                },
            };

            const retryRes = actualMethod === "GET"
                ? await client.get(endpoint, {
                    ...solvixOpts,
                    params: {
                        query: document,
                        variables: opts.variables ? JSON.stringify(opts.variables) : undefined,
                        operationName: opts.operationName,
                        extensions: JSON.stringify(retryBody.extensions),
                    },
                })
                : await client.post(endpoint, {
                    ...solvixOpts,
                    body: retryBody,
                    bodyType: "json",
                });

            graphqlRes = retryRes.data as GraphQLResponse<T>;
        }

        // Error handling
        if (throwOnError && graphqlRes.errors?.length) {
            throw new GraphQLClientError(graphqlRes.errors);
        }

        // Normalize cache
        if (normalizer && graphqlRes.data) {
            normalizer.write(cacheKey, graphqlRes.data);
        }

        return graphqlRes;
    }

    // ── Public API ────────────────────────────────────────────────────────

    return {
        query<T = any>(document: string, opts?: GraphQLOperationOptions) {
            return execute<T>(document, opts, defaultMethod);
        },

        mutate<T = any>(document: string, opts?: GraphQLOperationOptions) {
            return execute<T>(document, opts, "POST");
        },

        batch(operations) {
            if (batcher) {
                return batcher.execute(operations);
            }
            return Promise.all(
                operations.map((op) => execute(op.document, op.options))
            );
        },

        subscribe<T = any>(document: string, opts: GraphQLOperationOptions & { transport: import("../types").GraphQLSubscriptionTransport }) {
            const payload = {
                query: document,
                variables: opts.variables,
                operationName: opts.operationName,
            };
            return opts.transport.subscribe(endpoint, payload) as AsyncIterable<GraphQLResponse<T>>;
        },

        evict(predicate) {
            normalizer?.evict(predicate);
        },

        clearCache() {
            normalizer?.clear();
        },
    };
}
