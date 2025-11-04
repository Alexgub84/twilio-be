import type { FastifyInstance } from "fastify";
import {
  createMessagesHandlers,
  type MessagesHandlerDependencies,
} from "../handlers/messages.js";

export type MessagesRouteDependencies = MessagesHandlerDependencies;

export async function messagesRoutes(
  app: FastifyInstance,
  dependencies: MessagesRouteDependencies
) {
  const { handleHealthCheck, handleWhatsAppWebhook } =
    createMessagesHandlers(dependencies);

  app.get("/", handleHealthCheck);
  app.post("/whatsapp", handleWhatsAppWebhook);
}
