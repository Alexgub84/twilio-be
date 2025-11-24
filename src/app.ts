import fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  type RawServerDefault,
} from "fastify";
import formbody from "@fastify/formbody";
import { registerRoutes } from "./routes/index.js";
import type { OpenAIService } from "./services/ai/openai.js";
import type { TwilioService } from "./services/messaging/twilio.js";
import type { MessagesHandlerDependencies } from "./handlers/messages.js";
import { logger } from "./logger.js";

export interface AppDependencies {
  openAIService: OpenAIService;
  twilioService: TwilioService;
  messages?: Partial<MessagesHandlerDependencies>;
}

export type AppInstance = FastifyInstance<RawServerDefault>;

export async function buildApp({
  openAIService,
  twilioService,
  messages,
}: AppDependencies): Promise<AppInstance> {
  const loggerInstance =
    process.env.NODE_ENV === "test"
      ? undefined
      : logger.child({ module: "fastify" });

  const appOptions: FastifyServerOptions<RawServerDefault> = loggerInstance
    ? { loggerInstance }
    : { logger: false };

  const app = fastify(appOptions);

  await app.register(formbody);

  const messagesDependencies: MessagesHandlerDependencies = {
    generateSimpleResponse:
      messages?.generateSimpleResponse ??
      ((conversationId, message) =>
        openAIService.generateReply(conversationId, message)),
    sendWhatsAppMessage:
      messages?.sendWhatsAppMessage ??
      ((to, body) => twilioService.sendWhatsAppMessage(to, body)),
    saveConversationCsv:
      messages?.saveConversationCsv ??
      (async (conversationId, history) => {
        const { saveConversationCsv } = await import(
          "./services/export/conversationCsv.js"
        );
        return saveConversationCsv({
          conversationId,
          messages: history.map((m) => ({
            role: m.role,
            content:
              typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content),
            timestamp: new Date().toISOString(), // Approximate timestamp as history doesn't store it yet
          })),
        });
      }),
    getConversationHistory:
      messages?.getConversationHistory ??
      ((conversationId) =>
        openAIService.getConversationHistory(conversationId)),
  };

  await app.register(async (instance) => {
    await registerRoutes(instance, { messages: messagesDependencies });
  });

  return app;
}
