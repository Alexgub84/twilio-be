export interface KnowledgeEntry {
  title: string;
  source?: string | null;
}

export function normalizeAssistantReply(
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
