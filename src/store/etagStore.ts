import type { SolvixResponse } from "../types";

const etagStore = new Map<string, string>();
const etagResponseStore = new Map<string, SolvixResponse<any>>();

export function getETag(key: string): string | undefined {
    return etagStore.get(key);
}

export function setETag(key: string, value: string) {
    etagStore.set(key, value);
}

export function clearETag(key: string) {
    etagStore.delete(key);
    etagResponseStore.delete(key);
}

export function getETagResponse(key: string) {
    return etagResponseStore.get(key);
}

export function setETagResponse(
    key: string,
    value: SolvixResponse<any>
) {
    etagResponseStore.set(key, value);
}
