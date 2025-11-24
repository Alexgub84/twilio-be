import { z } from "zod";
import dotenv from "dotenv";

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

function validateEnvironment(): Environment {
  console.log("🔍 Environment Variables Debug:");
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("PORT:", process.env.PORT);
  console.log(
    "TWILIO_ACCOUNT_SID:",
    process.env.TWILIO_ACCOUNT_SID?.substring(0, 10) + "..."
  );
  console.log(
    "TWILIO_AUTH_TOKEN:",
    process.env.TWILIO_AUTH_TOKEN ? "[SET]" : "[NOT SET]"
  );
  console.log("TWILIO_PHONE_NUMBER:", process.env.TWILIO_PHONE_NUMBER);
  console.log(
    "TWILIO_MESSAGING_SERVICE_SID:",
    process.env.TWILIO_MESSAGING_SERVICE_SID
  );
  console.log(
    "OPENAI_MAX_CONTEXT_TOKENS:",
    process.env.OPENAI_MAX_CONTEXT_TOKENS ?? "[default 700]"
  );
  console.log(
    "OPENAI_EMBEDDING_MODEL:",
    process.env.OPENAI_EMBEDDING_MODEL ?? "[default text-embedding-3-small]"
  );
  console.log(
    "CHROMA_API_KEY:",
    process.env.CHROMA_API_KEY ? "[SET]" : "[NOT SET]"
  );
  console.log("CHROMA_TENANT:", process.env.CHROMA_TENANT ?? "[not set]");
  console.log("CHROMA_DATABASE:", process.env.CHROMA_DATABASE ?? "[not set]");
  console.log(
    "CHROMA_COLLECTION:",
    process.env.CHROMA_COLLECTION ?? "[not set]"
  );
  console.log(
    "GOOGLE_SERVICE_ACCOUNT_EMAIL:",
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "[not set]"
  );
  console.log(
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:",
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ? "[SET]" : "[NOT SET]"
  );
  console.log(
    "GOOGLE_DRIVE_FOLDER_ID:",
    process.env.GOOGLE_DRIVE_FOLDER_ID ?? "[not set]"
  );

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
    throw new Error("Environment validation failed");
  }

  console.log("✅ Environment validation passed");
  return result.data;
}

export const env = validateEnvironment();
