/**
 * Uses globalThis to share state across all API route module instances
 * within the same Node.js process (resets on server restart).
 * Falls back to AI_PROVIDER env var, then to "anthropic".
 */
declare global {
  // eslint-disable-next-line no-var
  var __vibeql_ai_provider: string | undefined;
}

export function getActiveProvider(): string {
  return globalThis.__vibeql_ai_provider ?? process.env.AI_PROVIDER ?? "anthropic";
}

export function setActiveProvider(provider: string) {
  globalThis.__vibeql_ai_provider = provider;
}
