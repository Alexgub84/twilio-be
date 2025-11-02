import type { FastifyInstance } from "fastify";
import { messagesRoutes } from "./messages.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(messagesRoutes);
}
