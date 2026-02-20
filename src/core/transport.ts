import type { SolvixMiddleware } from "../types";

export const transportMiddleware: SolvixMiddleware =
    async (ctx, next) => {
        const res = await fetch(ctx.url, ctx.options);

        ctx.response = res;

        await next();
    };