import { DBClient } from "@/lib/db/client-types";
import { Dialect, quoteIdent } from "@/lib/db/dialect";
import { ColumnInfo, Schema } from "@/types";
import {
  ALLOWED_COLUMN_PATTERNS,
  BLOCKED_COLUMN_PATTERNS,
  CATEGORICAL_TYPES,
  isConfiguredAllowedCategoricalColumn,
  isConfiguredSensitiveColumn,
} from "@/lib/agent/policy";

const MAX_DISTINCT_VALUES = 25;
const MAX_VALUE_LENGTH = 40;

const SENSITIVE_VALUE_PATTERNS = [
  /@/,
  /\b\d{8,}\b/,
  /\+?\d[\d\s().-]{7,}\d/,
  /^[a-f0-9]{24,}$/i,
  /^sk-[A-Za-z0-9_-]+/,
  /^eyJ[A-Za-z0-9_-]+/,
];

export interface DistinctInspectionResult {
  values: string[];
  valueCount: number;
  truncated: boolean;
}

function findColumn(schema: Schema, tableName: string, columnName: string): ColumnInfo | null {
  const table = schema.tables.find((t) => t.name === tableName);
  if (!table) return null;
  return table.columns.find((c) => c.name === columnName) ?? null;
}

export function canInspectDistinct(schema: Schema, table: string, column: string): { allowed: true } | { allowed: false; reason: string } {
  const col = findColumn(schema, table, column);
  if (!col) return { allowed: false, reason: "Table or column is not in the current schema." };

  if (isConfiguredSensitiveColumn(table, column) || BLOCKED_COLUMN_PATTERNS.some((pattern) => pattern.test(column))) {
    return { allowed: false, reason: "Column name looks sensitive or free-text." };
  }

  const allowedByConfig = isConfiguredAllowedCategoricalColumn(table, column);
  const allowedByName = ALLOWED_COLUMN_PATTERNS.some((pattern) => pattern.test(column));
  const allowedByType = CATEGORICAL_TYPES.some((type) => col.type.toLowerCase().includes(type));
  if (!allowedByConfig && !allowedByName && !allowedByType) {
    return { allowed: false, reason: "Column is not classified as a safe categorical field." };
  }

  return { allowed: true };
}

function relationName(table: string, dbSchema: string, dialect: Dialect): string {
  if (dialect === "mysql") return quoteIdent(table, dialect);
  return `${quoteIdent(dbSchema, dialect)}.${quoteIdent(table, dialect)}`;
}

function sanitizeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > MAX_VALUE_LENGTH) return null;
  if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(text))) return null;
  return text;
}

export async function inspectDistinctValues(
  client: DBClient,
  schema: Schema,
  table: string,
  column: string,
  dbSchema: string,
  dialect: Dialect
): Promise<DistinctInspectionResult> {
  const safety = canInspectDistinct(schema, table, column);
  if (!safety.allowed) throw new Error(safety.reason);

  const quotedColumn = quoteIdent(column, dialect);
  const sql = `
    SELECT ${quotedColumn} AS value, COUNT(*) AS count
    FROM ${relationName(table, dbSchema, dialect)}
    WHERE ${quotedColumn} IS NOT NULL
    GROUP BY ${quotedColumn}
    ORDER BY count DESC
    LIMIT ${MAX_DISTINCT_VALUES + 1}
  `;

  const result = await client.query(sql);
  const values = result.rows
    .slice(0, MAX_DISTINCT_VALUES)
    .map((row) => sanitizeValue(row.value))
    .filter((value): value is string => value !== null);

  if (values.length === 0 && result.rows.length > 0) {
    throw new Error("Distinct values looked sensitive or too long to share with AI.");
  }

  return {
    values,
    valueCount: result.rows.length,
    truncated: result.rows.length > MAX_DISTINCT_VALUES,
  };
}
