import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db/client";
import { executeMutation } from "@/lib/db/execute";
import { parseCSV } from "@/lib/parsers/csv";
import { parseExcel, parseExcelAllSheets } from "@/lib/parsers/excel";
import { ConnectionConfig, ColumnMapping } from "@/types";
import { Dialect, quoteIdent, mapImportType } from "@/lib/db/dialect";

const INT16_MIN = BigInt(-32_768);
const INT16_MAX = BigInt( 32_767);
const INT32_MIN = BigInt(-2_147_483_648);
const INT32_MAX = BigInt( 2_147_483_647);

const RE_UUID       = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_INTEGER    = /^-?\d+$/;
const RE_NUMERIC    = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const RE_DATE       = /^\d{4}-\d{2}-\d{2}$/;
const RE_TIME       = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const RE_TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*([Zz]|[+-]\d{2}:?\d{2})$/;
const RE_TIMESTAMP  = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function isValidJSON(v: string) {
  const t = v.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try { JSON.parse(t); return true; } catch { /* not json */ }
  }
  return false;
}

function inferType(values: string[]): string {
  const nonEmpty = values.filter((v) => v !== "");
  if (nonEmpty.length === 0) return "TEXT";

  if (nonEmpty.every((v) => v === "true" || v === "false" || v === "t" || v === "f" || v === "yes" || v === "no")) return "BOOLEAN";
  if (nonEmpty.every((v) => RE_UUID.test(v))) return "UUID";

  if (nonEmpty.every((v) => RE_INTEGER.test(v))) {
    const bigs = nonEmpty.map((v) => BigInt(v));
    if (bigs.every((n) => n >= INT16_MIN && n <= INT16_MAX)) return "SMALLINT";
    if (bigs.every((n) => n >= INT32_MIN && n <= INT32_MAX)) return "INTEGER";
    return "BIGINT";
  }

  if (nonEmpty.every((v) => RE_NUMERIC.test(v))) return "NUMERIC";

  if (nonEmpty.every((v) => RE_TIMESTAMPTZ.test(v))) return "TIMESTAMPTZ";
  if (nonEmpty.every((v) => RE_TIMESTAMP.test(v))) return "TIMESTAMP";
  if (nonEmpty.every((v) => RE_DATE.test(v))) return "DATE";
  if (nonEmpty.every((v) => RE_TIME.test(v))) return "TIME";

  if (nonEmpty.every((v) => isValidJSON(v))) return "JSONB";

  return "TEXT";
}

const SIMILARITY_THRESHOLD = 0.5;

interface TableConflict {
  exists: boolean;
  /** 0–1 fraction of column names in common between existing table and import */
  similarity: number;
  /** First available name like tableName_1, tableName_2, … */
  suggestedName: string;
}

interface FKOption {
  table: string;
  column: string;
}

interface PreviewDBData {
  conflicts: Map<string, TableConflict>;
  fkOptions: FKOption[];
}

