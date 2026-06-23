type Task<T> = {
    priority: number;
    task: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
    createdAt: number;
};

export class PriorityQueue {

    private heap: Task<any>[] = [];
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

            const totalSize = this.heap.length + this.activeCount;

            if (totalSize >= this.maxQueueSize) {
                switch (this.strategy) {
                    case "drop-oldest":
                        this.removeOldest();
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

            this.heapPush(item);
            this.process();
        });
    }

    // ─── Binary min-heap (lower priority number = higher priority) ───

    private heapPush(task: Task<any>): void {
        this.heap.push(task);
        this.bubbleUp(this.heap.length - 1);
    }

    private heapPop(): Task<any> | undefined {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0];
        const last = this.heap.pop();
        if (this.heap.length > 0 && last) {
            this.heap[0] = last;
            this.sinkDown(0);
        }
        return top;
    }

    private bubbleUp(idx: number): void {
        while (idx > 0) {
            const parent = (idx - 1) >> 1;
            const a = this.heap[idx]!;
            const b = this.heap[parent]!;
            if (a.priority < b.priority || (a.priority === b.priority && a.createdAt < b.createdAt)) {
                this.heap[idx] = b;
                this.heap[parent] = a;
                idx = parent;
            } else {
                break;
            }
        }
    }

    private sinkDown(idx: number): void {
        const size = this.heap.length;
        while (true) {
            let smallest = idx;
            const left = (idx << 1) + 1;
            const right = left + 1;

            if (left < size) {
                const a = this.heap[left]!;
                const b = this.heap[smallest]!;
                if (a.priority < b.priority || (a.priority === b.priority && a.createdAt < b.createdAt)) {
                    smallest = left;
                }
            }
            if (right < size) {
                const a = this.heap[right]!;
                const b = this.heap[smallest]!;
                if (a.priority < b.priority || (a.priority === b.priority && a.createdAt < b.createdAt)) {
                    smallest = right;
                }
            }

            if (smallest !== idx) {
                const tmp = this.heap[idx]!;
                this.heap[idx] = this.heap[smallest]!;
                this.heap[smallest] = tmp;
                idx = smallest;
            } else {
                break;
            }
        }
    }

    // ─── Drop strategies ───

    private removeLowestPriority(): void {
        if (this.heap.length === 0) return;
        let worstIdx = 0;
        let worstPriority = this.heap[0]!.priority;
        for (let i = 1; i < this.heap.length; i++) {
            const p = this.heap[i]!.priority;
            if (p > worstPriority) {
                worstPriority = p;
                worstIdx = i;
            }
        }
        this.removeAtIndex(worstIdx);
    }

    private removeOldest(): void {
        // Oldest is at index 0 (highest createdAt wins FIFO)
        // The oldest item is the one that's been in the queue longest
        if (this.heap.length === 0) return;
        let oldestIdx = 0;
        let oldestTime = this.heap[0]!.createdAt;
        for (let i = 1; i < this.heap.length; i++) {
            const t = this.heap[i]!.createdAt;
            if (t < oldestTime) {
                oldestTime = t;
                oldestIdx = i;
            }
        }
        this.removeAtIndex(oldestIdx);
    }

    private removeAtIndex(idx: number): void {
        const last = this.heap.pop();
        if (idx < this.heap.length && last) {
            this.heap[idx] = last;
            this.bubbleUp(idx);
            this.sinkDown(idx);
        }
    }

    // Arrow function locks "this"
    private process = (): void => {
        while (
            this.activeCount < this.concurrency &&
            this.heap.length > 0
        ) {
            const item = this.heapPop();
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