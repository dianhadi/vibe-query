"use client";

import { useState, useRef, useMemo } from "react";
import { ConnectionConfig, ColumnMapping, Dialect } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, Check, ChevronDown, ChevronRight, FileSpreadsheet, AlertTriangle } from "lucide-react";

interface FileImportProps {
  connectionConfig: ConnectionConfig;
  onImported: () => void;
  dialect?: Dialect;
  dbSchema?: string;
}

const PG_DATA_TYPES = [
  // String
  "TEXT", "VARCHAR", "CHAR",
  // Integer
  "SMALLINT", "INTEGER", "BIGINT",
  // Auto-increment
  "SERIAL", "BIGSERIAL",
  // Decimal / float
  "NUMERIC", "REAL", "DOUBLE PRECISION",
  // Boolean
  "BOOLEAN",
  // Date / time
  "DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ",
  // Other
  "UUID", "JSONB", "BYTEA",
];

const MYSQL_DATA_TYPES = [
  // String
  "TEXT", "VARCHAR", "CHAR",
  // Integer
  "TINYINT", "SMALLINT", "INT", "BIGINT",
  // Auto-increment
  "INT AUTO_INCREMENT", "BIGINT AUTO_INCREMENT",
  // Decimal / float
  "DECIMAL", "FLOAT", "DOUBLE",
  // Boolean
  "BOOLEAN",
  // Date / time
  "DATE", "TIME", "DATETIME", "TIMESTAMP",
  // Other
  "JSON", "BLOB",
];

interface SheetConfig {
  sheetName: string;
  tableName: string;
  rowCount: number;
  previewRows: Record<string, string>[];
  columnMappings: ColumnMapping[];
  tableExists: boolean;
  similarity: number;
  suggestedName: string;
}

