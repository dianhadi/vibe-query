"use client";

import { useState, useEffect } from "react";
import { QueryResult as QueryResultType, PAGE_SIZES, PageSize } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ReactMarkdown from "react-markdown";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Copy,
  Check,
  Zap,
  Play,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FileDown,
} from "lucide-react";
import Papa from "papaparse";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QueryResultProps {
  baseSql: string;
  result: QueryResultType;
  paginated?: boolean;
  page?: number;
  pageSize?: number;
  pageLoading?: boolean;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: PageSize) => void;
  onRerun?: (sql: string) => void;
  onSortChange?: (col: string | null, dir: "asc" | "desc") => void;
  sortCol?: string | null;
  sortDir?: SortDir;
  onAnalyze?: (sql: string) => void;
  analysis?: string | null;
  analyzeLoading?: boolean;
  analyzeError?: string | null;
}

type SortDir = "asc" | "desc";

const CLIENT_PAGE_SIZE = 50;

export default function QueryResult({
  baseSql,
  result,
  paginated = false,
  page = 0,
  pageSize = 50,
  pageLoading = false,
  onPageChange,
  onPageSizeChange,
  onRerun,
  onSortChange,
  sortCol = null,
  sortDir = "asc",
  onAnalyze,
  analysis,
  analyzeLoading = false,
  analyzeError,
}: QueryResultProps) {
  const [clientPage, setClientPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedSql, setEditedSql] = useState("");

  // Reset page when new results arrive
  useEffect(() => {
    setClientPage(0);
  }, [result]);

  const displaySql = paginated
    ? `${baseSql} LIMIT ${pageSize} OFFSET ${page * pageSize}`
    : baseSql;

  const clientTotalPages = Math.ceil(result.rows.length / CLIENT_PAGE_SIZE);
  const displayRows = paginated
    ? result.rows
    : result.rows.slice(clientPage * CLIENT_PAGE_SIZE, (clientPage + 1) * CLIENT_PAGE_SIZE);

  const rowStart = paginated ? page * pageSize + 1 : clientPage * CLIENT_PAGE_SIZE + 1;
  const rowEnd = rowStart + displayRows.length - 1;

  function handleSort(col: string) {
    if (!onSortChange) return;
    if (sortCol === col) {
      if (sortDir === "asc") {
        onSortChange(col, "desc");
      } else {
        // third click — clear sort
        onSortChange(null, "asc");
      }
    } else {
      onSortChange(col, "asc");
    }
  }

  function sortIndicator(col: string) {
    if (sortCol !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 inline h-3 w-3 opacity-80" />
      : <ArrowDown className="ml-1 inline h-3 w-3 opacity-80" />;
  }

  async function copySQL() {
    await navigator.clipboard.writeText(editing ? editedSql : displaySql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startEditing() {
    setEditedSql(displaySql);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditedSql("");
  }

  function handleRerun() {
    const sql = editedSql.trim();
    if (!sql) return;
    setEditing(false);
    setEditedSql("");
    onRerun?.(sql);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleRerun();
    }
    if (e.key === "Escape") {
      cancelEditing();
    }
  }

  function exportCSV() {
    const csv = Papa.unparse({
      fields: result.columns,
      data: result.rows.map((row) =>
        result.columns.map((col) => (row[col] === null || row[col] === undefined ? "" : row[col]))
      ),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      {/* SQL block */}
      <div className="rounded-md bg-muted border text-sm font-mono overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/60">
          <span className="text-xs text-muted-foreground">Generated SQL</span>
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <Button variant="default" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleRerun} disabled={!editedSql.trim()}>
                  <Play className="h-3 w-3" /> Run
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={cancelEditing} title="Cancel">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={startEditing} title="Edit SQL">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={copySQL} title={copied ? "Copied!" : "Copy SQL"}>
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                {onAnalyze && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={() => onAnalyze(displaySql)}
                    disabled={analyzeLoading}
                    title="Analyze query plan"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {analyzeLoading ? "Analyzing..." : "Analyze"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {editing ? (
          <Textarea
            value={editedSql}
            onChange={(e) => setEditedSql(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono text-sm border-0 rounded-none focus-visible:ring-0 min-h-[80px] resize-y bg-muted"
            autoFocus
          />
        ) : (
          <pre className="px-3 py-2 whitespace-pre-wrap break-all">{displaySql}</pre>
        )}

        {editing && (
          <div className="px-3 py-1.5 border-t bg-muted/40 text-[10px] text-muted-foreground">
            ⌘↵ to run · Esc to cancel
          </div>
        )}
      </div>

      {/* Analysis panel */}
      {analyzeLoading && (
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground animate-pulse">
          Running EXPLAIN ANALYZE and consulting AI...
        </div>
      )}
      {analyzeError && (
        <Alert variant="destructive">
          <AlertDescription>{analyzeError}</AlertDescription>
        </Alert>
      )}
      {analysis && !analyzeLoading && (
        <div className="rounded-md border bg-muted/30 overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/60 flex items-center gap-2">
            <span className="text-xs font-medium">Query Analysis</span>
            <Badge variant="secondary" className="text-xs">EXPLAIN ANALYZE</Badge>
          </div>
          <div className="px-4 py-3 prose prose-sm max-w-none text-sm
            [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1
            [&_ul]:my-1 [&_li]:my-0.5
            [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
            [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:text-xs">
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Result metadata */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {paginated
            ? `Rows ${rowStart}–${rowEnd}${result.hasMore ? "+" : ""}`
            : `${result.rowCount} row${result.rowCount !== 1 ? "s" : ""}`}
        </span>
        {result.columns.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {result.columns.length} columns
          </Badge>
        )}
        {sortCol && (
          <Badge variant="outline" className="text-xs">
            sorted by {sortCol} {sortDir === "asc" ? "↑" : "↓"}
          </Badge>
        )}
        {result.rows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 px-2 text-xs gap-1"
            onClick={exportCSV}
            title="Export to CSV"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Table */}
      {displayRows.length > 0 ? (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {result.columns.map((col) => (
                    <TableHead
                      key={col}
                      className="whitespace-nowrap text-xs cursor-pointer select-none hover:bg-muted/60 transition-colors"
                      onClick={() => handleSort(col)}
                    >
                      {col}
                      {sortIndicator(col)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row, i) => (
                  <TableRow key={i} className={pageLoading ? "opacity-50" : ""}>
                    {result.columns.map((col) => (
                      <TableCell key={col} className="text-xs font-mono whitespace-nowrap max-w-xs truncate">
                        {row[col] === null || row[col] === undefined ? (
                          <span className="text-muted-foreground italic">null</span>
                        ) : (
                          String(row[col])
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Server-side pagination controls */}
          {paginated && onPageChange && (
            <div className="flex items-center gap-1.5 text-sm">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onPageChange(page - 1)} disabled={page === 0 || pageLoading} title="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums min-w-[1.5rem] text-center">{page + 1}</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => onPageChange(page + 1)} disabled={!result.hasMore || pageLoading} title="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {pageLoading && (
                <span className="text-xs text-muted-foreground animate-pulse ml-1">Loading...</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange?.(Number(v) as PageSize)} disabled={pageLoading}>
                  <SelectTrigger className="h-7 w-16 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={String(s)} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Client-side pagination controls */}
          {!paginated && clientTotalPages > 1 && (
            <div className="flex items-center gap-1.5 text-sm">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setClientPage((p) => Math.max(0, p - 1))} disabled={clientPage === 0} title="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums min-w-[1.5rem] text-center">
                {clientPage + 1} / {clientTotalPages}
              </span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setClientPage((p) => Math.min(clientTotalPages - 1, p + 1))} disabled={clientPage === clientTotalPages - 1} title="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No rows returned.</p>
      )}
    </div>
  );
}
