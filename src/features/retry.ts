import type { SolvixMiddleware } from "../types";

export const retryMiddleware: SolvixMiddleware =
    async (ctx, next) => {
        const retry = ctx.options.retry ?? 0;

        let attempt = 0;

        while (attempt <= retry) {
            try {
                ctx.meta.attempt = attempt;

                await next();

                if (!ctx.response?.ok) {
                    throw new Error("HTTP error");
                }

                return;
            } catch (err) {
                attempt++;
                ctx.meta.retries = attempt;

                if (attempt > retry) {
                    ctx.error = err;
                    throw err;
                }
            }
        }
    };