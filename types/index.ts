export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
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
}

export interface GenerateResult {
  sql: string;
  queryType: QueryType;
}

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
}
