import { Bench } from "tinybench"
import { createClient } from "../dist/index.js"

const solvix = createClient({
    retry: {
        retries: 2,
    }
})

let callCount = 0

async function unstableEndpoint() {
    callCount++

    if (callCount % 3 !== 0) {
        throw new Error("Simulated failure")
    }

    return {
        ok: true
    }
}

const bench = new Bench({ time: 2000 })

bench.add("solvix retry storm 50 concurrent", async () => {
    await Promise.all(
        Array.from({ length: 50 }, async () => {
            try {
                await solvix.request("https://fake.test", {
                    transport: async () => {
                        const result = await unstableEndpoint()

                        return new Response(
                            JSON.stringify(result),
                            {
                                status: 200,
                                headers: {
                                    "Content-Type": "application/json"
                                }
                            }
                        )
                    }
                })
            } catch { }
        })
    )
})

await bench.run()

console.log("Benchmark results:", bench.results)

// console.log(bench.tasks.map(t => ({
//     name: t.name,
//     meanMs: t.result?.mean
// })))