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
  /** "tableName.columnName" — FK reference to an existing table column, or null */
  references?: string | null;
}

export const PAGE_SIZES = [20, 50, 100] as const;
export type PageSize = typeof PAGE_SIZES[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;
