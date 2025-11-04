import OpenAI from "openai";
import {
  registerEmbeddingFunction,
  type ChromaClient,
  type Collection,
  type EmbeddingFunction as ChromaEmbeddingFunction,
} from "chromadb";
import {
  encoding_for_model,
  type Tiktoken,
  type TiktokenModel,
} from "tiktoken";
import { logger } from "../logger.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

type EmbeddingVector = number[];

const isEmbeddingVector = (value: unknown): value is EmbeddingVector =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (element) => typeof element === "number" && Number.isFinite(element)
  );

interface OpenAIEmbeddingFunctionConfig {
  model: string;
}

type EmbeddingFunctionClassLike = {
  new (...args: unknown[]): ChromaEmbeddingFunction;
  buildFromConfig: (
    config: OpenAIEmbeddingFunctionConfig
  ) => ChromaEmbeddingFunction;
};

interface OpenAIEmbeddingFunctionOptions {
  openai_api_key: string;
  model: string;
  embedTexts?: (texts: string[]) => Promise<EmbeddingVector[]>;
}

class OpenAIEmbeddingFunction implements ChromaEmbeddingFunction {
  private static readonly identifier = "openai-api";
  private static registered = false;
  private static register(): void {
    if (OpenAIEmbeddingFunction.registered) {
      return;
    }

    try {
      registerEmbeddingFunction(
        OpenAIEmbeddingFunction.identifier,
        OpenAIEmbeddingFunction as unknown as EmbeddingFunctionClassLike
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("already registered")
      ) {
        throw error;
      }
    }

    OpenAIEmbeddingFunction.registered = true;
  }

  private static createEmbedder(
    apiKey: string,
    model: string
  ): (texts: string[]) => Promise<EmbeddingVector[]> {
    const embeddingClient = new OpenAI({ apiKey });
    return async (texts: string[]): Promise<EmbeddingVector[]> => {
      const response = await embeddingClient.embeddings.create({
        model,
        input: texts,
      });

      return response.data.map((item, index) => {
        const embedding = item.embedding;
        if (!isEmbeddingVector(embedding)) {
          throw new Error(
            `Invalid embedding vector received from OpenAI at index ${index}`
          );
        }
        return embedding;
      });
    };
  }

  static buildFromConfig(
    config: OpenAIEmbeddingFunctionConfig
  ): ChromaEmbeddingFunction {
    const apiKey = process.env.OPENAI_API_KEY;
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for OpenAIEmbeddingFunction"
      );
    }

    const model =
      typeof config.model === "string" && config.model.length > 0
        ? config.model
        : "text-embedding-3-small";

    return new OpenAIEmbeddingFunction({
      openai_api_key: apiKey,
      model,
    });
  }

  public readonly name = OpenAIEmbeddingFunction.identifier;
  private readonly model: string;
  private readonly embedTexts: (texts: string[]) => Promise<EmbeddingVector[]>;

  constructor(options: OpenAIEmbeddingFunctionOptions) {
    OpenAIEmbeddingFunction.register();

    this.model = options.model;
    this.embedTexts =
      options.embedTexts ??
      OpenAIEmbeddingFunction.createEmbedder(
        options.openai_api_key,
        options.model
      );
  }

  getConfig(): OpenAIEmbeddingFunctionConfig {
    return { model: this.model };
  }

  defaultSpace(): "cosine" {
    return "cosine";
  }

  supportedSpaces(): Array<"cosine" | "l2" | "ip"> {
    return ["cosine", "l2", "ip"];
  }

  async generate(texts: string[]): Promise<EmbeddingVector[]> {
    return this.embedTexts(texts);
  }

  async generateForQueries(texts: string[]): Promise<EmbeddingVector[]> {
    return this.embedTexts(texts);
  }
}

interface KnowledgeEntry {
  title: string;
  source?: string | null;
}

interface KnowledgeContext {
  message: ChatMessage;
  entries: KnowledgeEntry[];
}

