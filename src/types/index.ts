import type { RequestGroup } from "../core/group";

export type BodyType =
    | "json"
    | "form"
    | "multipart"
    | "text"
    | "blob"
    | "arrayBuffer"
    | "raw";

export type ResponseType =
    | "json"
    | "text"
    | "blob"
    | "arrayBuffer"
    | "formData"
    | "stream"
    | "raw";

export type HttpMethod =
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "HEAD"
    | "OPTIONS";

export type TimelineStage =
    | "created"
    | "queued"
    | "dequeued"
    | "rateLimitWaitStart"
    | "rateLimitWaitEnd"
    | "breakerCheck"
    | "transportStart"
    | "firstByte"
    | "responseReceived"
    | "parseStart"
    | "parseEnd"
    | "completed"
    | "failed"
    | "etagHit"
    | "shadowStart"
    | "shadowComplete"
    | "shadowDifference"
    | "shadowError"

export type SolvixEventType =
    | "request:start"
    | "request:retry"
    | "request:error"
    | "request:complete"
    | "request:shadowStart"
    | "request:shadowComplete"
    | "request:shadowDifference"
    | "request:shadowError"
    | "health:change";


export interface SolvixSecurityOptions {
    enforceHTTPS?: boolean;
    allowedDomains?: string[];
    blockInsecureHeaders?: boolean;
    maskSensitiveHeaders?: boolean;
    redactSnapshot?: boolean;
    strictMode?: boolean;
    maxBodySize?: number;        // in bytes
    maxResponseSize?: number;    // in bytes
    allowedMethods?: HttpMethod[];
    preventShadowTokenLeak?: boolean;
}

export type SolvixTransport = (
    url: string,
    init: RequestInit
) => Promise<Response>;

export interface ShadowOptions {
    enabled?: boolean;
    secondaryBaseURL: string;
    compareResponse?: boolean;
    onDifference?: (
        primary: SolvixResponse<any>,
        secondary: SolvixResponse<any>
    ) => void;
}

export interface OfflineOptions {
    enabled?: boolean;
    maxQueueSize?: number;
    persist?: boolean;
}

export interface ETagOptions {
    enabled?: boolean;
}

export interface AuthOptions {
    refreshToken: () => Promise<string>;
    shouldRefresh?: (error: any) => boolean;
    attachToken?: (token: string, ctx: SolvixContext<any>) => void;
}

export interface SnapshotOptions {
    enabled?: boolean;
    includeHeaders?: boolean;
    includeBody?: boolean;
}

export interface DependencyOptions {
    id?: string;
    dependsOn?: string[];
}

export interface RequestGroupOptions {
    id: string;
}

export interface RequestGroupStats {
    totalRequests: number;
    completed: number;
    failed: number;
    startTime: number;
    endTime?: number;
    duration?: number;
}

export interface SolvixEvent {
    type: SolvixEventType;
    context?: SolvixContext<any>;
    timestamp: number;
}

export interface TimelineEntry {
    stage: TimelineStage;
    timestamp: number;
}

export interface TimelineOptions {
    enabled?: boolean;
}

export interface ProfileMetrics {
    queueWaitTime?: number;
    rateLimitWaitTime?: number;
    networkTime?: number;
    parseTime?: number;
    totalTime: number;
    retries: number;
}

export interface ProfilingOptions {
    enabled?: boolean;
}

export interface FingerprintOptions {
    includeHeaders?: boolean;
    includeBody?: boolean;
    headerKeys?: string[];
    customStrategy?: (
        input: CanonicalRequest
    ) => string;
}

export interface CanonicalRequest {
    method: string;
    url: string;
    headers?: Record<string, string>;
    bodyHash?: string;
}

export interface RetryOptions {
    retries?: number;
    factor?: number;
    minTimeout?: number;
    maxTimeout?: number;
    jitter?: boolean;
    adaptive?: boolean;
}

export interface CacheOptions {
    ttl: number;
}

export interface CircuitBreakerOptions {
    failureThreshold: number;
    failureRate: number;
    rollingWindow: number;
    minimumRequests: number;
    resetTimeout: number;
    halfOpenRequests?: number;
}

export interface RateLimitOptions {
    capacity: number;
    refillRate: number;
    interval: number;
}

