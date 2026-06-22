import type { HealthCheckOptions, SolvixEvent } from "../types";
import { SolvixBus } from "./bus";

function noopOnStatusChange(_healthy: boolean) {}

const DEFAULTS = {
    interval: 30000,
    timeout: 5000,
    expectedStatus: 200
};

export class HealthChecker {
    private timer: ReturnType<typeof setInterval> | null = null;
    private _healthy = true;

    private endpoint: string;
    private interval: number;
    private timeout: number;
    private expectedStatus: number;
    private onStatusChange: (healthy: boolean) => void;
    private request: (url: string, opts?: Record<string, any>) => Promise<any>;

    constructor(
        options: HealthCheckOptions,
        requestFn: (url: string, opts?: Record<string, any>) => Promise<any>
    ) {
        this.endpoint = options.endpoint;
        this.interval = options.interval ?? DEFAULTS.interval;
        this.timeout = options.timeout ?? DEFAULTS.timeout;
        this.expectedStatus = options.expectedStatus ?? DEFAULTS.expectedStatus;
        this.onStatusChange = options.onStatusChange ?? noopOnStatusChange;
        this.request = requestFn;
    }

    get healthy(): boolean {
        return this._healthy;
    }

    start(): void {
        if (this.timer) return;
        // Immediate first check
        this.check();
        this.timer = setInterval(() => this.check(), this.interval);

        // Allow the timer to not block process exit
        if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
            (this.timer as any).unref();
        }
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async check(): Promise<void> {
        try {
            const res = await this.request(this.endpoint, {
                timeout: this.timeout,
                retry: { retries: 0 },
                metrics: { enabled: false },
                tracing: { enabled: false },
                correlation: { enabled: false }
            });

            const newHealthy = res.status === this.expectedStatus;
            this.updateHealth(newHealthy);
        } catch {
            this.updateHealth(false);
        }
    }

    private updateHealth(newHealthy: boolean): void {
        if (newHealthy !== this._healthy) {
            this._healthy = newHealthy;
            this.onStatusChange(newHealthy);
            const event: SolvixEvent = {
                type: "health:change",
                timestamp: Date.now()
            };
            SolvixBus.emit(event);
        }
    }
}
