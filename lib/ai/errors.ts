const STATUS_MESSAGES: Record<number, string> = {
  400: "Bad request — the prompt or input may be malformed",
  401: "Invalid API key — check your credentials in .env.local",
  403: "Access denied — your API key may lack permissions",
  429: "Rate limit exceeded — wait a moment and try again",
  500: "AI service internal error — try again later",
  502: "AI service returned a bad gateway response",
  503: "AI service unavailable — try again later",
  529: "AI service overloaded — try again later",
};

/**
 * Normalizes errors from all AI SDKs (OpenAI, Anthropic, Gemini, Ollama)
 * into a single user-friendly Error.
 *
 * All SDKs expose an HTTP status code as `.status` on their error objects,
 * which is what we check here.
 */
export function normalizeAIError(err: unknown, provider: string): Error {
  const status: number | undefined =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: number }).status
      : undefined;

  const originalMessage =
    err instanceof Error ? err.message : String(err);

  if (status !== undefined) {
    const description = STATUS_MESSAGES[status];
    if (description) {
      return new Error(`[${provider}] ${description} (HTTP ${status})`);
    }
    return new Error(`[${provider}] HTTP ${status}: ${originalMessage}`);
  }

  // Connection / timeout errors (no status code)
  if (
    originalMessage.includes("ECONNREFUSED") ||
    originalMessage.includes("fetch failed") ||
    originalMessage.includes("connect")
  ) {
    return new Error(`[${provider}] Connection failed — is the service reachable?`);
  }
  if (originalMessage.includes("timeout") || originalMessage.includes("ETIMEDOUT")) {
    return new Error(`[${provider}] Request timed out`);
  }

  return new Error(`[${provider}] ${originalMessage}`);
}
