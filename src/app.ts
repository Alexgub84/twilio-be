import fastify from "fastify";
import formbody from "@fastify/formbody";
import { registerRoutes } from "./routes/index.js";
import type { OpenAIService } from "./services/openai.js";
import type { TwilioService } from "./services/twilio.js";
import type { MessagesHandlerDependencies } from "./handlers/messages.js";
import { logger } from "./logger.js";

export interface AppDependencies {
  openAIService: OpenAIService;
  twilioService: TwilioService;
  messages?: Partial<MessagesHandlerDependencies>;
}

export async function buildApp({
  openAIService,
  twilioService,
  messages,
}: AppDependencies) {
  const appLogger =
    process.env.NODE_ENV === "test"
      ? false
      : logger.child({ module: "fastify" });

  const app = fastify({
    logger: appLogger,
  });

  await app.register(formbody);

  const messagesDependencies: MessagesHandlerDependencies = {
    generateSimpleResponse:
      messages?.generateSimpleResponse ??
      ((conversationId, message) =>
        openAIService.generateReply(conversationId, message)),
    sendWhatsAppMessage:
      messages?.sendWhatsAppMessage ??
      ((to, body) => twilioService.sendWhatsAppMessage(to, body)),
  };

  await app.register(async (instance) => {
    await registerRoutes(instance, { messages: messagesDependencies });
  });

  return app;
}
