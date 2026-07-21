export type Dialect = "postgresql" | "mysql";

export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dialect: Dialect;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

export interface ForeignKey {
  table: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface Schema {
  tables: TableInfo[];
  foreignKeys: ForeignKey[];
}

export type QueryType = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "DDL";

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  hasMore?: boolean;
}

export interface GenerateResult {
  sql: string;
  queryType: QueryType;
}

export type AgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool_call"; tool: "inspect_distinct"; table: string; column: string }
  | { type: "tool_result"; tool: "inspect_distinct"; summary: string }
  | { type: "clarify"; question: string }
  | { type: "final_sql"; sql: string; queryType: QueryType }
  | { type: "repair_suggestion"; sql: string; queryType: QueryType; summary: string }
  | { type: "error"; error: string };

export interface MutationPreview {
  rowsAffected: number;
  previewRows?: Record<string, unknown>[];
}

export interface QueryHistoryItem {
  id: string;
  timestamp: Date;
  prompt: string;
  sql: string;
  queryType: QueryType;
  rowCount?: number;
}

export interface ColumnMapping {
  originalName: string;
  mappedName: string;
  dataType: string;
  primaryKey?: boolean;
  /** false = NOT NULL; undefined/true = nullable (default) */
  nullable?: boolean;
  /** "tableName.columnName" — FK reference to an existing table column, or null */
  references?: string | null;
}

export const PAGE_SIZES = [20, 50, 100] as const;
export type PageSize = typeof PAGE_SIZES[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;
