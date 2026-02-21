import { detectRuntime } from "./runtime";
import type { SolvixOptions, SolvixContext, SolvixMeta } from "../types";

export function createContext<T>(
    url: string,
    options: SolvixOptions = {},
): SolvixContext<T> {

    const meta: SolvixMeta = {
        startTime: Date.now(),
        attempt: 0,
        retries: 0,
        runtime: detectRuntime(),
    };

    if (options.timeline?.enabled) {
        meta.timeline = [];
    }

    return {
        url,
        options,
        meta
    };
}