import type { AddressInfo } from "node:net";
import type { AppInstance } from "./app.js";
import { buildApp } from "./app.js";
import { env } from "./env.js";
import { createOpenAIClient } from "./clients/openai.js";
import { createFakeOpenAIClient } from "./clients/openai.fake.js";
import { createTwilioClient } from "./clients/twilio.js";
import { createFakeTwilioClient } from "./clients/twilio.fake.js";
import { createOpenAIService } from "./services/openai.js";
import { createTwilioService } from "./services/twilio.js";
import { defaultSystemPrompt } from "./prompts/system.js";
import { createChromaClient } from "./clients/chromadb.js";
import { createFakeChromaClient } from "./clients/chromadb.fake.js";

function shouldUseFakeClients() {
  if (typeof process.env.USE_FAKE_CLIENTS === "string") {
    return process.env.USE_FAKE_CLIENTS === "true";
  }

  return env.NODE_ENV === "test";
}

export interface StartServerOptions {
  useFakeClients?: boolean;
  host?: string;
  port?: number;
}

export async function startServer(
  options: StartServerOptions = {}
): Promise<AppInstance> {
  const useFake = options.useFakeClients ?? shouldUseFakeClients();
  const host = options.host ?? "0.0.0.0";
  const port = options.port ?? env.PORT;

  const openAIClient = useFake
    ? createFakeOpenAIClient()
    : createOpenAIClient(env.OPENAI_API_KEY);

  const twilioClient = useFake
    ? createFakeTwilioClient()
    : createTwilioClient(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

  const chromaClient = useFake
    ? createFakeChromaClient()
    : createChromaClient({
        apiKey: env.CHROMA_API_KEY,
        tenant: env.CHROMA_TENANT,
        database: env.CHROMA_DATABASE,
      });

  const openAIService = createOpenAIService({
    client: openAIClient,
    model: env.OPENAI_MODEL,
    tokenLimit: env.OPENAI_MAX_CONTEXT_TOKENS,
    systemPrompt: JSON.stringify(defaultSystemPrompt),
    chromaClient,
    chromaCollection: env.CHROMA_COLLECTION,
  });

  const twilioOptions: Parameters<typeof createTwilioService>[0] = {
    client: twilioClient,
  };

  if (env.TWILIO_PHONE_NUMBER) {
    twilioOptions.fromNumber = env.TWILIO_PHONE_NUMBER;
  }

  if (env.TWILIO_MESSAGING_SERVICE_SID) {
    twilioOptions.messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;
  }

  const twilioService = createTwilioService(twilioOptions);

  const app = await buildApp({
    openAIService,
    twilioService,
  });

  await app.listen({
    port,
    host,
  });

  const addressInfo = app.server.address() as AddressInfo | null;
  const resolvedPort = addressInfo?.port ?? port;

  app.log.info(`Server is running on http://${host}:${resolvedPort}`);

  return app;
}
