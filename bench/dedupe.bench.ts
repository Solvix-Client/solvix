import { createClient } from "../dist/index.js"

async function runFunctionalDedupeTest() {
    let transportCallCount = 0

    const solvix = createClient()

    await Promise.all(
        Array.from({ length: 1000 }, () =>
            solvix.get("https://fake.test", {
                dedupe: true,
                transport: async () => {
                    transportCallCount++

                    // simulate small delay
                    await new Promise(res => setTimeout(res, 10))

                    return new Response(
                        JSON.stringify({ ok: true }),
                        { status: 200 }
                    )
                }
            })
        )
    )

    console.log("Transport executed:", transportCallCount)
}

runFunctionalDedupeTest()