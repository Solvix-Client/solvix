import type { SolvixMiddleware } from "../types";
import { defaultTransport } from "./defaultTransport";

export const transportMiddleware: SolvixMiddleware =
    async (ctx, next) => {

        const transport =
            ctx.options.transport ?? defaultTransport;

        const response = await transport(
            ctx.url,
            ctx.options.fetch ?? {}
        );

        ctx.response = response;

        await next();
    };