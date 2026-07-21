import { DataQualityCheck, DataQualityPlan, PerformanceAnalysis, PerformanceSuggestion, Schema } from "@/types";
import { Dialect } from "@/lib/db/dialect";
import { schemaProfileToString } from "@/lib/agent/schema-profile";
import { classifyQueryType } from "@/lib/db/execute";
import { assertCanSendToAI } from "@/lib/policy/ai-context-policy";
import { hasMultipleStatements } from "@/lib/policy/sql-policy";
import { buildSystemPrompt, buildERDSystemPrompt, buildAnalyzeSystemPrompt, buildRepairSystemPrompt, buildAgentPlanningSystemPrompt, buildDataQualitySystemPrompt } from "./prompts";
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

function cleanJSONText(raw: string): string {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
}

function escapeRawControlCharsInStrings(text: string): string {
  let result = "";
  let inString = false;
  let escaping = false;

  for (const char of text) {
    if (escaping) {
      result += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaping = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString && char === "\n") {
      result += "\\n";
      continue;
    }
    if (inString && char === "\r") {
      result += "\\r";
      continue;
    }
    if (inString && char === "\t") {
      result += "\\t";
      continue;
    }

    result += char;
  }

  return result;
}

function parseModelJSON<T>(raw: string): T {
  const cleaned = cleanJSONText(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      return JSON.parse(escapeRawControlCharsInStrings(cleaned)) as T;
    } catch {
      throw new Error("AI returned invalid JSON. Please retry or rephrase the request.");
    }
  }
}

export async function analyzeQueryPlan(
  sql: string,
  explainText: string,
  dialect: Dialect = "postgresql"
): Promise<PerformanceAnalysis> {
  const adapter = createAdapter();
  assertCanSendToAI("sql");
  assertCanSendToAI("explain");
  const systemPrompt = buildAnalyzeSystemPrompt(dialect);
  const explainLabel = dialect === "mysql" ? "EXPLAIN" : "EXPLAIN ANALYZE";
  const userPrompt = `SQL Query:\n\`\`\`sql\n${sql}\n\`\`\`\n\n${explainLabel} output:\n\`\`\`\n${explainText}\n\`\`\``;
  logAICall("analyzeQueryPlan", sql);
  const raw = await adapter.generateSQL(systemPrompt, userPrompt);
  return parsePerformanceAnalysis(raw);
}

function parsePerformanceAnalysis(raw: string): PerformanceAnalysis {
  const parsed = parseModelJSON<Partial<PerformanceAnalysis>>(raw);
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    throw new Error("AI returned an invalid analysis summary");
  }

  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.flatMap((item): PerformanceSuggestion[] => {
        if (!item || typeof item !== "object") return [];
        const suggestion = item as Partial<PerformanceSuggestion>;
        if (
          (suggestion.kind !== "rewrite" && suggestion.kind !== "index") ||
          typeof suggestion.title !== "string" ||
          typeof suggestion.sql !== "string" ||
          typeof suggestion.reason !== "string"
        ) {
          return [];
        }

        const cleanSuggestionSql = cleanSQL(suggestion.sql);
        if (hasMultipleStatements(cleanSuggestionSql)) return [];
        if (suggestion.kind === "rewrite" && classifyQueryType(cleanSuggestionSql) !== "SELECT") return [];
        if (suggestion.kind === "index" && !/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(cleanSuggestionSql)) return [];

        return [{
          kind: suggestion.kind,
          title: suggestion.title.trim(),
          sql: cleanSuggestionSql,
          reason: suggestion.reason.trim(),
          risk: typeof suggestion.risk === "string" ? suggestion.risk.trim() : undefined,
        }];
      })
    : [];

  return {
    summary: parsed.summary.trim(),
    issues: Array.isArray(parsed.issues) ? parsed.issues.filter((issue): issue is string => typeof issue === "string") : [],
    suggestions,
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((note): note is string => typeof note === "string") : undefined,
  };
}

function parseDataQualityPlan(raw: string): DataQualityPlan {
  const parsed = parseModelJSON<Partial<DataQualityPlan>>(raw);
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    throw new Error("AI returned an invalid data quality summary");
  }

  const checks = Array.isArray(parsed.checks)
    ? parsed.checks.flatMap((item): DataQualityCheck[] => {
        if (!item || typeof item !== "object") return [];
        const check = item as Partial<DataQualityCheck>;
        if (
          typeof check.title !== "string" ||
          typeof check.table !== "string" ||
          (check.severity !== "low" && check.severity !== "medium" && check.severity !== "high") ||
          typeof check.sql !== "string" ||
          typeof check.reason !== "string"
        ) {
          return [];
        }

        const sql = cleanSQL(check.sql);
        if (hasMultipleStatements(sql)) return [];
        if (classifyQueryType(sql) !== "SELECT") return [];

        return [{
          title: check.title.trim(),
          table: check.table.trim(),
          severity: check.severity,
          sql,
          reason: check.reason.trim(),
        }];
      })
    : [];

  return {
    summary: parsed.summary.trim(),
    checks,
  };
}

