import type { drive_v3 } from "googleapis";
import {
  createCsvFile,
  createGoogleDriveClient,
} from "../../clients/googleDrive";
import { env, type Environment } from "../../env";
import { logger } from "../../logger";

export interface ConversationCsvMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface SaveConversationCsvOptions {
  conversationId: string;
  messages: ConversationCsvMessage[];
  fileName?: string;
}

export interface SaveConversationCsvDependencies {
  drive?: drive_v3.Drive;
  environment?: Pick<
    Environment,
    | "GOOGLE_SERVICE_ACCOUNT_EMAIL"
    | "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
    | "GOOGLE_DRIVE_FOLDER_ID"
  >;
  createDriveClient?: typeof createGoogleDriveClient;
  createDriveCsvFile?: typeof createCsvFile;
  now?: () => Date;
}

const CSV_HEADERS = ["conversation_id", "role", "timestamp", "content"];

export function buildConversationCsvContent(
  conversationId: string,
  messages: ConversationCsvMessage[]
): string {
  const rows = [
    CSV_HEADERS,
    ...messages.map((message) => [
      conversationId,
      message.role,
      message.timestamp,
      message.content,
    ]),
  ];

  return toCsv(rows);
}

export async function saveConversationCsv(
  options: SaveConversationCsvOptions,
  dependencies: SaveConversationCsvDependencies = {}
) {
  const serviceLogger = logger.child({ module: "conversation-csv" });
  const environment = dependencies.environment ?? env;

  try {
    const resolveDrive = (): drive_v3.Drive => {
      if (dependencies.drive) {
        return dependencies.drive;
      }

      const createClient =
        dependencies.createDriveClient ?? createGoogleDriveClient;
      return createClient({
        clientEmail: environment.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        privateKey: environment.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
      });
    };

    const drive = resolveDrive();
    const createFile = dependencies.createDriveCsvFile ?? createCsvFile;
    const fileName =
      options.fileName ??
      `${options.conversationId}-${resolveTimestamp(dependencies)}`;

    const csvContent = buildConversationCsvContent(
      options.conversationId,
      options.messages
    );

    const file = await createFile({
      drive,
      folderId: environment.GOOGLE_DRIVE_FOLDER_ID,
      fileName,
      content: csvContent,
    });

    serviceLogger.info(
      { conversationId: options.conversationId, fileName },
      "csv.export.drive.success"
    );

    return file;
  } catch (error) {
    serviceLogger.error(
      {
        conversationId: options.conversationId,
        error: error instanceof Error ? error.message : error,
      },
      "csv.export.drive.failed"
    );
    throw error;
  }
}

function resolveTimestamp({
  now,
}: Pick<SaveConversationCsvDependencies, "now">): string {
  const current = now ? now() : new Date();
  return current.toISOString();
}

function toCsv(rows: string[][]): string {
  return rows.map((columns) => columns.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(value: string): string {
  if (!value) return "";
  const mustQuote =
    value.includes(",") || value.includes('"') || value.includes("\n");
  if (!mustQuote) {
    return value;
  }

  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}
