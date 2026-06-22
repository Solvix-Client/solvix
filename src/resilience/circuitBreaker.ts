type State = "CLOSED" | "OPEN" | "HALF_OPEN";

type HostMetrics = {
    state: State;
    failures: number[];
    successes: number[];
    nextAttempt: number;
    halfOpenInFlight: number;
};

export class CircuitBreaker {

    private hosts = new Map<string, HostMetrics>();
    private config: {
        failureThreshold: number;
        failureRate: number;
        rollingWindow: number;
        minimumRequests: number;
        resetTimeout: number;
        halfOpenRequests: number;
        onOpen?: (host: string) => void;
    };

    constructor(config: {
        failureThreshold: number;
        failureRate: number;
        rollingWindow: number;
        minimumRequests: number;
        resetTimeout: number;
        halfOpenRequests: number;
        onOpen?: (host: string) => void;
    }) {
        // Normalize failureRate: if > 1, treat as percentage (100 = 100%)
        // and convert to ratio (0-1). This supports both usage patterns:
        //   failureRate: 100  → percentage style
        //   failureRate: 1    → ratio style (backward compatible)
        if (config.failureRate > 1) {
            config.failureRate = config.failureRate / 100;
        }
        this.config = config;
    }

    private getHost(host: string): HostMetrics {
        if (!this.hosts.has(host)) {
            this.hosts.set(host, {
                state: "CLOSED",
                failures: [],
                successes: [],
                nextAttempt: 0,
                halfOpenInFlight: 0
            });
        }
        return this.hosts.get(host)!;
    }

    private cleanup(metrics: HostMetrics) {
        const now = Date.now();
        const windowStart = now - this.config.rollingWindow;

        metrics.failures =
            metrics.failures.filter(t => t >= windowStart);

        metrics.successes =
            metrics.successes.filter(t => t >= windowStart);
    }

    canRequest(host: string): boolean {
        const metrics = this.getHost(host);

        if (metrics.state === "OPEN") {
            if (Date.now() >= metrics.nextAttempt) {
                metrics.state = "HALF_OPEN";
                metrics.halfOpenInFlight = 0;
            } else {
                return false;
            }
        }

        if (metrics.state === "HALF_OPEN") {
            if (
                metrics.halfOpenInFlight <
                this.config.halfOpenRequests
            ) {
                metrics.halfOpenInFlight++;
                return true;
            }
            return false;
        }

        return true;
    }

    recordSuccess(host: string) {
        const metrics = this.getHost(host);
        this.cleanup(metrics);

        metrics.successes.push(Date.now());

        if (metrics.state === "HALF_OPEN") {
            metrics.state = "CLOSED";
            metrics.failures = [];
            metrics.successes = [];
        }
    }

    recordFailure(host: string) {
        const metrics = this.getHost(host);
        this.cleanup(metrics);

        metrics.failures.push(Date.now());

        const totalRequests =
            metrics.failures.length + metrics.successes.length;

        if (totalRequests < this.config.minimumRequests) {
            return;
        }

        const failureRate =
            metrics.failures.length / totalRequests;

        if (
            metrics.failures.length >= this.config.failureThreshold &&
            failureRate >= this.config.failureRate
        ) {
            metrics.state = "OPEN";
            metrics.nextAttempt = Date.now() + this.config.resetTimeout;

            this.config.onOpen?.(host);
        }
    }

    getMetrics(host: string) {
        return this.getHost(host);
    }
}
