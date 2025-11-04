import type { Twilio } from "twilio";
import type { SendMessageResult } from "../types/index.js";
import { logger } from "../logger.js";

export interface TwilioServiceOptions {
  client: Twilio;
  fromNumber?: string;
  messagingServiceSid?: string;
}

export interface TwilioService {
  sendWhatsAppMessage: (to: string, body: string) => Promise<SendMessageResult>;
}

export function createTwilioService(
  options: TwilioServiceOptions
): TwilioService {
  const { client, fromNumber, messagingServiceSid } = options;
  const serviceLogger = logger.child({ module: "twilio-service" });

  const sendWhatsAppMessage = async (
    to: string,
    body: string
  ): Promise<SendMessageResult> => {
    try {
      const messageParams: {
        to: string;
        body: string;
        from?: string;
        messagingServiceSid?: string;
      } = {
        to,
        body,
      };

      if (messagingServiceSid) {
        messageParams.messagingServiceSid = messagingServiceSid;
      } else if (fromNumber) {
        messageParams.from = fromNumber;
      }

      const message = await client.messages.create(messageParams);

      serviceLogger.info(
        {
          to,
          messageSid: message.sid,
          messagingServiceSid: messageParams.messagingServiceSid,
        },
        "twilio.message.sent"
      );

      return {
        success: true,
        messageSid: message.sid,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      serviceLogger.error(
        {
          to,
          messagingServiceSid,
          error: errorMessage,
        },
        "twilio.message.failed"
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  return { sendWhatsAppMessage };
}
