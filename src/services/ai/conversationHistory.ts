import OpenAI from "openai";
import {
  encoding_for_model,
  type Tiktoken,
  type TiktokenModel,
} from "tiktoken";
import { logger } from "../../logger.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface ConversationHistoryServiceOptions {
  model: string;
  tokenLimit: number;
  systemPrompt: string;
  tokenizer?: Pick<Tiktoken, "encode">;
}

export interface ConversationHistoryService {
  ensureConversation: (conversationId: string) => ChatMessage[];
  addMessage: (conversationId: string, message: ChatMessage) => void;
  resetConversation: (conversationId: string) => void;
  countTokens: (messages: ChatMessage[]) => number;
  trimContext: (messages: ChatMessage[]) => boolean;
  getMessages: (conversationId: string) => ChatMessage[];
}

export function createConversationHistoryService(
  options: ConversationHistoryServiceOptions
): ConversationHistoryService {
  const { model, tokenLimit, systemPrompt } = options;
  const tokenizer =
    options.tokenizer ?? encoding_for_model(model as TiktokenModel);
  const serviceLogger = logger.child({ module: "conversation-history", model });

  const conversations = new Map<string, ChatMessage[]>();

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

  const getMessages = (conversationId: string): ChatMessage[] => {
    return ensureConversation(conversationId);
  };

  const addMessage = (conversationId: string, message: ChatMessage) => {
    const messages = ensureConversation(conversationId);
    messages.push(message);
  };

  const resetConversation = (conversationId: string) => {
    conversations.set(conversationId, [
      {
        role: "system",
        content: systemPrompt,
      },
    ]);
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
      serviceLogger.warn(
        {
          tokenLimit,
          totalTokens,
          conversationLength: messages.length,
        },
        "conversation.context.trimmed"
      );
    }

    return trimmed;
  };

  return {
    ensureConversation,
    addMessage,
    resetConversation,
    countTokens,
    trimContext,
    getMessages,
  };
}
