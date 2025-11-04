import type { Twilio } from "twilio";

export function createFakeTwilioClient(): Twilio {
  return {
    messages: {
      create: async ({ to, body }: { to: string; body: string }) => ({
        sid: `SMFAKE-${Date.now()}`,
        to,
        body,
        status: "sent",
      }),
    },
  } as unknown as Twilio;
}
