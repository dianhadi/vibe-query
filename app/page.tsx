"use client";

import { useState } from "react";
import {
  ConnectionConfig, Schema, QueryHistoryItem, QueryType,
  QueryResult as QueryResultType, PageSize, DEFAULT_PAGE_SIZE,
} from "@/types";
import { getLimitValue, stripLimitOffset, classifyQueryType } from "@/lib/db/execute";
import ConnectionForm from "@/components/ConnectionForm";
import SchemaExplorer from "@/components/SchemaExplorer";
import PromptInput from "@/components/PromptInput";
import QueryResult from "@/components/QueryResult";
import MutationConfirm from "@/components/MutationConfirm";
import QueryHistory from "@/components/QueryHistory";
import FileImport from "@/components/FileImport";
import PaginationConfirm from "@/components/PaginationConfirm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

type AppState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "pagination_confirm"; baseSql: string }
  | { kind: "select_result"; baseSql: string; result: QueryResultType; page: number; pageSize: number; paginated: boolean; pageLoading: boolean }
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
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

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

  async function runPaginatedSelect(baseSql: string, page: number, size: PageSize, prompt: string) {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: baseSql, connectionConfig, page, pageSize: size }),
    });
    const data = await res.json();
    if (data.error) {
      setAppState({ kind: "error", message: data.error });
      return;
    }
    setAppState({ kind: "select_result", baseSql, result: data, page, pageSize: size, paginated: true, pageLoading: false });
    if (page === 0) addHistory({ prompt, sql: baseSql, queryType: "SELECT", rowCount: data.rowCount });
  }

  async function runDirectSelect(sql: string, prompt: string) {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql, connectionConfig }),
    });
    const data = await res.json();
    if (data.error) {
      setAppState({ kind: "error", message: data.error });
      return;
    }
    setAppState({ kind: "select_result", baseSql: sql, result: data, page: 0, pageSize, paginated: false, pageLoading: false });
    addHistory({ prompt, sql, queryType: "SELECT", rowCount: data.rowCount });
  }

  async function processSQL(sql: string, prompt: string) {
    const queryType = classifyQueryType(sql);

    if (queryType === "SELECT") {
      const limitValue = getLimitValue(sql);
      if (limitValue === null) {
        setAppState({ kind: "pagination_confirm", baseSql: sql });
      } else if (limitValue === pageSize) {
        await runPaginatedSelect(stripLimitOffset(sql), 0, pageSize, prompt);
      } else {
        await runDirectSelect(sql, prompt);
      }
    } else {
      setAppState({ kind: "mutation_preview", sql, queryType, preview: null, previewLoading: true, commitLoading: false });

      const mRes = await fetch("/api/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, connectionConfig, confirmed: false }),
      });
      const mData = await mRes.json();

      if (mData.error) {
        setAppState({ kind: "mutation_preview", sql, queryType, preview: null, previewLoading: false, commitLoading: false, error: mData.error });
        return;
      }
      setAppState({ kind: "mutation_preview", sql, queryType, preview: mData.preview ?? null, previewLoading: false, commitLoading: false });
    }
  }

  async function handlePrompt(prompt: string) {
    if (!schema || !connectionConfig) return;
    setCurrentPrompt(prompt);
    setAppState({ kind: "loading" });

    try {
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, schema, pageSize }),
      });
      const genData = await genRes.json();
      if (genData.error) {
        setAppState({ kind: "error", message: genData.error });
        return;
      }
      await processSQL(genData.sql, prompt);
    } catch (err) {
      setAppState({ kind: "error", message: err instanceof Error ? err.message : "Unexpected error" });
    }
  }

  async function handleRerun(sql: string) {
    if (!connectionConfig) return;
    setAppState({ kind: "loading" });
    try {
      await processSQL(sql, currentPrompt);
    } catch (err) {
      setAppState({ kind: "error", message: err instanceof Error ? err.message : "Unexpected error" });
    }
  }

  async function handlePaginationConfirm(baseSql: string) {
    setAppState({ kind: "loading" });
    await runPaginatedSelect(baseSql, 0, pageSize, currentPrompt);
  }

  async function handlePageSizeChange(newSize: PageSize) {
    if (appState.kind !== "select_result") return;
    setPageSize(newSize);
    setAppState({ kind: "loading" });
    await runPaginatedSelect(appState.baseSql, 0, newSize, currentPrompt);
  }

  async function handlePageChange(page: number) {
    if (appState.kind !== "select_result" || !connectionConfig) return;
    const { baseSql, pageSize: size } = appState;
    setAppState({ ...appState, pageLoading: true });
    await runPaginatedSelect(baseSql, page, size as PageSize, currentPrompt);
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
      if (queryType === "DDL") refreshSchema();
    } catch (err) {
      setAppState({ ...appState, commitLoading: false, error: err instanceof Error ? err.message : "Commit failed" });
    }
  }

  function handleCancel() {
    setAppState({ kind: "idle" });
  }

  function handleHistorySelect(item: QueryHistoryItem) {
    setCurrentPrompt(item.prompt);
    setActiveTab("query");
  }

  function refreshSchema() {
    if (!connectionConfig) return;
    fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connectionConfig),
    })
      .then((r) => r.json())
      .then((d) => { if (d.success) setSchema(d.schema); });
  }

  function handleImported() {
    refreshSchema();
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
            onClick={() => { setConnected(false); setSchema(null); setConnectionConfig(null); }}
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

            {appState.kind === "pagination_confirm" && (
              <PaginationConfirm
                sql={appState.baseSql}
                pageSize={pageSize}
                onConfirm={() => handlePaginationConfirm(appState.baseSql)}
                onCancel={handleCancel}
              />
            )}

            {appState.kind === "select_result" && (
              <QueryResult
                baseSql={appState.baseSql}
                result={appState.result}
                page={appState.page}
                pageSize={appState.pageSize}
                paginated={appState.paginated}
                pageLoading={appState.pageLoading}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                onRerun={handleRerun}
              />
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
                <div className="rounded-md bg-muted border text-sm font-mono overflow-x-auto">
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
