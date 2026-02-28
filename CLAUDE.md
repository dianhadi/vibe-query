# vibeQL

A web app that lets users query their PostgreSQL database using natural language prompts instead of writing SQL manually. Powered by pluggable AI (Anthropic, OpenAI, Ollama, or any OpenAI-compatible API), built with Next.js (fullstack monorepo) and TypeScript.

---

## Project Vision

Users connect to a PostgreSQL database, describe what they want in plain language, and vibeQL generates and executes the SQL for them. For mutating operations (INSERT/UPDATE/DELETE), results are previewed first and require explicit confirmation before committing.

---

## Tech Stack

- **Frontend & Backend**: Next.js (App Router) + TypeScript — monorepo, fullstack
- **AI**: Pluggable adapter pattern — Anthropic (`claude-sonnet-4-6`), OpenAI, Ollama, or any OpenAI-compatible API
- **Database**: PostgreSQL (primary), architected to support other adapters later
- **DB Client**: `pg` (node-postgres)
- **File Parsing**: `xlsx` for Excel, `papaparse` for CSV
- **Diagram**: `mermaid` for ERD rendering (client-side dynamic import)
- **Markdown**: `react-markdown` for AI analysis output
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Package manager**: pnpm

---

## Core Features

### 1. Database Connection
- User inputs connection details (host, port, user, password, database name) via a connection form on first load
- Connection is tested before proceeding; clear error messages if it fails
- Connection config is stored in session (not persisted to disk/DB for security)
- Schema is introspected on connect: tables, columns, types — this schema context is sent to the AI with every prompt
- Multiple PostgreSQL schemas supported; sidebar has a schema dropdown (`/api/schema`)
- After DDL commits or file imports, the schema sidebar refreshes automatically

### 2. Prompt-to-SQL (Vibe Query)
- Main interface: a large prompt input box
- User types natural language (e.g. "show me the 10 most recent orders with customer names")
- AI generates SQL based on the prompt + live schema context
- **Both the generated SQL and the result data are always shown** — no hiding the query
- SQL is displayed in a code block with **Edit**, **Copy**, and **Analyze** buttons
- **Edit mode**: inline textarea with `⌘↵` to re-run, `Esc` to cancel
- Results shown in a sortable, paginated data table

### 3. Pagination
- Queries without an explicit LIMIT trigger a confirmation step (`PaginationConfirm`) before fetching
- Page size is configurable (20 / 50 / 100) via a dropdown — stored in app state
- Server-side pagination uses a subquery wrapper: `SELECT * FROM (...) AS _vq LIMIT N+1 OFFSET M`
- `N+1` fetch detects `hasMore` without a separate COUNT query
- `baseSql` (without LIMIT/OFFSET) is stored in state; `displaySql` is computed per page

### 4. Server-side Sorting
- Clicking a column header re-runs the query with `ORDER BY "col" ASC` (first click), `DESC` (second), cleared (third)
- `applyOrderBy(sql, col, dir)` strips any existing `ORDER BY` and appends the new one
- Sort state (`sortCol`, `sortDir`) lives in `page.tsx` — persists across page changes
- Sort is reset when a completely new query runs via `processSQL`

### 5. Mutation Safety (INSERT / UPDATE / DELETE)
- When a mutating query is generated:
  1. SQL is shown to the user for review
  2. A **dry-run / preview** executes inside a transaction that is immediately rolled back
  3. A prominent **"Commit Changes"** CTA is shown — changes are NOT applied until clicked
  4. On commit, the real mutation executes and rows affected is shown
  5. A **"Cancel"** option dismisses without executing
- DDL statements (DROP, ALTER, CREATE) require typing `CONFIRM` in a dialog

