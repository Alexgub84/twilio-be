import { CloudClient, type ChromaClient } from "chromadb";

export interface CreateChromaClientOptions {
  apiKey: string;
  tenant: string;
  database: string;
}

export function createChromaClient(
  options: CreateChromaClientOptions
): ChromaClient {
  return new CloudClient(options);
}
