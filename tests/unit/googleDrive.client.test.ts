import { Readable } from "node:stream";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { drive_v3 } from "googleapis";

const googleApiMocks = vi.hoisted(() => ({
  jwtMock: vi.fn(),
  driveFactoryMock: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: googleApiMocks.jwtMock,
    },
    drive: googleApiMocks.driveFactoryMock,
  },
}));

import {
  createCsvFile,
  createGoogleDriveClient,
} from "../../src/clients/googleDrive";

describe("googleDrive client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Google Drive client with normalized credentials", () => {
    const driveInstance = { files: { create: vi.fn() } };
    const jwtInstance = { authorize: vi.fn() };

    googleApiMocks.jwtMock.mockImplementation(() => jwtInstance);
    googleApiMocks.driveFactoryMock.mockReturnValue(driveInstance);

    const client = createGoogleDriveClient({
      clientEmail: "service-account@example.com",
      privateKey:
        "-----BEGIN PRIVATE KEY-----\\nLINE_1\\nLINE_2\\n-----END PRIVATE KEY-----",
    });

    expect(googleApiMocks.jwtMock).toHaveBeenCalledWith({
      email: "service-account@example.com",
      key: "-----BEGIN PRIVATE KEY-----\nLINE_1\nLINE_2\n-----END PRIVATE KEY-----",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
    expect(googleApiMocks.driveFactoryMock).toHaveBeenCalledWith({
      version: "v3",
      auth: jwtInstance,
    });
    expect(client).toBe(driveInstance);
  });

  it("creates a CSV file in the specified folder", async () => {
    const filesCreateMock = vi.fn().mockResolvedValue({
      data: {
        id: "generated-file-id",
        name: "conversation.csv",
      },
    });

    const drive = {
      files: {
        create: filesCreateMock,
      },
    };

    const content = "header1,header2\nvalue1,value2";

    const result = await createCsvFile({
      drive: drive as unknown as drive_v3.Drive,
      folderId: "folder-123",
      fileName: "conversation",
      content,
    });

    expect(result).toEqual({
      id: "generated-file-id",
      name: "conversation.csv",
    });

    expect(filesCreateMock).toHaveBeenCalledWith({
      requestBody: {
        name: "conversation.csv",
        mimeType: "text/csv",
        parents: ["folder-123"],
      },
      media: {
        mimeType: "text/csv",
        body: expect.any(Readable),
      },
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });

    const [[callArgument]] = filesCreateMock.mock.calls;
    const mediaBody = callArgument.media.body as Readable;

    const collected = await readStream(mediaBody);
    expect(collected).toBe(content);
  });
});

async function readStream(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(
      typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks).toString("utf-8");
}
