import OpenAI from "openai";
import {
  encoding_for_model,
  type Tiktoken,
  type TiktokenModel,
} from "tiktoken";
import { logger } from "../logger.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface OpenAIServiceOptions {
  client: OpenAI;
  model: string;
  tokenLimit: number;
  systemPrompt: string;
  tokenizer?: Pick<Tiktoken, "encode">;
}

export interface OpenAIService {
  generateReply: (conversationId: string, message: string) => Promise<string>;
  resetConversation: (conversationId: string) => void;
}

export function createOpenAIService(
  options: OpenAIServiceOptions
): OpenAIService {
  const { client, model, tokenLimit, systemPrompt } = options;
  const tokenizer =
    options.tokenizer ?? encoding_for_model(model as TiktokenModel);
  const serviceLogger = logger.child({ module: "openai-service", model });

  const conversations = new Map<string, ChatMessage[]>();

  const logInfo = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.info(meta ?? {}, message);
  };

  const logWarn = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.warn(meta ?? {}, message);
  };

  const logError = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.error(meta ?? {}, message);
  };

  const ensureConversation = (conversationId: string): ChatMessage[] => {
    const existing = conversations.get(conversationId);
    if (existing) {
      return existing;
    }

    const context: ChatMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];
    conversations.set(conversationId, context);
    return context;
  };

  const countTokens = (messages: ChatMessage[]): number =>
    messages.reduce((total, message) => {
      if (typeof message.content === "string") {
        return total + tokenizer.encode(message.content).length;
      }

      if (Array.isArray(message.content)) {
        return (
          total +
          message.content.reduce((innerTotal, part) => {
            if (part.type === "text") {
              return innerTotal + tokenizer.encode(part.text).length;
            }
            return innerTotal;
          }, 0)
        );
      }

      return total;
    }, 0);

  const trimContext = (messages: ChatMessage[]): boolean => {
    let trimmed = false;
    let totalTokens = countTokens(messages);

    while (totalTokens > tokenLimit && messages.length > 1) {
      trimmed = true;
      messages.splice(1, 1);
      totalTokens = countTokens(messages);
    }

    if (trimmed) {
      logWarn("openai.context.trimmed", {
        tokenLimit,
        totalTokens,
        conversationLength: messages.length,
      });
    }

    return trimmed;
  };

  const generateReply = async (
    conversationId: string,
    message: string
  ): Promise<string> => {
    const messages = ensureConversation(conversationId);
    messages.push({ role: "user", content: message });

    const trimmedBeforeCall = trimContext(messages);
    const startedAt = Date.now();

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model,
        messages,
      });
    } catch (error) {
      logError("openai.request.failed", {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }

    const responseMessage = response.choices?.[0]?.message;
    if (!responseMessage?.content) {
      logError("openai.response.empty", {
        conversationId,
        usage: response.usage,
      });
      throw new Error("No content returned from OpenAI response");
    }

    messages.push(responseMessage);
    const trimmedAfterCall = trimContext(messages);
    const totalTokens = countTokens(messages);

    const payload: Record<string, unknown> = {
      conversationId,
      totalTokens,
      durationMs: Date.now() - startedAt,
      usageTokens: response.usage?.total_tokens ?? null,
      trimmed: trimmedBeforeCall || trimmedAfterCall,
    };

    logInfo("openai.tokens", payload);

    return responseMessage.content;
  };

  const resetConversation = (conversationId: string) => {
    conversations.set(conversationId, [
      {
        role: "system",
        content: systemPrompt,
      },
    ]);
  };

  return {
    generateReply,
    resetConversation,
  };
}
