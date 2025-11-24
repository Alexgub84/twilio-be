import { beforeEach, describe, expect, it, vi } from "vitest";
import type { drive_v3 } from "googleapis";

const csvMocks = vi.hoisted(() => ({
  createGoogleDriveClient: vi.fn(),
  createCsvFile: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "service-account@example.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nLINE\\n-----END PRIVATE KEY-----",
  GOOGLE_DRIVE_FOLDER_ID: "drive-folder-id",
}));

vi.mock("../../src/clients/googleDrive", () => ({
  createGoogleDriveClient: csvMocks.createGoogleDriveClient,
  createCsvFile: csvMocks.createCsvFile,
}));

vi.mock("../../src/env", () => ({
  env: envMock,
}));

import { saveConversationCsv } from "../../src/services/export/conversationCsv";

describe("conversationCsv service", () => {
  const messages = [
    {
      role: "user",
      timestamp: "2024-11-12T15:00:00.000Z",
      content: "Hello, world!",
    },
    {
      role: "assistant",
      timestamp: "2024-11-12T15:01:00.000Z",
      content: "Line 1\nLine 2",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads a CSV using the default drive client", async () => {
    const driveInstance = {
      files: { create: vi.fn() },
    } as unknown as drive_v3.Drive;
    const timestamp = "2024-11-12T15:30:00.000Z";

    csvMocks.createGoogleDriveClient.mockReturnValue(driveInstance);
    csvMocks.createCsvFile.mockResolvedValue({ id: "file-id" });

    const result = await saveConversationCsv(
      {
        conversationId: "abc123",
        messages,
      },
      {
        now: () => new Date(timestamp),
      }
    );

    expect(result).toEqual({ id: "file-id" });

    expect(csvMocks.createGoogleDriveClient).toHaveBeenCalledWith({
      clientEmail: "service-account@example.com",
      privateKey:
        "-----BEGIN PRIVATE KEY-----\\nLINE\\n-----END PRIVATE KEY-----",
    });

    expect(csvMocks.createCsvFile).toHaveBeenCalledWith({
      drive: driveInstance,
      folderId: "drive-folder-id",
      fileName: `abc123-${timestamp}`,
      content: [
        "conversation_id,role,timestamp,content",
        'abc123,user,2024-11-12T15:00:00.000Z,"Hello, world!"',
        'abc123,assistant,2024-11-12T15:01:00.000Z,"Line 1\nLine 2"',
      ].join("\n"),
    });
  });

  it("reuses a provided drive client", async () => {
    const driveInstance = {
      files: { create: vi.fn() },
    } as unknown as drive_v3.Drive;

    csvMocks.createCsvFile.mockResolvedValue({ id: "file-id" });

    await saveConversationCsv(
      {
        conversationId: "conversation-456",
        messages: [messages[0]],
      },
      {
        drive: driveInstance,
        createDriveClient: csvMocks.createGoogleDriveClient,
        createDriveCsvFile: csvMocks.createCsvFile,
        now: () => new Date("2024-11-12T15:00:00.000Z"),
        environment: {
          GOOGLE_DRIVE_FOLDER_ID: "custom-folder",
          GOOGLE_SERVICE_ACCOUNT_EMAIL: "unused@example.com",
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "unused",
        },
      }
    );

    expect(csvMocks.createGoogleDriveClient).not.toHaveBeenCalled();
    expect(csvMocks.createCsvFile).toHaveBeenCalledWith({
      drive: driveInstance,
      folderId: "custom-folder",
      fileName: "conversation-456-2024-11-12T15:00:00.000Z",
      content: [
        "conversation_id,role,timestamp,content",
        'conversation-456,user,2024-11-12T15:00:00.000Z,"Hello, world!"',
      ].join("\n"),
    });
  });
});
