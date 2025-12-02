import type { FastifyRequest, FastifyReply } from "fastify";
import { whatsappMessageSchema } from "../types/index.js";
import type { SendMessageResult } from "../types/index.js";
import type { ConversationCsvMessage } from "../services/export/conversationCsv.js";
import type OpenAI from "openai";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

import type { GenerateReplyResult } from "../services/ai/openai.js";

export interface MessagesHandlerDependencies {
  generateSimpleResponse: (
    conversationId: string,
    message: string
  ) => Promise<GenerateReplyResult>;
  sendWhatsAppMessage: (to: string, body: string) => Promise<SendMessageResult>;
  saveConversationCsv?: (
    conversationId: string,
    messages: ConversationCsvMessage[]
  ) => Promise<unknown>;
  getConversationHistory?: (
    conversationId: string
  ) => ChatMessage[] | Promise<ChatMessage[]>;
}

async function handleExportRequest(
  conversationId: string,
  getConversationHistory: MessagesHandlerDependencies["getConversationHistory"],
  saveConversationCsv: NonNullable<
    MessagesHandlerDependencies["saveConversationCsv"]
  >,
  sendWhatsAppMessage: MessagesHandlerDependencies["sendWhatsAppMessage"],
  requestLog: FastifyRequest["log"]
): Promise<void> {
  if (!getConversationHistory) {
    await sendWhatsAppMessage(
      conversationId,
      "Export service unavailable: Conversation history not accessible."
    );
    return;
  }

  try {
    const messages = await Promise.resolve(
      getConversationHistory(conversationId)
    );
    if (!messages || messages.length === 0) {
      await sendWhatsAppMessage(
        conversationId,
        "Could not export conversation: No conversation history found."
      );
      return;
    }

    const csvMessages: ConversationCsvMessage[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        timestamp: new Date().toISOString(),
      }));

    await saveConversationCsv(conversationId, csvMessages);
    await sendWhatsAppMessage(
      conversationId,
      "Conversation exported successfully to Google Drive."
    );
  } catch (error) {
    requestLog.error({ error }, "export.failed");
    await sendWhatsAppMessage(conversationId, "Failed to export conversation.");
  }
}

export function createMessagesHandlers(
  dependencies: MessagesHandlerDependencies
) {
  const {
    generateSimpleResponse,
    sendWhatsAppMessage,
    saveConversationCsv,
    getConversationHistory,
  } = dependencies;

  if (!generateSimpleResponse || !sendWhatsAppMessage) {
    throw new Error("Messages handler dependencies are not configured");
  }

  return {
    async handleWhatsAppWebhook(request: FastifyRequest, reply: FastifyReply) {
      const parsed = whatsappMessageSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { From, Body } = parsed.data;

      request.log.info({ from: From, body: Body }, "whatsapp.message.received");

      const isExportRequest =
        Body.trim().toLowerCase() === "export" && saveConversationCsv;

      if (isExportRequest) {
        await handleExportRequest(
          From,
          getConversationHistory,
          saveConversationCsv,
          sendWhatsAppMessage,
          request.log
        );
        return reply.send({ success: true });
      }

      const openaiResult = await generateSimpleResponse(From, Body);
      const openaiResponse = openaiResult.response;

      request.log.info(
        {
          conversationId: From,
          userMessage: Body,
          assistantResponse: openaiResponse,
          tokens: {
            total: openaiResult.tokens.totalTokens,
            usage: openaiResult.tokens.usageTokens,
            request: openaiResult.tokens.requestTokens,
            conversation: openaiResult.tokens.conversationTokens,
            knowledge: openaiResult.tokens.knowledgeTokens,
            user: openaiResult.tokens.userTokens,
            durationMs: openaiResult.tokens.durationMs,
          },
        },
        "message.exchange.complete"
      );

      const result = await sendWhatsAppMessage(From, openaiResponse);

      if (!result.success) {
        request.log.error(
          { error: result.error, from: From },
          "whatsapp.message.send.failed"
        );
        return reply.status(500).send({
          error: "Failed to send message",
          details: result.error,
        });
      }

      return reply.send({
        success: true,
        messageSid: result.messageSid,
      });
    },

    async handleHealthCheck(_request: FastifyRequest, reply: FastifyReply) {
      return reply.send({ ok: true });
    },
  };
}
