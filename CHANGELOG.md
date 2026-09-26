# Solvix Release Notes

---

## v1.1.0 (2026-06-29) — GraphQL, Load Balancing & Binary Serialization

### New Features (3 major)

#### GraphQL Client (`createGraphQLClient`)
- **Query & Mutation** — `graphql.query()` and `graphql.mutate()` with full type inference
- **Request Batching** — collect multiple operations into a single HTTP request with configurable interval and max batch size
- **Automatic Persisted Queries (APQ)** — SHA-256 hash-based query deduplication, server-side caching
- **Entity-level Cache Normalization** — `__typename:id` key extraction with TTL-based auto-eviction and manual `evict()`/`clearCache()`
- **Subscription Transport Adapters** — pluggable architecture supporting HTTP/SSE (`createHTTPTransport`) and WebSocket (`createWSTransport`) with `graphql-ws` protocol, heartbeat, reconnect
- **GraphQL Error Handling** — `GraphQLClientError` with structured `graphqlErrors` array, optional `throwOnError` mode
- Composition architecture: all HTTP concerns (retry, circuit breaker, rate limiting, metrics, tracing, auth) inherited from the underlying Solvix client

#### Client-side Load Balancing (`createLoadBalancer`)
- **Drop-in transport** — `createLoadBalancer()` returns a `SolvixTransport`, use via `createClient({ transport })`
- **Built-in strategies** — `round-robin`, `random`, `weighted`, `health`
- **Custom strategy functions** — `(backends: BackendState[]) => BackendState` with access to `latency`, `healthy`, `weight`, `consecutiveFailures`
- **Per-backend health checking** — configurable endpoint, interval, timeout, failure threshold
- **Transparent failover** — automatically routes to healthy backends on 5xx or connection errors
- **Latency tracking** — exponential moving average updated after each request
- **URL rewriting** — preserves paths, query params, and fragments across backends

#### Protobuf / MessagePack Serialization
- **Extended `BodyType`** — `"protobuf"` and `"msgpack"` added to the union
- **Extended `ResponseType`** — `"protobuf"` and `"msgpack"` added to the union
- **`SerializationOptions`** — user-provided `encoder`/`decoder` functions, zero bundled dependencies
- **Codec helpers** — `createProtobufCodec()` and `createMsgpackCodec()` with sensible defaults
- **Custom Content-Type** — override default `application/protobuf` or `application/msgpack` headers

### New Exports

| Export | Type | Description |
|--------|------|-------------|
| `createGraphQLClient` | function | Create a GraphQL client wrapping an existing Solvix client |
| `createHTTPTransport` | function | HTTP/SSE transport adapter for GraphQL subscriptions |
| `createWSTransport` | function | WebSocket transport adapter for GraphQL subscriptions |
| `createLoadBalancer` | function | Create a load-balancing transport |
| `createProtobufCodec` | function | Helper to create a protobuf serialization codec |
| `createMsgpackCodec` | function | Helper to create a MessagePack serialization codec |
| `GraphQLOptions` | interface | Options for `createGraphQLClient()` |
| `GraphQLOperationOptions` | interface | Per-operation options for queries/mutations |
| `GraphQLResponse` | interface | Standard GraphQL response envelope |
| `GraphQLError` | interface | A single GraphQL error |
| `GraphQLClient` | interface | The GraphQL client interface |
| `GraphQLSubscriptionTransport` | interface | Transport adapter interface for subscriptions |
| `GraphQLClientError` | class | Error thrown when `throwOnError` is enabled |
| `LoadBalancerOptions` | interface | Options for `createLoadBalancer()` |
| `BackendConfig` | interface | Configuration for a single backend server |
| `BackendState` | interface | Runtime state of a backend (latency, health, etc.) |
| `LoadBalanceStrategy` | type | Built-in strategy name or custom function |
| `SerializationOptions` | interface | Custom codec for binary serialization |

### New Types in `SolvixOptions`

```typescript
serialization?: {
  protobuf?: SerializationOptions;
  msgpack?: SerializationOptions;
};
```

### Tests

- 37 new tests across 3 files (`graphql.spec.ts`, `loadBalancer.spec.ts`, `serialization.spec.ts`)
- Total: **208 tests passing** across 32 test files
- Zero breaking changes — all features are opt-in

### Bundle

| Output | Size |
|--------|------|
| ESM (`dist/index.js`) | 33.05 KB |
| CJS (`dist/index.cjs`) | 33.96 KB |
| DTS (`dist/index.d.ts`) | 34.28 KB |

---

## v1.0.0 (2026-06-23) — Stable Release

### What's New Since Beta

Solvix 1.0.0 is the first stable release. It adds **16 new features** and **6 performance optimizations** on top of the beta foundation, bringing the total to **~50 built-in features** — more than any other JS HTTP client.

