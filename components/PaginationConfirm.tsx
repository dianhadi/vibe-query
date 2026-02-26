"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PaginationConfirmProps {
  sql: string;
  pageSize: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PaginationConfirm({ sql, pageSize, onConfirm, onCancel }: PaginationConfirmProps) {
  return (
    <div className="space-y-4">
      {/* SQL block */}
      <div className="rounded-md bg-muted border text-sm font-mono overflow-x-auto">
        <div className="px-3 py-2 border-b bg-muted/60 text-xs text-muted-foreground">
          Generated SQL
        </div>
        <pre className="px-3 py-2 whitespace-pre-wrap break-all">{sql}</pre>
      </div>

      <Alert>
        <AlertDescription className="space-y-1">
          <p className="font-medium">This query has no LIMIT and may return a very large number of rows.</p>
          <p className="text-muted-foreground text-sm">
            To keep things safe and fast, results will be paginated at {pageSize} rows per page.
            Click below to proceed, or cancel to go back.
          </p>
        </AlertDescription>
      </Alert>

      <div className="flex gap-2">
        <Button onClick={onConfirm}>
          Show first {pageSize} rows (paginated)
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
