import { ColumnInfo, Schema, TableInfo } from "@/types";
import {
  ALLOWED_COLUMN_PATTERNS,
  BLOCKED_COLUMN_PATTERNS,
  CATEGORICAL_TYPES,
  isConfiguredAllowedCategoricalColumn,
  isConfiguredSensitiveColumn,
} from "@/lib/agent/policy";

interface TableProfile {
  table: string;
  entityHint?: string;
  displayColumns: string[];
  sensitiveColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  foreignKeyLikeColumns: string[];
  queryHints: string[];
}

function isSensitiveColumn(table: string, name: string): boolean {
  return isConfiguredSensitiveColumn(table, name) || BLOCKED_COLUMN_PATTERNS.some((pattern) => pattern.test(name));
}

function isCategoricalColumn(table: string, column: ColumnInfo): boolean {
  const configMatch = isConfiguredAllowedCategoricalColumn(table, column.name);
  const nameMatch = ALLOWED_COLUMN_PATTERNS.some((pattern) => pattern.test(column.name));
  const typeMatch = CATEGORICAL_TYPES.some((type) => column.type.toLowerCase().includes(type));
  return !isSensitiveColumn(table, column.name) && (configMatch || nameMatch || typeMatch);
}

function isDateColumn(column: ColumnInfo): boolean {
  const name = column.name.toLowerCase();
  const type = column.type.toLowerCase();
  return /date|time|dob|birth/.test(name) || /date|time|timestamp/.test(type);
}

function isDisplayColumn(column: ColumnInfo): boolean {
  return /^(name|title|label|display_name)$/i.test(column.name);
}

function isForeignKeyLikeColumn(column: ColumnInfo): boolean {
  return /_id$/i.test(column.name) && !/^id$/i.test(column.name);
}

function inferEntityHint(table: TableInfo): string | undefined {
  const name = table.name.toLowerCase();
  if (/employee|staff|user|customer|person|people|member/.test(name)) return "people/entity table";
  if (/order|invoice|payment|transaction|sale|sales/.test(name)) return "transaction table";
  if (/product|item|sku/.test(name)) return "catalog table";
  if (/log|audit|event|history/.test(name)) return "log/audit table";
  return undefined;
}

function profileTable(table: TableInfo): TableProfile {
  const sensitiveColumns = table.columns.filter((column) => isSensitiveColumn(table.name, column.name)).map((column) => column.name);
  const categoricalColumns = table.columns.filter((column) => isCategoricalColumn(table.name, column)).map((column) => column.name);
  const dateColumns = table.columns.filter(isDateColumn).map((column) => column.name);
  const displayColumns = table.columns.filter(isDisplayColumn).map((column) => column.name);
  const foreignKeyLikeColumns = table.columns.filter(isForeignKeyLikeColumn).map((column) => column.name);
  const queryHints: string[] = [];

  for (const column of categoricalColumns) {
    queryHints.push(`${column}: inspect distinct before mapping natural-language filters.`);
  }
  for (const column of sensitiveColumns) {
    queryHints.push(`${column}: sensitive or free-text; do not inspect distinct or send values to AI.`);
  }

  return {
    table: table.name,
    entityHint: inferEntityHint(table),
    displayColumns,
    sensitiveColumns,
    categoricalColumns,
    dateColumns,
    foreignKeyLikeColumns,
    queryHints,
  };
}

export function buildSchemaProfile(schema: Schema): TableProfile[] {
  return schema.tables.map(profileTable);
}

export function schemaProfileToString(schema: Schema): string {
  const profiles = buildSchemaProfile(schema);
  const lines: string[] = [];

  for (const profile of profiles) {
    const parts: string[] = [];
    if (profile.entityHint) parts.push(`entity=${profile.entityHint}`);
    if (profile.displayColumns.length > 0) parts.push(`display=${profile.displayColumns.join(", ")}`);
    if (profile.categoricalColumns.length > 0) parts.push(`categorical=${profile.categoricalColumns.join(", ")}`);
    if (profile.dateColumns.length > 0) parts.push(`date=${profile.dateColumns.join(", ")}`);
    if (profile.sensitiveColumns.length > 0) parts.push(`sensitive=${profile.sensitiveColumns.join(", ")}`);
    if (profile.foreignKeyLikeColumns.length > 0) parts.push(`fk_like=${profile.foreignKeyLikeColumns.join(", ")}`);
    if (parts.length > 0) lines.push(`Table ${profile.table}: ${parts.join("; ")}`);
    for (const hint of profile.queryHints) {
      lines.push(`  - ${hint}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "No additional schema profile hints.";
}
