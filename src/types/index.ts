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
    | "request:shadowError";

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
    context: SolvixContext<any>;
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

export interface SolvixHooks {
    onRequestStart?: (ctx: any) => void;
    onRequestEnd?: (ctx: any) => void;
    onRetry?: (ctx: any, attempt: number) => void;
    onError?: (error: unknown, ctx: any) => void;
    onCircuitOpen?: (host: string) => void;
}

export interface StreamOptions {
    stream?: boolean;
    sse?: boolean;
    parseJsonLines?: boolean;
}

export interface SolvixOptions {
    baseURL?: string;
    timeout?: number;
    retry?: number | RetryOptions;
    parseJson?: boolean;
    validateStatus?: (status: number) => boolean;
    cache?: boolean | CacheOptions;
    dedupe?: boolean;
    fetch?: RequestInit;
    circuitBreaker?: CircuitBreakerOptions;
    rateLimit?: RateLimitOptions;
    priority?: number;
    queue?: QueueOptions;
    maxConcurrency?: number;
    hooks?: SolvixHooks;
    stream?: boolean;
    sse?: boolean;
    parseJsonLines?: boolean;
    body?: unknown;
    bodyType?: BodyType;
    responseType?: ResponseType;
    transformRequest?: (body: unknown, headers: Headers) => Promise<any> | any;
    transformResponse?: (response: Response) => Promise<any>;
    method?: HttpMethod;
    allowedOrigins?: string[];
    avoidPreflight?: boolean;
    fingerprint?: FingerprintOptions;
    timeline?: TimelineOptions;
    profiling?: ProfilingOptions;
    devMode?: boolean;
    group?: RequestGroup;
    id?: string;
    dependsOn?: string[];
    snapshot?: SnapshotOptions;
    auth?: AuthOptions;
    etag?: ETagOptions;
    offline?: OfflineOptions;
    shadow?: ShadowOptions;
    transport?: SolvixTransport;
    params?: Record<string, any>;
    security?: SolvixSecurityOptions;
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
}

export interface SolvixContext<T = unknown> {
    url: string;
    options: SolvixOptions;
    response?: Response;
    error?: unknown;
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