# vibe-query

A web app that lets users query their database using natural language prompts instead of writing SQL manually. Powered by Claude AI, built with Next.js (fullstack monorepo) and TypeScript.

---

## Project Vision

Users connect to a PostgreSQL database, describe what they want in plain language, and vibe-query generates and executes the SQL for them. For mutating operations (INSERT/UPDATE/DELETE), results are previewed first and require explicit confirmation before committing.

---

## Tech Stack

- **Frontend & Backend**: Next.js (App Router) + TypeScript — monorepo, fullstack
- **AI**: Anthropic Claude API (`claude-sonnet-4-6`) for natural language → SQL
- **Database**: PostgreSQL (primary), architected to support other adapters later
- **DB Client**: `pg` (node-postgres)
- **File Parsing**: `xlsx` for Excel, `papaparse` for CSV
- **UI**: Tailwind CSS + shadcn/ui
- **State**: React state + server actions / API routes

---

## Core Features

### 1. Database Connection
- User inputs connection details (host, port, user, password, database name) via a connection form on first load
- Connection is tested before proceeding; clear error messages if it fails
- Connection config is stored in session (not persisted to disk/DB for security)
- Schema is introspected on connect: tables, columns, types, foreign keys — this schema context is sent to Claude with every prompt

### 2. Prompt-to-SQL (Vibe Query)
- Main interface: a large prompt input box
- User types natural language (e.g. "show me the 10 most recent orders with customer names")
- Claude generates SQL based on the prompt + live schema context
- **Both the generated SQL and the result data are always shown** — no hiding the query
- SQL is displayed in a syntax-highlighted code block with a copy button
- Results are displayed in a paginated data table

### 3. Mutation Safety (INSERT / UPDATE / DELETE)
- When Claude detects or generates a mutating query (INSERT, UPDATE, DELETE, TRUNCATE, DROP, ALTER), the flow is:
  1. SQL is shown to the user for review
  2. A **dry-run / preview** is executed where possible (e.g. wrapping in a transaction and rolling back, or running a SELECT equivalent)
  3. A prominent **"Commit Changes"** CTA button is shown — changes are NOT applied until clicked
  4. On commit, the real mutation executes and result (rows affected, etc.) is shown
  5. A **"Cancel"** option dismisses without executing
- DDL statements (DROP, ALTER, CREATE) should require extra confirmation (a typed confirmation dialog)

### 4. File Import → Table
- User can upload `.xlsx`, `.xls`, or `.csv` files
- File is parsed client-side or server-side into rows + columns
- User sees a preview of the data (first 10 rows)
- User can set:
  - Target table name (new or existing)
  - Column name mapping / overrides
  - Data types per column (inferred by default)
- On confirm, vibe-query generates and executes a `CREATE TABLE IF NOT EXISTS` + batch `INSERT` statements
- Import follows the same mutation safety flow (preview → commit CTA)

### 5. Query History
- All executed queries (read and committed writes) are stored in local state for the session
- Sidebar or collapsible panel shows query history with timestamp, prompt used, and SQL
- Clicking a history item re-populates the prompt and SQL for re-use or editing

---

## Project Structure

```
vibe-query/
├── app/
│   ├── page.tsx                  # Main app shell / connection gate
│   ├── api/
│   │   ├── connect/route.ts      # Test DB connection + introspect schema
│   │   ├── query/route.ts        # Run a SELECT query
│   │   ├── mutate/route.ts       # Preview + commit mutating queries
│   │   ├── import/route.ts       # Handle file import → table
│   │   └── generate/route.ts     # Call Claude to generate SQL from prompt
│   └── layout.tsx
├── components/
│   ├── ConnectionForm.tsx
│   ├── PromptInput.tsx
│   ├── QueryResult.tsx           # SQL display + data table
│   ├── MutationConfirm.tsx       # Preview + Commit CTA
│   ├── FileImport.tsx
│   ├── SchemaExplorer.tsx        # Sidebar showing tables/columns
│   └── QueryHistory.tsx
├── lib/
│   ├── db/
│   │   ├── client.ts             # pg pool management
│   │   ├── introspect.ts         # Schema introspection queries
│   │   ├── execute.ts            # Safe query execution helpers
│   │   └── adapters/             # Future: mysql, sqlite adapters
│   ├── ai/
│   │   ├── claude.ts             # Anthropic SDK wrapper
│   │   └── prompts.ts            # System prompt templates
│   └── parsers/
│       ├── excel.ts              # xlsx parsing
│       └── csv.ts                # papaparse wrapper
├── types/
│   └── index.ts                  # Shared TypeScript types
├── .env.local                    # ANTHROPIC_API_KEY, etc.
└── CLAUDE.md                     # This file
```

