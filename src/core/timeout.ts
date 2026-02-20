import type { SolvixMiddleware } from "../types";

export const timeoutMiddleware: SolvixMiddleware =
    async (ctx, next) => {
        const timeout = ctx.options.timeout;
        if (!timeout) return next();

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        ctx.options.signal = controller.signal;

        try {
            await next();
        } finally {
            clearTimeout(id);
        }
    };