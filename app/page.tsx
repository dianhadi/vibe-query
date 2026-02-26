"use client";

import { useState } from "react";
import { ConnectionConfig, Schema, QueryHistoryItem, QueryType, QueryResult as QueryResultType } from "@/types";
import ConnectionForm from "@/components/ConnectionForm";

import SchemaExplorer from "@/components/SchemaExplorer";
import PromptInput from "@/components/PromptInput";
import QueryResult from "@/components/QueryResult";
import MutationConfirm from "@/components/MutationConfirm";
import QueryHistory from "@/components/QueryHistory";
import FileImport from "@/components/FileImport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

type AppState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "select_result"; sql: string; result: QueryResultType }
  | { kind: "mutation_preview"; sql: string; queryType: QueryType; preview: { rowsAffected: number; previewRows?: Record<string, unknown>[] } | null; previewLoading: boolean; commitLoading: boolean; error?: string }
  | { kind: "mutation_done"; sql: string; queryType: QueryType; rowsAffected: number }
  | { kind: "error"; message: string };

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig | null>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [appState, setAppState] = useState<AppState>({ kind: "idle" });
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState("query");
  const [currentPrompt, setCurrentPrompt] = useState("");

  function handleConnected(config: ConnectionConfig, s: Schema) {
    setConnectionConfig(config);
    setSchema(s);
    setConnected(true);
  }

  function addHistory(item: Omit<QueryHistoryItem, "id" | "timestamp">) {
    setHistory((prev) => [
      ...prev,
      { ...item, id: crypto.randomUUID(), timestamp: new Date() },
    ]);
  }

  async function handlePrompt(prompt: string) {
    if (!schema || !connectionConfig) return;
    setCurrentPrompt(prompt);
    setAppState({ kind: "loading" });

    try {
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, schema }),
      });
      const genData = await genRes.json();
      if (genData.error) {
        setAppState({ kind: "error", message: genData.error });
        return;
      }

      const { sql, queryType } = genData;

      if (queryType === "SELECT") {
        const qRes = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql, connectionConfig }),
        });
        const qData = await qRes.json();
        if (qData.error) {
          setAppState({ kind: "error", message: qData.error });
          return;
        }
        setAppState({ kind: "select_result", sql, result: qData });
        addHistory({ prompt, sql, queryType, rowCount: qData.rowCount });
      } else {
        setAppState({
          kind: "mutation_preview",
          sql,
          queryType,
          preview: null,
          previewLoading: true,
          commitLoading: false,
        });

        const mRes = await fetch("/api/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql, connectionConfig, confirmed: false }),
        });
        const mData = await mRes.json();

        if (mData.error) {
          setAppState({
            kind: "mutation_preview",
            sql,
            queryType,
            preview: null,
            previewLoading: false,
            commitLoading: false,
            error: mData.error,
          });
          return;
        }

        setAppState({
          kind: "mutation_preview",
          sql,
          queryType,
          preview: mData.preview ?? null,
          previewLoading: false,
          commitLoading: false,
        });
      }
    } catch (err) {
      setAppState({ kind: "error", message: err instanceof Error ? err.message : "Unexpected error" });
    }
  }

  async function handleCommit() {
    if (appState.kind !== "mutation_preview" || !connectionConfig) return;
    const { sql, queryType } = appState;

    setAppState({ ...appState, commitLoading: true, error: undefined });

    try {
      const res = await fetch("/api/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, connectionConfig, confirmed: true }),
      });
      const data = await res.json();
      if (data.error) {
        setAppState({ ...appState, commitLoading: false, error: data.error });
        return;
      }
      setAppState({ kind: "mutation_done", sql, queryType, rowsAffected: data.result.rowsAffected });
      addHistory({ prompt: currentPrompt, sql, queryType, rowCount: data.result.rowsAffected });
    } catch (err) {
      setAppState({
        ...appState,
        commitLoading: false,
        error: err instanceof Error ? err.message : "Commit failed",
      });
    }
  }

  function handleCancel() {
    setAppState({ kind: "idle" });
  }

  function handleHistorySelect(item: QueryHistoryItem) {
    setCurrentPrompt(item.prompt);
    setActiveTab("query");
  }

  function handleImported() {
    if (!connectionConfig) return;
    fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connectionConfig),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setSchema(d.schema);
      });
  }

  if (!connected || !schema || !connectionConfig) {
    return <ConnectionForm onConnected={handleConnected} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Toaster />

      {/* Left sidebar: schema */}
      <aside className="w-56 border-r flex flex-col shrink-0">
        <div className="px-3 py-3 border-b flex items-center justify-between">
          <span className="font-bold text-sm">vibe-query</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={() => {
              setConnected(false);
              setSchema(null);
              setConnectionConfig(null);
            }}
          >
            Disconnect
          </Button>
        </div>
        <SchemaExplorer schema={schema} />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b px-4">
            <TabsList className="h-10">
              <TabsTrigger value="query">Query</TabsTrigger>
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="history">History ({history.length})</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="query" className="flex-1 overflow-auto p-4 space-y-4 mt-0">
            <PromptInput
              onSubmit={handlePrompt}
              loading={appState.kind === "loading"}
            />

            <Separator />

            {appState.kind === "idle" && (
              <p className="text-sm text-muted-foreground">
                Type a natural language query above and press Run.
              </p>
            )}

            {appState.kind === "loading" && (
              <p className="text-sm text-muted-foreground animate-pulse">Generating SQL...</p>
            )}

            {appState.kind === "error" && (
              <Alert variant="destructive">
                <AlertDescription>{appState.message}</AlertDescription>
              </Alert>
            )}

            {appState.kind === "select_result" && (
              <QueryResult sql={appState.sql} result={appState.result} />
            )}

            {appState.kind === "mutation_preview" && (
              <MutationConfirm
                sql={appState.sql}
                queryType={appState.queryType}
                preview={appState.preview}
                onCommit={handleCommit}
                onCancel={handleCancel}
                loading={appState.commitLoading || appState.previewLoading}
                error={appState.error}
              />
            )}

            {appState.kind === "mutation_done" && (
              <div className="space-y-3">
                <Alert>
                  <AlertDescription>
                    Committed. <strong>{appState.rowsAffected}</strong> row
                    {appState.rowsAffected !== 1 ? "s" : ""} affected.
                  </AlertDescription>
                </Alert>
                <div className="relative rounded-md bg-muted border text-sm font-mono overflow-x-auto">
                  <pre className="px-3 py-2 whitespace-pre-wrap break-all">{appState.sql}</pre>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="import" className="flex-1 overflow-auto p-4 mt-0">
            <FileImport connectionConfig={connectionConfig} onImported={handleImported} />
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-0 h-full">
            <QueryHistory history={history} onSelect={handleHistorySelect} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
