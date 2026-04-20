import type { SolvixMiddleware } from "../types";
import { normalizeRetry } from "../utils/retryHelpers";

export const retryMiddleware: SolvixMiddleware =
    async (ctx, next) => {
        const normalizedRetry = normalizeRetry(ctx.options.retry);
        const maxRetries = normalizedRetry.retries;

        let attempt = 0;

        while (attempt <= maxRetries) {
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

                if (attempt > maxRetries) {
                    ctx.error = err;
                    throw err;
                }
            }
        }
    };