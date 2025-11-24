import type { FastifyRequest, FastifyReply } from "fastify";
import { whatsappMessageSchema } from "../types/index.js";
import type { SendMessageResult } from "../types/index.js";
import type { ConversationCsvMessage } from "../services/export/conversationCsv.js";
import type OpenAI from "openai";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface MessagesHandlerDependencies {
  generateSimpleResponse: (
    conversationId: string,
    message: string
  ) => Promise<string>;
  sendWhatsAppMessage: (to: string, body: string) => Promise<SendMessageResult>;
  saveConversationCsv?: (
    conversationId: string,
    messages: ConversationCsvMessage[]
  ) => Promise<unknown>;
  getConversationHistory?: (
    conversationId: string
  ) => ChatMessage[] | Promise<ChatMessage[]>;
}

export function createMessagesHandlers(
  dependencies: MessagesHandlerDependencies
) {
  const {
    generateSimpleResponse: generateResponse,
    sendWhatsAppMessage: dispatchMessage,
    saveConversationCsv,
  } = dependencies;

  if (!generateResponse || !dispatchMessage) {
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

      request.log.info(`Received WhatsApp message from ${From}: ${Body}`);

      // Check if user is requesting export
      if (Body.trim().toLowerCase() === "export" && saveConversationCsv) {
        try {
          const getHistory = dependencies.getConversationHistory;
          if (!getHistory) {
            await dispatchMessage(
              From,
              "Export service unavailable: Conversation history not accessible."
            );
            return reply.send({
              success: false,
              error: "History service unavailable",
            });
          }

          const messages = await Promise.resolve(getHistory(From));
          if (messages && messages.length > 0 && saveConversationCsv) {
            const csvMessages: ConversationCsvMessage[] = messages
              .filter((m) => m.role !== "system")
              .map((m) => ({
                role: m.role,
                content:
                  typeof m.content === "string"
                    ? m.content
                    : JSON.stringify(m.content),
                timestamp: new Date().toISOString(),
              }));

            await saveConversationCsv(From, csvMessages);
            await dispatchMessage(
              From,
              "Conversation exported successfully to Google Drive."
            );
          } else {
            await dispatchMessage(
              From,
              "Could not export conversation: No conversation history found."
            );
          }
        } catch (error) {
          request.log.error(`Export failed: ${error}`);
          await dispatchMessage(From, "Failed to export conversation.");
        }
        return reply.send({ success: true });
      }

      const openaiResponse = await generateResponse(From, Body);
      const result = await dispatchMessage(From, openaiResponse);

      if (!result.success) {
        request.log.error(`Failed to send message: ${result.error}`);
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
