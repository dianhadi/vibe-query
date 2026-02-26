import { Schema } from "@/types";
import { buildSystemPrompt } from "./prompts";
import { schemaToString } from "@/lib/db/introspect";
import { AIAdapter } from "./adapters/types";
import { AnthropicAdapter } from "./adapters/anthropic";
import { OpenAIAdapter } from "./adapters/openai";
import { OllamaAdapter } from "./adapters/ollama";

function createAdapter(): AIAdapter {
  const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();

  switch (provider) {
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
      return new AnthropicAdapter(apiKey, process.env.AI_MODEL);
    }
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
      return new OpenAIAdapter(apiKey, process.env.AI_MODEL, process.env.OPENAI_BASE_URL);
    }
    case "ollama": {
      return new OllamaAdapter(process.env.AI_MODEL, process.env.OLLAMA_BASE_URL);
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: "${provider}". Supported: anthropic, openai, ollama`);
  }
}

export async function generateSQL(prompt: string, schema: Schema): Promise<string> {
  const adapter = createAdapter();
  const systemPrompt = buildSystemPrompt(schemaToString(schema));
  return adapter.generateSQL(systemPrompt, prompt);
}
