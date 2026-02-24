import type { SolvixTransport } from "../types";

export const defaultTransport: SolvixTransport = async (
    url,
    init
) => {
    return fetch(url, init);
};