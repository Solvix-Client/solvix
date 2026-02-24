import { createClient } from "../dist/index.js";

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
    // global.gc?.();

    // console.log("Initial Heap:", formatMB(process.memoryUsage().heapUsed));

    // for (let i = 0; i < 10000; i++) {
    //     await client.get("https://test.com");
    // }

    // global.gc?.();

    // console.log("After 10k requests:", formatMB(process.memoryUsage().heapUsed));

    
    for (let round = 1; round <= 3; round++) {
        global.gc?.();
        console.log(`Round ${round} start:`, formatMB(process.memoryUsage().heapUsed));

        for (let i = 0; i < 10000; i++) {
            await client.get("https://test.com");
        }

        global.gc?.();
        console.log(`Round ${round} end:`, formatMB(process.memoryUsage().heapUsed));
    }
}

run();