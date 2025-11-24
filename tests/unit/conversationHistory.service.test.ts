import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createConversationHistoryService,
  type ConversationHistoryService,
} from "../../src/services/ai/conversationHistory";
import type { Tiktoken } from "tiktoken";
import type OpenAI from "openai";

describe("ConversationHistoryService", () => {
  let service: ConversationHistoryService;
  let tokenizer: { encode: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    tokenizer = {
      encode: vi
        .fn()
        .mockImplementation((text) => new Uint32Array(text.length)),
    };

    service = createConversationHistoryService({
      model: "gpt-4",
      tokenLimit: 10,
      systemPrompt: "System prompt",
      tokenizer: tokenizer as unknown as Tiktoken,
    });
  });

  it("should initialize with system prompt", () => {
    const messages = service.getMessages("test-id");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe("System prompt");
  });

  it("should add messages correctly", () => {
    service.addMessage("test-id", { role: "user", content: "Hello" });
    const messages = service.getMessages("test-id");
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe("Hello");
  });

  it("should count tokens correctly", () => {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "World" },
    ];

    const count = service.countTokens(messages);
    expect(count).toBe(10); // 5 + 5 based on mock tokenizer
  });

  it("should trim context when exceeding limit", () => {
    service.addMessage("test-id", { role: "user", content: "123456" }); // 6 tokens
    service.addMessage("test-id", { role: "assistant", content: "123456" }); // 6 tokens
    // Total 12 + system prompt > 10

    const trimmed = service.trimContext(service.getMessages("test-id"));
    expect(trimmed).toBe(true);

    const messages = service.getMessages("test-id");
    // Should remove oldest non-system message
    expect(messages.length).toBeLessThan(3);
    expect(messages[0].role).toBe("system");
  });

  it("should reset conversation", () => {
    service.addMessage("test-id", { role: "user", content: "Hello" });
    service.resetConversation("test-id");
    const messages = service.getMessages("test-id");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("system");
  });
});
