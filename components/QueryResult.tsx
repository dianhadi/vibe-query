"use client";

import { useState } from "react";
import { QueryResult as QueryResultType } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface QueryResultProps {
  sql: string;
  result: QueryResultType;
}

const PAGE_SIZE = 50;

export default function QueryResult({ sql, result }: QueryResultProps) {
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);

  const totalPages = Math.ceil(result.rows.length / PAGE_SIZE);
  const pageRows = result.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function copySQL() {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {/* SQL block */}
      <div className="relative rounded-md bg-muted border text-sm font-mono overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/60">
          <span className="text-xs text-muted-foreground">Generated SQL</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={copySQL}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <pre className="px-3 py-2 whitespace-pre-wrap break-all">{sql}</pre>
      </div>

      {/* Result table */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}
          </span>
          {result.columns.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {result.columns.length} columns
            </Badge>
          )}
        </div>
        {result.rows.length > 0 ? (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {result.columns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap text-xs">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row, i) => (
                    <TableRow key={i}>
                      {result.columns.map((col) => (
                        <TableCell key={col} className="text-xs font-mono whitespace-nowrap max-w-xs truncate">
                          {row[col] === null || row[col] === undefined
                            ? <span className="text-muted-foreground italic">null</span>
                            : String(row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No rows returned.</p>
        )}
      </div>
    </div>
  );
}
