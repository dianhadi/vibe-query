import type { PoolClient } from "pg";
import type { DBClient, DBResult } from "../client-types";

export class PgClientAdapter implements DBClient {
  constructor(private client: PoolClient) {}

  async query(sql: string, params?: unknown[]): Promise<DBResult> {
    const result = await this.client.query(sql, params);
    return {
      rows: result.rows,
      fields: result.fields.map((f) => ({ name: f.name })),
      rowCount: result.rowCount ?? 0,
    };
  }

  async beginTransaction(): Promise<void> {
    await this.client.query("BEGIN");
  }

  async rollback(): Promise<void> {
    await this.client.query("ROLLBACK");
  }
}
