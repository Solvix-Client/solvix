import { Bench } from "tinybench";
import { createClient } from "../src";

globalThis.fetch = async () => {
    return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ ok: true }),
        text: async () => "ok",
        clone() { return this; }
    } as any;
};

const client = createClient({
    maxConcurrency: 100,
    queue: { maxQueueSize: 1000, strategy: "fifo" }
});

const bench = new Bench({ time: 2000 });

bench
    .add("100 parallel requests", async () => {
        await Promise.all(Array.from({ length: 100 }, () => client.get("https://test.com")));
    })
    .add("500 parallel requests", async () => {
        await Promise.all(Array.from({ length: 500 }, () => client.get("https://test.com")));
    });

await bench.run();

console.log("\n=== Concurrency Benchmark ===");
console.table(
    bench.tasks.map(task => {
        const r = task.result as any;
        if (!r || r.state !== "completed") {
            return { name: task.name, opsPerSec: "-", avgMs: "-", samples: "-" };
        }
        return {
            name: task.name,
            opsPerSec: Math.round(r.throughput.mean).toLocaleString(),
            avgMs: r.latency?.mean !== undefined ? r.latency.mean.toFixed(4) : "-",
            samples: r.latency?.samples?.length ?? "-"
        };
    })
);
