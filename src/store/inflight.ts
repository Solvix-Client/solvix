import type { SolvixResponse } from "../types";

const inflightMap = new Map<
    string,
    Promise<SolvixResponse<any>>
>();

const MAX_INFLIGHT = 10000;
const evictionOrder: string[] = [];

function enforceMaxSize(): void {
    while (inflightMap.size >= MAX_INFLIGHT) {
        const oldest = evictionOrder.shift();
        if (oldest !== undefined) {
            inflightMap.delete(oldest);
        } else {
            break;
        }
    }
}

export function getInflight(key: string) {
    return inflightMap.get(key);
}

export function setInflight(
    key: string,
    promise: Promise<SolvixResponse<any>>
) {
    enforceMaxSize();
    inflightMap.set(key, promise);
    evictionOrder.push(key);
}

export function clearInflight(key: string) {
    inflightMap.delete(key);
    const idx = evictionOrder.indexOf(key);
    if (idx !== -1) {
        evictionOrder.splice(idx, 1);
    }
}