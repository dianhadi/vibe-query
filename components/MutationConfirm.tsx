"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { QueryType } from "@/types";

interface MutationConfirmProps {
  sql: string;
  queryType: QueryType;
  preview: { rowsAffected: number; previewRows?: Record<string, unknown>[] } | null;
  onCommit: () => void;
  onCancel: () => void;
  loading: boolean;
  error?: string | null;
}

export default function MutationConfirm({
  sql,
  queryType,
  preview,
  onCommit,
  onCancel,
  loading,
  error,
}: MutationConfirmProps) {
  const [ddlConfirmText, setDdlConfirmText] = useState("");
  const isDDL = queryType === "DDL";
  const ddlConfirmed = !isDDL || ddlConfirmText === "CONFIRM";

  return (
    <div className="space-y-4">
      {/* SQL preview */}
      <div className="relative rounded-md bg-muted border text-sm font-mono overflow-x-auto">
        <div className="px-3 py-2 border-b bg-muted/60 text-xs text-muted-foreground">
          SQL to Execute
        </div>
        <pre className="px-3 py-2 whitespace-pre-wrap break-all">{sql}</pre>
      </div>

      {/* Preview info */}
      {preview && (
        <Alert>
          <AlertDescription>
            <strong>Dry-run preview:</strong> This query would affect{" "}
            <strong>{preview.rowsAffected}</strong> row{preview.rowsAffected !== 1 ? "s" : ""}.
          </AlertDescription>
        </Alert>
      )}

      {/* DDL extra confirmation */}
      {isDDL && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="mb-2 font-semibold">
              This is a DDL statement (CREATE/ALTER/DROP). This action may be irreversible.
            </p>
            <p className="mb-2 text-sm">Type <code className="font-mono bg-muted px-1">CONFIRM</code> to proceed:</p>
            <Input
              value={ddlConfirmText}
              onChange={(e) => setDdlConfirmText(e.target.value)}
              placeholder="CONFIRM"
              className="font-mono"
            />
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          variant="destructive"
          onClick={onCommit}
          disabled={loading || !ddlConfirmed}
          className="flex-1"
        >
          {loading ? "Committing..." : "Commit Changes"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
