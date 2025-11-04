import type { FastifyRequest, FastifyReply } from "fastify";
import { whatsappMessageSchema } from "../types/index.js";
import type { SendMessageResult } from "../types/index.js";

export interface MessagesHandlerDependencies {
  generateSimpleResponse: (
    conversationId: string,
    message: string
  ) => Promise<string>;
  sendWhatsAppMessage: (to: string, body: string) => Promise<SendMessageResult>;
}

export function createMessagesHandlers(
  dependencies: MessagesHandlerDependencies
) {
  const {
    generateSimpleResponse: generateResponse,
    sendWhatsAppMessage: dispatchMessage,
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
