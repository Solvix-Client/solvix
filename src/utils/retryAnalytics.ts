import type { TimelineEntry } from "../types";

export function getNetworkDuration(
    timeline: TimelineEntry[]
): number | undefined {

    const start = timeline.find(
        t => t.stage === "transportStart"
    );

    const end = timeline.find(
        t => t.stage === "responseReceived"
    );

    if (!start || !end) return undefined;

    return end.timestamp - start.timestamp;
}