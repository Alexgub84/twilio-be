import type { FastifyInstance } from "fastify";
import { messagesRoutes, type MessagesRouteDependencies } from "./messages.js";

export interface RoutesDependencies {
  messages: MessagesRouteDependencies;
}

export async function registerRoutes(
  app: FastifyInstance,
  dependencies: RoutesDependencies
) {
  await app.register(async (instance) => {
    await messagesRoutes(instance, dependencies.messages);
  });
}
