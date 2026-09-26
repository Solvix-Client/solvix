/**
 * Compute a SHA-256 hash of the GraphQL query string for APQ.
 * Uses crypto.subtle (available in Node 16+, browsers, Deno, Bun).
 */
export async function createPersistedQueryHash(query: string): Promise<string> {
    const data = new TextEncoder().encode(query);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
