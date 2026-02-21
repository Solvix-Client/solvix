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

export interface RetryOptions {
    retries: number;
    factor?: number;
    minTimeout?: number;
    maxTimeout?: number;
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
}

export type SolvixRuntime =
    | "node"
    | "browser"
    | "deno"
    | "bun"
    | "edge"
    | "unknown";

export interface SolvixContext<T = unknown> {
    url: string;
    options: SolvixOptions;
    response?: Response;
    error?: unknown;
    meta: {
        startTime: number;
        endTime?: number;
        duration?: number;
        attempt: number;
        retries: number;
        runtime: SolvixRuntime;
    };
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