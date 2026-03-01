import { DBClient } from "./client-types";
import { QueryResult, QueryType } from "@/types";
import { quoteIdent, Dialect } from "./dialect";

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

export function hasLimitClause(sql: string): boolean {
  return /\bLIMIT\b/i.test(sql);
}

/** Returns the top-level LIMIT value, or null if none. */
export function getLimitValue(sql: string): number | null {
  const match = /\bLIMIT\s+(\d+)\s*(?:OFFSET\s+\d+\s*)?;?\s*$/i.exec(sql.trim());
  return match ? parseInt(match[1], 10) : null;
}

/** Strips the trailing LIMIT … OFFSET … clause from a SQL string. */
export function stripLimitOffset(sql: string): string {
  return sql
    .trim()
    .replace(/;\s*$/, "")
    .replace(/\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i, "")
    .trim();
}

/** Strips any trailing ORDER BY clause and appends a new one (or none if col is null). */
export function applyOrderBy(sql: string, col: string | null, dir: "asc" | "desc", dialect: Dialect = "postgresql"): string {
  const stripped = sql
    .trim()
    .replace(/;\s*$/, "")
    .replace(/\s+ORDER\s+BY\s+.+$/i, "")
    .trim();
  if (!col) return stripped;
  const quoted = quoteIdent(col, dialect);
  return `${stripped} ORDER BY ${quoted} ${dir.toUpperCase()}`;
}

export async function executeSelect(
  client: DBClient,
  sql: string
): Promise<QueryResult> {
  const result = await client.query(sql);
  return {
    columns: result.fields.map((f) => f.name),
    rows: result.rows,
    rowCount: result.rowCount,
  };
}

export async function executeSelectPaginated(
  client: DBClient,
  baseSql: string,
  page: number,
  pageSize: number
): Promise<QueryResult> {
  const offset = page * pageSize;
  // Fetch one extra row to detect whether there's a next page
  const paginatedSQL = `${baseSql.replace(/;\s*$/, "")} LIMIT ${pageSize + 1} OFFSET ${offset}`;
  const result = await client.query(paginatedSQL);
  const hasMore = result.rows.length > pageSize;
  const rows = hasMore ? result.rows.slice(0, pageSize) : result.rows;
  return {
    columns: result.fields.map((f) => f.name),
    rows,
    rowCount: rows.length,
    hasMore,
  };
}

export async function executeMutationPreview(
  client: DBClient,
  sql: string
): Promise<{ rowsAffected: number; previewRows?: Record<string, unknown>[] }> {
  await client.beginTransaction();
  try {
    const result = await client.query(sql);
    const rowsAffected = result.rowCount;
    let previewRows: Record<string, unknown>[] | undefined;
    if (result.rows && result.rows.length > 0) {
      previewRows = result.rows.slice(0, 20);
    }
    await client.rollback();
    return { rowsAffected, previewRows };
  } catch (err) {
    await client.rollback();
    throw err;
  }
}

export async function executeMutation(
  client: DBClient,
  sql: string
): Promise<{ rowsAffected: number }> {
  const result = await client.query(sql);
  return { rowsAffected: result.rowCount };
}
