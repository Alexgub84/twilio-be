import {
  registerEmbeddingFunction,
  type ChromaClient,
  type Collection,
  type EmbeddingFunction as ChromaEmbeddingFunction,
} from "chromadb";
import OpenAI from "openai";
import { logger } from "../../logger.js";

// Types re-exported or adapted from original file
export type EmbeddingVector = number[];

export const isEmbeddingVector = (value: unknown): value is EmbeddingVector =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (element) => typeof element === "number" && Number.isFinite(element)
  );

export interface OpenAIEmbeddingFunctionConfig {
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

export class OpenAIEmbeddingFunction implements ChromaEmbeddingFunction {
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

export interface KnowledgeEntry {
  title: string;
  source?: string | null;
}

export interface KnowledgeContext {
  message: OpenAI.Chat.Completions.ChatCompletionMessageParam;
  entries: KnowledgeEntry[];
}

export interface KnowledgeBaseServiceOptions {
  chromaClient: ChromaClient;
  chromaCollection: string;
  embeddingModel: string;
  openAIApiKey: string;
  chromaMaxResults?: number;
  chromaMaxCharacters?: number;
  embedTexts?: (texts: string[]) => Promise<EmbeddingVector[]>;
  openaiClient: OpenAI; // Used for fallback embedding if custom embedTexts not provided
}

export interface KnowledgeBaseService {
  buildKnowledgeContext: (
    conversationId: string,
    userMessage: string
  ) => Promise<KnowledgeContext | null>;
}

export function createKnowledgeBaseService(
  options: KnowledgeBaseServiceOptions
): KnowledgeBaseService {
  const {
    chromaClient,
    chromaCollection,
    embeddingModel,
    openAIApiKey,
    openaiClient,
  } = options;

  const serviceLogger = logger.child({ module: "knowledge-base-service" });
  const chromaMaxResults = options.chromaMaxResults ?? 5;
  const chromaMaxCharacters = options.chromaMaxCharacters ?? 1500;

  let chromaCollectionPromise: Promise<Collection> | null = null;

  const logInfo = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.info(meta ?? {}, message);
  };

  const logError = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.error(meta ?? {}, message);
  };

  const logWarn = (message: string, meta?: Record<string, unknown>) => {
    serviceLogger.warn(meta ?? {}, message);
  };

  const embedTexts =
    options.embedTexts ??
    (async (texts: string[]): Promise<EmbeddingVector[]> => {
      const response = await openaiClient.embeddings.create({
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

  // Initialize connection
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
      };
    } catch (error) {
      logError("chroma.query.failed", {
        conversationId,
        collection: chromaCollection,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  };

  return {
    buildKnowledgeContext,
  };
}
