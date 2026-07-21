import { NextRequest } from "next/server";
import { repairSQL } from "@/lib/ai";
import { classifyQueryType } from "@/lib/db/execute";
import { AgentStreamEvent, Dialect, QueryType, Schema } from "@/types";

function encodeEvent(event: AgentStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function sameQueryCategory(original: QueryType, repaired: QueryType): boolean {
  return original === repaired;
}

export async function POST(req: NextRequest) {
  let body: {
    originalPrompt?: string;
    failedSql: string;
    errorMessage: string;
    schema: Schema;
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

  const { originalPrompt = "", failedSql, errorMessage, schema, dbSchema, dialect } = body;
  if (!failedSql || !errorMessage || !schema) {
    return new Response(JSON.stringify({ error: "failedSql, errorMessage, and schema are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encodeEvent({ type: "status", message: "Reviewing failed SQL and database error." }));
        controller.enqueue(encodeEvent({ type: "status", message: "Checking the query against the current schema." }));

        const sql = await repairSQL(
          originalPrompt,
          failedSql,
          errorMessage,
          schema,
          dbSchema ?? "public",
          dialect ?? "postgresql"
        );

        const originalType = classifyQueryType(failedSql);
        const repairedType = classifyQueryType(sql);
        if (!sameQueryCategory(originalType, repairedType)) {
          controller.enqueue(encodeEvent({
            type: "error",
            error: `Repair changed query type from ${originalType} to ${repairedType}. Please edit the SQL manually.`,
          }));
          return;
        }

        controller.enqueue(encodeEvent({ type: "status", message: "Generated repaired SQL." }));
        controller.enqueue(encodeEvent({ type: "final_sql", sql, queryType: repairedType }));
      } catch (err) {
        controller.enqueue(encodeEvent({
          type: "error",
          error: err instanceof Error ? err.message : "Failed to repair SQL",
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
