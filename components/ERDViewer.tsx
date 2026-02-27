"use client";

import { useEffect, useRef, useState } from "react";
import { Schema } from "@/types";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ERDViewerProps {
  schema: Schema;
  dbSchema: string;
  connectionConfig: object;
}

export default function ERDViewer({ schema, dbSchema }: ERDViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setMermaidCode(null);

    try {
      const res = await fetch("/api/erd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema, dbSchema }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMermaidCode(data.mermaid);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate ERD");
    } finally {
      setLoading(false);
    }
  }

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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Mermaid render failed");
        }
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
        <Button onClick={generate} disabled={loading} size="sm">
          {loading ? "Generating..." : mermaidCode ? "Regenerate" : "Generate ERD"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {mermaidCode && (
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {/* Rendered diagram */}
          {!error && (
            <div
              ref={containerRef}
              className="flex-1 rounded-md border bg-white overflow-auto p-4 min-h-[300px] flex items-start justify-center"
            />
          )}

          {/* Raw Mermaid code toggle */}
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
