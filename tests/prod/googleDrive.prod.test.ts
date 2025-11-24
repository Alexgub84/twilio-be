import { describe, expect, it } from "vitest";
import {
  createCsvFile,
  createGoogleDriveClient,
} from "../../src/clients/googleDrive";
import { env } from "../../src/env";

const runProdTest = process.env.RUN_GOOGLE_DRIVE_PROD_TEST === "true";
const describeProd = runProdTest ? describe : describe.skip;

describeProd("googleDrive prod integration", () => {
  it("uploads a CSV to the configured Drive folder", async () => {
    const drive = createGoogleDriveClient({
      clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    });

    const timestamp = new Date().toISOString();
    const fileName = `conversation-prod-test-${timestamp}`;

    const csvContent = [
      "conversation_id,role,timestamp,content",
      `prod-${timestamp},user,${timestamp},"Hello from prod test"`,
    ].join("\n");

    const file = await createCsvFile({
      drive,
      folderId: env.GOOGLE_DRIVE_FOLDER_ID,
      fileName,
      content: csvContent,
      fields: "id, name, webViewLink",
    });

    expect(file.id).toBeTruthy();
    expect(file.name).toContain("conversation-prod-test-");
  }, 30_000);
});
