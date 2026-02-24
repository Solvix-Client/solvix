import type { TimelineStage } from "../types";

export function markTimeline(
    ctx: any,
    stage: TimelineStage
) {
    if (!ctx.meta.timeline) return;

    ctx.meta.timeline.push({
        stage,
        timestamp: Date.now()
    });
}