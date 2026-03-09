import { Pool as PgPool } from "pg";
import mysql from "mysql2/promise";
import { ConnectionConfig } from "@/types";
import { DBClient } from "./client-types";
import { PgClientAdapter } from "./adapters/pg-client";
import { MySQLClientAdapter } from "./adapters/mysql-client";

export async function withClient<T>(
  config: ConnectionConfig,
  fn: (client: DBClient) => Promise<T>,
  dbSchema?: string
): Promise<T> {
  const dialect = config.dialect ?? "postgresql";

  if (dialect === "mysql") {
    const pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 10000,
    });
    const connection = await pool.getConnection();
    try {
      return await fn(new MySQLClientAdapter(connection));
    } finally {
      connection.release();
      await pool.end();
    }
  } else {
    const pool = new PgPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionTimeoutMillis: 10000,
      max: 5,
    });
    const client = await pool.connect();
    try {
      const adapter = new PgClientAdapter(client);
      if (dbSchema && dbSchema !== "public") {
        await adapter.query(`SET search_path TO "${dbSchema}"`);
      }
      return await fn(adapter);
    } finally {
      client.release();
      await pool.end();
    }
  }
}
