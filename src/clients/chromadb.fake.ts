import type { ChromaClient } from "chromadb";

type FakeHeartbeatResult = number;

export interface FakeChromaClientOptions {
  documents?: Array<string | null>;
  metadatas?: Array<Record<string, unknown> | null>;
  distances?: Array<number | null>;
  onQuery?: (args: { queryTexts?: string[] }) => void;
}

export function createFakeChromaClient(
  options: FakeChromaClientOptions = {}
): ChromaClient {
  const { documents = [], metadatas = [], distances = [], onQuery } = options;

  const collection = {
    query: async (args: { queryTexts?: string[] }) => {
      onQuery?.(args);
      return {
        documents: [documents],
        metadatas: [metadatas],
        distances: [distances],
      };
    },
  };

  return {
    heartbeat: async () => Date.now() satisfies FakeHeartbeatResult,
    getOrCreateCollection: async () => collection,
  } as unknown as ChromaClient;
}
