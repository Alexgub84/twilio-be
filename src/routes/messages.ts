import type { FastifyInstance } from "fastify";
import {
  handleWhatsAppWebhook,
  handleHealthCheck,
} from "../handlers/messages.js";

export async function messagesRoutes(app: FastifyInstance) {
  app.get("/", handleHealthCheck);
  app.post("/whatsapp", handleWhatsAppWebhook);
}
