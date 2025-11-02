import { z } from "zod";

export const whatsappMessageSchema = z.object({
  From: z.string().min(1, "From field is required"),
  Body: z.string().min(1, "Body field is required"),
});

export type WhatsAppMessage = z.infer<typeof whatsappMessageSchema>;

export interface SendMessageResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}
