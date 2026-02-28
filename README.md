# vibeQL

A web app that lets you query your PostgreSQL database using natural language instead of writing SQL manually. Powered by AI (Anthropic, OpenAI, Ollama, or any OpenAI-compatible API), built with Next.js and TypeScript.

## What it does

- Connect to a PostgreSQL database via a connection form
- Type plain English — AI generates and executes the SQL for you
- SELECT results displayed in a paginated, sortable data table
- INSERT / UPDATE / DELETE show a dry-run preview and require explicit confirmation
- DDL statements (CREATE / ALTER / DROP) require an extra typed confirmation
- Edit generated SQL inline and re-run with a single keystroke
- Server-side pagination with configurable page sizes (20 / 50 / 100)
- Column header click sorts results server-side via `ORDER BY`
- **ERD viewer** — AI generates a Mermaid entity-relationship diagram from your schema
- **Query analyzer** — runs `EXPLAIN ANALYZE` and asks AI for index/performance recommendations
- Multiple PostgreSQL schemas supported via sidebar dropdown
- Import CSV or Excel files (including multi-sheet) into tables — with PK, FK, and type configuration per column
- Query history tracked per session

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+ (`npm install -g pnpm`)
- A running PostgreSQL database
- An API key for your chosen AI provider

---

## Getting started

**1. Clone the repo**

```bash
git clone https://github.com/dianhadi/vibe-query.git
cd vibe-query
```

**2. Install dependencies**

```bash
pnpm install
```

**3. Set up environment variables**

```bash
cp .env.local.example .env.local
```

