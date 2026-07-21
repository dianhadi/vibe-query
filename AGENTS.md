# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

vibeQL is a Next.js App Router + TypeScript fullstack app for querying PostgreSQL or MySQL databases with natural language. AI providers are pluggable: Anthropic, OpenAI or OpenAI-compatible APIs, Google Gemini, and Ollama.

The app always shows generated SQL, supports server-side pagination and sorting, previews mutations before commit, requires extra confirmation for DDL, imports CSV/Excel files into tables, generates Mermaid ERDs, and analyzes SELECT query plans.

## Tech Stack

- Next.js 16 App Router with React 19 and TypeScript
- Tailwind CSS v4 and shadcn/ui-style components
- `pnpm` package manager
- PostgreSQL via `pg`, MySQL via `mysql2`
- AI adapters under `lib/ai/adapters`
- DB adapters under `lib/db/adapters`
- CSV/Excel parsing via `papaparse` and `xlsx`

## Development Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm build
```

Use `pnpm typecheck` and `pnpm lint` for normal validation. Run `pnpm build` for changes touching Next.js routing, server/client boundaries, package config, or production behavior.

## Important Architecture

- `app/page.tsx` owns the main app state: connection state, selected tab, query results, pagination, sorting, ERD state, and analysis state.
- API routes live in `app/api/*/route.ts`.
- Shared types live in `types/index.ts`.
- DB access is routed through `lib/db/client.ts`, `lib/db/execute.ts`, `lib/db/introspect.ts`, and adapter implementations.
- AI calls go through `lib/ai/index.ts`; provider-specific code belongs in `lib/ai/adapters`.
- Runtime AI provider switching uses `lib/ai/provider-store.ts` and `globalThis.__vibeql_ai_provider`.
- Prompt construction belongs in `lib/ai/prompts.ts`.
- UI primitives live in `components/ui`; feature components live in `components`.

## Product Invariants

- Always show generated or executed SQL to the user.
- Never auto-commit INSERT, UPDATE, DELETE, TRUNCATE, or other mutating operations. Preview first, then require explicit user confirmation.
- DDL such as CREATE, ALTER, and DROP must require typing `CONFIRM`.
- Do not send result rows or user database contents to AI. AI may receive schema structure, SQL text, and EXPLAIN output only.
- Keep connection credentials request-scoped/session-scoped. Do not persist them to disk or a database.
- After schema-changing operations or imports, refresh schema state in the sidebar.
- Multiple PostgreSQL schemas are supported; generated SQL must stay restricted to the selected schema context.
- Keep built-in agent safety patterns language-neutral/common English. Use `vibeql.config.json` for localized or project-specific sensitive/categorical column overrides.

## Query Behavior

- Queries without an explicit `LIMIT` should trigger the pagination confirmation flow.
- Server-side pagination wraps the original query:

```sql
SELECT * FROM (<baseSql>) AS _vq LIMIT <pageSize+1> OFFSET <page*pageSize>
```

- Fetch `pageSize + 1` rows to compute `hasMore` without a separate count.
- Sorting is server-side. `applyOrderBy(sql, col, dir)` strips an existing `ORDER BY` and appends the chosen order.
- Reset sort state when processing a completely new query.

## AI Behavior

- All AI features use the same adapter method shape: `generateSQL(systemPrompt, userPrompt)`.
- SQL generation, ERD generation, and query analysis differ by system prompt.
- Normalize provider errors through `lib/ai/errors.ts`.
- Keep AI logging structured and safe: no system prompts, credentials, result rows, or full data dumps.
- Anthropic prompt caching is intentionally enabled for schema prompts.

## UI Guidelines

- Preserve the existing compact app/dashboard feel. Do not turn app screens into marketing pages.
- Prefer existing component patterns and `components/ui` primitives.
- Use lucide icons where the existing UI uses icons.
- Keep controls accessible and responsive; avoid text overlap in buttons, tabs, sidebars, dialogs, and tables.
- Keep cards for actual grouped UI, repeated items, or dialogs; avoid decorative nested cards.

## Editing Guidelines

- Keep changes scoped to the requested feature or bug.
- Prefer existing helper functions and adapter boundaries over new abstractions.
- Do not rewrite unrelated files or reformat broadly.
- Do not commit secrets or `.env.local`.
- This repo may have user changes. Do not revert changes you did not make unless explicitly asked.

## Environment

Relevant env vars:

- `AI_PROVIDER`: `anthropic`, `openai`, `gemini`, or `ollama`
- `AI_MODEL`: optional model override
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `GEMINI_API_KEY`
- `OLLAMA_BASE_URL`

Database connection details are entered by the user in the app and should not be persisted server-side.
