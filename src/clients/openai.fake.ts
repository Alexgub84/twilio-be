import type OpenAI from "openai";

type FakeMessage = {
  role?: string;
  content?: unknown;
};

export function createFakeOpenAIClient(): OpenAI {
  return {
    chat: {
      completions: {
        create: async ({ messages }: { messages: FakeMessage[] }) => {
          const lastMessage = messages[messages.length - 1];
          const lastContent =
            typeof lastMessage?.content === "string"
              ? lastMessage.content
              : JSON.stringify(lastMessage?.content ?? "");

          return {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: `[fake-openai] ${lastContent}`,
                },
              },
            ],
            usage: {
              prompt_tokens: lastContent.length,
              completion_tokens: lastContent.length,
              total_tokens: lastContent.length * 2,
            },
          } as unknown;
        },
      },
    },
  } as unknown as OpenAI;
}
