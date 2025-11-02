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
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    throw new Error("Environment validation failed");
  }

  return result.data;
}

export const env = validateEnvironment();