export interface PriorityOptions {
    priority?: number;
}

export type QueueStrategy =
    | "fifo"
    | "drop-oldest"
    | "drop-lowest-priority"
    | "reject";

export interface QueueOptions {
    maxQueueSize?: number;
    strategy?: QueueStrategy;
}

export interface ProgressPayload {
    loaded: number;
    total?: number;
    /** Convenience: Math.round((loaded / total) * 100) when total is known */
    percent?: number;
}

/** Automatically assigns a unique X-Request-ID header to every outgoing request. */
export interface CorrelationOptions {
    /** Default: true (enabled by default) */
    enabled?: boolean;
    /** Default: "x-request-id" */
    headerName?: string;
    /** Custom ID generator. Default: crypto.randomUUID() */
    generator?: () => string;
}

/** Aggregated request metrics collected across the client's lifetime. */
export interface MetricsOptions {
    enabled?: boolean;
    /** Duration histogram bucket thresholds in ms. Default: [50, 100, 200, 500, 1000, 3000, 5000] */
    durationBuckets?: number[];
}

export interface MetricsSnapshot {
    totalRequests: number;
    activeRequests: number;
    successCount: number;
    failureCount: number;
    retryCount: number;
    durationHistogram: Record<string, number>;
    startTime: number;
}

/** W3C Trace Context propagation for distributed tracing. */
export interface TracingOptions {
    enabled?: boolean;
    /** Header name. Default: "traceparent" */
    traceHeader?: string;
}

/** Periodic endpoint health checking. */
export interface HealthCheckOptions {
    enabled?: boolean;
    /** Health endpoint URL (e.g. "/health") */
    endpoint: string;
    /** Check interval in ms. Default: 30000 */
    interval?: number;
    /** Request timeout in ms. Default: 5000 */
    timeout?: number;
    /** Expected HTTP status. Default: 200 */
    expectedStatus?: number;
    /** Called when health status changes */
    onStatusChange?: (healthy: boolean) => void;
}

/** CSRF protection — reads token from cookie, injects as header on state-changing methods. */
export interface CSRFOptions {
    enabled?: boolean;
    /** Cookie name to read the token from. Default: "XSRF-TOKEN" */
    cookieName?: string;
    /** Header name to inject the token into. Default: "X-XSRF-TOKEN" */
    headerName?: string;
    /** Methods that require CSRF protection. Default: ["POST", "PUT", "PATCH", "DELETE"] */
    methods?: HttpMethod[];
    /** Custom cookie reader. Default reads from document.cookie */
    getCookie?: () => string | null;
}

/** Simple in-memory cookie jar for environments without native cookie storage. */
export interface CookieJarOptions {
    enabled?: boolean;
    /** Optional domain filter — only store/send cookies matching this domain. */
    domain?: string;
}

/** TLS/SSL configuration for Node.js environments (requires undici). */
export interface TLSOptions {
    /** Skip certificate validation. Default: true. Set to false for self-signed certs. */
    rejectUnauthorized?: boolean;
    /** Custom CA certificate (PEM string) */
    ca?: string;
    /** Client certificate (PEM string) for mutual TLS */
    cert?: string;
    /** Client key (PEM string) for mutual TLS */
    key?: string;
    /** Passphrase for the client key */
    passphrase?: string;
}

/** HTTP proxy configuration for Node.js environments (requires undici). */
export interface ProxyOptions {
    host: string;
    port: number;
    /** Proxy protocol. Default: "http" */
    protocol?: "http" | "https";
    /** Proxy authentication */
    auth?: { username: string; password: string };
}

