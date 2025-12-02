import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChromaClient } from "chromadb";
import type { Tiktoken } from "tiktoken";
import { createOpenAIService } from "../../src/services/ai/openai.js";
import { createFakeOpenAIClient } from "../../src/clients/openai.fake.js";
import { createFakeChromaClient } from "../../src/clients/chromadb.fake.js";
import { logger } from "../../src/logger.js";

describe("createOpenAIService", () => {
  const tokenizer: Pick<Tiktoken, "encode"> = {
    encode: (value: string) =>
      Uint32Array.from(Array.from(value).map((_, index) => index)),
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns assistant reply from fake client", async () => {
    const service = createOpenAIService({
      client: createFakeOpenAIClient(),
      model: "gpt-4o-mini",
      tokenLimit: 500,
      systemPrompt: "You are helpful",
      embeddingModel: "text-embedding-3-small",
      tokenizer,
      openAIApiKey: "test-key",
      chromaClient: createFakeChromaClient(),
      chromaCollection: "test-collection",
    });

    const result = await service.generateReply("conversation-1", "Hello");

    expect(result.response).toContain("[fake-openai]");
    expect(result.response).toContain("Hello");
    expect(result.tokens).toBeDefined();
    expect(typeof result.tokens.totalTokens).toBe("number");
  });

  it("resets conversation context", async () => {
    const service = createOpenAIService({
      client: createFakeOpenAIClient(),
      model: "gpt-4o-mini",
      tokenLimit: 100,
      systemPrompt: "You are helpful",
      embeddingModel: "text-embedding-3-small",
      tokenizer,
      openAIApiKey: "test-key",
      chromaClient: createFakeChromaClient(),
      chromaCollection: "test-collection",
    });

    await service.generateReply("conversation-3", "Hi there");
    service.resetConversation("conversation-3");

    const result = await service.generateReply(
      "conversation-3",
      "How are you?"
    );

    expect(result.response).toContain("How are you?");
  });

  it("queries chroma for contextual knowledge", async () => {
    const queries: Array<{
      queryTexts?: string[];
      queryEmbeddings?: number[][];
    }> = [];

    const service = createOpenAIService({
      client: createFakeOpenAIClient(),
      model: "gpt-4o-mini",
      tokenLimit: 200,
      systemPrompt: "You are helpful",
      embeddingModel: "text-embedding-3-small",
      tokenizer,
      openAIApiKey: "test-key",
      chromaClient: createFakeChromaClient({
        documents: ["Hands and Fire workshop details"],
        metadatas: [{ title: "workshops", source: "knowledge-base" }],
        distances: [0.12],
        onQuery: (args) => {
          queries.push(args);
        },
      }),
      chromaCollection: "test-collection",
    });

    await service.generateReply("conversation-ctx", "Tell me about workshops");

    expect(queries).toHaveLength(1);
    expect(queries[0]?.queryTexts).toBeUndefined();
    expect(queries[0]?.queryEmbeddings?.[0]?.length).toBeGreaterThan(0);
  });

  it("converts markdown links to plain URLs", async () => {
    const service = createOpenAIService({
      client: createFakeOpenAIClient(),
      model: "gpt-4o-mini",
      tokenLimit: 200,
      systemPrompt: "Respond clearly",
      embeddingModel: "text-embedding-3-small",
      tokenizer,
      openAIApiKey: "test-key",
      chromaClient: createFakeChromaClient(),
      chromaCollection: "test-collection",
    });

    const result = await service.generateReply(
      "conversation-links",
      "הנה הקישור שביקשת: [Hands and Fire](https://handsandfire.com/workshops)"
    );

    expect(result.response).toContain(
      "Hands and Fire\nhttps://handsandfire.com/workshops"
    );
    expect(result.response).not.toContain("](");
  });

  it("fills placeholder links using knowledge sources", async () => {
    const service = createOpenAIService({
      client: createFakeOpenAIClient(),
      model: "gpt-4o-mini",
      tokenLimit: 200,
      systemPrompt: "Respond clearly",
      embeddingModel: "text-embedding-3-small",
      tokenizer,
      openAIApiKey: "test-key",
      chromaClient: createFakeChromaClient({
        documents: ["Hands and Fire workshop details"],
        metadatas: [
          {
            title: "workshops",
            source: "https://handsandfire.com/workshops",
          },
        ],
        distances: [0.05],
      }),
      chromaCollection: "test-collection",
    });

    const result = await service.generateReply(
      "conversation-placeholder",
      "פרטי הסדנה כאן: [קישור לסדנאות](#)"
    );

    expect(result.response).toContain(
      "קישור לסדנאות\nhttps://handsandfire.com/workshops"
    );
    expect(result.response).not.toContain("](#");
  });

  it("logs chroma query failures as errors", async () => {
    const fakeLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    } as const;

    vi.spyOn(logger, "child").mockImplementation(
      () => fakeLogger as unknown as never
    );

    const chromaClient = {
      heartbeat: vi.fn().mockResolvedValue(Date.now()),
      getOrCreateCollection: vi.fn().mockResolvedValue({
        query: vi.fn().mockRejectedValue(new Error("missing collection")),
      }),
    } as unknown as ChromaClient;

    const service = createOpenAIService({
      client: createFakeOpenAIClient(),
      model: "gpt-4o-mini",
      tokenLimit: 200,
      systemPrompt: "You are helpful",
      embeddingModel: "text-embedding-3-small",
      tokenizer,
      openAIApiKey: "test-key",
      chromaClient,
      chromaCollection: "test-collection",
    });

    const result = await service.generateReply(
      "conversation-error",
      "Hello there"
    );

    expect(result.response).toContain("Hello there");
    expect(fakeLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-error",
        collection: "test-collection",
        error: "missing collection",
      }),
      "chroma.query.failed"
    );
  });
});
