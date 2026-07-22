export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
  ollama: "llama3.2",
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getModelEnvName(provider: string): string {
  return `${provider.toUpperCase()}_MODEL`;
}

export function resolveAIModel(provider: string): string {
  const normalizedProvider = provider.toLowerCase();
  return (
    readEnv(getModelEnvName(normalizedProvider)) ??
    readEnv("AI_MODEL") ??
    DEFAULT_MODELS[normalizedProvider] ??
    normalizedProvider
  );
}