Edit `.env.local` — at minimum set `AI_PROVIDER` and the corresponding API key (see [AI providers](#ai-providers) below).

> Connection credentials are never stored server-side — they are passed from the browser session on each request.

**4. Run the dev server**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), enter your database connection details, and start querying.

---

## AI providers

Set `AI_PROVIDER` in `.env.local` to one of the supported values:

| Provider | `AI_PROVIDER` | Default model | Key required |
|---|---|---|---|
| Anthropic Claude | `anthropic` | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `gpt-4o` | `OPENAI_API_KEY` |
| Ollama (local) | `ollama` | `llama3.2` | — |

Any **OpenAI-compatible API** (Groq, OpenRouter, LM Studio, etc.) also works via the `openai` provider — just set `OPENAI_BASE_URL` to the provider's endpoint.

Override the model for any provider with `AI_MODEL`.

> When using Anthropic, [prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) is enabled automatically — the schema system prompt is cached so repeated queries against the same schema are significantly cheaper and faster.

### Examples

```env
# Anthropic (default)
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Groq (OpenAI-compatible)
AI_PROVIDER=openai
OPENAI_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-versatile

# Ollama (local, no key needed)
AI_PROVIDER=ollama
AI_MODEL=llama3.2
```

---

## Feature guide

### Querying

Type a question in the prompt box and press **Run**. The AI generates SQL based on your live schema context. Both the generated SQL and the result table are always shown.

- **Edit**: click **Edit** in the SQL box to modify the query inline. Press `⌘↵` (or `Ctrl↵`) to re-run, `Esc` to cancel.
- **Sort**: click any column header to sort ascending → descending → unsorted. Sorting re-runs the query server-side with `ORDER BY`.
- **Pagination**: queries without an explicit `LIMIT` ask before fetching all rows. Page size (20 / 50 / 100) is configurable.

### Query analyzer

After a SELECT result is shown, click **Analyze** in the SQL box toolbar. This:

1. Runs `EXPLAIN (ANALYZE, BUFFERS)` against the exact executing query
2. Sends the plan to the AI
3. Shows a formatted analysis with index recommendations, identified slow operations, and query rewrite suggestions

### ERD viewer

Open the **ERD** tab and click **Generate ERD**. The AI reads your schema and produces a Mermaid `erDiagram` with tables, columns, types, PK/FK markers, and inferred relationships. The raw Mermaid source is available in a collapsible section.

The diagram is regenerated (or cleared) automatically when you switch schemas or make DDL changes.

### Multiple schemas

Use the dropdown at the top of the schema sidebar to switch between PostgreSQL schemas. The AI is restricted to querying only the currently selected schema — no cross-schema queries.

### Mutation safety

INSERT / UPDATE / DELETE / TRUNCATE run inside a transaction that is immediately rolled back, so you see a preview of rows affected before anything is committed. DDL statements (CREATE / ALTER / DROP) require typing `CONFIRM` in a dialog.

After a DDL commit the schema sidebar refreshes automatically.

### File import

Go to the **Import** tab and upload a `.csv`, `.xlsx`, or `.xls` file.

**Column mapping preview** — before committing you can review and edit:
- **PK** checkbox — mark a column as `PRIMARY KEY`. Columns named `id`, `<table>_id`, or `<singular>_id` are auto-checked and typed as `SERIAL`.
- **Column name** — rename any column before it lands in the database.
- **Data type** — 19 types supported (TEXT, INTEGER, BIGINT, SERIAL, BIGSERIAL, NUMERIC, BOOLEAN, DATE, TIMESTAMP, TIMESTAMPTZ, UUID, JSONB, and more). Types are inferred automatically.
- **Foreign key** — optionally set a `REFERENCES table(column)` constraint. Columns named `user_id`, `order_id`, etc. are pre-filled when the referenced table exists.

**Multi-sheet Excel** — each sheet maps to a separate table. Sheet names are used as table names (editable). You can expand each sheet to configure its column mappings individually.

**Table name conflict detection** — on preview the server checks whether the target table already exists:
- If the existing table has ≥ 50 % of columns in common → **blocked**, must rename.
- If the existing table has very different columns → **auto-renamed** to `<name>_1` (or next available suffix).

The same preview → confirm flow applies before any rows are written.

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the development server (Turbopack) |
| `pnpm build` | Build for production |
| `pnpm start` | Start the production server |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Run ESLint |

---

## Project structure

```
vibe-query/
├── app/
│   ├── page.tsx                  # Main app shell / connection gate
│   ├── layout.tsx
│   └── api/
│       ├── connect/route.ts      # Test DB connection + introspect schema
│       ├── generate/route.ts     # Call AI to generate SQL from prompt
│       ├── query/route.ts        # Execute SELECT queries (paginated)
│       ├── mutate/route.ts       # Preview + commit mutating queries
│       ├── import/route.ts       # File import → table
│       ├── schema/route.ts       # Switch PostgreSQL schema
│       ├── erd/route.ts          # Generate Mermaid ERD from schema
│       └── analyze/route.ts      # EXPLAIN ANALYZE + AI analysis
├── components/
│   ├── ConnectionForm.tsx
│   ├── PromptInput.tsx
│   ├── QueryResult.tsx           # SQL display + sortable data table + analyzer
│   ├── MutationConfirm.tsx       # Dry-run preview + commit CTA
│   ├── PaginationConfirm.tsx     # Confirm before fetching all rows
│   ├── ERDViewer.tsx             # Mermaid ERD renderer
│   ├── FileImport.tsx
│   ├── SchemaExplorer.tsx        # Sidebar with schema dropdown + tables
│   ├── QueryHistory.tsx
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── db/
│   │   ├── client.ts             # pg pool management
│   │   ├── introspect.ts         # Schema introspection (multi-schema)
│   │   ├── execute.ts            # Query execution helpers + ORDER BY utils
│   │   └── adapters/types.ts     # DB adapter interface (future adapters)
│   ├── ai/
│   │   ├── index.ts              # Factory — picks adapter from AI_PROVIDER
│   │   ├── prompts.ts            # System prompt templates (SQL, ERD, analyze)
│   │   └── adapters/
│   │       ├── types.ts          # AIAdapter interface
│   │       ├── anthropic.ts      # Anthropic + prompt caching
│   │       ├── openai.ts         # OpenAI / compatible API
│   │       └── ollama.ts         # Ollama
│   └── parsers/
│       ├── excel.ts              # xlsx parsing
│       └── csv.ts                # papaparse wrapper
├── types/
│   └── index.ts                  # Shared TypeScript types
├── public/
│   └── vibeQL-logo.svg
├── .env.local                    # Local env vars (gitignored)
├── .env.local.example            # Template for env vars
└── CLAUDE.md                     # AI assistant instructions / product spec
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend + Backend | Next.js 16 (App Router) + TypeScript |
| AI | Pluggable — Anthropic, OpenAI, Ollama, or any OpenAI-compatible API |
| Database | PostgreSQL via `pg` (node-postgres) |
| UI | Tailwind CSS v4 + shadcn/ui |
| Diagram | Mermaid.js (ERD rendering) |
| Markdown | react-markdown (AI analysis output) |
| File parsing | `xlsx` + `papaparse` |
| Package manager | pnpm |

---

## Contributing

1. Fork the repo and create a branch from `main`
2. Make your changes — run `pnpm typecheck` and `pnpm lint` before opening a PR
3. Open a pull request with a clear description of what changed and why

### Key conventions

- All API routes live in `app/api/` as Next.js route handlers
- Database logic stays in `lib/db/` — keep it decoupled from Next.js
- The `AIAdapter` interface (`lib/ai/adapters/types.ts`) is the abstraction point for adding new AI providers — implement `generateSQL(systemPrompt, userPrompt)` and register it in `lib/ai/index.ts`
- The `DBAdapter` interface (`lib/db/adapters/types.ts`) is the abstraction point for future database backends
- Mutation safety is a core principle — never auto-commit writes; always preview first
- Always show the generated SQL to the user

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `AI_PROVIDER` | No | `anthropic` (default), `openai`, or `ollama` |
| `AI_MODEL` | No | Override the default model for the selected provider |
| `ANTHROPIC_API_KEY` | If `AI_PROVIDER=anthropic` | Anthropic API key |
| `OPENAI_API_KEY` | If `AI_PROVIDER=openai` | OpenAI (or compatible) API key |
| `OPENAI_BASE_URL` | No | Override OpenAI base URL (for Groq, OpenRouter, etc.) |
| `OLLAMA_BASE_URL` | No | Ollama base URL (default: `http://localhost:11434`) |
