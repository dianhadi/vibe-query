import { DBClient } from "./client-types";
import { Schema, TableInfo, ForeignKey, IndexInfo } from "@/types";
import { Dialect, quoteIdent } from "./dialect";

export async function listSchemas(client: DBClient, dialect: Dialect = "postgresql"): Promise<string[]> {
  if (dialect === "mysql") {
    // MySQL databases ≠ pg schemas; disable the schema switcher for MySQL
    return [];
  }
  const res = await client.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      AND schema_name NOT LIKE 'pg_%'
    ORDER BY
      CASE WHEN schema_name = 'public' THEN 0 ELSE 1 END,
      schema_name
  `);
  return res.rows.map((r) => r.schema_name as string);
}

export async function introspectSchema(
  client: DBClient,
  schemaName = "public",
  dialect: Dialect = "postgresql"
): Promise<Schema> {
  if (dialect === "mysql") {
    return introspectMySQLSchema(client, schemaName);
  }
  return introspectPgSchema(client, schemaName);
}

async function introspectPgSchema(client: DBClient, schemaName: string): Promise<Schema> {
  const tablesRes = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [schemaName]
  );

  const tables: TableInfo[] = await Promise.all(
    tablesRes.rows.map(async (t) => {
      const colsRes = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schemaName, t.table_name as string]
      );
      return {
        name: t.table_name as string,
        columns: colsRes.rows.map((c) => ({
          name: c.column_name as string,
          type: c.data_type as string,
          nullable: c.is_nullable === "YES",
        })),
        indexes: await introspectPgIndexes(client, schemaName, t.table_name as string),
      };
    })
  );

  const fkRes = await client.query(
    `SELECT
       kcu.table_name,
       kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
     FROM information_schema.table_constraints AS tc
     JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage AS ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1`,
    [schemaName]
  );

  const foreignKeys: ForeignKey[] = fkRes.rows.map((r) => ({
    table: r.table_name as string,
    column: r.column_name as string,
    referencedTable: r.foreign_table_name as string,
    referencedColumn: r.foreign_column_name as string,
  }));

  return { tables, foreignKeys };
}

async function introspectMySQLSchema(client: DBClient, schemaName: string): Promise<Schema> {
  const tablesRes = await client.query(
    `SELECT TABLE_NAME AS table_name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [schemaName]
  );

  const tables: TableInfo[] = await Promise.all(
    tablesRes.rows.map(async (t) => {
      const colsRes = await client.query(
        `SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [schemaName, t.table_name as string]
      );
      return {
        name: t.table_name as string,
        columns: colsRes.rows.map((c) => ({
          name: c.column_name as string,
          type: c.data_type as string,
          nullable: c.is_nullable === "YES",
        })),
        indexes: await introspectMySQLIndexes(client, t.table_name as string),
      };
    })
  );

  const fkRes = await client.query(
    `SELECT
       TABLE_NAME AS table_name,
       COLUMN_NAME AS column_name,
       REFERENCED_TABLE_NAME AS foreign_table_name,
       REFERENCED_COLUMN_NAME AS foreign_column_name
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [schemaName]
  );

  const foreignKeys: ForeignKey[] = fkRes.rows.map((r) => ({
    table: r.table_name as string,
    column: r.column_name as string,
    referencedTable: r.foreign_table_name as string,
    referencedColumn: r.foreign_column_name as string,
  }));

  return { tables, foreignKeys };
}

async function introspectPgIndexes(client: DBClient, schemaName: string, tableName: string): Promise<IndexInfo[]> {
  const res = await client.query(
    `SELECT
       i.relname AS index_name,
       ix.indisunique AS is_unique,
       ix.indisprimary AS is_primary,
       pg_get_indexdef(i.oid) AS definition,
       ARRAY(
         SELECT pg_get_indexdef(i.oid, n, true)
         FROM generate_series(1, ix.indnkeyatts) AS n
         ORDER BY n
       ) AS columns
     FROM pg_class t
     JOIN pg_namespace ns ON ns.oid = t.relnamespace
     JOIN pg_index ix ON t.oid = ix.indrelid
     JOIN pg_class i ON i.oid = ix.indexrelid
     WHERE ns.nspname = $1 AND t.relname = $2
     ORDER BY ix.indisprimary DESC, i.relname`,
    [schemaName, tableName]
  );

  return res.rows.map((row) => ({
    name: row.index_name as string,
    columns: Array.isArray(row.columns) ? row.columns.map(String) : [],
    unique: Boolean(row.is_unique),
    primary: Boolean(row.is_primary),
    definition: row.definition as string,
  }));
}

async function introspectMySQLIndexes(client: DBClient, tableName: string): Promise<IndexInfo[]> {
  const res = await client.query(`SHOW INDEX FROM ${quoteIdent(tableName, "mysql")}`);
  const byName = new Map<string, IndexInfo & { seq: Map<string, number> }>();

  for (const row of res.rows) {
    const name = String(row.Key_name ?? row.key_name ?? "");
    const column = String(row.Column_name ?? row.column_name ?? "");
    const seq = Number(row.Seq_in_index ?? row.seq_in_index ?? 0);
    if (!name || !column) continue;

    const existing = byName.get(name) ?? {
      name,
      columns: [],
      unique: Number(row.Non_unique ?? row.non_unique ?? 1) === 0,
      primary: name === "PRIMARY",
      seq: new Map<string, number>(),
    };
    existing.columns.push(column);
    existing.seq.set(column, seq);
    byName.set(name, existing);
  }

  return Array.from(byName.values()).map(({ seq, ...index }) => ({
    ...index,
    columns: index.columns.sort((a, b) => (seq.get(a) ?? 0) - (seq.get(b) ?? 0)),
  }));
}

export function schemaToString(schema: Schema, schemaName = "public", dialect: Dialect = "postgresql"): string {
  const label = dialect === "mysql" ? "MySQL database" : "PostgreSQL schema";
  const lines: string[] = [`${label}: ${schemaName}`];
  for (const table of schema.tables) {
    lines.push(`Table: ${table.name}`);
    for (const col of table.columns) {
      lines.push(`  - ${col.name} (${col.type})${col.nullable ? "" : " NOT NULL"}`);
    }
    if (table.indexes && table.indexes.length > 0) {
      lines.push("  Indexes:");
      for (const index of table.indexes) {
        const markers = [index.primary ? "PRIMARY" : null, index.unique ? "UNIQUE" : null].filter(Boolean).join(" ");
        lines.push(`    - ${index.name} (${index.columns.join(", ")})${markers ? ` ${markers}` : ""}`);
      }
    }
  }
  if (schema.foreignKeys.length > 0) {
    lines.push("\nForeign Keys:");
    for (const fk of schema.foreignKeys) {
      lines.push(`  ${fk.table}.${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}`);
    }
  }
  return lines.join("\n");
}