### 6. File Import → Table
- User uploads `.xlsx`, `.xls`, or `.csv` files via the **Import** tab
- **Multi-sheet Excel**: each sheet is mapped to its own table; accordion UI per sheet
- Preview of first 10 rows; editable column mappings with per-column controls:
  - **PK checkbox** — mark as `PRIMARY KEY`; auto-checked for `id`, `<table>_id`, `<singular>_id`; type auto-set to `SERIAL`
  - **Column name** — rename before import
  - **Data type** — 19 types with auto-inference (SMALLINT/INTEGER/BIGINT via BigInt range check, UUID, TIMESTAMPTZ, TIMESTAMP, DATE, TIME, JSONB, BOOLEAN, SERIAL, BIGSERIAL, etc.)
  - **Foreign key** — optional `REFERENCES table(column)` constraint; dropdown shows PK/UNIQUE columns of existing tables; auto-detected from `*_id` column name patterns
- **Table conflict detection** (checked during preview via `information_schema`):
  - ≥ 50% column overlap → blocked, user must rename
  - < 50% column overlap → auto-renamed to `<name>_1` (or next available suffix)
- Generates `CREATE TABLE` + batch `INSERT` statements (500 rows/batch)
- Schema sidebar refreshes after successful import

### 7. Query History
- All executed queries (reads and committed writes) stored in React state for the session
- **History** tab shows timestamp, prompt used, SQL, and row count
- Clicking a history item re-populates the prompt input, switches to the Query tab, and **auto-runs** the query if it is a SELECT

### 8. ERD Viewer
- **ERD** tab → **Generate ERD** button
- Sends current schema to AI with `buildERDSystemPrompt()`; AI returns a `erDiagram` Mermaid string
- Mermaid is loaded via dynamic import (client-side only, avoids SSR issues)
- Diagram rendered as inline SVG; raw Mermaid source shown in a collapsible section
- ERD state lives in `page.tsx` (persists across tab switches); cleared automatically on schema change or DDL

