import { NextRequest } from "next/server";
import { planQueryAction } from "@/lib/ai";
import { withClient } from "@/lib/db/client";
import { inspectDistinctValues } from "@/lib/agent/tools";
import { getSQLExecutionPolicy } from "@/lib/policy/sql-policy";
import { AgentStreamEvent, ConnectionConfig, Dialect, Schema } from "@/types";

const MAX_AGENT_STEPS = 4;

function encodeEvent(event: AgentStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function observationForDistinct(table: string, column: string, values: string[], truncated: boolean): string {
  const suffix = truncated ? " (truncated)" : "";
  return `inspect_distinct ${table}.${column}: values=${JSON.stringify(values)}${suffix}`;
}

export async function POST(req: NextRequest) {
  let body: {
    prompt: string;
    schema: Schema;
    connectionConfig: ConnectionConfig;
    pageSize?: number;
    dbSchema?: string;
    dialect?: Dialect;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { prompt, schema, connectionConfig, pageSize, dbSchema, dialect } = body;
  if (!prompt || !schema || !connectionConfig) {
    return new Response(JSON.stringify({ error: "prompt, schema, and connectionConfig are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const activeDialect = dialect ?? connectionConfig.dialect ?? "postgresql";
  const activeSchema = dbSchema ?? (activeDialect === "mysql" ? connectionConfig.database : "public");

  const stream = new ReadableStream({
    async start(controller) {
      const observations: string[] = [];
      const inspected = new Set<string>();

      try {
        controller.enqueue(encodeEvent({ type: "status", message: "Planning query from prompt and schema." }));

        for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
          const action = await planQueryAction(
            prompt,
            schema,
            observations,
            pageSize,
            activeSchema,
            activeDialect
          );

          if (action.action === "final_sql") {
            const policy = getSQLExecutionPolicy(action.sql);
            if (policy.action === "refuse") {
              controller.enqueue(encodeEvent({ type: "error", error: policy.reason }));
              return;
            }
            controller.enqueue(encodeEvent({ type: "status", message: "Generated SQL." }));
            controller.enqueue(encodeEvent({ type: "final_sql", sql: action.sql, queryType: policy.queryType }));
            return;
          }

          if (action.action === "clarify") {
            controller.enqueue(encodeEvent({ type: "clarify", question: action.question }));
            return;
          }

          if (action.action === "refuse") {
            controller.enqueue(encodeEvent({ type: "error", error: action.reason }));
            return;
          }

          const key = `${action.table}.${action.column}`;
          if (inspected.has(key)) {
            controller.enqueue(encodeEvent({
              type: "error",
              error: `Agent repeated the same inspection for ${key}. Please clarify the request.`,
            }));
            return;
          }
          inspected.add(key);

          controller.enqueue(encodeEvent({
            type: "tool_call",
            tool: "inspect_distinct",
            table: action.table,
            column: action.column,
          }));

          const result = await withClient(
            connectionConfig,
            (client) => inspectDistinctValues(client, schema, action.table, action.column, activeSchema, activeDialect),
            activeSchema
          );

          observations.push(observationForDistinct(action.table, action.column, result.values, result.truncated));
          const summary = result.truncated
            ? `Checked ${action.table}.${action.column}; received ${result.values.length} safe values, truncated.`
            : `Checked ${action.table}.${action.column}; found ${result.values.length} safe values.`;
          controller.enqueue(encodeEvent({ type: "tool_result", tool: "inspect_distinct", summary }));
        }

        controller.enqueue(encodeEvent({
          type: "error",
          error: "Agent reached the planning step limit. Please narrow the request.",
        }));
      } catch (err) {
        controller.enqueue(encodeEvent({
          type: "error",
          error: err instanceof Error ? err.message : "Failed to plan query",
        }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
