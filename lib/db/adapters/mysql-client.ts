import type { PoolConnection, RowDataPacket, ResultSetHeader, FieldPacket } from "mysql2/promise";
import type { DBClient, DBResult } from "../client-types";

export class MySQLClientAdapter implements DBClient {
  constructor(private client: PoolConnection) {}

  async query(sql: string, params?: unknown[]): Promise<DBResult> {
    const [result, fields] = await this.client.query(sql, params);
    if (Array.isArray(result)) {
      const rows = result as RowDataPacket[];
      const fieldList = (fields as FieldPacket[]) ?? [];
      return {
        rows: rows.map((r) => ({ ...r }) as Record<string, unknown>),
        fields: fieldList.map((f) => ({ name: f.name })),
        rowCount: rows.length,
      };
    } else {
      const header = result as ResultSetHeader;
      return {
        rows: [],
        fields: [],
        rowCount: header.affectedRows ?? 0,
      };
    }
  }

  async beginTransaction(): Promise<void> {
    await this.client.beginTransaction();
  }

  async commit(): Promise<void> {
    await this.client.commit();
  }

  async rollback(): Promise<void> {
    await this.client.rollback();
  }
}
