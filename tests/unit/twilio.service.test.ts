import { describe, expect, it, vi } from "vitest";

import { createTwilioService } from "../../src/services/twilio.js";
import { createFakeTwilioClient } from "../../src/clients/twilio.fake.js";

describe("createTwilioService", () => {
  it("sends WhatsApp message using fake client", async () => {
    const service = createTwilioService({
      client: createFakeTwilioClient(),
      fromNumber: "whatsapp:+10000000000",
    });

    const result = await service.sendWhatsAppMessage(
      "whatsapp:+19999999999",
      "Hello from tests"
    );

    expect(result.success).toBe(true);
    expect(result.messageSid).toMatch(/^SMFAKE-/);
  });

  it("propagates messaging service SID when provided", async () => {
    const createSpy = vi.fn(async (params: Record<string, string>) => {
      expect(params.messagingServiceSid).toBe("MG123");
      expect(params.from).toBeUndefined();
      return { sid: "SM123" };
    });

    const fakeClient = {
      messages: {
        create: createSpy,
      },
    } as unknown as ReturnType<typeof createFakeTwilioClient>;

    const service = createTwilioService({
      client: fakeClient,
      messagingServiceSid: "MG123",
    });

    const result = await service.sendWhatsAppMessage(
      "whatsapp:+12222222222",
      "Testing"
    );

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messagingServiceSid: "MG123",
      })
    );
    expect(result).toEqual({
      success: true,
      messageSid: "SM123",
    });
  });
});
