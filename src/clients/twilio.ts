import twilio, { type Twilio } from "twilio";

export function createTwilioClient(
  accountSid: string,
  authToken: string
): Twilio {
  return twilio(accountSid, authToken);
}
