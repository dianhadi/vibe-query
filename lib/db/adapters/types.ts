import { ConnectionConfig, Schema, QueryResult } from "@/types";

export interface DBAdapter {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  introspectSchema(): Promise<Schema>;
}
