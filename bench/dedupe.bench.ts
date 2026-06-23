import { createClient } from "../src";

async function runFunctionalDedupeTest() {
    let transportCallCount = 0;

    const solvix = createClient();

    await Promise.all(
        Array.from({ length: 1000 }, () =>
            solvix.get("https://fake.test", {
                dedupe: true,
                transport: async () => {
                    transportCallCount++;
                    await new Promise(res => setTimeout(res, 10));
                    return new Response(JSON.stringify({ ok: true }), { status: 200 });
                }
            })
        )
    );

    const passed = transportCallCount <= 10; // at most 1 unique request per host, but some may slip
    console.log(`\n=== Deduplication Test ===`);
    console.log(`Transport executed: ${transportCallCount} (expected ~1-10 for 1000 concurrent identical requests)`);
    console.log(`Status: ${passed ? "✅ PASS" : "❌ FAIL"}`);
}

runFunctionalDedupeTest();
