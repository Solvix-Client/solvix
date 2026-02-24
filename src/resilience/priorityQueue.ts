type Task<T> = {
    priority: number;
    task: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
    createdAt: number;
};

export class PriorityQueue {

    private queue: Task<any>[] = [];
    private activeCount: number = 0;

    constructor(
        private readonly concurrency: number,
        private readonly maxQueueSize: number,
        private readonly strategy: "fifo" | "drop-oldest" | "drop-lowest-priority" | "reject"
    ) { }

    async add<T>(
        task: () => Promise<T>,
        priority: number
    ): Promise<T> {

        return new Promise((resolve, reject) => {

            const totalSize = this.queue.length + this.activeCount;

            if (totalSize >= this.maxQueueSize) {
                switch (this.strategy) {

                    case "drop-oldest":
                        this.queue.shift();
                        break;

                    case "drop-lowest-priority":
                        this.removeLowestPriority();
                        break;

                    case "reject":
                    default:
                        reject(new Error("Queue overflow"));
                        return;
                }
            }

            const item: Task<T> = {
                task,
                priority,
                resolve,
                reject,
                createdAt: Date.now()
            };

            this.insertByPriority(item);
            this.process();
        });
    }

    private insertByPriority(task: Task<any>): void {
        let i = this.queue.length - 1;

        while (i >= 0 && this.queue[i]!.priority > task.priority) {
            i--;
        }

        this.queue.splice(i + 1, 0, task);
    }

    private removeLowestPriority(): void {
        if (this.queue.length === 0) return;

        let lowestIndex = 0;

        for (let i = 1; i < this.queue.length; i++) {
            if (this.queue[i]!.priority > this.queue[lowestIndex]!.priority) {
                lowestIndex = i;
            }
        }

        this.queue.splice(lowestIndex, 1);
    }

    // Arrow function locks "this"
    private process = (): void => {
        while (
            this.activeCount < this.concurrency &&
            this.queue.length > 0
        ) {
            const item = this.queue.shift();
            if (!item) break;

            this.activeCount++;

            item.task()
                .then(item.resolve)
                .catch(item.reject)
                .finally(() => {
                    this.activeCount--;
                    this.process();
                });
        }
    };
}