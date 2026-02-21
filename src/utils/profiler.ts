import type {
    TimelineEntry,
    ProfileMetrics
} from "../types";

function findStage(
    timeline: TimelineEntry[],
    stage: string
) {
    return timeline.find(t => t.stage === stage);
}

export function buildProfile(
    timeline: TimelineEntry[],
    retries: number,
    startTime: number,
    endTime: number
): ProfileMetrics {

    const profile: ProfileMetrics = {
        totalTime: endTime - startTime,
        retries
    };

    const queueStart = findStage(timeline, "queued");
    const queueEnd = findStage(timeline, "dequeued");

    if (queueStart && queueEnd) {
        profile.queueWaitTime =
            queueEnd.timestamp - queueStart.timestamp;
    }

    const rateStart = findStage(timeline, "rateLimitWaitStart");
    const rateEnd = findStage(timeline, "rateLimitWaitEnd");

    if (rateStart && rateEnd) {
        profile.rateLimitWaitTime =
            rateEnd.timestamp - rateStart.timestamp;
    }

    const transportStart = findStage(timeline, "transportStart");
    const responseReceived = findStage(timeline, "responseReceived");

    if (transportStart && responseReceived) {
        profile.networkTime =
            responseReceived.timestamp - transportStart.timestamp;
    }

    const parseStart = findStage(timeline, "parseStart");
    const parseEnd = findStage(timeline, "parseEnd");

    if (parseStart && parseEnd) {
        profile.parseTime =
            parseEnd.timestamp - parseStart.timestamp;
    }

    return profile;
}