export type SolvixRuntime =
    | "node"
    | "browser"
    | "deno"
    | "bun"
    | "edge"
    | "unknown";

export function detectRuntime(): SolvixRuntime {
    const g = globalThis as any;

    if (typeof g.Deno !== "undefined") return "deno";
    if (typeof g.Bun !== "undefined") return "bun";

    if (typeof window !== "undefined" && typeof document !== "undefined")
        return "browser";

    if (
        typeof process !== "undefined" &&
        typeof process.versions === "object" &&
        !!process.versions?.node
    ) {
        return "node";
    }

    // Edge runtimes often lack process but have fetch
    if (typeof fetch !== "undefined") return "edge";

    return "unknown";
}