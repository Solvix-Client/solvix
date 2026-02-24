import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src";


describe("Stress test", () => {

  it("should handle 200 rapid requests", async () => {

    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      json: async () => ({ ok: true }),
      clone(){return this;}
    });

    const client = createClient({ baseURL: "https://api.example.com", maxConcurrency: 5 });

    await Promise.all(
      Array.from({ length: 200 }).map(() =>
        client.get("/stress")
      )
    );
  });

});