#### Security (3 new)
- **CSRF Protection** — reads `XSRF-TOKEN` cookie, injects `X-XSRF-TOKEN` header on state-changing methods (POST/PUT/PATCH/DELETE). Customizable cookie name, header name, and cookie reader.
- **TLS/SSL Configuration** — `rejectUnauthorized`, custom CA, client cert/key for mTLS. Uses `undici` Agent under the hood (Node.js, optional dependency).
- **HTTP/HTTPS Proxy** — `proxy: { host, port, auth }` for corporate networks. Uses `undici ProxyAgent`.

#### Resilience (3 new)
- **Health Checks** — `client.healthCheck` with interval-based endpoint pinging, `onStatusChange` callback, `health:change` events.
- **Cookie Management** — in-memory `CookieJar` for Node.js/edge. Parses `Set-Cookie`, attaches `Cookie` on subsequent requests.
- **User-Extensible Middleware** — `client.use(middleware)` for injecting custom Koa-style middleware into the request pipeline.

#### Observability (4 new)
- **Correlation IDs** — auto `X-Request-ID` header on every request, stored in `ctx.meta`, included in all log metadata.
- **Aggregated Metrics** — `client.metrics()` returns total/active/success/failure/retry counters + duration histogram (configurable buckets).
- **Distributed Tracing** — W3C `traceparent` header injection (format `00-{traceId}-{spanId}-01`), same traceId across retries, new spanId per attempt.
- **Public Event Bus** — `SolvixBus` exported for external subscriptions to `request:start`, `:complete`, `:error`, `:retry`, `health:change`, shadow events.

#### Data Handling (2 new)
- **Progress Events** — `onUploadProgress` and `onDownloadProgress` hooks via ReadableStream counting. Works with Blob, string, ArrayBuffer bodies.
- **Response Schema Validation** — `validateResponse` callback (compatible with Zod, Valibot, or custom functions). Zero external dependencies.

#### Caching & Routing (2 new)
- **Graceful Fallback URLs** — `fallbackURLs[]` tried automatically when primary URL fails with retryable errors.
- **Custom paramsSerializer** — full control over query parameter serialization format (bracket notation, indexed, etc.).

#### Backward Compatibility
This release adds a `paramsSerializer` option to `SolvixOptions` but otherwise contains **zero breaking changes**. All 46 existing option fields remain unchanged. All existing code continues to work without modification.

---

### Performance Optimizations (6)

| Optimization | Files Changed | Impact |
|---|---|---|
| SHA-256 skipped unless dedupe/cache enabled | `fingerprint.ts`, `client.ts` | Eliminates Web Crypto hash for ~90% of requests |
| Binary heap priority queue | `priorityQueue.ts` | O(log n) insert/pop instead of O(n) splice. Handles 10k+ queue depth |
| Consolidated Headers (3 calls → 1) | `tracer.ts`, `csrfProtector.ts`, `client.ts` | Single Headers object shared across tracing, CSRF, and cookie jar |
| In-place header mutation | `client.ts` | Avoids object spread on every header change |
| FIFO eviction at 10k entries | `inflight.ts`, `dependencyRegistry.ts` | No memory leaks at scale |
| Dependency registry fix: entries now cleaned up on resolve/reject | `dependencyRegistry.ts` | Fixed memory leak (was leaking permanently) |

---

### Benchmark Suite Overhaul

All 7 benchmark files rewritten with clean `console.table` output. New npm scripts:

| Script | What it runs |
|--------|-------------|
| `npm run bench` | Basic throughput comparison (native fetch vs axios vs solvix) |
| `npm run bench:all` | All 7 benchmarks sequentially |
| `npm run bench:network` | Real network test against jsonplaceholder |

---

### Documentation

- Full JSDoc added to every public function, type, and option
- DTS output: 23.42 KB (was 14 KB) — rich IntelliSense descriptions
- 171 tests across 29 test files

---

### Bundle

| Output | Size |
|--------|------|
| ESM (`dist/index.js`) | 33.03 KB |
| CJS (`dist/index.cjs`) | 33.94 KB |
| DTS (`dist/index.d.ts`) | 23.42 KB |

---

## v1.0.0-beta.1

### Core Features

- Advanced retry engine with backoff
- Circuit breaker implementation
- Rate limiter support
- Request deduplication
- Token refresh orchestrator (stampede-safe)
- Request dependency chains
- Snapshot debugging mode
- Profiling support
- ETag conditional requests
- Offline queue support
- Shadow mode execution
- Transport-agnostic architecture

### Performance

- Competitive with native fetch and Axios
- ~7.8KB gzip bundle size
- Memory stable under 10k requests
- Stampede protection verified (1000 concurrent)

### Security

- Header sanitization & CRLF injection protection
- Body size guard
- Response size guard
- HTTPS enforcement
- Domain whitelisting
- Method allowlisting

### Stability Tests

- Retry storm validated
- Token refresh stampede protection validated
- Dedupe under concurrency validated
- Memory stability verified

### Bundle (beta.1)

- index.js: 23KB
- gzip: 7.8KB
