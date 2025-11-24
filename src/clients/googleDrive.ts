import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";

const DEFAULT_SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const CSV_MIME_TYPE = "text/csv";
const DEFAULT_FIELDS = "id, name, webViewLink";

export interface CreateGoogleDriveClientOptions {
  clientEmail: string;
  privateKey: string;
  scopes?: string[];
}

export function createGoogleDriveClient(
  options: CreateGoogleDriveClientOptions
): drive_v3.Drive {
  const auth = new google.auth.JWT({
    email: options.clientEmail,
    key: options.privateKey.replace(/\\n/g, "\n"),
    scopes: options.scopes ?? DEFAULT_SCOPES,
  });

  return google.drive({
    version: "v3",
    auth,
  });
}

export interface CreateCsvFileOptions {
  drive: drive_v3.Drive;
  folderId: string;
  fileName: string;
  content: string;
  fields?: string;
}

export async function createCsvFile(
  options: CreateCsvFileOptions
): Promise<drive_v3.Schema$File> {
  const normalizedFileName = options.fileName.endsWith(".csv")
    ? options.fileName
    : `${options.fileName}.csv`;

  const response = await options.drive.files.create({
    requestBody: {
      name: normalizedFileName,
      mimeType: CSV_MIME_TYPE,
      parents: [options.folderId],
    },
    media: {
      mimeType: CSV_MIME_TYPE,
      body: Readable.from([options.content]),
    },
    fields: options.fields ?? DEFAULT_FIELDS,
    supportsAllDrives: true,
  });

  return response.data;
}
