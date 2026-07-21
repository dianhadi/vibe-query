import fs from "fs";
import path from "path";

export interface AgentPolicyConfig {
  agentPolicy?: {
    allowedCategoricalColumns?: string[];
    sensitiveColumns?: string[];
  };
}

export const BLOCKED_COLUMN_PATTERNS = [
  /(^|_)name$/i,
  /full_?name/i,
  /first_?name/i,
  /last_?name/i,
  /email|mail/i,
  /phone|mobile|whatsapp/i,
  /address|street|latitude|longitude|(^|_)lat$|(^|_)lng$/i,
  /ssn|passport|national_?id|tax_?id/i,
  /password|token|secret|api_?key/i,
  /note|notes|comment|description|message|bio/i,
];

export const ALLOWED_COLUMN_PATTERNS = [
  /gender|sex/i,
  /status|state|stage|phase/i,
  /^is_|^has_|_flag$/i,
  /type|category|role/i,
  /priority|severity|level|tier|rank/i,
  /channel|source|origin|platform/i,
  /payment_?status|order_?status|shipment_?status|delivery_?status|approval_?status|review_?status/i,
  /mode|method|kind|class|segment|group/i,
];

export const CATEGORICAL_TYPES = [
  "boolean",
  "bool",
  "enum",
  "tinyint",
  "smallint",
];

let cachedPolicy: AgentPolicyConfig | null = null;

function normalizeColumnRef(value: string): string {
  return value.trim().toLowerCase();
}

function readPolicyConfig(): AgentPolicyConfig {
  if (cachedPolicy) return cachedPolicy;

  const filePath = path.join(process.cwd(), "vibeql.config.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    cachedPolicy = JSON.parse(raw) as AgentPolicyConfig;
  } catch {
    cachedPolicy = {};
  }

  return cachedPolicy;
}

function configuredColumns(key: "allowedCategoricalColumns" | "sensitiveColumns"): Set<string> {
  const values = readPolicyConfig().agentPolicy?.[key] ?? [];
  return new Set(values.map(normalizeColumnRef));
}

export function isConfiguredSensitiveColumn(table: string, column: string): boolean {
  const columns = configuredColumns("sensitiveColumns");
  return columns.has(normalizeColumnRef(`${table}.${column}`)) || columns.has(normalizeColumnRef(column));
}

export function isConfiguredAllowedCategoricalColumn(table: string, column: string): boolean {
  const columns = configuredColumns("allowedCategoricalColumns");
  return columns.has(normalizeColumnRef(`${table}.${column}`)) || columns.has(normalizeColumnRef(column));
}

