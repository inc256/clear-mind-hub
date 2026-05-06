// ─────────────────────────────────────────────────────────────────────────────
// src/services/ai/sseParser.ts
// Parses an OpenAI-compatible Server-Sent Events (SSE) stream
// Calls onDelta for every content chunk received
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads an SSE ReadableStream from an OpenAI-compatible endpoint.
 * Emits content delta strings via onDelta until the [DONE] sentinel is received.
 *
 * Handles:
 * - Partial/chunked JSON lines (buffers and retries)
 * - Comment lines (": ping" style keep-alives)
 * - Carriage-return line endings
 * - Premature stream close
 */
export async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (chunk: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      // Extract and clean the line
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);

      // Skip empty lines and SSE comment lines (keep-alives)
      if (!line || line.startsWith(":")) continue;

      // Only process data lines
      if (!line.startsWith("data: ")) continue;

      const payload = line.slice(6).trim();

      // Stream terminator
      if (payload === "[DONE]") break outer;

      try {
        const parsed = JSON.parse(payload);
        // Support both streaming chat completions and plain text delta formats
        const delta: string | undefined =
          parsed.choices?.[0]?.delta?.content ??
          parsed.choices?.[0]?.text;

        if (typeof delta === "string" && delta.length > 0) {
          onDelta(delta);
        }
      } catch {
        // Incomplete JSON chunk — put the line back into the buffer and
        // wait for more bytes before retrying
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }
}
