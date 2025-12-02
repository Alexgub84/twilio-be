import { z } from "zod";
import dotenv from "dotenv";
import { logger } from "./logger.js";

dotenv.config();

const isTest = process.env.NODE_ENV === "test";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.string().default("3000").transform(Number),
    TWILIO_ACCOUNT_SID: z
      .string()
      .startsWith("AC", "Account SID must start with AC")
      .default(isTest ? "ACtest_account_sid_for_testing" : ""),
    TWILIO_AUTH_TOKEN: z
      .string()
      .min(1, "Auth token is required")
      .default(isTest ? "test_auth_token" : ""),
    TWILIO_PHONE_NUMBER: isTest
      ? z
          .string()
          .startsWith("whatsapp:", "Phone number must be in WhatsApp format")
          .default("whatsapp:+15555555555")
      : z
          .string()
          .startsWith("whatsapp:", "Phone number must be in WhatsApp format")
          .optional(),
    TWILIO_MESSAGING_SERVICE_SID: z
      .string()
      .refine(
        (val) => val.startsWith("MG") || val.startsWith("US"),
        "Messaging Service SID must start with MG or US"
      )
      .optional(),
    OPENAI_API_KEY: z
      .string()
      .min(1, "OpenAI API key is required")
      .default(isTest ? "test_openai_api_key" : ""),
    OPENAI_MODEL: z
      .string()
      .min(1, "OpenAI model is required")
      .default("gpt-4o-mini"),
    OPENAI_EMBEDDING_MODEL: z
      .string()
      .min(1, "OpenAI embedding model is required")
      .default("text-embedding-3-small"),
    OPENAI_MAX_CONTEXT_TOKENS: z
      .string()
      .default("700")
      .transform((value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(
            "OPENAI_MAX_CONTEXT_TOKENS must be a positive number"
          );
        }
        return parsed;
      }),
    CHROMA_API_KEY: z
      .string()
      .min(1, "Chroma API key is required")
      .default(isTest ? "test_chroma_api_key" : ""),
    CHROMA_TENANT: z
      .string()
      .min(1, "Chroma tenant is required")
      .default(isTest ? "test_chroma_tenant" : ""),
    CHROMA_DATABASE: z
      .string()
      .min(1, "Chroma database is required")
      .default(isTest ? "test_chroma_database" : ""),
    CHROMA_COLLECTION: z
      .string()
      .min(1, "Chroma collection is required")
      .default(isTest ? "test_chroma_collection" : ""),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: isTest
      ? z
          .string()
          .email("Google service account email must be a valid email")
          .default("service-account@example.com")
      : z.string().email("Google service account email must be a valid email"),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: isTest
      ? z
          .string()
          .min(1, "Google service account private key is required")
          .default(
            "-----BEGIN PRIVATE KEY-----\\nTEST_PRIVATE_KEY\\n-----END PRIVATE KEY-----"
          )
      : z.string().min(1, "Google service account private key is required"),
    GOOGLE_DRIVE_FOLDER_ID: isTest
      ? z
          .string()
          .min(1, "Google Drive folder ID is required")
          .default("test-google-drive-folder-id")
      : z.string().min(1, "Google Drive folder ID is required"),
  })
  .refine(
    (data) =>
      data.NODE_ENV === "test" ||
      data.TWILIO_PHONE_NUMBER ||
      data.TWILIO_MESSAGING_SERVICE_SID,
    {
      message:
        "Either TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID must be provided",
    }
  );

export type Environment = z.infer<typeof envSchema>;

function logEnvironmentDebug(): void {
  const envLogger = logger.child({ module: "env-validation" });
  envLogger.debug({ NODE_ENV: process.env.NODE_ENV }, "env.NODE_ENV");
  envLogger.debug({ PORT: process.env.PORT }, "env.PORT");
  envLogger.debug(
    {
      accountSidPrefix: process.env.TWILIO_ACCOUNT_SID?.substring(0, 10),
    },
    "env.TWILIO_ACCOUNT_SID"
  );
  envLogger.debug(
    { isSet: Boolean(process.env.TWILIO_AUTH_TOKEN) },
    "env.TWILIO_AUTH_TOKEN"
  );
  envLogger.debug(
    { phoneNumber: process.env.TWILIO_PHONE_NUMBER },
    "env.TWILIO_PHONE_NUMBER"
  );
  envLogger.debug(
    { messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID },
    "env.TWILIO_MESSAGING_SERVICE_SID"
  );
  envLogger.debug(
    {
      maxContextTokens:
        process.env.OPENAI_MAX_CONTEXT_TOKENS ?? "[default 700]",
    },
    "env.OPENAI_MAX_CONTEXT_TOKENS"
  );
  envLogger.debug(
    {
      embeddingModel:
        process.env.OPENAI_EMBEDDING_MODEL ??
        "[default text-embedding-3-small]",
    },
    "env.OPENAI_EMBEDDING_MODEL"
  );
  envLogger.debug(
    { isSet: Boolean(process.env.CHROMA_API_KEY) },
    "env.CHROMA_API_KEY"
  );
  envLogger.debug(
    { tenant: process.env.CHROMA_TENANT ?? "[not set]" },
    "env.CHROMA_TENANT"
  );
  envLogger.debug(
    { database: process.env.CHROMA_DATABASE ?? "[not set]" },
    "env.CHROMA_DATABASE"
  );
  envLogger.debug(
    { collection: process.env.CHROMA_COLLECTION ?? "[not set]" },
    "env.CHROMA_COLLECTION"
  );
  envLogger.debug(
    {
      serviceAccountEmail:
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "[not set]",
    },
    "env.GOOGLE_SERVICE_ACCOUNT_EMAIL"
  );
  envLogger.debug(
    {
      isPrivateKeySet: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    },
    "env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
  );
  envLogger.debug(
    { folderId: process.env.GOOGLE_DRIVE_FOLDER_ID ?? "[not set]" },
    "env.GOOGLE_DRIVE_FOLDER_ID"
  );
}

function validateEnvironment(): Environment {
  logEnvironmentDebug();

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const envLogger = logger.child({ module: "env-validation" });
    envLogger.error(
      { errors: result.error.flatten().fieldErrors },
      "env.validation.failed"
    );
    throw new Error("Environment validation failed");
  }

  logger.child({ module: "env-validation" }).info("env.validation.passed");
  return result.data;
}

export const env = validateEnvironment();