### 9. Query Analyzer (EXPLAIN ANALYZE)
- **Analyze** button appears in the SQL block toolbar for SELECT results
- Runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` against the exact executing SQL
- EXPLAIN output + original SQL sent to AI with `buildAnalyzeSystemPrompt()`
- AI returns markdown analysis: summary, issues found, `CREATE INDEX` recommendations, query rewrite suggestions
- Rendered with `react-markdown` in a panel below the SQL box
- Analysis cleared when a new query runs

---

## Project Structure

```
vibe-query/
├── app/
│   ├── page.tsx                  # Main app shell / connection gate
│   ├── layout.tsx
│   └── api/
│       ├── connect/route.ts      # Test DB connection + introspect schema + list schemas
│       ├── generate/route.ts     # Call AI to generate SQL from prompt
│       ├── query/route.ts        # Execute SELECT queries (paginated or direct)
│       ├── mutate/route.ts       # Preview + commit mutating queries
│       ├── import/route.ts       # File import → table
│       ├── schema/route.ts       # Switch PostgreSQL schema (lightweight)
│       ├── erd/route.ts          # Generate Mermaid ERD from schema via AI
│       └── analyze/route.ts      # EXPLAIN ANALYZE + AI performance analysis
├── components/
│   ├── ConnectionForm.tsx        # DB connection form with vibeQL logo
│   ├── PromptInput.tsx
│   ├── QueryResult.tsx           # SQL display + sortable table + analyzer panel
│   ├── MutationConfirm.tsx       # Dry-run preview + commit CTA
│   ├── PaginationConfirm.tsx     # Prompt user before fetching unlimited rows
│   ├── ERDViewer.tsx             # Mermaid ERD renderer (controlled component)
│   ├── FileImport.tsx
│   ├── SchemaExplorer.tsx        # Sidebar with schema dropdown + tables/columns
│   ├── QueryHistory.tsx
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── db/
│   │   ├── client.ts             # pg pool management + withClient helper
│   │   ├── introspect.ts         # Schema introspection (multi-schema, listSchemas)
│   │   ├── execute.ts            # Query helpers: paginated, mutations, applyOrderBy
│   │   └── adapters/types.ts     # DBAdapter interface (future: mysql, sqlite)
│   ├── ai/
│   │   ├── index.ts              # Factory (AI_PROVIDER env) + generateSQL/ERD/analyze
│   │   ├── prompts.ts            # buildSystemPrompt / buildERDSystemPrompt / buildAnalyzeSystemPrompt
│   │   └── adapters/
│   │       ├── types.ts          # AIAdapter interface: generateSQL(system, user)
│   │       ├── anthropic.ts      # Anthropic SDK + prompt caching (cache_control)
│   │       ├── openai.ts         # OpenAI SDK (supports baseURL override)
│   │       └── ollama.ts         # Ollama via fetch to /v1/chat/completions
│   └── parsers/
│       ├── excel.ts              # xlsx parsing
│       └── csv.ts                # papaparse wrapper
├── types/
│   └── index.ts                  # Shared types: QueryResult, Schema, ColumnMapping (with primaryKey, references), PageSize, etc.
├── public/
│   └── vibeQL-logo.svg           # Brand logo (indigo gradient)
├── .env.local                    # Local env vars (gitignored)
├── .env.local.example
└── CLAUDE.md                     # This file
```

---

## API Routes

### `POST /api/connect`
- Body: `{ host, port, user, password, database }`
- Tests connection, introspects `public` schema, lists all user schemas
- Returns: `{ success, schema, dbSchemas: string[] }`

### `POST /api/schema`
- Body: `{ connectionConfig, schemaName }`
- Lightweight schema switch — re-introspects without re-testing connection
- Returns: `{ schema }`

### `POST /api/generate`
- Body: `{ prompt, schema, pageSize?, dbSchema? }`
- Calls AI with system prompt (schema + pagination rule + schema restriction)
- Returns: `{ sql }`

### `POST /api/query`
- Body: `{ sql, connectionConfig, page?, pageSize? }`
- If `page`/`pageSize` present → uses `executeSelectPaginated` (subquery + N+1 trick)
- Returns: `{ columns, rows, rowCount, hasMore? }`

### `POST /api/mutate`
- Body: `{ sql, connectionConfig, confirmed: boolean }`
- `confirmed: false` → `BEGIN` + execute + `ROLLBACK`, returns preview
- `confirmed: true` → executes for real
- Returns: `{ preview?: { rowsAffected, previewRows? }, result?: { rowsAffected } }`

### `POST /api/import`
- Body: `multipart/form-data` with file + `{ tableName, columnMappings, confirmed }`
- For multi-sheet Excel: `sheetsConfig` (per-sheet `{ sheetName, tableName, columnMappings }`)
- Preview (`confirmed=false`): infers types, checks table conflicts, fetches FK-eligible columns — all in one DB connection
- Commit (`confirmed=true`): runs `CREATE TABLE` + batched `INSERT` statements
- Returns preview: `{ isMultiSheet, fkOptions, sheets | preview: { columnMappings, tableExists, similarity, suggestedName }, similarityThreshold }`
- Returns commit: `{ result: { rowsInserted, sheetsImported? } }`

### `POST /api/erd`
- Body: `{ schema, dbSchema? }`
- Calls AI with `buildERDSystemPrompt()`, returns raw Mermaid `erDiagram` string
- Returns: `{ mermaid }`

### `POST /api/analyze`
- Body: `{ sql, connectionConfig }`
- Runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` then sends output to AI
- Returns: `{ analysis }` (markdown string)

---

## AI Integration

### Adapter Interface (`lib/ai/adapters/types.ts`)
```typescript
interface AIAdapter {
  generateSQL(systemPrompt: string, userPrompt: string): Promise<string>;
}
```
All AI features (SQL generation, ERD, query analysis) use this single method with different system/user prompts.

