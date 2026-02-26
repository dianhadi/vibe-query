import { Pool, PoolClient } from "pg";
import { ConnectionConfig } from "@/types";

export function createPool(config: ConnectionConfig): Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: 10000,
    max: 5,
  });
}

export async function withClient<T>(
  config: ConnectionConfig,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = createPool(config);
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}