export interface OpenAIServiceOptions {
  client: OpenAI;
  model: string;
  tokenLimit: number;
  systemPrompt: string;
  embeddingModel: string;
  openAIApiKey: string;
  tokenizer?: Pick<Tiktoken, "encode">;
  chromaClient: ChromaClient;
  chromaCollection: string;
  chromaMaxResults?: number;
  chromaMaxCharacters?: number;
  embedTexts?: (texts: string[]) => Promise<EmbeddingVector[]>;
}

export interface OpenAIService {
  generateReply: (conversationId: string, message: string) => Promise<string>;
  resetConversation: (conversationId: string) => void;
}

export function createOpenAIService(
  options: OpenAIServiceOptions
): OpenAIService {
  const {
    client,
    model,
    tokenLimit,
    systemPrompt,
    chromaClient,
    chromaCollection,
    embeddingModel,
    openAIApiKey,
  } = options;
  const tokenizer =
    options.tokenizer ?? encoding_for_model(model as TiktokenModel);
  const serviceLogger = logger.child({ module: "openai-service", model });
  const chromaMaxResults = options.chromaMaxResults ?? 5;
  const chromaMaxCharacters = options.chromaMaxCharacters ?? 1500;

  const conversations = new Map<string, ChatMessage[]>();
  let chromaCollectionPromise: Promise<Collection> | null = null;

  const logInfo = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.info(meta ?? {}, message);
  };

  const logWarn = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.warn(meta ?? {}, message);
  };

  const logError = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.error(meta ?? {}, message);
  };

  const embedTexts =
    options.embedTexts ??
    (async (texts: string[]): Promise<EmbeddingVector[]> => {
      const response = await client.embeddings.create({
        model: embeddingModel,
        input: texts,
      });

      return response.data.map((item, index) => {
        const embedding = item.embedding;
        if (!isEmbeddingVector(embedding)) {
          throw new Error(
            `Invalid embedding vector received from OpenAI at index ${index}`
          );
        }
        return embedding;
      });
    });

  const chromaEmbeddingFunction = new OpenAIEmbeddingFunction({
    openai_api_key: openAIApiKey,
    model: embeddingModel,
    embedTexts,
  });

  const resolveChromaCollection = async (): Promise<Collection | null> => {
    if (!chromaCollectionPromise) {
      chromaCollectionPromise = chromaClient
        .getOrCreateCollection({
          name: chromaCollection,
          embeddingFunction: chromaEmbeddingFunction,
        })
        .catch((error) => {
          chromaCollectionPromise = null;
          logError("chroma.collection.resolve.failed", {
            collection: chromaCollection,
            error: error instanceof Error ? error.message : error,
          });
          return Promise.reject(error);
        });
    }

    try {
      return await chromaCollectionPromise;
    } catch {
      return null;
    }
  };

  void (async () => {
    try {
      await chromaClient.heartbeat();
      logInfo("chroma.heartbeat.success");
    } catch (error) {
      logError("chroma.heartbeat.failed", {
        error: error instanceof Error ? error.message : error,
      });
    }

    try {
      await resolveChromaCollection();
      logInfo("chroma.collection.ready", { collection: chromaCollection });
    } catch {
      /* noop */
    }
  })();

  const ensureConversation = (conversationId: string): ChatMessage[] => {
    const existing = conversations.get(conversationId);
    if (existing) {
      return existing;
    }

    const context: ChatMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];
    conversations.set(conversationId, context);
    return context;
  };

  const countTokens = (messages: ChatMessage[]): number =>
    messages.reduce((total, message) => {
      if (typeof message.content === "string") {
        return total + tokenizer.encode(message.content).length;
      }

      if (Array.isArray(message.content)) {
        return (
          total +
          message.content.reduce((innerTotal, part) => {
            if (part.type === "text") {
              return innerTotal + tokenizer.encode(part.text).length;
            }
            return innerTotal;
          }, 0)
        );
      }

      return total;
    }, 0);

  const trimContext = (messages: ChatMessage[]): boolean => {
    let trimmed = false;
    let totalTokens = countTokens(messages);

    while (totalTokens > tokenLimit && messages.length > 1) {
      trimmed = true;
      messages.splice(1, 1);
      totalTokens = countTokens(messages);
    }

    if (trimmed) {
      logWarn("openai.context.trimmed", {
        tokenLimit,
        totalTokens,
        conversationLength: messages.length,
      });
    }

    return trimmed;
  };

  const truncate = (value: string, limit: number): string => {
    if (value.length <= limit) {
      return value;
    }

    const sliceLimit = Math.max(0, limit - 3);
    return `${value.slice(0, sliceLimit)}...`;
  };

  const buildKnowledgeContext = async (
    conversationId: string,
    userMessage: string
  ): Promise<KnowledgeContext | null> => {
    const collection = await resolveChromaCollection();

    if (!collection) {
      return null;
    }

    let queryEmbeddings: EmbeddingVector[];
    try {
      queryEmbeddings = await embedTexts([userMessage]);
    } catch (error) {
      logWarn("openai.embedding.failed", {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }

    if (!Array.isArray(queryEmbeddings) || queryEmbeddings.length === 0) {
      logWarn("openai.embedding.empty", {
        conversationId,
      });
      return null;
    }

    try {
      const queryResult = await collection.query({
        queryEmbeddings,
        nResults: chromaMaxResults,
        include: ["documents", "metadatas", "distances"],
      });

      const documents = queryResult.documents?.[0] ?? [];
      const metadatas = queryResult.metadatas?.[0] ?? [];
      const distances = queryResult.distances?.[0] ?? [];

      const entries: string[] = [];
      const perDocumentLimit = Math.max(
        200,
        Math.floor(chromaMaxCharacters / Math.max(1, chromaMaxResults))
      );

      const entriesForContext: KnowledgeEntry[] = [];

      documents.forEach((doc, index) => {
        if (!doc) {
          return;
        }

        const metadata =
          (Array.isArray(metadatas) ? metadatas[index] : null) ?? {};
        const title =
          metadata && typeof metadata.title === "string"
            ? metadata.title
            : `snippet-${index + 1}`;
        const source =
          metadata && typeof metadata.source === "string"
            ? metadata.source
            : "unknown";
        const distance = Array.isArray(distances) ? distances[index] : null;

        entriesForContext.push({ title, source });

        const scoreFragment =
          typeof distance === "number"
            ? ` | score: ${distance.toFixed(4)}`
            : "";

        entries.push(
          `- (${title} | source: ${source}${scoreFragment}) ${truncate(
            doc,
            perDocumentLimit
          )}`
        );
      });

      if (entries.length === 0) {
        logInfo("chroma.query.empty", {
          conversationId,
          collection: chromaCollection,
        });
        return null;
      }

      const contextString = `Knowledge base context:\n${entries.join("\n")}`;

      logInfo("chroma.query.success", {
        conversationId,
        collection: chromaCollection,
        results: entries.length,
      });

      return {
        entries: entriesForContext,
        message: {
          role: "system",
          content: contextString,
        },
      } satisfies KnowledgeContext;
    } catch (error) {
      logError("chroma.query.failed", {
        conversationId,
        collection: chromaCollection,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  };

  const generateReply = async (
    conversationId: string,
    message: string
  ): Promise<string> => {
    const messages = ensureConversation(conversationId);
    messages.push({ role: "user", content: message });

    const trimmedBeforeCall = trimContext(messages);

    const requestMessages = [...messages];
    const knowledgeContext = await buildKnowledgeContext(
      conversationId,
      message
    );
    const knowledgeEntries = knowledgeContext?.entries ?? [];

    let knowledgeApplied = false;

    if (knowledgeContext) {
      requestMessages.splice(
        requestMessages.length - 1,
        0,
        knowledgeContext.message
      );
      knowledgeApplied = true;

      if (countTokens(requestMessages) > tokenLimit) {
        const index = requestMessages.indexOf(knowledgeContext.message);
        if (index >= 0) {
          requestMessages.splice(index, 1);
        }
        knowledgeApplied = false;
        logWarn("chroma.context.dropped", {
          conversationId,
          reason: "token_limit",
        });
      }
    }

    const trimmedRequest = trimContext(requestMessages);
    const startedAt = Date.now();

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model,
        messages: requestMessages,
      });
    } catch (error) {
      logError("openai.request.failed", {
        conversationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }

    const responseMessage = response.choices?.[0]?.message;
    if (!responseMessage?.content) {
      logError("openai.response.empty", {
        conversationId,
        usage: response.usage,
      });
      throw new Error("No content returned from OpenAI response");
    }

    const normalizedContent = normalizeAssistantReply(
      responseMessage.content,
      knowledgeEntries
    );

    const enrichedResponseMessage: ChatMessage = {
      ...responseMessage,
      content: normalizedContent,
    };

    messages.push(enrichedResponseMessage);
    const trimmedAfterCall = trimContext(messages);
    const totalTokens = countTokens(messages);
    const requestTokens = countTokens(requestMessages);

    const payload: Record<string, unknown> = {
      conversationId,
      totalTokens,
      durationMs: Date.now() - startedAt,
      usageTokens: response.usage?.total_tokens ?? null,
      trimmed: trimmedBeforeCall || trimmedAfterCall || trimmedRequest,
      knowledgeApplied,
      requestTokens,
    };

    logInfo("openai.tokens", payload);

    return normalizedContent;
  };

  const resetConversation = (conversationId: string) => {
    conversations.set(conversationId, [
      {
        role: "system",
        content: systemPrompt,
      },
    ]);
  };

  return {
    generateReply,
    resetConversation,
  };
}

function normalizeAssistantReply(
  content: string,
  knowledgeEntries: KnowledgeEntry[]
): string {
  if (!content.includes("[") || !content.includes(")")) {
    return content;
  }

  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  if (!markdownLinkRegex.test(content)) {
    return content;
  }

  const candidateUrls: string[] = knowledgeEntries
    .map((entry) => entry.source)
    .filter((source): source is string => typeof source === "string")
    .map((source) => source.trim())
    .filter(isHttpUrl);

  let normalized = content;
  let match: RegExpExecArray | null;
  markdownLinkRegex.lastIndex = 0;

  while ((match = markdownLinkRegex.exec(content)) !== null) {
    const fullMatch = match[0] ?? "";
    const label = match[1] ?? "";
    const link = match[2] ?? "";

    if (!fullMatch) {
      continue;
    }

    const resolved = resolveUrl(link, candidateUrls);

    const replacement = resolved ? formatLink(label, resolved) : label.trim();

    normalized = normalized.replace(fullMatch, replacement);
  }

  return normalized;
}

function resolveUrl(link: string, candidates: string[]): string | null {
  const trimmed = link.trim();

  if (trimmed.length === 0 || trimmed === "#" || trimmed.startsWith("#")) {
    return candidates.shift() ?? null;
  }

  if (isHttpUrl(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("www.")) {
    return `https://${trimmed}`;
  }

  const inlineUrl = extractFirstUrl(trimmed);
  if (inlineUrl) {
    return inlineUrl;
  }

  return null;
}

function formatLink(label: string, url: string): string {
  const cleanedLabel = label
    .trim()
    .replace(/[\s\n]+/g, " ")
    .trim();
  if (cleanedLabel.length === 0) {
    return url;
  }

  return `${cleanedLabel}\n${stripTrailingPunctuation(url)}`;
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[).,;:!?]+$/g, "");
}

function extractFirstUrl(value: string): string | null {
  const urlRegex = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/;
  const match = value.match(urlRegex);
  if (!match) {
    return null;
  }

  const url = match[0];
  if (url.startsWith("www.")) {
    return `https://${url}`;
  }

  return url;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}
