import { createClient } from "../src";

let refreshCallCount = 0;
let token = "expired";

async function mockTransport() {
    if (token === "expired") {
        return new Response(null, { status: 401 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

const solvix = createClient({
    auth: {
        shouldRefresh: (error: any) => error.status === 401,
        refreshToken: async () => {
            refreshCallCount++;
            await new Promise(res => setTimeout(res, 50));
            token = "valid";
            return "valid-token";
        },
        attachToken: (newToken: string, ctx: any) => {
            const headers = new Headers(ctx.options.fetch?.headers);
            headers.set("Authorization", `Bearer ${newToken}`);
            ctx.options.fetch = { ...ctx.options.fetch, headers };
        }
    }
});

async function runStampedeTest() {
    refreshCallCount = 0;
    token = "expired";

    const start = Date.now();
    await Promise.all(
        Array.from({ length: 100 }, () =>
            solvix.get("https://fake.test", { transport: mockTransport })
        )
    );
    const elapsed = Date.now() - start;

    const passed = refreshCallCount === 1;
    console.log(`\n=== Token Refresh Stampede Test ===`);
    console.log(`Refresh executed: ${refreshCallCount} (expected: 1 for 100 concurrent requests)`);
    console.log(`Total time: ${elapsed}ms (expected ~50ms with coalescing, ~5000ms without)`);
    console.log(`Status: ${passed ? "✅ PASS" : "❌ FAIL"}`);
}

runStampedeTest();
