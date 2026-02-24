type Deferred = {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    promise: Promise<any>;
    dependsOn: string[];
};

class DependencyRegistry {

    private registry = new Map<string, Deferred>();

    private detectCircular(start: string, current: string): boolean {
        if (start === current) return true;

        const entry = this.registry.get(current);
        if (!entry) return false;

        if (entry.dependsOn.includes(start)) {
            return true;
        }

        return entry.dependsOn.some(dep =>
            this.detectCircular(start, dep)
        );
    }

    create(id: string, dependsOn?: string[]) {
        if (!id) {
            throw new Error("Dependency id is required");
        }

        if (this.registry.has(id)) {
            throw new Error(`Duplicate dependency id: ${id}`);
        }

        // Proper circular detection BEFORE insertion
        if (dependsOn?.length) {
            for (const dep of dependsOn) {
                if (this.detectCircular(id, dep)) {
                    throw new Error(
                        `Circular dependency detected: ${id} ↔ ${dep}`
                    );
                }
            }
        }

        let resolve!: (value?: any) => void;
        let reject!: (reason?: any) => void;

        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });

        this.registry.set(id, {
            promise,
            resolve,
            reject,
            dependsOn: dependsOn ?? []
        });
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