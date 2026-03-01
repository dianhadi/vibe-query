"use client";

import { useState, useEffect } from "react";
import {
  ConnectionConfig, Schema, QueryHistoryItem, QueryType,
  QueryResult as QueryResultType, PageSize, DEFAULT_PAGE_SIZE,
} from "@/types";
import { getLimitValue, stripLimitOffset, classifyQueryType, applyOrderBy } from "@/lib/db/execute";
import ConnectionForm from "@/components/ConnectionForm";
import SchemaExplorer from "@/components/SchemaExplorer";
import PromptInput from "@/components/PromptInput";
import QueryResult from "@/components/QueryResult";
import MutationConfirm from "@/components/MutationConfirm";
import QueryHistory from "@/components/QueryHistory";
import FileImport from "@/components/FileImport";
import PaginationConfirm from "@/components/PaginationConfirm";
import ERDViewer from "@/components/ERDViewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import Image from "next/image";
import { LogOut, Terminal, Upload, GitBranch, Clock } from "lucide-react";

type AppState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "pagination_confirm"; baseSql: string }
  | { kind: "select_result"; baseSql: string; result: QueryResultType; page: number; pageSize: number; paginated: boolean; pageLoading: boolean; analysis?: string; analyzeLoading?: boolean; analyzeError?: string }
  | { kind: "mutation_preview"; sql: string; queryType: QueryType; preview: { rowsAffected: number; previewRows?: Record<string, unknown>[] } | null; previewLoading: boolean; commitLoading: boolean; error?: string }
  | { kind: "mutation_done"; sql: string; queryType: QueryType; rowsAffected: number }
  | { kind: "error"; message: string };

const SESSION_KEY  = "vibeql_session";
const HISTORY_KEY  = "vibeql_history";
const ERD_KEY      = "vibeql_erd";

function saveSession(
  config: ConnectionConfig,
  sc: Schema,
  schemas: string[],
  schemaName: string
) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ connectionConfig: config, schema: sc, dbSchemas: schemas, currentDbSchema: schemaName }));
  } catch { /* quota exceeded or private browsing — ignore */ }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(HISTORY_KEY);
    sessionStorage.removeItem(ERD_KEY);
  } catch { /* ignore */ }
}

