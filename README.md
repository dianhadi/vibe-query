# vibe-query

A web app that lets you query your PostgreSQL database using natural language instead of writing SQL manually. Powered by AI, built with Next.js and TypeScript.

## What it does

- Connect to a PostgreSQL database via a connection form
- Type plain English queries — AI generates the SQL for you
- SELECT results are shown immediately in a paginated table
- INSERT / UPDATE / DELETE queries show a dry-run preview and require explicit confirmation before committing
- DDL statements (CREATE / ALTER / DROP) require an extra typed confirmation
- Import CSV or Excel files directly into tables with column mapping
- Query history is tracked per session

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

### Examples

```env
# Anthropic
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
│       ├── query/route.ts        # Execute SELECT queries
│       ├── mutate/route.ts       # Preview + commit mutating queries
│       └── import/route.ts       # File import → table
├── components/
│   ├── ConnectionForm.tsx
│   ├── PromptInput.tsx
│   ├── QueryResult.tsx           # SQL display + data table
│   ├── MutationConfirm.tsx       # Dry-run preview + commit CTA
│   ├── FileImport.tsx
│   ├── SchemaExplorer.tsx        # Sidebar showing tables/columns
│   ├── QueryHistory.tsx
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── db/
│   │   ├── client.ts             # pg pool management
│   │   ├── introspect.ts         # Schema introspection
│   │   ├── execute.ts            # Query execution helpers
│   │   └── adapters/types.ts     # DB adapter interface (for future adapters)
│   ├── ai/
│   │   ├── index.ts              # Factory — picks adapter from AI_PROVIDER env var
│   │   ├── prompts.ts            # System prompt templates
│   │   └── adapters/
│   │       ├── types.ts          # AIAdapter interface
│   │       ├── anthropic.ts      # Anthropic implementation
│   │       ├── openai.ts         # OpenAI / compatible API implementation
│   │       └── ollama.ts         # Ollama implementation
│   └── parsers/
│       ├── excel.ts              # xlsx parsing
│       └── csv.ts                # papaparse wrapper
├── types/
│   └── index.ts                  # Shared TypeScript types
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
- The `AIAdapter` interface in `lib/ai/adapters/types.ts` is the abstraction point for adding new AI providers — implement `generateSQL(systemPrompt, userPrompt)` and register it in `lib/ai/index.ts`
- The `DBAdapter` interface in `lib/db/adapters/types.ts` is the abstraction point for adding new database backends
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
