import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/app.js";

const createTestApp = async () => {
  const generateReply = vi.fn(
    async (_conversationId: string, message: string) => {
      return `[ai] ${message}`;
    }
  );

  const sendWhatsAppMessage = vi.fn(async () => ({
    success: true,
    messageSid: "SM123",
  }));

  const app = await buildApp({
    openAIService: {
      generateReply,
      resetConversation: vi.fn(),
    },
    twilioService: {
      sendWhatsAppMessage,
    },
  });

  return { app, generateReply, sendWhatsAppMessage };
};

describe("app integration", () => {
  it("responds to health check", async () => {
    const { app } = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    await app.close();
  });

  it("validates WhatsApp payload", async () => {
    const { app } = await createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/whatsapp",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty("error", "Invalid request body");

    await app.close();
  });

  it("sends WhatsApp message when payload is valid", async () => {
    const { app, generateReply, sendWhatsAppMessage } = await createTestApp();

    const payload = {
      From: "whatsapp:+15551234567",
      Body: "Hello there",
    };

    const response = await app.inject({
      method: "POST",
      url: "/whatsapp",
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      messageSid: "SM123",
    });
    expect(generateReply).toHaveBeenCalledWith(payload.From, payload.Body);
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      payload.From,
      `[ai] ${payload.Body}`
    );

    await app.close();
  });

  it("returns 500 when Twilio send fails", async () => {
    const generateReply = vi.fn(async () => "Hi!");
    const sendWhatsAppMessage = vi.fn(async () => ({
      success: false,
      error: "Twilio down",
    }));

    const app = await buildApp({
      openAIService: {
        generateReply,
        resetConversation: vi.fn(),
      },
      twilioService: {
        sendWhatsAppMessage,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/whatsapp",
      payload: {
        From: "whatsapp:+15550000000",
        Body: "Ping",
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "Failed to send message",
      details: "Twilio down",
    });

    await app.close();
  });
});
