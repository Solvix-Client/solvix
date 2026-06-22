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
    profiling: { enabled: true },
    snapshot: { enabled: true },
    retry: { retries: 1 }
});

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

async function run() {
    console.log("\n=== Memory Stability Test ===");

    for (let round = 1; round <= 3; round++) {
        if (typeof globalThis.gc === "function") globalThis.gc();
        const startHeap = process.memoryUsage().heapUsed;
        console.log(`Round ${round} start: ${formatMB(startHeap)}`);

        for (let i = 0; i < 10000; i++) {
            await client.get("https://test.com");
        }

        if (typeof globalThis.gc === "function") globalThis.gc();
        const endHeap = process.memoryUsage().heapUsed;
        const growth = endHeap - startHeap;
        console.log(`Round ${round} end:   ${formatMB(endHeap)} (growth: ${formatMB(growth)})`);

        if (growth > 50 * 1024 * 1024) {
            console.log(`⚠️  Warning: Memory growth of ${formatMB(growth)} exceeds 50 MB threshold`);
        }
    }

    console.log(`Memory test complete.`);
}

run();
