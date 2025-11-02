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

    const messageParams: {
      to: string;
      body: string;
      from?: string;
      messagingServiceSid?: string;
    } = {
      to,
      body,
    };

    if (env.TWILIO_MESSAGING_SERVICE_SID) {
      messageParams.messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;
    } else if (env.TWILIO_PHONE_NUMBER) {
      messageParams.from = env.TWILIO_PHONE_NUMBER;
    }

    const message = await client.messages.create(messageParams);

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
