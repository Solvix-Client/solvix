type Task<T> = {
    priority: number;
    task: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
};

export class PriorityQueue {

    private queue: Task<any>[] = [];
    private activeCount = 0;

    constructor(
        private concurrency: number,
        private maxQueueSize: number,
        private strategy: "fifo" | "drop-oldest" | "drop-lowest-priority" | "reject"
    ) { }

    async add<T>(
        task: () => Promise<T>,
        priority: number
    ): Promise<T> {

        return new Promise((resolve, reject) => {

            if (this.queue.length >= this.maxQueueSize) {
                switch (this.strategy) {
                    case "drop-oldest":
                        this.queue.shift();
                        break;

                    case "drop-lowest-priority":
                        this.queue.sort((a, b) => b.priority - a.priority);
                        this.queue.shift();
                        break;

                    case "reject":
                        reject(new Error("Queue overflow"));
                        return;
                }
            }

            this.queue.push({ task, priority, resolve, reject });

            this.queue.sort((a, b) => a.priority - b.priority);

            this.process();
        });
    }

    private process() {
        if (this.activeCount >= this.concurrency) return;

        const item = this.queue.shift();
        if (!item) return;

        this.activeCount++;

        item.task()
            .then(item.resolve)
            .catch(item.reject)
            .finally(() => {
                this.activeCount--;
                this.process();
            });
    }
}