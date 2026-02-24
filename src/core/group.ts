import type {
    RequestGroupStats
} from "../types";

export class RequestGroup {

    private stats: RequestGroupStats;
    private controllers = new Set<AbortController>();

    constructor(public readonly id: string) {
        this.stats = {
            totalRequests: 0,
            completed: 0,
            failed: 0,
            startTime: Date.now()
        };
    }

    registerRequest(
        controller?: AbortController
    ) {
        this.stats.totalRequests++;
        if (controller) {
            this.controllers.add(controller);
        }
    }

    markComplete() {
        this.stats.completed++;
        this.tryFinish();
    }

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

    getStats(): RequestGroupStats {
        return { ...this.stats };
    }

    abort() {
        for (const controller of this.controllers) {
            controller.abort();
        }
    }

    static create(id: string) {
        return new RequestGroup(id);
    }
}