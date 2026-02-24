import type { SolvixResponse } from "../types";

const inflightMap = new Map<
    string,
    Promise<SolvixResponse<any>>
>();

export function getInflight(key: string) {
    return inflightMap.get(key);
}

export function setInflight(
    key: string,
    promise: Promise<SolvixResponse<any>>
) {
    inflightMap.set(key, promise);
}

export function clearInflight(key: string) {
    inflightMap.delete(key);
}