import { detectRuntime } from "./runtime";
import type { SolvixOptions, SolvixContext } from "../types";

export function createContext<T>(
    url: string,
    options: SolvixOptions = {}
): SolvixContext<T> {
    return {
        url,
        options,
        meta: {
            startTime: Date.now(),
            attempt: 0,
            retries: 0,
            runtime: detectRuntime()
        }
    };
}