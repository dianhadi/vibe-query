export interface DBResult {
  rows: Record<string, unknown>[];
  fields: { name: string }[];
  rowCount: number;
}

export interface DBClient {
  query(sql: string, params?: unknown[]): Promise<DBResult>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