/** Single DB connection that fetches both table conflict info and FK-eligible columns. */
async function fetchPreviewDBData(
  config: ConnectionConfig,
  tables: { tableName: string; importColumns: string[] }[],
  dbSchema?: string
): Promise<PreviewDBData> {
  const conflicts = new Map<string, TableConflict>(
    tables.map(({ tableName }) => [tableName, { exists: false, similarity: 0, suggestedName: tableName }])
  );
  const fkOptions: FKOption[] = [];
  const dialect: Dialect = config.dialect ?? "postgresql";
  // For MySQL use config.database as schemaName; for pg use the selected schema (default "public")
  const schemaName = dialect === "mysql" ? config.database : (dbSchema ?? "public");

  try {
    await withClient(config, async (client) => {
      if (dialect === "mysql") {
        // FK-eligible columns (PRIMARY KEY + UNIQUE) for MySQL
        const fkRes = await client.query(
          `SELECT DISTINCT c.TABLE_NAME AS table_name, c.COLUMN_NAME AS column_name
           FROM information_schema.COLUMNS c
           JOIN information_schema.KEY_COLUMN_USAGE kcu
             ON kcu.TABLE_SCHEMA = c.TABLE_SCHEMA
             AND kcu.TABLE_NAME = c.TABLE_NAME
             AND kcu.COLUMN_NAME = c.COLUMN_NAME
           JOIN information_schema.TABLE_CONSTRAINTS tc
             ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
             AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
           WHERE c.TABLE_SCHEMA = ?
             AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE')
           ORDER BY c.TABLE_NAME, c.COLUMN_NAME`,
          [schemaName]
        );
        fkOptions.push(...fkRes.rows.map((r) => ({ table: r.table_name as string, column: r.column_name as string })));

        for (const { tableName, importColumns } of tables) {
          const colRes = await client.query(
            "SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
            [schemaName, tableName]
          );
          if (colRes.rows.length === 0) continue;

          const existingCols = new Set(colRes.rows.map((r) => r.column_name as string));
          const overlap = importColumns.filter((c) => existingCols.has(c)).length;
          const similarity = overlap / Math.max(existingCols.size, importColumns.length);

          let suggestedName = `${tableName}_1`;
          for (let i = 1; i <= 9; i++) {
            const candidate = `${tableName}_${i}`;
            const check = await client.query(
              "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
              [schemaName, candidate]
            );
            if (check.rows.length === 0) { suggestedName = candidate; break; }
          }

          conflicts.set(tableName, { exists: true, similarity, suggestedName });
        }
      } else {
        // PostgreSQL
        const fkRes = await client.query(
          `SELECT DISTINCT c.table_name, c.column_name
           FROM information_schema.columns c
           JOIN information_schema.key_column_usage kcu
             ON kcu.table_schema = c.table_schema
             AND kcu.table_name = c.table_name
             AND kcu.column_name = c.column_name
           JOIN information_schema.table_constraints tc
             ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
           WHERE c.table_schema = $1
             AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
           ORDER BY c.table_name, c.column_name`,
          [schemaName]
        );
        fkOptions.push(...fkRes.rows.map((r) => ({ table: r.table_name as string, column: r.column_name as string })));

        for (const { tableName, importColumns } of tables) {
          const colRes = await client.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
            [schemaName, tableName]
          );
          if (colRes.rows.length === 0) continue;

          const existingCols = new Set(colRes.rows.map((r) => r.column_name as string));
          const overlap = importColumns.filter((c) => existingCols.has(c)).length;
          const similarity = overlap / Math.max(existingCols.size, importColumns.length);

          let suggestedName = `${tableName}_1`;
          for (let i = 1; i <= 9; i++) {
            const candidate = `${tableName}_${i}`;
            const check = await client.query(
              "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
              [schemaName, candidate]
            );
            if (check.rows.length === 0) { suggestedName = candidate; break; }
          }

          conflicts.set(tableName, { exists: true, similarity, suggestedName });
        }
      }
    });
  } catch {
    // return safe defaults — don't block the preview on a check failure
  }
  return { conflicts, fkOptions };
}

function inferFKReference(mappedName: string, fkTargetSet: Set<string>): string | null {
  if (!mappedName.endsWith("_id")) return null;
  const base = mappedName.slice(0, -3);
  for (const candidate of [`${base}.id`, `${base}s.id`, `${base}es.id`]) {
    if (fkTargetSet.has(candidate)) return candidate;
  }
  return null;
}

function toSafeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function singularize(name: string): string {
  if (name.endsWith("ies")) return name.slice(0, -3) + "y"; // companies → company
  if (name.endsWith("ses") || name.endsWith("xes") || name.endsWith("zes")) return name.slice(0, -2); // boxes → box
  if (name.endsWith("s") && name.length > 1) return name.slice(0, -1); // orders → order
  return name;
}

function isPKCandidate(mappedName: string, tableName: string): boolean {
  if (mappedName === "id") return true;
  if (tableName === "") return false;
  const singular = singularize(tableName);
  return mappedName === `${tableName}_id` || mappedName === `${singular}_id`;
}

function inferMappings(headers: string[], rows: Record<string, string>[], fkTargetSet = new Set<string>(), tableName = ""): ColumnMapping[] {
  return headers.map((h) => {
    const mappedName = toSafeName(h) || `col_${headers.indexOf(h)}`;
    const isPK = isPKCandidate(mappedName, tableName);
    const dataType = isPK ? "SERIAL" : inferType(rows.map((r) => r[h] ?? ""));
    return {
      originalName: h,
      mappedName,
      dataType,
      primaryKey: isPK || undefined,
      nullable: isPK ? false : true,
      references: inferFKReference(mappedName, fkTargetSet),
    };
  });
}

