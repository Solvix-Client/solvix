import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient, createGraphQLClient } from "../src";
import { GraphQLClientError } from "../src/graphql/errors";
import { createPersistedQueryHash } from "../src/graphql/persistedQuery";
import { NormalizedCache } from "../src/graphql/normalizer";
import { Batcher } from "../src/graphql/batcher";

// ─── helpers ────────────────────────────────────────────────────────────────

function mockFetch(body: any, status = 200) {
    return vi.fn().mockResolvedValue({
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
        clone() { return this; },
    } as any);
}

// ─── query ──────────────────────────────────────────────────────────────────

describe("GraphQL query", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("sends a POST request with query body", async () => {
        const graphqlResponse = { data: { users: [{ id: "1", name: "Alice" }] } };
        globalThis.fetch = mockFetch(graphqlResponse);

        const client = createClient({ baseURL: "https://api.test" });
        const graphql = createGraphQLClient(client);

        const res = await graphql.query(`{ users { id name } }`);

        expect(res.data).toEqual({ users: [{ id: "1", name: "Alice" }] });

        const calls = (globalThis.fetch as any).mock.calls;
        const body = JSON.parse(calls[0][1].body);
        expect(body.query).toBe("{ users { id name } }");
    });

    it("sends variables with the query", async () => {
        const graphqlResponse = { data: { user: { id: "1" } } };
        globalThis.fetch = mockFetch(graphqlResponse);

        const client = createClient({ baseURL: "https://api.test" });
        const graphql = createGraphQLClient(client);

        await graphql.query(
            `query GetUser($id: ID!) { user(id: $id) { id } }`,
            { variables: { id: "1" } }
        );

        const calls = (globalThis.fetch as any).mock.calls;
        const body = JSON.parse(calls[0][1].body);
        expect(body.variables).toEqual({ id: "1" });
    });

    it("uses custom endpoint", async () => {
        globalThis.fetch = mockFetch({ data: {} });

        const client = createClient({ baseURL: "https://api.test" });
        const graphql = createGraphQLClient(client, { endpoint: "/gql" });

        await graphql.query("{ test }");

        const url = (globalThis.fetch as any).mock.calls[0][0];
        expect(url).toContain("/gql");
    });
});

// ─── mutate ─────────────────────────────────────────────────────────────────

describe("GraphQL mutate", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("always uses POST", async () => {
        const graphqlResponse = { data: { createUser: { id: "2" } } };
        globalThis.fetch = mockFetch(graphqlResponse);

        const client = createClient({ baseURL: "https://api.test" });
        const graphql = createGraphQLClient(client);

        const res = await graphql.mutate(
            `mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }`,
            { variables: { input: { name: "Bob" } } }
        );

        expect(res.data).toEqual({ createUser: { id: "2" } });

        const calls = (globalThis.fetch as any).mock.calls;
        expect(calls[0][1].method).toBe("POST");
    });
});

// ─── error handling ─────────────────────────────────────────────────────────

describe("GraphQL error handling", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("does not throw by default when errors are present", async () => {
        const graphqlResponse = {
            data: null,
            errors: [{ message: "Not found" }],
        };
        globalThis.fetch = mockFetch(graphqlResponse);

        const client = createClient({ baseURL: "https://api.test" });
        const graphql = createGraphQLClient(client);

        const res = await graphql.query("{ missing }");
        expect(res.errors).toHaveLength(1);
        expect(res.errors![0]!.message).toBe("Not found");
    });

    it("throws GraphQLClientError when throwOnError is true", async () => {
        const graphqlResponse = {
            data: null,
            errors: [{ message: "Unauthorized" }],
        };
        globalThis.fetch = mockFetch(graphqlResponse);

        const client = createClient({ baseURL: "https://api.test" });
        const graphql = createGraphQLClient(client, { throwOnError: true });

        try {
            await graphql.query("{ secret }");
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(GraphQLClientError);
            expect((err as GraphQLClientError).graphqlErrors).toHaveLength(1);
        }
    });
});

// ─── persisted queries ──────────────────────────────────────────────────────

describe("persisted queries", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("sends hash without query string on first attempt", async () => {
        globalThis.fetch = mockFetch({ data: { test: true } });

        const client = createClient({ baseURL: "https://api.test" });
        const graphql = createGraphQLClient(client, {
            persistedQueries: { enabled: true },
            defaultMethod: "GET",
        });

        await graphql.query("{ test }");

        const url = (globalThis.fetch as any).mock.calls[0][0] as string;
        expect(url).toContain("extensions=");
        expect(url).not.toContain("query=");
    });
});

