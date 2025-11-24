import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createKnowledgeBaseService,
  type KnowledgeBaseService,
} from "../../src/services/ai/knowledgeBase";
import type { ChromaClient } from "chromadb";
import type OpenAI from "openai";

describe("KnowledgeBaseService", () => {
  let service: KnowledgeBaseService;
  let mockChromaClient: unknown;
  let mockCollection: unknown;
  let mockOpenAI: unknown;

  beforeEach(() => {
    mockCollection = {
      query: vi.fn().mockResolvedValue({
        documents: [["Doc 1", "Doc 2"]],
        metadatas: [
          [{ title: "Title 1", source: "Source 1" }, { title: "Title 2" }],
        ],
        distances: [[0.1, 0.2]],
      }),
    };

    mockChromaClient = {
      heartbeat: vi.fn().mockResolvedValue(Date.now()),
      getOrCreateCollection: vi.fn().mockResolvedValue(mockCollection),
    };

    mockOpenAI = {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      },
    };

    service = createKnowledgeBaseService({
      chromaClient: mockChromaClient as unknown as ChromaClient,
      chromaCollection: "test-collection",
      embeddingModel: "text-embedding-3-small",
      openAIApiKey: "test-key",
      openaiClient: mockOpenAI as unknown as OpenAI,
    });
  });

  it("should build knowledge context successfully", async () => {
    const context = await service.buildKnowledgeContext("test-id", "query");

    expect(context).not.toBeNull();
    expect(context?.entries).toHaveLength(2);
    expect(context?.entries[0].title).toBe("Title 1");
    expect(context?.message.role).toBe("system");
    expect(context?.message.content).toContain("Knowledge base context:");
    expect(context?.message.content).toContain("Doc 1");
  });

  it("should return null if collection resolution fails", async () => {
    // We create a new service instance where the client fails immediately
    // The key is that the failing mock must be used by the service
    const failedMockChromaClient = {
      heartbeat: vi.fn().mockResolvedValue(Date.now()),
      getOrCreateCollection: vi.fn().mockRejectedValue(new Error("Failed")),
    };

    const failedService = createKnowledgeBaseService({
      chromaClient: failedMockChromaClient as unknown as ChromaClient,
      chromaCollection: "test-collection",
      embeddingModel: "text-embedding-3-small",
      openAIApiKey: "test-key",
      openaiClient: mockOpenAI as OpenAI,
    });

    // Because the service caches the collection promise, we need to make sure we are using the failed service
    // and waiting for the rejection to be handled or caught inside buildKnowledgeContext

    const context = await failedService.buildKnowledgeContext(
      "test-id",
      "query"
    );
    expect(context).toBeNull();
  });

  it("should handle empty query results", async () => {
    (
      mockCollection as { query: ReturnType<typeof vi.fn> }
    ).query.mockResolvedValue({
      documents: [[]],
      metadatas: [[]],
      distances: [[]],
    });

    const context = await service.buildKnowledgeContext("test-id", "query");
    expect(context).toBeNull();
  });
});
