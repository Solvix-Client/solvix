import type { SolvixMiddleware } from "../types";

export function compose(
    middlewares: SolvixMiddleware[]
) {
    return async function execute(ctx: any) {
        let index = -1;

        async function dispatch(i: number): Promise<void> {
            if (i <= index) {
                throw new Error("next() called multiple times");
            }

            index = i;

            const fn = middlewares[i];
            if (!fn) return;

            await fn(ctx, () => dispatch(i + 1));
        }

        await dispatch(0);
    };
}