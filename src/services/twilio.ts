import twilio from "twilio";
import { env } from "../env.js";
import type { SendMessageResult } from "../types/index.js";

export function createTwilioClient() {
  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<SendMessageResult> {
  try {
    const client = createTwilioClient();
    const message = await client.messages.create({
      from: env.TWILIO_PHONE_NUMBER,
      to,
      body,
    });

    return {
      success: true,
      messageSid: message.sid,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: errorMessage,
    };
  }
}
