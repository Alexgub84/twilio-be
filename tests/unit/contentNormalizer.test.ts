import { describe, it, expect } from "vitest";
import { normalizeAssistantReply } from "../../src/utils/contentNormalizer";

describe("ContentNormalizer", () => {
  it("should normalize links with source map", () => {
    // The normalizer uses candidates when the link is empty, "#", or starts with "#"
    const content = "Here is a link to [Google](#) and [Bing](#)";
    const knowledgeEntries = [
      { title: "Google", source: "https://google.com" },
      { title: "Bing", source: "https://bing.com" },
    ];

    const normalized = normalizeAssistantReply(content, knowledgeEntries);
    expect(normalized).toContain("https://google.com");
    expect(normalized).toContain("https://bing.com");
  });

  it("should handle empty source map", () => {
    const content = "Here is a link to [Google](#)";
    const normalized = normalizeAssistantReply(content, []);
    // If no candidates, resolveUrl returns null.
    // If resolved is null, replacement is label.trim() -> "Google"
    expect(normalized).toBe("Here is a link to Google");
  });

  it("should not modify content without links", () => {
    const content = "Hello world";
    const normalized = normalizeAssistantReply(content, []);
    expect(normalized).toBe(content);
  });
});
