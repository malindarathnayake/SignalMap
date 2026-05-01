function stripMarkdownJsonFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```[ \t]*(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)(?:\r?\n)?```[ \t]*$/i);
  return match?.[1] !== undefined ? match[1].trim() : trimmed;
}

function rawSnippet(content: string): string {
  return content
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function parseLlmJson(content: string, label: string): unknown {
  const normalized = stripMarkdownJsonFence(content);
  try {
    return JSON.parse(normalized);
  } catch (err) {
    const parseMessage = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${label} failed schema validation: output is not valid JSON: ${parseMessage}; raw="${rawSnippet(
        content,
      )}"`,
    );
  }
}
