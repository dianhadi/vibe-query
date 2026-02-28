"use client";

import { useEffect, useRef } from "react";
import { Schema } from "@/types";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GitBranch, RefreshCw } from "lucide-react";

interface ERDViewerProps {
  schema: Schema;
  dbSchema: string;
  mermaidCode: string | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}

export default function ERDViewer({
  schema,
  dbSchema,
  mermaidCode,
  loading,
  error,
  onGenerate,
}: ERDViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Render mermaid diagram whenever mermaidCode changes
  useEffect(() => {
    if (!mermaidCode || !containerRef.current) return;

    let cancelled = false;

    async function render() {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });

      if (cancelled || !containerRef.current) return;

      try {
        const id = `erd-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidCode!);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        // render error is surfaced via the error prop from parent
        console.error("Mermaid render error:", err);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [mermaidCode]);

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Entity Relationship Diagram</p>
          <p className="text-xs text-muted-foreground">
            AI-generated from <span className="font-mono">{dbSchema}</span> schema · {schema.tables.length} tables
          </p>
        </div>
        <Button onClick={onGenerate} disabled={loading} size="sm" className="gap-2">
          {mermaidCode
            ? <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            : <GitBranch className="h-3.5 w-3.5" />}
          {loading ? "Generating..." : mermaidCode ? "Regenerate" : "Generate ERD"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {mermaidCode && !error && (
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <div
            ref={containerRef}
            className="flex-1 rounded-md border bg-white overflow-auto p-4 min-h-[300px] flex items-start justify-center"
          />

          <details className="rounded-md border text-xs">
            <summary className="px-3 py-2 cursor-pointer text-muted-foreground hover:text-foreground select-none">
              Mermaid source
            </summary>
            <pre className="px-3 pb-3 pt-1 whitespace-pre-wrap break-all font-mono overflow-x-auto">
              {mermaidCode}
            </pre>
          </details>
        </div>
      )}

      {!mermaidCode && !loading && !error && (
        <p className="text-sm text-muted-foreground">
          Click "Generate ERD" to create a diagram from your current schema.
        </p>
      )}
    </div>
  );
}
