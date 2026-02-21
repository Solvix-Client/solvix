type Deferred = {
    promise: Promise<any>;
    resolve: (value?: any) => void;
    reject: (reason?: any) => void;
};

class DependencyRegistry {

    private registry = new Map<string, Deferred>();

    create(id: string) {
        if (this.registry.has(id)) return;

        let resolve!: (value?: any) => void;
        let reject!: (reason?: any) => void;

        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });

        this.registry.set(id, { promise, resolve, reject });
    }

    resolve(id: string, value?: any) {
        const entry = this.registry.get(id);
        if (!entry) return;
        entry.resolve(value);
    }

    reject(id: string, error?: any) {
        const entry = this.registry.get(id);
        if (!entry) return;
        entry.reject(error);
    }

    async waitFor(id: string) {
        const entry = this.registry.get(id);
        if (!entry) return;
        return entry.promise;
    }

    has(id: string) {
        return this.registry.has(id);
    }
}

export const dependencyRegistry = new DependencyRegistry();