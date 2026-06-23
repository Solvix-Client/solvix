export class RateLimiter {

    private tokens: number;
    private lastRefill: number;

    constructor(
        private capacity: number,
        private refillRate: number,
        private interval: number
    ) {
        this.tokens = capacity;
        this.lastRefill = Date.now();
    }

    private refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;

        const refillTokens =
            Math.floor(elapsed / this.interval) * this.refillRate;

        if (refillTokens > 0) {
            this.tokens = Math.min(
                this.capacity,
                this.tokens + refillTokens
            );
            this.lastRefill = now;
        }
    }

    async acquire(signal?: AbortSignal) {
        while (true) {

            if (signal?.aborted) {
                throw new Error("RateLimiter aborted");
            }

            this.refill();

            if (this.tokens > 0) {
                this.tokens--;
                return;
            }

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(resolve, this.interval);

                if (signal) {
                    signal.addEventListener("abort", () => {
                        clearTimeout(timeout);
                        reject(new Error("RateLimiter aborted"));
                    });
                }
            });
        }
    }

    /** Sync the token count from a server-provided `X-RateLimit-Remaining` value.
     *  This keeps the client-side bucket aligned with the server's actual state. */
    syncFromHeaders(remaining: number, resetAt?: number) {
        this.tokens = Math.min(this.capacity, remaining);

        if (resetAt !== undefined) {
            const serverResetMs = resetAt * 1000;
            const localTimeMs = Date.now();
            const waitMs = Math.max(0, serverResetMs - localTimeMs);

            // If the server says the bucket resets far in the future,
            // advance lastRefill so the next refill happens after reset.
            this.lastRefill = localTimeMs + waitMs;
        }
    }
}