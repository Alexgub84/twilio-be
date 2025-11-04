import OpenAI from "openai";
import { env } from "../env.js";
import { encoding_for_model, type TiktokenModel } from "tiktoken";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const encoder = encoding_for_model(env.OPENAI_MODEL as TiktokenModel);

const MAX_TOKENS = 700;

const context: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: "You are a helpful chatbot",
  },
];

export async function generateSimpleResponse(message: string) {
  context.push({ role: "user", content: message });
  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: context,
  });
  const responseMessage = response.choices?.[0]?.message;
  if (!responseMessage) {
    throw new Error("No content returned from OpenAI response");
  }
  context.push(responseMessage);

  if (response.usage && response.usage.total_tokens > MAX_TOKENS) {
    deleteOlderMessages();
  }
  if (!responseMessage.content) {
    throw new Error("No content returned from OpenAI response");
  }
  return responseMessage.content;
}

function deleteOlderMessages() {
  let contextLength = getContextLength();
  while (contextLength > MAX_TOKENS) {
    for (let i = 0; i < context.length; i++) {
      const message = context[i];
      if (message && message.role != "system") {
        context.splice(i, 1);
        contextLength = getContextLength();
        break;
      }
    }
  }
}

function getContextLength() {
  let length = 0;
  context.forEach((message) => {
    if (typeof message.content == "string") {
      length += encoder.encode(message.content).length;
    } else if (Array.isArray(message.content)) {
      message.content.forEach((messageContent) => {
        if (messageContent.type == "text") {
          length += encoder.encode(messageContent.text).length;
        }
      });
    }
  });
  return length;
}
