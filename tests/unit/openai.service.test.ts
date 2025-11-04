import { describe, expect, it } from "vitest";

import { createOpenAIService } from "../../src/services/openai.js";
import { createFakeOpenAIClient } from "../../src/clients/openai.fake.js";
import { createFakeChromaClient } from "../../src/clients/chromadb.fake.js";

describe("createOpenAIService", () => {
  const tokenizer = {
    encode: (value: string) => Array.from(value).map((_, index) => index),
  };

  it("returns assistant reply from fake client", async () => {
    const service = createOpenAIService({
      client: createFakeOpenAIClient(),
      model: "gpt-4o-mini",
      tokenLimit: 500,
      systemPrompt: "You are helpful",
      tokenizer,
      chromaClient: createFakeChromaClient(),
      chromaCollection: "test-collection",
    });

    const response = await service.generateReply("conversation-1", "Hello");

    expect(response).toContain("[fake-openai]");
    expect(response).toContain("Hello");
  });

  it("resets conversation context", async () => {
    const service = createOpenAIService({
      client: createFakeOpenAIClient(),
      model: "gpt-4o-mini",
      tokenLimit: 100,
      systemPrompt: "You are helpful",
      tokenizer,
      chromaClient: createFakeChromaClient(),
      chromaCollection: "test-collection",
    });

    await service.generateReply("conversation-3", "Hi there");
    service.resetConversation("conversation-3");

    const response = await service.generateReply(
      "conversation-3",
      "How are you?"
    );

    expect(response).toContain("How are you?");
  });

  it("queries chroma for contextual knowledge", async () => {
    const queries: Array<{ queryTexts?: string[] }> = [];

    const service = createOpenAIService({
      client: createFakeOpenAIClient(),
      model: "gpt-4o-mini",
      tokenLimit: 200,
      systemPrompt: "You are helpful",
      tokenizer,
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
    expect(queries[0]?.queryTexts).toEqual(["Tell me about workshops"]);
  });
});
