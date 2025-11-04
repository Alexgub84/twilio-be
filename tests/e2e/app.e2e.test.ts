import { describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";

describe("server e2e", () => {
  it("handles health check and WhatsApp flow end-to-end", async () => {
    const chromaQueries: Array<{
      queryTexts?: string[];
      queryEmbeddings?: number[][];
    }> = [];

    vi.resetModules();
    vi.doMock("../../src/clients/chromadb.fake.js", () => ({
      createFakeChromaClient: () => ({
        heartbeat: async () => Date.now(),
        getOrCreateCollection: async () => ({
          query: async (args: {
            queryTexts?: string[];
            queryEmbeddings?: number[][];
          }) => {
            chromaQueries.push(args);
            return {
              documents: [["Hands and Fire workshop details"]],
              metadatas: [[{ title: "workshops", source: "knowledge-base" }]],
              distances: [[0.05]],
            };
          },
        }),
      }),
    }));

    const { startServer } = await import("../../src/server.js");

    const app = await startServer({
      useFakeClients: true,
      port: 0,
      host: "127.0.0.1",
    });

    try {
      const address = app.server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const health = await fetch(`${baseUrl}/`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true });

      const whatsappResponse = await fetch(`${baseUrl}/whatsapp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          From: "whatsapp:+15550001111",
          Body: "Hello e2e",
        }),
      });

      expect(whatsappResponse.status).toBe(200);
      const body = await whatsappResponse.json();
      expect(body).toEqual({
        success: true,
        messageSid: expect.stringMatching(/^SMFAKE-/),
      });

      expect(chromaQueries).toHaveLength(1);
      expect(chromaQueries[0]?.queryTexts).toBeUndefined();
      expect(chromaQueries[0]?.queryEmbeddings?.[0]?.length).toBeGreaterThan(0);
    } finally {
      await app.close();
      vi.unmock("../../src/clients/chromadb.fake.js");
      vi.resetModules();
    }
  });
});
