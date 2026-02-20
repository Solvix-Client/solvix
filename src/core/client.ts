import { compose } from "./compose";
import { createContext } from "./context";
import { transportMiddleware } from "./transport";
import { timeoutMiddleware } from "./timeout";
import type {
    SolvixOptions,
    SolvixMiddleware,
    SolvixResponse
} from "../types";

export function createClient(globalOptions: SolvixOptions = {}) {
    // Retry removed from middleware stack
    const middlewares: SolvixMiddleware[] = [
        timeoutMiddleware,
        transportMiddleware
    ];

    const run = compose(middlewares);

    async function request<T = unknown>(
        url: string,
        options: SolvixOptions = {}
    ): Promise<SolvixResponse<T>> {
        const ctx = createContext<T>(url, {
            ...globalOptions,
            ...options
        });

        const retryCount = ctx.options.retry ?? 0;
        let attempt = 0;

        while (attempt <= retryCount) {
            try {
                ctx.meta.attempt = attempt;

                await run(ctx);

                if (!ctx.response?.ok) {
                    throw new Error(`HTTP Error: ${ctx.response?.status}`);
                }

                break;
            } catch (err) {
                attempt++;
                ctx.meta.retries = attempt;

                if (attempt > retryCount) {
                    ctx.error = err;
                    throw err;
                }
            }
        }

        const data =
            ctx.options.parseJson !== false
                ? await ctx.response?.json()
                : await ctx.response?.text();

        ctx.meta.endTime = Date.now();
        ctx.meta.duration =
            ctx.meta.endTime - ctx.meta.startTime;

        return {
            data: data as T,
            status: ctx.response?.status ?? 0,
            headers: ctx.response?.headers ?? new Headers(),
            meta: ctx.meta
        };
    }

    return {
        request,

        get: <T = unknown>(url: string, opts?: SolvixOptions) =>
            request<T>(url, { ...opts, method: "GET" }),

        post: <T = unknown>(url: string, opts?: SolvixOptions) =>
            request<T>(url, { ...opts, method: "POST" })
    };
}