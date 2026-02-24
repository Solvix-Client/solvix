type QueuedRequest = () => Promise<any>;

class OfflineQueue {

    private queue: QueuedRequest[] = [];
    private maxSize: number;

    constructor(maxSize = 100) {
        this.maxSize = maxSize;
    }

    enqueue(task: QueuedRequest) {
        if (this.queue.length >= this.maxSize) {
            this.queue.shift(); // Drop oldest
        }
        this.queue.push(task);
    }

    async flush() {
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                await task();
            }
        }
    }

    size() {
        return this.queue.length;
    }
}

export const offlineQueue = new OfflineQueue();