---

## API Routes

### `POST /api/connect`
- Body: `{ host, port, user, password, database }`
- Tests connection, introspects schema, returns schema summary
- Returns: `{ success, schema: { tables: [...] } }`

### `POST /api/generate`
- Body: `{ prompt, schema }`
- Calls Claude with system prompt + user prompt + schema context
- Returns: `{ sql, queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' }`

### `POST /api/query`
- Body: `{ sql, connectionConfig }`
- Executes a read-only query
- Returns: `{ columns, rows, rowCount }`

### `POST /api/mutate`
- Body: `{ sql, connectionConfig, confirmed: boolean }`
- If `confirmed: false` → runs in a transaction + ROLLBACK, returns preview
- If `confirmed: true` → executes for real
- Returns: `{ preview?: { rowsAffected }, result?: { rowsAffected } }`

### `POST /api/import`
- Body: `multipart/form-data` with file + `{ tableName, columnMappings, confirmed }`
- Parses file, generates CREATE TABLE + INSERT SQL
- Same confirmed flow as `/api/mutate`
- Returns: `{ sql, preview?, result? }`

---

## Claude Integration

### System Prompt (in `lib/ai/prompts.ts`)
```
You are a SQL expert assistant for a PostgreSQL database.
The user will describe what they want in natural language.
Your job is to generate a single, correct SQL statement.

Rules:
- Only output valid PostgreSQL SQL
- No markdown, no explanation — just the SQL
- Use the schema provided to reference correct table and column names
- If the user's request is ambiguous, make a reasonable assumption
- For mutating queries, be conservative and precise

Current schema:
{SCHEMA}
```

### Query Type Detection
After generating SQL, Claude (or a regex check) classifies it as:
- `SELECT` → execute immediately, show results
- `INSERT | UPDATE | DELETE | TRUNCATE` → mutation flow (preview → commit)
- `CREATE | ALTER | DROP` → DDL flow (extra confirmation dialog)

---

## Database Adapter Architecture

Current: PostgreSQL only. Future-proof by abstracting the DB layer:

```typescript
// lib/db/adapters/types.ts
interface DBAdapter {
  connect(config: ConnectionConfig): Promise<void>
  disconnect(): Promise<void>
  query(sql: string): Promise<QueryResult>
  introspectSchema(): Promise<Schema>
}
```

PostgreSQL adapter implements this interface. Future adapters (MySQL, SQLite, etc.) will implement the same interface with zero changes to the rest of the app.

---

## Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Connection config is never stored server-side beyond the request lifecycle. Pass it from the client session to each API request.

---

## Development Commands

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build
npm run build

# Type check
npm run typecheck
```

---

## Key UX Principles

1. **Always show the SQL** — users should always see what query was generated, never a black box
2. **Never auto-commit mutations** — safety first, always require explicit user confirmation
3. **Schema-aware** — Claude always has full schema context so it generates accurate queries
4. **Fast feedback** — show results inline, don't navigate away
5. **Graceful errors** — DB errors, Claude errors, and parse errors should show human-readable messages with the raw error detail available on toggle

---

## Out of Scope (v1)

- User authentication / multi-user
- Saving connections or queries to a persistent store
- Query scheduling or automation
- Support for non-relational databases
- Real-time / streaming query results