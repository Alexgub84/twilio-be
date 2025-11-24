import OpenAI from "openai";
import { type Tiktoken } from "tiktoken";
import { logger } from "../../logger.js";
import type { ChromaClient } from "chromadb";
import {
  createConversationHistoryService,
  type ConversationHistoryService,
} from "./conversationHistory.js";
import {
  createKnowledgeBaseService,
  type KnowledgeBaseService,
  type EmbeddingVector,
} from "./knowledgeBase.js";
import { normalizeAssistantReply } from "../../utils/contentNormalizer.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface OpenAIServiceOptions {
  client: OpenAI;
  model: string;
  tokenLimit: number;
  systemPrompt: string;
  embeddingModel: string;
  openAIApiKey: string;
  tokenizer?: Pick<Tiktoken, "encode">;
  chromaClient: ChromaClient;
  chromaCollection: string;
  chromaMaxResults?: number;
  chromaMaxCharacters?: number;
  embedTexts?: (texts: string[]) => Promise<EmbeddingVector[]>;
  // Dependency injection for services (optional, useful for testing)
  conversationHistoryService?: ConversationHistoryService;
  knowledgeBaseService?: KnowledgeBaseService;
}

export interface OpenAIService {
  generateReply: (conversationId: string, message: string) => Promise<string>;
  resetConversation: (conversationId: string) => void;
  getConversationHistory: (conversationId: string) => ChatMessage[];
}

export function createOpenAIService(
  options: OpenAIServiceOptions
): OpenAIService {
  const {
    client,
    model,
    tokenLimit,
    systemPrompt,
    openAIApiKey,
    chromaClient,
    chromaCollection,
    embeddingModel,
  } = options;

  const serviceLogger = logger.child({ module: "openai-service", model });

  const conversationHistory =
    options.conversationHistoryService ??
    createConversationHistoryService({
      model,
      tokenLimit,
      systemPrompt,
      ...(options.tokenizer && { tokenizer: options.tokenizer }),
    });

  const knowledgeBase =
    options.knowledgeBaseService ??
    createKnowledgeBaseService({
      chromaClient,
      chromaCollection,
      embeddingModel,
      openAIApiKey,
      openaiClient: client,
      ...(options.chromaMaxResults && {
        chromaMaxResults: options.chromaMaxResults,
      }),
      ...(options.chromaMaxCharacters && {
        chromaMaxCharacters: options.chromaMaxCharacters,
      }),
      ...(options.embedTexts && { embedTexts: options.embedTexts }),
    });

  const logInfo = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.info(meta ?? {}, message);
  };

  const logError = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.error(meta ?? {}, message);
  };

  const logWarn = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.warn(meta ?? {}, message);
  };

  const generateReply = async (
    conversationId: string,
    message: string
  ): Promise<string> => {
    // 1. Get conversation and add user message
    const messages = conversationHistory.getMessages(conversationId);
    const userMessage: ChatMessage = { role: "user", content: message };
    conversationHistory.addMessage(conversationId, userMessage);

    // 2. Initial Trim
    const trimmedBeforeCall = conversationHistory.trimContext(messages);

    // 3. Knowledge Retrieval
    const requestMessages = [...messages];
    const knowledgeContext = await knowledgeBase.buildKnowledgeContext(
      conversationId,
      message
    );
    const knowledgeEntries = knowledgeContext?.entries ?? [];

    let knowledgeApplied = false;

    if (knowledgeContext) {
      // Insert system message with knowledge before the last user message
      requestMessages.splice(
        requestMessages.length - 1,
        0,
        knowledgeContext.message
      );
      knowledgeApplied = true;

      // Check if knowledge pushes us over limit
      if (conversationHistory.countTokens(requestMessages) > tokenLimit) {
        const index = requestMessages.indexOf(knowledgeContext.message);
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

    // 4. Trim Request Context (if needed)
    const trimmedRequest = conversationHistory.trimContext(requestMessages);

    if (knowledgeApplied && knowledgeContext) {
      knowledgeApplied = requestMessages.includes(knowledgeContext.message);
    }

    // 5. Token Accounting
    const totalRequestTokens = conversationHistory.countTokens(requestMessages);
    const knowledgeTokens =
      knowledgeApplied && knowledgeContext
        ? conversationHistory.countTokens([knowledgeContext.message])
        : 0;
    const userTokens = conversationHistory.countTokens([
      requestMessages[requestMessages.length - 1] ?? {
        role: "user",
        content: "",
      },
    ]);
    const conversationTokens = Math.max(
      0,
      totalRequestTokens - knowledgeTokens - userTokens
    );

    logInfo("openai.tokens.breakdown", {
      conversationId,
      requestTokens: totalRequestTokens,
      conversationTokens,
      knowledgeTokens,
      userTokens,
      tokenLimit,
    });
    const startedAt = Date.now();

    // 6. OpenAI Call
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

    // 7. Normalize Response
    const normalizedContent = normalizeAssistantReply(
      responseMessage.content,
      knowledgeEntries
    );

    const enrichedResponseMessage: ChatMessage = {
      ...responseMessage,
      content: normalizedContent,
    };

    // 8. Update History
    conversationHistory.addMessage(conversationId, enrichedResponseMessage);
    const trimmedAfterCall = conversationHistory.trimContext(messages);

    const payload: Record<string, unknown> = {
      conversationId,
      totalTokens: conversationHistory.countTokens(messages),
      durationMs: Date.now() - startedAt,
      usageTokens: response.usage?.total_tokens ?? null,
      trimmed: trimmedBeforeCall || trimmedAfterCall || trimmedRequest,
      knowledgeApplied,
      requestTokens: totalRequestTokens,
      conversationTokens,
      knowledgeTokens,
      userTokens,
    };

    logInfo("openai.tokens", payload);

    return normalizedContent;
  };

  const resetConversation = (conversationId: string) => {
    conversationHistory.resetConversation(conversationId);
  };

  const getConversationHistory = (conversationId: string): ChatMessage[] => {
    return conversationHistory.getMessages(conversationId);
  };

  return {
    generateReply,
    resetConversation,
    getConversationHistory,
  };
}
