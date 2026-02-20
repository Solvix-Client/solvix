import type { SolvixMiddleware } from "../types";

export const transportMiddleware: SolvixMiddleware =
    async (ctx, next) => {
        const res = await fetch(ctx.url, ctx.options.fetch);

        ctx.response = res;

        await next();
    };