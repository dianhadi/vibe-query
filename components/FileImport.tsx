"use client";

import { useState, useRef } from "react";
import { ConnectionConfig, ColumnMapping } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FileImportProps {
  connectionConfig: ConnectionConfig;
  onImported: () => void;
}

const DATA_TYPES = ["TEXT", "INTEGER", "NUMERIC", "BOOLEAN", "TIMESTAMP", "DATE"];

export default function FileImport({ connectionConfig, onImported }: FileImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [tableName, setTableName] = useState("");
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewSql, setPreviewSql] = useState("");
  const [stage, setStage] = useState<"upload" | "preview" | "done">("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rowsInserted: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setTableName(f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_"));
    setError(null);
    setStage("upload");
    setColumnMappings([]);
    setPreviewRows([]);
  }

  async function handlePreview() {
    if (!file || !tableName) return;
    setLoading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("tableName", tableName);
    form.append("connectionConfig", JSON.stringify(connectionConfig));
    form.append("confirmed", "false");

    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setColumnMappings(data.preview.columnMappings);
        setPreviewRows(data.preview.previewRows ?? []);
        setPreviewSql(data.sql);
        setStage("preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file || !tableName) return;
    setLoading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("tableName", tableName);
    form.append("connectionConfig", JSON.stringify(connectionConfig));
    form.append("confirmed", "true");
    form.append("columnMappings", JSON.stringify(columnMappings));

    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data.result);
        setStage("done");
        onImported();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function updateMapping(index: number, field: keyof ColumnMapping, value: string) {
    setColumnMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  }

  return (
    <div className="space-y-4">
      {stage === "upload" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>File (.csv, .xlsx, .xls)</Label>
            <Input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
            />
          </div>
          {file && (
            <div className="space-y-1">
              <Label htmlFor="tableName">Target Table Name</Label>
              <Input
                id="tableName"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="my_table"
              />
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {file && (
            <Button onClick={handlePreview} disabled={loading || !tableName}>
              {loading ? "Processing..." : "Preview Import"}
            </Button>
          )}
        </div>
      )}

      {stage === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Column Mappings</h3>
            <Badge variant="secondary">{columnMappings.length} columns</Badge>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Original Name</TableHead>
                  <TableHead>Column Name</TableHead>
                  <TableHead>Data Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {columnMappings.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-mono">{m.originalName}</TableCell>
                    <TableCell>
                      <Input
                        value={m.mappedName}
                        onChange={(e) => updateMapping(i, "mappedName", e.target.value)}
                        className="h-7 text-xs font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={m.dataType} onValueChange={(v) => updateMapping(i, "dataType", v)}>
                        <SelectTrigger className="h-7 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">
                              {t}
                            </SelectItem>
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
                        <TableHead key={m.originalName} className="text-xs whitespace-nowrap">
                          {m.mappedName}
                        </TableHead>
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

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button onClick={handleCommit} disabled={loading}>
              {loading ? "Importing..." : `Import into "${tableName}"`}
            </Button>
            <Button variant="outline" onClick={() => setStage("upload")} disabled={loading}>
              Back
            </Button>
          </div>
        </div>
      )}

      {stage === "done" && result && (
        <Alert>
          <AlertDescription>
            Successfully imported <strong>{result.rowsInserted}</strong> rows into <strong>{tableName}</strong>.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
