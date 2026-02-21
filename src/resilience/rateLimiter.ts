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
}