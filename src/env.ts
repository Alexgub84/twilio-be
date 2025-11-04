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
