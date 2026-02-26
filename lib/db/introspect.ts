import { PoolClient } from "pg";
import { Schema, TableInfo, ForeignKey } from "@/types";

export async function listSchemas(client: PoolClient): Promise<string[]> {
  const res = await client.query<{ schema_name: string }>(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      AND schema_name NOT LIKE 'pg_%'
    ORDER BY
      CASE WHEN schema_name = 'public' THEN 0 ELSE 1 END,
      schema_name
  `);
  return res.rows.map((r) => r.schema_name);
}

export async function introspectSchema(
  client: PoolClient,
  schemaName = "public"
): Promise<Schema> {
  const tablesRes = await client.query<{ table_name: string }>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `,
    [schemaName]
  );

  const tables: TableInfo[] = await Promise.all(
    tablesRes.rows.map(async (t) => {
      const colsRes = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `,
        [schemaName, t.table_name]
      );
      return {
        name: t.table_name,
        columns: colsRes.rows.map((c) => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === "YES",
        })),
      };
    })
  );

  const fkRes = await client.query<{
    table_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_column_name: string;
  }>(
    `
    SELECT
      kcu.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1
  `,
    [schemaName]
  );

  const foreignKeys: ForeignKey[] = fkRes.rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    referencedTable: r.foreign_table_name,
    referencedColumn: r.foreign_column_name,
  }));

  return { tables, foreignKeys };
}

export function schemaToString(schema: Schema, schemaName = "public"): string {
  const lines: string[] = [`PostgreSQL schema: ${schemaName}`];
  for (const table of schema.tables) {
    lines.push(`Table: ${table.name}`);
    for (const col of table.columns) {
      lines.push(`  - ${col.name} (${col.type})${col.nullable ? "" : " NOT NULL"}`);
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