export async function generateERD(
  schema: Schema,
  dbSchema = "public",
  dialect: Dialect = "postgresql"
): Promise<string> {
  const adapter = createAdapter();
  assertCanSendToAI("schema");
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

export type AgentPlanningAction =
  | { action: "final_sql"; sql: string }
  | { action: "inspect_distinct"; table: string; column: string; reason: string }
  | { action: "clarify"; question: string }
  | { action: "refuse"; reason: string };

export interface RepairSuggestion {
  sql: string;
  summary: string;
}

function parsePlanningAction(raw: string): AgentPlanningAction {
  const parsed = parseModelJSON<Partial<AgentPlanningAction>>(raw);

  if (parsed.action === "final_sql" && typeof parsed.sql === "string" && parsed.sql.trim()) {
    return { action: "final_sql", sql: cleanSQL(parsed.sql) };
  }
  if (
    parsed.action === "inspect_distinct" &&
    typeof parsed.table === "string" &&
    typeof parsed.column === "string" &&
    typeof parsed.reason === "string"
  ) {
    return { action: "inspect_distinct", table: parsed.table, column: parsed.column, reason: parsed.reason };
  }
  if (parsed.action === "clarify" && typeof parsed.question === "string" && parsed.question.trim()) {
    return { action: "clarify", question: parsed.question.trim() };
  }
  if (parsed.action === "refuse" && typeof parsed.reason === "string" && parsed.reason.trim()) {
    return { action: "refuse", reason: parsed.reason.trim() };
  }

  throw new Error("AI returned an invalid planning action");
}

export async function generateSQL(
  prompt: string,
  schema: Schema,
  pageSize?: number,
  dbSchema = "public",
  dialect: Dialect = "postgresql"
): Promise<string> {
  const adapter = createAdapter();
  assertCanSendToAI("schema");
  const systemPrompt = buildSystemPrompt(schemaToString(schema, dbSchema, dialect), pageSize, dbSchema, dialect);
  logAICall("generateSQL", prompt);
  const raw = await adapter.generateSQL(systemPrompt, prompt);
  return cleanSQL(raw);
}

export async function generateDataQualityPlan(
  schema: Schema,
  dbSchema = "public",
  dialect: Dialect = "postgresql"
): Promise<DataQualityPlan> {
  const adapter = createAdapter();
  assertCanSendToAI("schema");
  assertCanSendToAI("schema_profile");
  const systemPrompt = buildDataQualitySystemPrompt(
    schemaToString(schema, dbSchema, dialect),
    schemaProfileToString(schema),
    dbSchema,
    dialect
  );
  logAICall("generateDataQualityPlan", `schema=${dbSchema}`);
  const raw = await adapter.generateSQL(systemPrompt, "Generate data quality checks for this schema.");
  return parseDataQualityPlan(raw);
}

export async function planQueryAction(
  prompt: string,
  schema: Schema,
  observations: string[],
  pageSize?: number,
  dbSchema = "public",
  dialect: Dialect = "postgresql"
): Promise<AgentPlanningAction> {
  const adapter = createAdapter();
  assertCanSendToAI("schema");
  assertCanSendToAI("schema_profile");
  assertCanSendToAI("tool_observation");
  const systemPrompt = buildAgentPlanningSystemPrompt(
    schemaToString(schema, dbSchema, dialect),
    schemaProfileToString(schema),
    pageSize,
    dbSchema,
    dialect
  );
  const userPrompt = [
    `User request:\n${prompt}`,
    observations.length > 0 ? `Tool observations:\n${observations.join("\n")}` : "Tool observations: none",
  ].join("\n\n");
  logAICall("planQueryAction", prompt);
  const raw = await adapter.generateSQL(systemPrompt, userPrompt);
  return parsePlanningAction(raw);
}

export async function repairSQL(
  originalPrompt: string,
  failedSql: string,
  errorMessage: string,
  schema: Schema,
  dbSchema = "public",
  dialect: Dialect = "postgresql"
): Promise<RepairSuggestion> {
  const adapter = createAdapter();
  assertCanSendToAI("schema");
  assertCanSendToAI("sql");
  assertCanSendToAI("db_error");
  const systemPrompt = buildRepairSystemPrompt(schemaToString(schema, dbSchema, dialect), dbSchema, dialect);
  const userPrompt = `Original request:\n${originalPrompt || "(not available)"}\n\nFailed SQL:\n\`\`\`sql\n${failedSql}\n\`\`\`\n\nDatabase error:\n${errorMessage}`;
  logAICall("repairSQL", failedSql);
  const raw = await adapter.generateSQL(systemPrompt, userPrompt);
  const parsed = parseModelJSON<Partial<RepairSuggestion>>(raw);
  if (typeof parsed.sql !== "string" || !parsed.sql.trim()) {
    throw new Error("AI returned an invalid repair SQL");
  }
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    throw new Error("AI returned an invalid repair summary");
  }
  return {
    sql: cleanSQL(parsed.sql),
    summary: parsed.summary.trim(),
  };
}
