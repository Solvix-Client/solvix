export interface RetryOptions {
    retries: number;
    factor?: number;      // exponential multiplier
    minTimeout?: number;  // base delay
    maxTimeout?: number;  // cap
}

export interface CacheOptions {
  ttl: number;
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