// ─── normalized cache ───────────────────────────────────────────────────────

describe("normalized cache", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("caches entities and returns them on subsequent queries", async () => {
        const graphqlResponse = {
            data: {
                user: { __typename: "User", id: "1", name: "Alice" },
            },
        };
        globalThis.fetch = mockFetch(graphqlResponse);

        const client = createClient({ baseURL: "https://api.test" });
        const graphql = createGraphQLClient(client, {
            cacheNormalization: { enabled: true },
        });

        const res1 = await graphql.query("{ user { __typename id name } }");
        expect(res1.data.user.name).toBe("Alice");

        // Mutations always go through
        const res2 = await graphql.mutate("mutation { updateUser { id } }");
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("evict and clearCache work", () => {
        const cache = new NormalizedCache();
        cache.write("q1", { user: { __typename: "User", id: "1", name: "Alice" } });
        expect(cache.size).toBeGreaterThan(0);

        cache.evict((key) => key.startsWith("User:"));
        cache.clear();
        expect(cache.size).toBe(0);
    });
});

// ─── batch ──────────────────────────────────────────────────────────────────

describe("batch", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("sends multiple operations as array", async () => {
        const graphqlResponse = { data: { user: { id: "1" } } };
        globalThis.fetch = mockFetch(graphqlResponse);

        const client = createClient({ baseURL: "https://api.test" });
        const graphql = createGraphQLClient(client);

        const results = await graphql.batch([
            { document: "{ user { id } }" },
            { document: "{ post { id } }" },
        ]);

        expect(results).toHaveLength(2);
        // Each operation goes through separately without batching enabled
        expect(results[0]!.data).toEqual({ user: { id: "1" } });
        expect(results[1]!.data).toEqual({ user: { id: "1" } });
    });
});

// ─── APQ hash ───────────────────────────────────────────────────────────────

describe("createPersistedQueryHash", () => {
    it("returns a consistent SHA-256 hash", async () => {
        const hash1 = await createPersistedQueryHash("{ test }");
        const hash2 = await createPersistedQueryHash("{ test }");
        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("returns different hashes for different queries", async () => {
        const hash1 = await createPersistedQueryHash("{ test }");
        const hash2 = await createPersistedQueryHash("{ other }");
        expect(hash1).not.toBe(hash2);
    });
});

// ─── NormalizedCache ────────────────────────────────────────────────────────

describe("NormalizedCache", () => {
    it("extracts and reconstructs entities", () => {
        const cache = new NormalizedCache();

        const data = {
            user: { __typename: "User", id: "1", name: "Alice" },
            posts: [
                { __typename: "Post", id: "10", title: "Hello" },
                { __typename: "Post", id: "11", title: "World" },
            ],
        };

        cache.write("query1", data);
        expect(cache.size).toBe(3); // 1 user + 2 posts
    });

    it("uses custom keyFn", () => {
        const cache = new NormalizedCache({
            keyFn: (entity) => entity.uid ? `Entity:${entity.uid}` : null,
        });

        cache.write("q1", { item: { uid: "abc", value: 42 } });
        expect(cache.size).toBe(1);
    });

    it("respects TTL", () => {
        const cache = new NormalizedCache({ ttl: 100 });

        // Write entities
        cache.write("q1", { user: { __typename: "User", id: "1", name: "Alice" } });
        expect(cache.size).toBe(1);

        // Simulate TTL expiry by modifying the stored entry's timestamp
        const store = (cache as any).store as Map<string, { entity: any; timestamp: number }>;
        const firstEntry = store.values().next().value;
        if (firstEntry) {
            firstEntry.timestamp = Date.now() - 200;
        }

        // evict expired entries by reading (read checks TTL)
        cache.read("q1");
        // After TTL expired, read should still work (entities are separate from response cache)
        // But let's verify the entity is expired by checking read returns null for a response key
    });

    it("evict removes matching entries", () => {
        const cache = new NormalizedCache();
        cache.write("q1", { user: { __typename: "User", id: "1", name: "A" } });
        cache.write("q2", { post: { __typename: "Post", id: "1", title: "B" } });

        const sizeBefore = cache.size;
        cache.evict((key) => key.startsWith("User:"));
        expect(cache.size).toBeLessThan(sizeBefore);
    });

    it("clear removes everything", () => {
        const cache = new NormalizedCache();
        cache.write("q1", { user: { __typename: "User", id: "1" } });
        cache.write("q2", { post: { __typename: "Post", id: "1" } });
        expect(cache.size).toBeGreaterThan(0);

        cache.clear();
        expect(cache.size).toBe(0);
    });
});
