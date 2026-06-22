import { Bench } from "tinybench";
import { createClient } from "../src";
import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";

globalThis.fetch = async () => {
    return {
        ok: true,
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => ({ ok: true }),
        text: async () => JSON.stringify({ ok: true }),
        clone() { return this; }
    } as any;
};

const minimalClient = createClient({
    security: { enforceHTTPS: false, allowedDomains: [], allowedMethods: [] }
});

const fullClient = createClient({
    retry: { retries: 2 },
    profiling: { enabled: true },
    snapshot: { enabled: true },
    etag: { enabled: true },
    security: { enforceHTTPS: false, allowedDomains: [], allowedMethods: [] }
});

axios.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => ({
    data: { ok: true },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
});

const bench = new Bench({ time: 2000 });

bench
    .add("native fetch", async () => { await fetch("https://test.com"); })
    .add("axios", async () => { await axios.get("https://test.com"); })
    .add("solvix minimal", async () => { await minimalClient.get("https://test.com"); })
    .add("solvix full enterprise", async () => { await fullClient.get("https://test.com"); });

await bench.run();

console.log("\n=== Basic Throughput Benchmark ===");
console.table(
    bench.tasks.map(task => {
        const r = task.result as any;
        if (!r || r.state !== "completed") {
            return { name: task.name, opsPerSec: "-", avgMs: "-", samples: "-" };
        }
        return {
            name: task.name,
            opsPerSec: r.throughput?.mean !== undefined ? Math.round(r.throughput.mean).toLocaleString() : "-",
            avgMs: r.latency?.mean !== undefined ? r.latency.mean.toFixed(4) : "-",
            samples: r.latency?.samples?.length ?? "-"
        };
    })
);
