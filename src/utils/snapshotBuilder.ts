import type {
    SolvixContext,
    RequestSnapshot
} from "../types";

export function buildSnapshot(
    ctx: SolvixContext<any>
): RequestSnapshot {

    return {
        url: ctx.url,
        method: ctx.options.fetch?.method ?? "GET",
        startTime: ctx.meta.startTime,
        ...(ctx.meta.endTime !== undefined && {
            endTime: ctx.meta.endTime
        }),
        ...(ctx.meta.duration !== undefined && {
            duration: ctx.meta.duration
        }),
        retries: ctx.meta.retries,

        ...(ctx.meta.timeline !== undefined && {
            timeline: ctx.meta.timeline
        }),

        ...(ctx.meta.profile !== undefined && {
            profile: ctx.meta.profile
        }),

        ...(ctx.options.group && {
            groupId: ctx.options.group.id
        }),

        ...(ctx.options.id && {
            dependencyId: ctx.options.id
        })
    };
}