export interface SolvixLogger {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Lifecycle hooks. Fired at various stages of the request pipeline.
 * All hooks are optional.
 */
export interface SolvixHooks {
    /** Called when a request starts processing. */
    onRequestStart?: (ctx: any) => void;
    /** Called after a request completes successfully. */
    onRequestEnd?: (ctx: any) => void;
    /** Called before retrying a failed request. */
    onRetry?: (ctx: any, attempt: number) => void;
    /** Called when a request fails permanently. */
    onError?: (error: unknown, ctx: any) => void;
    /** Called when the circuit breaker opens for a host. */
    onCircuitOpen?: (host: string) => void;
    /**
     * Called periodically during upload with progress info.
     * @see {@link ProgressPayload}
     */
    onUploadProgress?: (progress: ProgressPayload) => void;
    /**
     * Called periodically during download with progress info.
     * @see {@link ProgressPayload}
     */
    onDownloadProgress?: (progress: ProgressPayload) => void;
}

export interface StreamOptions {
    stream?: boolean;
    sse?: boolean;
    parseJsonLines?: boolean;
}

/**
 * All options accepted by `createClient()` and per-request.
 *
 * Global options are set in `createClient({...})` and can be
 * overridden per-request by passing them to `client.get(...)` etc.
 *
 * Every field is optional. Features are opt-in — nothing is enabled
 * by default except basic HTTP functionality and security guards.
 */
export interface SolvixOptions {
    /** Base URL prepended to all relative request URLs. */
    baseURL?: string;
    /** Request timeout in milliseconds. Uses AbortController internally. */
    timeout?: number;
    /**
     * Retry configuration. Set to a number for max retries, or an object for full control.
     * @default { retries: 0 }
     */
    retry?: number | RetryOptions;
    /** @deprecated Use hooks or responseType instead. */
    parseJson?: boolean;
    /**
     * Custom status validation function.
     * Return `true` to accept the status, `false` or throw to reject.
     * @default (status) => status >= 200 && status < 300
     */
    validateStatus?: (status: number) => boolean;
    /** Enable in-memory response caching for GET requests. Pass `{ ttl }` for custom TTL. */
    cache?: boolean | CacheOptions;
    /** Deduplicate in-flight requests — only one network call for identical requests. */
    dedupe?: boolean;
    /**
     * Raw fetch options (`credentials`, `mode`, `redirect`, etc.).
     * These are merged with the internal fetch config.
     */
    fetch?: RequestInit;
    /** Circuit breaker configuration for per-host failure protection. */
    circuitBreaker?: CircuitBreakerOptions;
    /** Token bucket rate limiter for client-side throttling. */
    rateLimit?: RateLimitOptions;
    /** Queue priority (lower number = higher priority). Default: 5. */
    priority?: number;
    /** Queue behavior (max size, drop strategy). */
    queue?: QueueOptions;
    /** Maximum number of concurrent requests. Default: Infinity. */
    maxConcurrency?: number;
    /** Lifecycle hooks (onRequestStart, onRetry, onError, etc.). */
    hooks?: SolvixHooks;
    /**
     * Enable response streaming as an async iterable.
     * @see {@link StreamOptions}
     */
    stream?: boolean;
    /** Parse Server-Sent Events (SSE) from the response stream. */
    sse?: boolean;
    /** Parse newline-delimited JSON (NDJSON) from the response stream. */
    parseJsonLines?: boolean;
    /** Request body. Serialized according to `bodyType`. */
    body?: unknown;
    /**
     * How to serialize the request body.
     * @default "json"
     */
    bodyType?: BodyType;
    /**
     * How to deserialize the response body.
     * @default "json"
     */
    responseType?: ResponseType;
    /**
     * Transform the request body and headers before sending.
     * Receives `(body, headers)`, should return the transformed body.
     */
    transformRequest?: (body: unknown, headers: Headers) => Promise<any> | any;
    /**
     * Transform the raw Response object after receiving it.
     * Receives the `Response`, should return the parsed data.
     */
    transformResponse?: (response: Response) => Promise<any>;
    /** HTTP method override. Default is determined by the method helper. */
    method?: HttpMethod;
    /** Allowed cross-origin destinations for CORS requests. */
    allowedOrigins?: string[];
    /** Avoid triggering CORS preflight by keeping requests simple. */
    avoidPreflight?: boolean;
    /** Fine-tune cache/dedup key fingerprinting. */
    fingerprint?: FingerprintOptions;
    /** Enable request timeline tracking (stages with timestamps). */
    timeline?: TimelineOptions;
    /** Enable performance profiling (builds ProfileMetrics from timeline). */
    profiling?: ProfilingOptions;
    /** Enable development-mode warnings for common misconfigurations. */
    devMode?: boolean;
    /** Attach this request to a RequestGroup for batch abort. */
    group?: RequestGroup;
    /** Unique ID for this request (used in dependency chains). */
    id?: string;
    /** IDs of requests this request depends on (waits for them to complete). */
    dependsOn?: string[];
    /** Capture a detailed snapshot of the request (for debugging). */
    snapshot?: SnapshotOptions;
    /** Token refresh configuration for automatic 401 handling. */
    auth?: AuthOptions;
    /** Conditional GET support via ETag headers. */
    etag?: ETagOptions;
    /** Offline request queuing (browser only). */
    offline?: OfflineOptions;
    /** Fire-and-forget shadow requests to a secondary endpoint. */
    shadow?: ShadowOptions;
    /**
     * Custom transport function.
     * Overrides the default `fetch` for this request.
     * @see {@link SolvixTransport}
     */
    transport?: SolvixTransport;
    /** URL query parameters (merged into the request URL). */
    params?: Record<string, any>;
    /** Security policies (HTTPS enforcement, domain whitelisting, etc.). */
    security?: SolvixSecurityOptions;
    /** Response schema validation callback. Return the validated data or throw.
     *  Users can pass Zod's `.parse()`, Valibot's `safeParse`, or a custom fn. */
    validateResponse?: (data: unknown) => any;
    /** URLs to try in order when the primary URL fails with a retryable error. */
    fallbackURLs?: string[];
    /** Structured logger — plug in pino, winston, console, or a custom adapter. */
    logger?: SolvixLogger;
    /** Auto-assign unique X-Request-ID header to every request. */
    correlation?: CorrelationOptions;
    /** Aggregated request metrics (counters, histograms). */
    metrics?: MetricsOptions;
    /** W3C Trace Context propagation (traceparent header). */
    tracing?: TracingOptions;
    /** Periodic health check endpoint pinging. */
    healthCheck?: HealthCheckOptions;
    /** CSRF protection — injects token from cookie into header. */
    csrf?: CSRFOptions;
    /** In-memory cookie jar for environments without native cookie storage. */
    cookieJar?: CookieJarOptions;
    /** TLS/SSL configuration for Node.js (self-signed certs, mTLS). Requires undici. */
    tls?: TLSOptions;
    /** HTTP proxy for Node.js. Requires undici. */
    proxy?: ProxyOptions;
    /** Custom query parameter serializer. Overrides the default URLSearchParams-based serializer. */
    paramsSerializer?: (params: Record<string, any>) => string;
    /** @internal */
    __tokenRefreshAttempted?: boolean;
    /** @internal */
    __offlineReplay?: boolean;
}

export type SolvixRuntime =
    | "node"
    | "browser"
    | "deno"
    | "bun"
    | "edge"
    | "unknown";

export interface RequestSnapshot {
    url: string;
    method: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    retries: number;
    timeline?: any[];
    profile?: any;
    groupId?: string;
    dependencyId?: string;
    error?: {
        message: string;
        status?: number;
    };
}

export interface SolvixMeta {
    startTime: number;
    endTime?: number;
    duration?: number;
    attempt: number;
    retries: number;
    runtime: SolvixRuntime;
    timeline?: TimelineEntry[];
    profile?: ProfileMetrics;
    snapshot?: RequestSnapshot;
    /** Correlation ID (X-Request-ID) when correlation feature is enabled. */
    correlationId?: string;
    /** W3C trace ID when tracing feature is enabled. */
    traceId?: string;
    /** W3C span ID when tracing feature is enabled. */
    spanId?: string;
}

/**
 * The request context passed through the middleware pipeline.
 *
 * Middleware can read and modify `url`, `options`, and `response`.
 * All fields are mutable — changes propagate to subsequent middleware.
 *
 * @typeParam T - The expected response data type.
 */
export interface SolvixContext<T = unknown> {
    /** The resolved request URL. */
    url: string;
    /** Merged options (global + per-request). */
    options: SolvixOptions;
    /** The Response object, set by the transport middleware. */
    response?: Response;
    /** The error, if the request failed. */
    error?: unknown;
    /** Metadata: timestamps, attempt count, timeline, profiling, etc. */
    meta: SolvixMeta
}

export type SolvixMiddleware = <T>(
    ctx: SolvixContext<T>,
    next: () => Promise<void>
) => Promise<void>;

export interface SolvixResponse<T> {
    data: T;
    status: number;
    headers: Headers;
    meta: SolvixContext<T>["meta"];
}