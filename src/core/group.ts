import type {
    RequestGroupStats
} from "../types";

/**
 * A group of requests that can be aborted together.
 *
 * Use `RequestGroup.create("my-group")` to create one, then pass the
 * same group instance to multiple requests. Calling `group.abort()`
 * cancels all in-flight requests in the group.
 *
 * @example
 * ```ts
 * import { RequestGroup, createClient } from "@adityadev13/solvix";
 *
 * const group = RequestGroup.create("search");
 * const client = createClient({ baseURL: "https://api.example.com" });
 *
 * client.get("/search?q=foo", { group });
 * client.get("/search?q=bar", { group });
 *
 * // Cancel both requests
 * group.abort();
 * ```
 */
export class RequestGroup {

    private stats: RequestGroupStats;
    private controllers = new Set<AbortController>();

    /**
     * @param id - Unique identifier for this group (used in stats and debugging).
     */
    constructor(public readonly id: string) {
        this.stats = {
            totalRequests: 0,
            completed: 0,
            failed: 0,
            startTime: Date.now()
        };
    }

    /** @internal Register a request with this group. */
    registerRequest(
        controller?: AbortController
    ) {
        this.stats.totalRequests++;
        if (controller) {
            this.controllers.add(controller);
        }
    }

    /** @internal Mark a request in this group as completed. */
    markComplete() {
        this.stats.completed++;
        this.tryFinish();
    }

    /** @internal Mark a request in this group as failed. */
    markFailed() {
        this.stats.failed++;
        this.tryFinish();
    }

    private tryFinish() {
        if (
            this.stats.completed + this.stats.failed ===
            this.stats.totalRequests
        ) {
            this.stats.endTime = Date.now();
            this.stats.duration =
                this.stats.endTime - this.stats.startTime;
        }
    }

    /** Get the current stats for this group (total, completed, failed, duration). */
    getStats(): RequestGroupStats {
        return { ...this.stats };
    }

    /** Abort all in-flight requests in this group immediately. */
    abort() {
        for (const controller of this.controllers) {
            controller.abort();
        }
    }

    /**
     * Create a new RequestGroup with the given ID.
     * Equivalent to `new RequestGroup(id)`.
     */
    static create(id: string) {
        return new RequestGroup(id);
    }
}