import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";

describe("Security Enforcement", () => {

    it("should block HTTP when HTTPS enforced", async () => {

        const client = createClient({
            security: { enforceHTTPS: true }
        });

        await expect(
            client.get("http://example.com")
        ).rejects.toThrow();
    });

});