export default function Home() {
  const [initializing, setInitializing] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig | null>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [dbSchemas, setDbSchemas] = useState<string[]>(["public"]);
  const [currentDbSchema, setCurrentDbSchema] = useState("public");

  // Restore session on mount (runs only on client, after hydration)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.connectionConfig && saved.schema) {
          setConnectionConfig(saved.connectionConfig);
          setSchema(saved.schema);
          setDbSchemas(saved.dbSchemas ?? ["public"]);
          setCurrentDbSchema(saved.currentDbSchema ?? "public");
          setConnected(true);
        }
      }

      const historyRaw = sessionStorage.getItem(HISTORY_KEY);
      if (historyRaw) {
        const parsed = JSON.parse(historyRaw) as (Omit<QueryHistoryItem, "timestamp"> & { timestamp: string })[];
        setHistory(parsed.map((item) => ({ ...item, timestamp: new Date(item.timestamp) })));
      }

      const erd = sessionStorage.getItem(ERD_KEY);
      if (erd) setErdMermaid(erd);
    } catch { /* corrupted — start fresh */ }
    setInitializing(false);
  }, []);
  const [appState, setAppState] = useState<AppState>({ kind: "idle" });
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState("query");
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [erdMermaid, setErdMermaid] = useState<string | null>(null);
  const [erdLoading, setErdLoading] = useState(false);
  const [erdError, setErdError] = useState<string | null>(null);

  function resetState() {
    setAppState({ kind: "idle" });
    setHistory([]);
    setActiveTab("query");
    setCurrentPrompt("");
    setPageSize(DEFAULT_PAGE_SIZE);
    setSortCol(null);
    setSortDir("asc");
    setErdMermaid(null);
    setErdLoading(false);
    setErdError(null);
  }

  // Keep history in sync with sessionStorage (skip until mount effect finishes)
  useEffect(() => {
    if (initializing) return;
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* ignore */ }
  }, [history, initializing]);

  // Keep ERD in sync with sessionStorage
  useEffect(() => {
    if (initializing) return;
    try {
      if (erdMermaid) sessionStorage.setItem(ERD_KEY, erdMermaid);
      else sessionStorage.removeItem(ERD_KEY);
    } catch { /* ignore */ }
  }, [erdMermaid, initializing]);

  function handleConnected(config: ConnectionConfig, s: Schema, schemas: string[]) {
    // For MySQL, dbSchemas is empty; use the database name as the current schema
    const schemaName = schemas.length > 0 ? schemas[0] : config.database;
    resetState();
    setConnectionConfig(config);
    setSchema(s);
    setDbSchemas(schemas);
    setCurrentDbSchema(schemaName);
    setConnected(true);
    saveSession(config, s, schemas, schemaName);
  }

  function addHistory(item: Omit<QueryHistoryItem, "id" | "timestamp">) {
    setHistory((prev) => [
      ...prev,
      { ...item, id: crypto.randomUUID(), timestamp: new Date() },
    ]);
  }

  async function runPaginatedSelect(baseSql: string, page: number, size: PageSize, prompt: string, sc: string | null = null, sd: "asc" | "desc" = "asc") {
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
    setSortCol(sc);
    setSortDir(sd);
    if (page === 0) addHistory({ prompt, sql: baseSql, queryType: "SELECT", rowCount: data.rowCount });
  }

  async function runDirectSelect(sql: string, prompt: string, sc: string | null = null, sd: "asc" | "desc" = "asc") {
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
    setSortCol(sc);
    setSortDir(sd);
    addHistory({ prompt, sql, queryType: "SELECT", rowCount: data.rowCount });
  }

  async function processSQL(sql: string, prompt: string) {
    setSortCol(null);
    setSortDir("asc");
    // analysis is part of select_result state, cleared naturally when state changes
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
        body: JSON.stringify({ prompt, schema, pageSize, dbSchema: currentDbSchema, dialect: connectionConfig.dialect }),
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

  async function handleAnalyze(sql: string) {
    if (appState.kind !== "select_result" || !connectionConfig) return;
    setAppState({ ...appState, analyzeLoading: true, analysis: undefined, analyzeError: undefined });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, connectionConfig }),
      });
      const data = await res.json();
      if (data.error) {
        setAppState({ ...appState, analyzeLoading: false, analyzeError: data.error });
      } else {
        setAppState({ ...appState, analyzeLoading: false, analysis: data.analysis });
      }
    } catch (err) {
      setAppState({ ...appState, analyzeLoading: false, analyzeError: err instanceof Error ? err.message : "Analysis failed" });
    }
  }

  async function handleSortChange(col: string | null, dir: "asc" | "desc") {
    if (appState.kind !== "select_result") return;
    const { baseSql, paginated, pageSize: size } = appState;
    const sortedSql = applyOrderBy(baseSql, col, dir, connectionConfig?.dialect);
    setAppState({ ...appState, pageLoading: true });
    if (paginated) {
      await runPaginatedSelect(sortedSql, 0, size as PageSize, currentPrompt, col, dir);
    } else {
      await runDirectSelect(sortedSql, currentPrompt, col, dir);
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
      if (queryType === "DDL") refreshSchema();
    } catch (err) {
      setAppState({ ...appState, commitLoading: false, error: err instanceof Error ? err.message : "Commit failed" });
    }
  }

  function handleCancel() {
    setAppState({ kind: "idle" });
  }

  async function handleHistorySelect(item: QueryHistoryItem) {
    setCurrentPrompt(item.prompt);
    setActiveTab("query");
    if (item.queryType === "SELECT") {
      setAppState({ kind: "loading" });
      try {
        await processSQL(item.sql, item.prompt);
      } catch (err) {
        setAppState({ kind: "error", message: err instanceof Error ? err.message : "Unexpected error" });
      }
    }
  }

  function refreshSchema(schemaName = currentDbSchema) {
    if (!connectionConfig) return;
    fetch("/api/schema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionConfig, schemaName }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.schema) {
          setSchema(d.schema);
          setErdMermaid(null);
          setErdError(null);
          if (connectionConfig) saveSession(connectionConfig, d.schema, dbSchemas, schemaName);
        }
      });
  }

  async function handleDbSchemaChange(schemaName: string) {
    if (!connectionConfig) return;
    setCurrentDbSchema(schemaName);
    setAppState({ kind: "idle" });
    setErdMermaid(null);
    setErdError(null);
    const res = await fetch("/api/schema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionConfig, schemaName }),
    });
    const data = await res.json();
    if (data.schema) {
      setSchema(data.schema);
      saveSession(connectionConfig, data.schema, dbSchemas, schemaName);
    }
  }

  function handleImported() {
    refreshSchema();
    setErdMermaid(null);
    setErdError(null);
  }

  async function handleGenerateERD() {
    if (!schema) return;
    setErdLoading(true);
    setErdError(null);
    setErdMermaid(null);
    try {
      const res = await fetch("/api/erd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema, dbSchema: currentDbSchema, dialect: connectionConfig?.dialect }),
      });
      const data = await res.json();
      if (data.error) {
        setErdError(data.error);
      } else {
        setErdMermaid(data.mermaid);
      }
    } catch (err) {
      setErdError(err instanceof Error ? err.message : "Failed to generate ERD");
    } finally {
      setErdLoading(false);
    }
  }

  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-sm text-muted-foreground animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!connected || !schema || !connectionConfig) {
    return <ConnectionForm onConnected={handleConnected} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Toaster />

      {/* Left sidebar: schema */}
      <aside className="w-56 border-r flex flex-col shrink-0 bg-muted/40">
        <div className="px-3 py-3 border-b flex items-center justify-between">
          <Image src="/vibeQL-logo.svg" alt="vibeQL" width={88} height={28} />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground"
            onClick={() => { clearSession(); resetState(); setConnected(false); setSchema(null); setConnectionConfig(null); }}
            title="Disconnect"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
        <SchemaExplorer
          schema={schema}
          dbSchemas={dbSchemas}
          currentDbSchema={currentDbSchema}
          onDbSchemaChange={handleDbSchemaChange}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b px-4">
            <TabsList className="h-11 gap-1 bg-transparent p-0">
              <TabsTrigger
                value="query"
                className="h-11 gap-2 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-primary font-medium"
              >
                <Terminal className="h-4 w-4" />
                Query
              </TabsTrigger>
              <TabsTrigger
                value="import"
                className="h-11 gap-2 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-primary font-medium"
              >
                <Upload className="h-4 w-4" />
                Import
              </TabsTrigger>
              <TabsTrigger
                value="erd"
                className="h-11 gap-2 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-primary font-medium"
              >
                <GitBranch className="h-4 w-4" />
                ERD
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="h-11 gap-2 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-primary font-medium"
              >
                <Clock className="h-4 w-4" />
                History
                {history.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary leading-none">
                    {history.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="query" className="flex-1 overflow-auto p-4 space-y-4 mt-0">
            <PromptInput
              onSubmit={handlePrompt}
              loading={appState.kind === "loading"}
              value={currentPrompt}
              onChange={setCurrentPrompt}
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
                onSortChange={handleSortChange}
                sortCol={sortCol}
                sortDir={sortDir}
                onAnalyze={handleAnalyze}
                analysis={appState.analysis}
                analyzeLoading={appState.analyzeLoading}
                analyzeError={appState.analyzeError}
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
            <FileImport connectionConfig={connectionConfig} onImported={handleImported} dialect={connectionConfig.dialect} />
          </TabsContent>

          <TabsContent value="erd" className="flex-1 overflow-auto p-4 mt-0 h-full">
            <ERDViewer
              schema={schema}
              dbSchema={currentDbSchema}
              mermaidCode={erdMermaid}
              loading={erdLoading}
              error={erdError}
              onGenerate={handleGenerateERD}
            />
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-0 h-full">
            <QueryHistory history={history} onSelect={handleHistorySelect} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
