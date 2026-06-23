import { Bench } from "tinybench";
import { createClient } from "../src";

const solvix = createClient({
    retry: { retries: 2 }
});

let callCount = 0;

async function unstableEndpoint() {
    callCount++;
    if (callCount % 3 !== 0) throw new Error("Simulated failure");
    return { ok: true };
}

const bench = new Bench({ time: 2000 });

bench.add("solvix retry storm 50 concurrent", async () => {
    await Promise.all(
        Array.from({ length: 50 }, async () => {
            try {
                await solvix.request("https://fake.test", {
                    transport: async () => {
                        const result = await unstableEndpoint();
                        return new Response(JSON.stringify(result), {
                            status: 200,
                            headers: { "Content-Type": "application/json" }
                        });
                    }
                });
            } catch { /* expected failures */ }
        })
    );
});

await bench.run();

console.log("\n=== Retry Storm Benchmark ===");
console.log(`Total endpoint calls: ${callCount} (expected ~150 = 50 req × 3 attempts)`);
console.table(
    bench.tasks.map(task => {
        const r = task.result as any;
        if (!r || r.state !== "completed") {
            return { name: task.name, meanMs: "-", p99: "-", samples: "-" };
        }
        return {
            name: task.name,
            meanMs: r.latency?.mean !== undefined ? r.latency.mean.toFixed(4) : "-",
            opsPerSec: r.throughput?.mean !== undefined ? Math.round(r.throughput.mean).toLocaleString() : "-",
            samples: r.latency?.samples?.length ?? "-"
        };
    })
);
