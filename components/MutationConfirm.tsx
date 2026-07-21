"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QueryType } from "@/types";
import { Check, X, AlertTriangle, Wrench, Pencil, Play } from "lucide-react";

interface MutationConfirmProps {
  sql: string;
  queryType: QueryType;
  preview: { rowsAffected: number; previewRows?: Record<string, unknown>[] } | null;
  onCommit: () => void;
  onCancel: () => void;
  loading: boolean;
  error?: string | null;
  onRepair?: (sql: string, error: string) => void;
  onRerun?: (sql: string) => void;
}

export default function MutationConfirm({
  sql,
  queryType,
  preview,
  onCommit,
  onCancel,
  loading,
  error,
  onRepair,
  onRerun,
}: MutationConfirmProps) {
  const [ddlConfirmText, setDdlConfirmText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editedSql, setEditedSql] = useState("");
  const isDDL = queryType === "DDL";
  const ddlConfirmed = !isDDL || ddlConfirmText === "CONFIRM";

  function startEditing() {
    setEditedSql(sql);
    setEditing(true);
    setDdlConfirmText("");
  }

  function cancelEditing() {
    setEditing(false);
    setEditedSql("");
  }

  function handleRerun() {
    const nextSql = editedSql.trim();
    if (!nextSql) return;
    setEditing(false);
    setEditedSql("");
    setDdlConfirmText("");
    onRerun?.(nextSql);
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
    <div className="space-y-4">
      {/* SQL preview */}
      <div className="relative rounded-md bg-muted border text-sm font-mono overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/60">
          <span className="text-xs text-muted-foreground">SQL to Execute</span>
          {onRerun && (
            <div className="flex items-center gap-1">
              {editing ? (
                <>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={handleRerun}
                    disabled={loading || !editedSql.trim()}
                  >
                    <Play className="h-3 w-3" />
                    Run
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={cancelEditing}
                    disabled={loading}
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={startEditing}
                  disabled={loading}
                  title="Edit SQL"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
        {editing ? (
          <>
            <Textarea
              value={editedSql}
              onChange={(e) => setEditedSql(e.target.value)}
              onKeyDown={handleKeyDown}
              className="font-mono text-sm border-0 rounded-none focus-visible:ring-0 min-h-[96px] resize-y bg-muted"
              disabled={loading}
              autoFocus
            />
            <div className="px-3 py-1.5 border-t bg-muted/40 text-[10px] text-muted-foreground">
              Cmd/Ctrl+Enter to run. Esc to cancel.
            </div>
          </>
        ) : (
          <pre className="px-3 py-2 whitespace-pre-wrap break-all">{sql}</pre>
        )}
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
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="mb-2 font-semibold">
              This is a DDL statement (CREATE/ALTER/DROP). This action may be irreversible.
            </p>
            <p className="mb-2 text-sm">This statement has not been executed yet.</p>
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
          <AlertDescription>
            <div className="space-y-2">
              <p>{error}</p>
              {onRepair && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => onRepair(sql, error)}
                  disabled={loading}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  Repair SQL
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          variant="destructive"
          onClick={onCommit}
          disabled={loading || !ddlConfirmed}
          className="flex-1 gap-2"
        >
          <Check className="h-4 w-4" />
          {loading ? "Committing..." : "Commit Changes"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={loading} className="gap-2">
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
