import { PoolClient } from "pg";
import { QueryResult, QueryType } from "@/types";

export function detectQueryType(sql: string): QueryType {
  const trimmed = sql.trim().toUpperCase();
  if (/^(INSERT|UPDATE|DELETE|TRUNCATE)/.test(trimmed)) return "INSERT";
  if (/^(CREATE|ALTER|DROP)/.test(trimmed)) return "DDL";
  return "SELECT";
}

export function classifyQueryType(sql: string): QueryType {
  const trimmed = sql.trim().toUpperCase();
  if (/^INSERT/.test(trimmed)) return "INSERT";
  if (/^UPDATE/.test(trimmed)) return "UPDATE";
  if (/^DELETE/.test(trimmed)) return "DELETE";
  if (/^TRUNCATE/.test(trimmed)) return "DELETE";
  if (/^(CREATE|ALTER|DROP)/.test(trimmed)) return "DDL";
  return "SELECT";
}

export async function executeSelect(
  client: PoolClient,
  sql: string
): Promise<QueryResult> {
  const result = await client.query(sql);
  return {
    columns: result.fields.map((f) => f.name),
    rows: result.rows,
    rowCount: result.rowCount ?? 0,
  };
}

export async function executeMutationPreview(
  client: PoolClient,
  sql: string
): Promise<{ rowsAffected: number; previewRows?: Record<string, unknown>[] }> {
  await client.query("BEGIN");
  try {
    const result = await client.query(sql);
    const rowsAffected = result.rowCount ?? 0;
    let previewRows: Record<string, unknown>[] | undefined;
    if (result.rows && result.rows.length > 0) {
      previewRows = result.rows.slice(0, 20);
    }
    await client.query("ROLLBACK");
    return { rowsAffected, previewRows };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function executeMutation(
  client: PoolClient,
  sql: string
): Promise<{ rowsAffected: number }> {
  const result = await client.query(sql);
  return { rowsAffected: result.rowCount ?? 0 };
}
