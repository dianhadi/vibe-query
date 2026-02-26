import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db/client";
import { executeMutation, executeMutationPreview } from "@/lib/db/execute";
import { parseCSV } from "@/lib/parsers/csv";
import { parseExcel } from "@/lib/parsers/excel";
import { ConnectionConfig, ColumnMapping } from "@/types";

function inferType(values: string[]): string {
  const nonEmpty = values.filter((v) => v !== "");
  if (nonEmpty.every((v) => /^-?\d+$/.test(v))) return "INTEGER";
  if (nonEmpty.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return "NUMERIC";
  if (nonEmpty.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))) return "TIMESTAMP";
  if (nonEmpty.every((v) => v === "true" || v === "false")) return "BOOLEAN";
  return "TEXT";
}

function buildImportSQL(
  tableName: string,
  columnMappings: ColumnMapping[],
  rows: Record<string, string>[]
): string[] {
  const cols = columnMappings.map((c) => `"${c.mappedName}" ${c.dataType}`).join(", ");
  const createSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (${cols});`;

  if (rows.length === 0) return [createSQL];

  const colNames = columnMappings.map((c) => `"${c.mappedName}"`).join(", ");
  const valuePlaceholders = rows.map((row) => {
    const vals = columnMappings.map((c) => {
      const val = row[c.originalName] ?? "";
      if (val === "") return "NULL";
      return `'${val.replace(/'/g, "''")}'`;
    });
    return `(${vals.join(", ")})`;
  });

  const batchSize = 500;
  const insertSQLs: string[] = [];
  for (let i = 0; i < valuePlaceholders.length; i += batchSize) {
    const batch = valuePlaceholders.slice(i, i + batchSize).join(",\n  ");
    insertSQLs.push(`INSERT INTO "${tableName}" (${colNames}) VALUES\n  ${batch};`);
  }

  return [createSQL, ...insertSQLs];
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const tableName = formData.get("tableName") as string | null;
  const connectionConfigStr = formData.get("connectionConfig") as string | null;
  const confirmedStr = formData.get("confirmed") as string | null;
  const columnMappingsStr = formData.get("columnMappings") as string | null;

  if (!file || !tableName || !connectionConfigStr) {
    return NextResponse.json({ error: "file, tableName, and connectionConfig are required" }, { status: 400 });
  }

  let connectionConfig: ConnectionConfig;
  try {
    connectionConfig = JSON.parse(connectionConfigStr);
  } catch {
    return NextResponse.json({ error: "Invalid connectionConfig JSON" }, { status: 400 });
  }

  const confirmed = confirmedStr === "true";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    if (file.name.endsWith(".csv")) {
      parsed = parseCSV(buffer.toString("utf-8"));
    } else {
      parsed = parseExcel(buffer);
    }

    let columnMappings: ColumnMapping[];
    if (columnMappingsStr) {
      columnMappings = JSON.parse(columnMappingsStr);
    } else {
      columnMappings = parsed.headers.map((h, i) => {
        const colValues = parsed.rows.map((r) => r[h] ?? "");
        return {
          originalName: h,
          mappedName: h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
          dataType: inferType(colValues),
        };
      });
    }

    const sqls = buildImportSQL(tableName, columnMappings, parsed.rows);
    const combinedSQL = sqls.join("\n");

    if (!confirmed) {
      return NextResponse.json({
        sql: combinedSQL,
        preview: {
          rowCount: parsed.rows.length,
          previewRows: parsed.rows.slice(0, 10),
          columnMappings,
        },
      });
    } else {
      await withClient(connectionConfig, async (client) => {
        for (const sql of sqls) {
          await executeMutation(client, sql);
        }
      });
      return NextResponse.json({ result: { rowsInserted: parsed.rows.length } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