function buildImportSQL(
  tableName: string,
  columnMappings: ColumnMapping[],
  rows: Record<string, string>[],
  dialect: Dialect = "postgresql",
  schemaName?: string
): string[] {
  const q = (name: string) => quoteIdent(name, dialect);
  // Qualify table name with schema when using a non-public PostgreSQL schema
  const qualifyTable = (t: string) =>
    dialect === "postgresql" && schemaName && schemaName !== "public"
      ? `${q(schemaName)}.${q(t)}`
      : q(t);

  const cols = columnMappings.map((c) => {
    const mappedType = mapImportType(c.dataType, dialect);
    const isAutoInc = dialect === "mysql" && (mappedType === "INT AUTO_INCREMENT" || mappedType === "BIGINT AUTO_INCREMENT");
    const notNull = c.nullable === false || c.primaryKey;

    let def: string;
    if (isAutoInc) {
      // MySQL: AUTO_INCREMENT must be inline with PRIMARY KEY
      def = `${q(c.mappedName)} ${mappedType} PRIMARY KEY`;
    } else {
      def = `${q(c.mappedName)} ${mappedType}`;
      if (notNull && !c.primaryKey) def += " NOT NULL";
      if (c.primaryKey) def += " PRIMARY KEY";
    }

    if (c.references && !isAutoInc) {
      const dot = c.references.indexOf(".");
      if (dot > 0) {
        const refTable = c.references.slice(0, dot);
        const refCol = c.references.slice(dot + 1);
        def += ` REFERENCES ${qualifyTable(refTable)}(${q(refCol)})`;
      }
    }
    return def;
  }).join(", ");

  const createSQL = `CREATE TABLE ${qualifyTable(tableName)} (${cols});`;
  if (rows.length === 0) return [createSQL];

  const colNames = columnMappings.map((c) => q(c.mappedName)).join(", ");
  const valuePlaceholders = rows.map((row) => {
    const vals = columnMappings.map((c) => {
      const val = row[c.originalName] ?? "";
      if (val === "") return "NULL";
      // MySQL BOOLEAN is TINYINT(1) — string 'true'/'false' is rejected; convert to 1/0
      if (dialect === "mysql" && c.dataType.toUpperCase() === "BOOLEAN") {
        const lower = val.toLowerCase();
        if (["true", "t", "yes"].includes(lower)) return "1";
        if (["false", "f", "no"].includes(lower)) return "0";
      }
      return `'${val.replace(/'/g, "''")}'`;
    });
    return `(${vals.join(", ")})`;
  });

  const batchSize = 500;
  const insertSQLs: string[] = [];
  for (let i = 0; i < valuePlaceholders.length; i += batchSize) {
    const batch = valuePlaceholders.slice(i, i + batchSize).join(",\n  ");
    insertSQLs.push(`INSERT INTO ${qualifyTable(tableName)} (${colNames}) VALUES\n  ${batch};`);
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
  const connectionConfigStr = formData.get("connectionConfig") as string | null;
  const confirmedStr = formData.get("confirmed") as string | null;
  const dbSchema = (formData.get("dbSchema") as string | null) ?? "public";

  if (!file || !connectionConfigStr) {
    return NextResponse.json({ error: "file and connectionConfig are required" }, { status: 400 });
  }

  let connectionConfig: ConnectionConfig;
  try {
    connectionConfig = JSON.parse(connectionConfigStr);
  } catch {
    return NextResponse.json({ error: "Invalid connectionConfig JSON" }, { status: 400 });
  }

  const dialect: Dialect = connectionConfig.dialect ?? "postgresql";
  const confirmed = confirmedStr === "true";
  const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Multi-sheet Excel path ──────────────────────────────────────────────
    if (isExcel) {
      const sheets = parseExcelAllSheets(buffer).filter((s) => s.data.headers.length > 0);
      const isMultiSheet = sheets.length > 1;

      if (isMultiSheet) {
        if (!confirmed) {
          // First pass: build preliminary table names to query DB
          const prelimNames = sheets.map((s) =>
            toSafeName(s.sheetName) || toSafeName(file.name.replace(/\.[^.]+$/, "")) + `_${s.sheetName}`
          );
          const { conflicts, fkOptions } = await fetchPreviewDBData(
            connectionConfig,
            sheets.map((_s, i) => ({ tableName: prelimNames[i], importColumns: [] })),
            dbSchema
          );
          const fkTargetSet = new Set(fkOptions.map((o) => `${o.table}.${o.column}`));

          // Second pass: build full previews with FK-aware mappings
          const sheetsWithConflicts = sheets.map((s, i) => {
            const tableName = prelimNames[i];
            const mappings = inferMappings(s.data.headers, s.data.rows, fkTargetSet, tableName);
            const c = conflicts.get(tableName);
            return {
              sheetName: s.sheetName,
              tableName,
              rowCount: s.data.rows.length,
              previewRows: s.data.rows.slice(0, 10),
              columnMappings: mappings,
              tableExists: c?.exists ?? false,
              similarity: c?.similarity ?? 0,
              suggestedName: c?.suggestedName ?? tableName,
            };
          });
          return NextResponse.json({ isMultiSheet: true, sheets: sheetsWithConflicts, fkOptions, similarityThreshold: SIMILARITY_THRESHOLD });
        } else {
          // Commit: sheetsConfig contains per-sheet tableName + columnMappings
          const sheetsConfigStr = formData.get("sheetsConfig") as string | null;
          if (!sheetsConfigStr) {
            return NextResponse.json({ error: "sheetsConfig required for multi-sheet commit" }, { status: 400 });
          }
          const sheetsConfig: { sheetName: string; tableName: string; columnMappings: ColumnMapping[] }[] = JSON.parse(sheetsConfigStr);

          let totalRows = 0;
          await withClient(connectionConfig, async (client) => {
            if (dialect === "postgresql") {
              await client.beginTransaction();
              try {
                for (const cfg of sheetsConfig) {
                  const sheetData = sheets.find((s) => s.sheetName === cfg.sheetName);
                  if (!sheetData) continue;
                  const sqls = buildImportSQL(cfg.tableName, cfg.columnMappings, sheetData.data.rows, dialect, dbSchema);
                  for (const sql of sqls) await executeMutation(client, sql);
                  totalRows += sheetData.data.rows.length;
                }
                await client.commit();
              } catch (err) {
                await client.rollback();
                throw err;
              }
            } else {
              // MySQL: DDL can't be rolled back — track created tables and DROP on failure
              const createdTables: string[] = [];
              try {
                for (const cfg of sheetsConfig) {
                  const sheetData = sheets.find((s) => s.sheetName === cfg.sheetName);
                  if (!sheetData) continue;
                  const sqls = buildImportSQL(cfg.tableName, cfg.columnMappings, sheetData.data.rows, dialect, dbSchema);
                  for (let i = 0; i < sqls.length; i++) {
                    await executeMutation(client, sqls[i]);
                    if (i === 0) createdTables.push(cfg.tableName); // first SQL = CREATE TABLE
                  }
                  totalRows += sheetData.data.rows.length;
                }
              } catch (err) {
                for (const t of [...createdTables].reverse()) {
                  try { await client.query(`DROP TABLE IF EXISTS ${quoteIdent(t, dialect)}`); } catch { /* ignore */ }
                }
                throw err;
              }
            }
          }, dbSchema);
          return NextResponse.json({ result: { rowsInserted: totalRows, sheetsImported: sheetsConfig.length } });
        }
      }
    }

    // ── Single-sheet (CSV or single-sheet Excel) ────────────────────────────
    const tableName = formData.get("tableName") as string | null;
    if (!tableName) {
      return NextResponse.json({ error: "tableName is required" }, { status: 400 });
    }

    const parsed = isExcel ? parseExcel(buffer) : parseCSV(buffer.toString("utf-8"));
    const columnMappingsStr = formData.get("columnMappings") as string | null;
    const columnMappings: ColumnMapping[] = columnMappingsStr
      ? JSON.parse(columnMappingsStr)
      : inferMappings(parsed.headers, parsed.rows, new Set(), tableName);

    const sqls = buildImportSQL(tableName, columnMappings, parsed.rows, dialect, dbSchema);

    if (!confirmed) {
      const importColumns = columnMappings.map((m) => m.mappedName);
      const { conflicts, fkOptions } = await fetchPreviewDBData(connectionConfig, [{ tableName, importColumns }], dbSchema);
      const fkTargetSet = new Set(fkOptions.map((o) => `${o.table}.${o.column}`));
      // Re-infer mappings now that we have FK targets (only when not user-supplied)
      const finalMappings: ColumnMapping[] = columnMappingsStr
        ? columnMappings
        : inferMappings(parsed.headers, parsed.rows, fkTargetSet, tableName);
      const c = conflicts.get(tableName);
      return NextResponse.json({
        sql: buildImportSQL(tableName, finalMappings, parsed.rows, dialect, dbSchema).join("\n"),
        isMultiSheet: false,
        fkOptions,
        preview: {
          rowCount: parsed.rows.length,
          previewRows: parsed.rows.slice(0, 10),
          columnMappings: finalMappings,
          tableExists: c?.exists ?? false,
          similarity: c?.similarity ?? 0,
          suggestedName: c?.suggestedName ?? tableName,
          similarityThreshold: SIMILARITY_THRESHOLD,
        },
      });
    } else {
      await withClient(connectionConfig, async (client) => {
        if (dialect === "postgresql") {
          await client.beginTransaction();
          try {
            for (const sql of sqls) await executeMutation(client, sql);
            await client.commit();
          } catch (err) {
            await client.rollback();
            throw err;
          }
        } else {
          // MySQL: DDL can't be rolled back — DROP the table on INSERT failure
          let tableCreated = false;
          try {
            for (const sql of sqls) {
              await executeMutation(client, sql);
              if (!tableCreated) tableCreated = true; // first SQL = CREATE TABLE
            }
          } catch (err) {
            if (tableCreated) {
              try { await client.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName, dialect)}`); } catch { /* ignore */ }
            }
            throw err;
          }
        }
      }, dbSchema);
      return NextResponse.json({ result: { rowsInserted: parsed.rows.length } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
