import OpenAI from "openai";
import type { ChromaClient, Collection } from "chromadb";
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
  chromaClient: ChromaClient;
  chromaCollection: string;
  chromaMaxResults?: number;
  chromaMaxCharacters?: number;
}

export interface OpenAIService {
  generateReply: (conversationId: string, message: string) => Promise<string>;
  resetConversation: (conversationId: string) => void;
}

export function createOpenAIService(
  options: OpenAIServiceOptions
): OpenAIService {
  const {
    client,
    model,
    tokenLimit,
    systemPrompt,
    chromaClient,
    chromaCollection,
  } = options;
  const tokenizer =
    options.tokenizer ?? encoding_for_model(model as TiktokenModel);
  const serviceLogger = logger.child({ module: "openai-service", model });
  const chromaMaxResults = options.chromaMaxResults ?? 5;
  const chromaMaxCharacters = options.chromaMaxCharacters ?? 1500;

  const conversations = new Map<string, ChatMessage[]>();
  let chromaCollectionPromise: Promise<Collection> | null = null;

  const logInfo = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.info(meta ?? {}, message);
  };

  const logWarn = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.warn(meta ?? {}, message);
  };

  const logError = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.error(meta ?? {}, message);
  };

  const resolveChromaCollection = async (): Promise<Collection | null> => {
    if (!chromaCollectionPromise) {
      chromaCollectionPromise = chromaClient
        .getOrCreateCollection({ name: chromaCollection })
        .catch((error) => {
          chromaCollectionPromise = null;
          logWarn("chroma.collection.resolve.failed", {
            collection: chromaCollection,
            error: error instanceof Error ? error.message : error,
          });
          return Promise.reject(error);
        });
    }

    try {
      return await chromaCollectionPromise;
    } catch {
      return null;
    }
  };

  void (async () => {
    try {
      await chromaClient.heartbeat();
      logInfo("chroma.heartbeat.success");
    } catch (error) {
      logWarn("chroma.heartbeat.failed", {
        error: error instanceof Error ? error.message : error,
      });
    }

    try {
      await resolveChromaCollection();
      logInfo("chroma.collection.ready", { collection: chromaCollection });
    } catch {
      /* noop */
    }
  })();

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

  const truncate = (value: string, limit: number): string => {
    if (value.length <= limit) {
      return value;
    }

    const sliceLimit = Math.max(0, limit - 3);
    return `${value.slice(0, sliceLimit)}...`;
  };

  const buildKnowledgeMessage = async (
    conversationId: string,
    userMessage: string
  ): Promise<ChatMessage | null> => {
    const collection = await resolveChromaCollection();

    if (!collection) {
      return null;
    }

    try {
      const queryResult = await collection.query({
        queryTexts: [userMessage],
        nResults: chromaMaxResults,
        include: ["documents", "metadatas", "distances"],
      });

      const documents = queryResult.documents?.[0] ?? [];
      const metadatas = queryResult.metadatas?.[0] ?? [];
      const distances = queryResult.distances?.[0] ?? [];

      const entries: string[] = [];
      const perDocumentLimit = Math.max(
        200,
        Math.floor(chromaMaxCharacters / Math.max(1, chromaMaxResults))
      );

      documents.forEach((doc, index) => {
        if (!doc) {
          return;
        }

        const metadata =
          (Array.isArray(metadatas) ? metadatas[index] : null) ?? {};
        const title =
          metadata && typeof metadata.title === "string"
            ? metadata.title
            : `snippet-${index + 1}`;
        const source =
          metadata && typeof metadata.source === "string"
            ? metadata.source
            : "unknown";
        const distance = Array.isArray(distances) ? distances[index] : null;

        const scoreFragment =
          typeof distance === "number"
            ? ` | score: ${distance.toFixed(4)}`
            : "";

        entries.push(
          `- (${title} | source: ${source}${scoreFragment}) ${truncate(
            doc,
            perDocumentLimit
          )}`
        );
      });

      if (entries.length === 0) {
        logInfo("chroma.query.empty", {
          conversationId,
          collection: chromaCollection,
        });
        return null;
      }

      const contextString = `Knowledge base context:\n${entries.join("\n")}`;

      logInfo("chroma.query.success", {
        conversationId,
        collection: chromaCollection,
        results: entries.length,
      });

      return {
        role: "system",
        content: contextString,
      } satisfies ChatMessage;
    } catch (error) {
      logWarn("chroma.query.failed", {
        conversationId,
        collection: chromaCollection,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  };

  const generateReply = async (
    conversationId: string,
    message: string
  ): Promise<string> => {
    const messages = ensureConversation(conversationId);
    messages.push({ role: "user", content: message });

    const trimmedBeforeCall = trimContext(messages);

    const requestMessages = [...messages];
    const knowledgeMessage = await buildKnowledgeMessage(
      conversationId,
      message
    );

    let knowledgeApplied = false;

    if (knowledgeMessage) {
      requestMessages.splice(requestMessages.length - 1, 0, knowledgeMessage);
      knowledgeApplied = true;

      if (countTokens(requestMessages) > tokenLimit) {
        const index = requestMessages.indexOf(knowledgeMessage);
        if (index >= 0) {
          requestMessages.splice(index, 1);
        }
        knowledgeApplied = false;
        logWarn("chroma.context.dropped", {
          conversationId,
          reason: "token_limit",
        });
      }
    }

    const trimmedRequest = trimContext(requestMessages);
    const startedAt = Date.now();

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model,
        messages: requestMessages,
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
    const requestTokens = countTokens(requestMessages);

    const payload: Record<string, unknown> = {
      conversationId,
      totalTokens,
      durationMs: Date.now() - startedAt,
      usageTokens: response.usage?.total_tokens ?? null,
      trimmed: trimmedBeforeCall || trimmedAfterCall || trimmedRequest,
      knowledgeApplied,
      requestTokens,
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
