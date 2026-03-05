import { Schema } from "@/types";
import { Dialect } from "@/lib/db/dialect";
import { buildSystemPrompt, buildERDSystemPrompt, buildAnalyzeSystemPrompt } from "./prompts";
import { schemaToString } from "@/lib/db/introspect";
import { AIAdapter } from "./adapters/types";
import { AnthropicAdapter } from "./adapters/anthropic";
import { OpenAIAdapter } from "./adapters/openai";
import { OllamaAdapter } from "./adapters/ollama";
import { GeminiAdapter } from "./adapters/gemini";
import { getActiveProvider } from "./provider-store";

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
  ollama: "llama3.2",
};

function truncatePrompt(text: string, wordLimit = 8): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= wordLimit) return text.trim();
  return words.slice(0, wordLimit).join(" ") + " ...";
}

function logAICall(feature: string, userPrompt: string) {
  const provider = getActiveProvider();
  const model = process.env.AI_MODEL ?? DEFAULT_MODELS[provider] ?? provider;
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    level: "info",
    feature,
    provider,
    model,
    prompt: truncatePrompt(userPrompt),
  }));
}

function createAdapter(): AIAdapter {
  const provider = getActiveProvider().toLowerCase();

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
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
      return new GeminiAdapter(apiKey, process.env.AI_MODEL);
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: "${provider}". Supported: anthropic, openai, ollama, gemini`);
  }
}

export async function analyzeQueryPlan(
  sql: string,
  explainText: string,
  dialect: Dialect = "postgresql"
): Promise<string> {
  const adapter = createAdapter();
  const systemPrompt = buildAnalyzeSystemPrompt(dialect);
  const explainLabel = dialect === "mysql" ? "EXPLAIN" : "EXPLAIN ANALYZE";
  const userPrompt = `SQL Query:\n\`\`\`sql\n${sql}\n\`\`\`\n\n${explainLabel} output:\n\`\`\`\n${explainText}\n\`\`\``;
  logAICall("analyzeQueryPlan", sql);
  return adapter.generateSQL(systemPrompt, userPrompt);
}

export async function generateERD(
  schema: Schema,
  dbSchema = "public",
  dialect: Dialect = "postgresql"
): Promise<string> {
  const adapter = createAdapter();
  const systemPrompt = buildERDSystemPrompt(dialect);
  const userPrompt = `Generate a Mermaid erDiagram for this schema:\n\n${schemaToString(schema, dbSchema, dialect)}`;
  logAICall("generateERD", `schema=${dbSchema}`);
  return adapter.generateSQL(systemPrompt, userPrompt);
}

/** Strip markdown code fences that AI models sometimes add despite instructions. */
function cleanSQL(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:sql)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export async function generateSQL(
  prompt: string,
  schema: Schema,
  pageSize?: number,
  dbSchema = "public",
  dialect: Dialect = "postgresql"
): Promise<string> {
  const adapter = createAdapter();
  const systemPrompt = buildSystemPrompt(schemaToString(schema, dbSchema, dialect), pageSize, dbSchema, dialect);
  logAICall("generateSQL", prompt);
  const raw = await adapter.generateSQL(systemPrompt, prompt);
  return cleanSQL(raw);
}
