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
    if (sortCol !== col) return <span className="ml-1 opacity-20">⇅</span>;
    return (
      <span className="ml-1 opacity-80">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
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

  return (
    <div className="space-y-3">
      {/* SQL block */}
      <div className="rounded-md bg-muted border text-sm font-mono overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/60">
          <span className="text-xs text-muted-foreground">Generated SQL</span>
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <Button variant="default" size="sm" className="h-6 text-xs" onClick={handleRerun} disabled={!editedSql.trim()}>
                  Run
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={cancelEditing}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={startEditing}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={copySQL}>
                  {copied ? "Copied!" : "Copy"}
                </Button>
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
            <div className="flex items-center gap-2 text-sm">
              <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page === 0 || pageLoading}>
                Previous
              </Button>
              <span className="text-muted-foreground">Page {page + 1}</span>
              <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={!result.hasMore || pageLoading}>
                Next
              </Button>
              {pageLoading && (
                <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
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
            <div className="flex items-center gap-2 text-sm">
              <Button variant="outline" size="sm" onClick={() => setClientPage((p) => Math.max(0, p - 1))} disabled={clientPage === 0}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {clientPage + 1} of {clientTotalPages}
              </span>
              <Button variant="outline" size="sm" onClick={() => setClientPage((p) => Math.min(clientTotalPages - 1, p + 1))} disabled={clientPage === clientTotalPages - 1}>
                Next
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