### Provider Factory (`lib/ai/index.ts`)
Reads `AI_PROVIDER` env var and instantiates the correct adapter. Exported functions:
- `generateSQL(prompt, schema, pageSize?, dbSchema?)` — SQL generation
- `generateERD(schema, dbSchema?)` — Mermaid ERD
- `analyzeQueryPlan(sql, explainText)` — performance analysis

### Prompt Caching (Anthropic only)
The Anthropic adapter sends the system prompt as a content block with `cache_control: { type: "ephemeral" }`. This caches the schema context for ~5 minutes, making repeated queries against the same schema ~90% cheaper on input tokens.

### System Prompts (`lib/ai/prompts.ts`)
- `buildSystemPrompt(schemaText, pageSize?, dbSchema?)` — SQL generation; includes pagination rule and schema restriction
- `buildERDSystemPrompt()` — Mermaid erDiagram rules; outputs only valid Mermaid, no fences
- `buildAnalyzeSystemPrompt()` — EXPLAIN ANALYZE interpretation; structured markdown output with Summary / Issues / Index Recommendations / Other Suggestions sections

---

## Key Architectural Decisions

### SELECT routing (`processSQL` in `page.tsx`)
```
getLimitValue(sql) === null         → PaginationConfirm (ask before fetching all)
getLimitValue(sql) === pageSize     → runPaginatedSelect (AI added our LIMIT)
getLimitValue(sql) is other number  → runDirectSelect (user said "top 5", etc.)
```

### Pagination subquery pattern
```sql
SELECT * FROM (<baseSql>) AS _vq LIMIT <pageSize+1> OFFSET <page*pageSize>
```
Fetching `pageSize + 1` rows lets us set `hasMore = rows.length > pageSize` without a separate COUNT.

### ERD / Analyze state in page.tsx
Both ERD (`erdMermaid`, `erdLoading`, `erdError`) and query analysis (`analysis`, `analyzeLoading`, `analyzeError`) live in `page.tsx`, not in child components. This ensures state survives tab switches (Radix UI Tabs unmounts inactive content by default).

### Sort state in page.tsx
`sortCol` and `sortDir` live in `page.tsx`. On column header click, `applyOrderBy(baseSql, col, dir)` builds a new SQL string, then `runPaginatedSelect` or `runDirectSelect` re-fetches from page 0.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AI_PROVIDER` | No | `anthropic` (default), `openai`, or `ollama` |
| `AI_MODEL` | No | Override the default model |
| `ANTHROPIC_API_KEY` | If `AI_PROVIDER=anthropic` | Anthropic API key |
| `OPENAI_API_KEY` | If `AI_PROVIDER=openai` | OpenAI (or compatible) API key |
| `OPENAI_BASE_URL` | No | Override base URL (Groq, OpenRouter, LM Studio, etc.) |
| `OLLAMA_BASE_URL` | No | Ollama base URL (default: `http://localhost:11434`) |

Connection config is never stored server-side beyond the request lifecycle.

---

## Development Commands

```bash
pnpm install       # Install dependencies
pnpm dev           # Run dev server (Turbopack)
pnpm build         # Production build
pnpm typecheck     # TypeScript type check
pnpm lint          # ESLint
```

---

## Key UX Principles

1. **Always show the SQL** — users always see what query was generated or executed
2. **Never auto-commit mutations** — safety first; always preview before applying writes
3. **Schema-aware** — AI always has full schema context for the current PostgreSQL schema
4. **Fast feedback** — results, analysis, and diagrams appear inline; no page navigation
5. **Persistent state across tabs** — ERD and analysis results survive tab switches
6. **Graceful errors** — DB errors, AI errors, and parse errors show human-readable messages

---

## Out of Scope (v1)

- User authentication / multi-user
- Saving connections or queries to a persistent store
- Query scheduling or automation
- Support for non-relational databases
- Real-time / streaming query results
- DML query analysis (EXPLAIN ANALYZE on INSERT/UPDATE/DELETE)