export default function FileImport({ connectionConfig, onImported, dialect = "postgresql", dbSchema = "public" }: FileImportProps) {
  const DATA_TYPES = dialect === "mysql" ? MYSQL_DATA_TYPES : PG_DATA_TYPES;
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"upload" | "preview" | "done">("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single-sheet state
  const [tableName, setTableName] = useState("");
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [tableExists, setTableExists] = useState(false);
  const [tableSimilarity, setTableSimilarity] = useState(0);
  const [tableSuggestedName, setTableSuggestedName] = useState("");
  const [similarityThreshold, setSimilarityThreshold] = useState(0.5);

  // Multi-sheet state
  const [isMultiSheet, setIsMultiSheet] = useState(false);
  const [sheets, setSheets] = useState<SheetConfig[]>([]);
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set([0]));

  // FK options (shared across single/multi)
  const [fkOptions, setFkOptions] = useState<{ table: string; column: string }[]>([]);
  const groupedFkOptions = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const { table, column } of fkOptions) {
      if (!groups.has(table)) groups.set(table, []);
      groups.get(table)!.push(column);
    }
    return Array.from(groups.entries()).map(([table, columns]) => ({ table, columns }));
  }, [fkOptions]);

  // Done state
  const [doneResult, setDoneResult] = useState<{ rowsInserted: number; sheetsImported?: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setTableName(f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_"));
    setError(null);
    setStage("upload");
    setColumnMappings([]);
    setPreviewRows([]);
    setTableExists(false);
    setTableSimilarity(0);
    setTableSuggestedName("");
    setSheets([]);
    setFkOptions([]);
    setIsMultiSheet(false);
    setExpandedSheets(new Set([0]));
  }

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("tableName", tableName);
    form.append("connectionConfig", JSON.stringify(connectionConfig));
    form.append("dbSchema", dbSchema);
    form.append("confirmed", "false");

    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.isMultiSheet) {
        setIsMultiSheet(true);
        setFkOptions(data.fkOptions ?? []);
        const threshold: number = data.similarityThreshold ?? 0.5;
        setSimilarityThreshold(threshold);
        // Auto-rename sheets with very different existing tables
        const resolvedSheets = (data.sheets as SheetConfig[]).map((s) => {
          if (s.tableExists && s.similarity < threshold) {
            return { ...s, tableName: s.suggestedName, tableExists: false };
          }
          return s;
        });
        setSheets(resolvedSheets);
        setStage("preview");
      } else {
        setIsMultiSheet(false);
        setColumnMappings(data.preview.columnMappings);
        setPreviewRows(data.preview.previewRows ?? []);
        setFkOptions(data.fkOptions ?? []);
        const threshold: number = data.preview.similarityThreshold ?? 0.5;
        setSimilarityThreshold(threshold);
        const exists: boolean = data.preview.tableExists ?? false;
        const similarity: number = data.preview.similarity ?? 0;
        const suggested: string = data.preview.suggestedName ?? tableName;
        if (exists && similarity < threshold) {
          // Auto-rename: different structure, no friction
          setTableName(suggested);
          setTableExists(false);
          setTableSimilarity(similarity);
          setTableSuggestedName(suggested);
        } else {
          setTableExists(exists);
          setTableSimilarity(similarity);
          setTableSuggestedName(suggested);
        }
        setStage("preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setLoading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("connectionConfig", JSON.stringify(connectionConfig));
    form.append("dbSchema", dbSchema);
    form.append("confirmed", "true");

    if (isMultiSheet) {
      form.append("sheetsConfig", JSON.stringify(
        sheets.map((s) => ({ sheetName: s.sheetName, tableName: s.tableName, columnMappings: s.columnMappings }))
      ));
    } else {
      form.append("tableName", tableName);
      form.append("columnMappings", JSON.stringify(columnMappings));
    }

    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setDoneResult(data.result);
        setStage("done");
        onImported();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function updateSingleMapping(index: number, field: keyof ColumnMapping, value: string) {
    setColumnMappings((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  }

  function updateSingleRef(index: number, value: string | null) {
    setColumnMappings((prev) => prev.map((m, i) => (i === index ? { ...m, references: value || null } : m)));
  }

  function updateSheetRef(sheetIdx: number, colIdx: number, value: string | null) {
    setSheets((prev) => prev.map((s, si) =>
      si !== sheetIdx ? s : {
        ...s,
        columnMappings: s.columnMappings.map((m, ci) => (ci === colIdx ? { ...m, references: value || null } : m)),
      }
    ));
  }

  function updateSinglePK(index: number, value: boolean) {
    setColumnMappings((prev) => prev.map((m, i) => (i === index ? { ...m, primaryKey: value || undefined, nullable: value ? false : m.nullable } : m)));
  }

  function updateSingleNullable(index: number, value: boolean) {
    setColumnMappings((prev) => prev.map((m, i) => (i === index ? { ...m, nullable: value } : m)));
  }

  function updateSheetPK(sheetIdx: number, colIdx: number, value: boolean) {
    setSheets((prev) => prev.map((s, si) =>
      si !== sheetIdx ? s : {
        ...s,
        columnMappings: s.columnMappings.map((m, ci) => (ci === colIdx ? { ...m, primaryKey: value || undefined, nullable: value ? false : m.nullable } : m)),
      }
    ));
  }

  function updateSheetNullable(sheetIdx: number, colIdx: number, value: boolean) {
    setSheets((prev) => prev.map((s, si) =>
      si !== sheetIdx ? s : {
        ...s,
        columnMappings: s.columnMappings.map((m, ci) => (ci === colIdx ? { ...m, nullable: value } : m)),
      }
    ));
  }

  function updateSheetMapping(sheetIdx: number, colIdx: number, field: keyof ColumnMapping, value: string) {
    setSheets((prev) => prev.map((s, si) =>
      si !== sheetIdx ? s : {
        ...s,
        columnMappings: s.columnMappings.map((m, ci) => (ci === colIdx ? { ...m, [field]: value } : m)),
      }
    ));
  }

  function updateSheetTableName(sheetIdx: number, value: string) {
    setSheets((prev) => prev.map((s, si) => si === sheetIdx ? { ...s, tableName: value, tableExists: false } : s));
  }

  function toggleSheet(idx: number) {
    setExpandedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  // ── Upload stage ──────────────────────────────────────────────────────────
  if (stage === "upload") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>File (.csv, .xlsx, .xls)</Label>
          <Input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
        </div>
        {file && !(file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) && (
          <div className="space-y-1">
            <Label htmlFor="tableName">Target Table Name</Label>
            <Input
              id="tableName"
              value={tableName}
              onChange={(e) => { setTableName(e.target.value); setTableExists(false); }}
              placeholder="my_table"
            />
          </div>
        )}
        {file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel file — sheet names will be used as table names (editable before import).
          </p>
        )}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {file && (
          <Button onClick={handlePreview} disabled={loading} className="gap-2">
            <Upload className="h-4 w-4" />
            {loading ? "Processing..." : "Preview Import"}
          </Button>
        )}
      </div>
    );
  }

  // ── Done stage ────────────────────────────────────────────────────────────
  if (stage === "done" && doneResult) {
    return (
      <div className="space-y-3">
        <Alert>
          <Check className="h-4 w-4" />
          <AlertDescription>
            {isMultiSheet
              ? <>Successfully imported <strong>{doneResult.rowsInserted}</strong> rows across <strong>{doneResult.sheetsImported}</strong> tables.</>
              : <>Successfully imported <strong>{doneResult.rowsInserted}</strong> rows into <strong>{tableName}</strong>.</>
            }
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => { setStage("upload"); setFile(null); if (inputRef.current) inputRef.current.value = ""; }}>
          Import another file
        </Button>
      </div>
    );
  }

  // ── Preview stage — multi-sheet ───────────────────────────────────────────
  if (stage === "preview" && isMultiSheet) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Sheets to Import</h3>
          <Badge variant="secondary">{sheets.length} sheets</Badge>
        </div>

        <div className="space-y-2">
          {sheets.map((sheet, si) => (
            <div key={sheet.sheetName} className="rounded-md border overflow-hidden">
              {/* Sheet header */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/40 hover:bg-muted/60 text-left text-sm transition-colors"
                onClick={() => toggleSheet(si)}
              >
                {expandedSheets.has(si) ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{sheet.sheetName}</span>
                <Badge variant="outline" className="text-xs ml-1">{sheet.rowCount} rows</Badge>
                {sheet.tableExists && (
                  <span title="Table already exists with similar structure — rename to continue" className="ml-1 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">→ </span>
                <Input
                  value={sheet.tableName}
                  onChange={(e) => { e.stopPropagation(); updateSheetTableName(si, e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-6 text-xs font-mono w-40 ml-1"
                  placeholder="table_name"
                />
              </button>

              {/* Sheet detail */}
              {expandedSheets.has(si) && (
                <div className="p-3 space-y-3">
                  {/* Column mappings */}
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-10 text-center">PK</TableHead>
                          <TableHead className="text-xs w-16 text-center">Nullable</TableHead>
                          <TableHead className="text-xs">Original</TableHead>
                          <TableHead className="text-xs">Column Name</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Foreign Key</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sheet.columnMappings.map((m, ci) => (
                          <TableRow key={ci}>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={!!m.primaryKey}
                                onCheckedChange={(v) => updateSheetPK(si, ci, !!v)}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={m.nullable !== false}
                                disabled={!!m.primaryKey}
                                onCheckedChange={(v) => updateSheetNullable(si, ci, !!v)}
                              />
                            </TableCell>
                            <TableCell className="text-xs font-mono">{m.originalName}</TableCell>
                            <TableCell>
                              <Input
                                value={m.mappedName}
                                onChange={(e) => updateSheetMapping(si, ci, "mappedName", e.target.value)}
                                className="h-7 text-xs font-mono"
                              />
                            </TableCell>
                            <TableCell>
                              <Select value={m.dataType} onValueChange={(v) => updateSheetMapping(si, ci, "dataType", v)}>
                                <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {DATA_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select value={m.references ?? "__none__"} onValueChange={(v) => updateSheetRef(si, ci, v === "__none__" ? null : v)}>
                                <SelectTrigger className="h-7 text-xs w-44"><SelectValue placeholder="— none —" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__" className="text-xs text-muted-foreground">— none —</SelectItem>
                                  {groupedFkOptions.map(({ table, columns }) => (
                                    <SelectGroup key={table}>
                                      <SelectLabel className="text-xs">{table}</SelectLabel>
                                      {columns.map((col) => (
                                        <SelectItem key={`${table}.${col}`} value={`${table}.${col}`} className="text-xs pl-6">{col}</SelectItem>
                                      ))}
                                    </SelectGroup>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Data preview */}
                  {sheet.previewRows.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none py-1">
                        Data preview (first {sheet.previewRows.length} rows)
                      </summary>
                      <div className="rounded-md border overflow-x-auto mt-1">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {sheet.columnMappings.map((m) => (
                                <TableHead key={m.originalName} className="text-xs whitespace-nowrap">{m.mappedName}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sheet.previewRows.map((row, ri) => (
                              <TableRow key={ri}>
                                {sheet.columnMappings.map((m) => (
                                  <TableCell key={m.originalName} className="text-xs font-mono whitespace-nowrap max-w-xs truncate">
                                    {row[m.originalName] ?? ""}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="flex gap-2">
          <Button onClick={handleCommit} disabled={loading || sheets.some((s) => s.tableExists)} className="gap-2">
            <Check className="h-4 w-4" />
            {loading ? "Importing..." : `Import ${sheets.length} tables`}
          </Button>
          <Button variant="outline" onClick={() => setStage("upload")} disabled={loading}>Back</Button>
        </div>
      </div>
    );
  }

  // ── Preview stage — single sheet / CSV ────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="tableNamePreview">Target Table Name</Label>
        <Input
          id="tableNamePreview"
          value={tableName}
          onChange={(e) => { setTableName(e.target.value); setTableExists(false); }}
          placeholder="my_table"
          className="font-mono"
        />
      </div>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">Column Mappings</h3>
        <Badge variant="secondary">{columnMappings.length} columns</Badge>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">PK</TableHead>
              <TableHead className="w-20 text-center">Nullable</TableHead>
              <TableHead>Original Name</TableHead>
              <TableHead>Column Name</TableHead>
              <TableHead>Data Type</TableHead>
              <TableHead>Foreign Key</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columnMappings.map((m, i) => (
              <TableRow key={i}>
                <TableCell className="text-center">
                  <Checkbox
                    checked={!!m.primaryKey}
                    onCheckedChange={(v) => updateSinglePK(i, !!v)}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={m.nullable !== false}
                    disabled={!!m.primaryKey}
                    onCheckedChange={(v) => updateSingleNullable(i, !!v)}
                  />
                </TableCell>
                <TableCell className="text-xs font-mono">{m.originalName}</TableCell>
                <TableCell>
                  <Input value={m.mappedName} onChange={(e) => updateSingleMapping(i, "mappedName", e.target.value)} className="h-7 text-xs font-mono" />
                </TableCell>
                <TableCell>
                  <Select value={m.dataType} onValueChange={(v) => updateSingleMapping(i, "dataType", v)}>
                    <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DATA_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={m.references ?? "__none__"} onValueChange={(v) => updateSingleRef(i, v === "__none__" ? null : v)}>
                    <SelectTrigger className="h-7 text-xs w-44"><SelectValue placeholder="— none —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-muted-foreground">— none —</SelectItem>
                      {groupedFkOptions.map(({ table, columns }) => (
                        <SelectGroup key={table}>
                          <SelectLabel className="text-xs">{table}</SelectLabel>
                          {columns.map((col) => (
                            <SelectItem key={`${table}.${col}`} value={`${table}.${col}`} className="text-xs pl-6">{col}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {previewRows.length > 0 && (
        <>
          <h3 className="font-semibold text-sm">Data Preview (first {previewRows.length} rows)</h3>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columnMappings.map((m) => (
                    <TableHead key={m.originalName} className="text-xs whitespace-nowrap">{m.mappedName}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, i) => (
                  <TableRow key={i}>
                    {columnMappings.map((m) => (
                      <TableCell key={m.originalName} className="text-xs font-mono whitespace-nowrap max-w-xs truncate">
                        {row[m.originalName] ?? ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {tableExists && tableSimilarity >= similarityThreshold && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Table <strong className="font-mono">{tableName}</strong> already exists with a similar structure.
            Rename it above to continue — suggested: <strong className="font-mono">{tableSuggestedName}</strong>
          </AlertDescription>
        </Alert>
      )}

      {!tableExists && tableSuggestedName && tableSuggestedName !== tableName && tableSimilarity < similarityThreshold && tableSimilarity > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            A table with the original name existed but had a different structure — auto-renamed to <strong className="font-mono">{tableName}</strong>.
          </AlertDescription>
        </Alert>
      )}

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="flex gap-2">
        <Button onClick={handleCommit} disabled={loading || tableExists} className="gap-2">
          <Check className="h-4 w-4" />
          {loading ? "Importing..." : `Import into "${tableName}"`}
        </Button>
        <Button variant="outline" onClick={() => setStage("upload")} disabled={loading}>Back</Button>
      </div>
    </div>
  );
}
