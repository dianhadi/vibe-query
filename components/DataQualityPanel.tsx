"use client";

import { DataQualityPlan } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Play, RefreshCw } from "lucide-react";

interface DataQualityPanelProps {
  plan: DataQualityPlan | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  onRunCheck: (sql: string, title: string) => void;
}

function severityVariant(severity: "low" | "medium" | "high"): "secondary" | "outline" | "destructive" {
  if (severity === "high") return "destructive";
  if (severity === "medium") return "outline";
  return "secondary";
}

export default function DataQualityPanel({
  plan,
  loading,
  error,
  onGenerate,
  onRunCheck,
}: DataQualityPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Data Quality Checks</p>
          <p className="text-xs text-muted-foreground">
            Generate safe read-only audit queries from schema metadata.
          </p>
        </div>
        <Button onClick={onGenerate} disabled={loading} size="sm" className="gap-2">
          {plan
            ? <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            : <ClipboardCheck className="h-3.5 w-3.5" />}
          {loading ? "Generating..." : plan ? "Regenerate" : "Generate Checks"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground animate-pulse">
          Planning audit checks...
        </div>
      )}

      {!plan && !loading && !error && (
        <p className="text-sm text-muted-foreground">
          Click Generate Checks to create suggested audit queries.
        </p>
      )}

      {plan && !loading && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{plan.summary}</p>
          {plan.checks.map((check, index) => (
            <div key={`${check.title}-${index}`} className="rounded-md border bg-muted/30 overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant={severityVariant(check.severity)} className="text-xs">
                    {check.severity}
                  </Badge>
                  <span className="truncate text-sm font-medium">{check.title}</span>
                  <Badge variant="secondary" className="text-xs">{check.table}</Badge>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  onClick={() => onRunCheck(check.sql, check.title)}
                >
                  <Play className="h-3.5 w-3.5" />
                  Run Check
                </Button>
              </div>
              <div className="space-y-2 px-3 py-2">
                <p className="text-xs text-muted-foreground">{check.reason}</p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted px-3 py-2 font-mono text-xs">
                  {check.sql}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
