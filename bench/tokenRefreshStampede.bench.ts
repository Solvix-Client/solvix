import { createClient } from "../dist/index.js"

let refreshCallCount = 0
let token = "expired"

async function mockTransport() {
    if (token === "expired") {
        return new Response(null, { status: 401 })
    }

    return new Response(
        JSON.stringify({ ok: true }),
        { status: 200 }
    )
}

const solvix = createClient({
    auth: {
        shouldRefresh: (error) => error.status === 401,

        refreshToken: async () => {
            refreshCallCount++

            // simulate refresh delay
            await new Promise(res => setTimeout(res, 50))

            token = "valid"
            return "valid-token"
        },

        attachToken: (newToken, ctx) => {
            const headers = new Headers(ctx.options.fetch?.headers)
            headers.set("Authorization", `Bearer ${newToken}`)

            ctx.options.fetch = {
                ...ctx.options.fetch,
                headers
            }
        }
    }
})

async function runStampedeTest() {
    refreshCallCount = 0
    token = "expired"

    await Promise.all(
        Array.from({ length: 100 }, () =>
            solvix.get("https://fake.test", {
                transport: mockTransport
            })
        )
    )

    console.log("Refresh executed:", refreshCallCount)
}

runStampedeTest()