import { Bench } from "tinybench";
import { createClient } from "../src";
import axios from "axios";

const client = createClient();

const bench = new Bench({ time: 5000 });

bench
    .add("native fetch (real)", async () => {
        await fetch("https://jsonplaceholder.typicode.com/posts");
    })
    .add("axios (real)", async () => {
        await axios.get("https://jsonplaceholder.typicode.com/posts");
    })
    .add("solvix minimal (real)", async () => {
        await client.get("https://jsonplaceholder.typicode.com/posts");
    });

await bench.run();

console.log("\n=== Real Network Benchmark ===");
console.log("Target: https://jsonplaceholder.typicode.com/posts");
console.log("Duration: 5 seconds per client\n");
console.table(
    bench.tasks.map(task => {
        const r = task.result as any;
        if (!r || r.state !== "completed") {
            return { name: task.name, avgMs: "-", opsPerSec: "-", samples: "-" };
        }
        return {
            name: task.name,
            avgMs: r.latency?.mean !== undefined ? r.latency.mean.toFixed(2) : "-",
            opsPerSec: r.throughput?.mean !== undefined ? Math.round(r.throughput.mean).toLocaleString() : "-",
            samples: r.samples?.length ?? "-"
        };
    })
);
