import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db/client";
import { analyzeQueryPlan } from "@/lib/ai";
import { ConnectionConfig } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { sql, connectionConfig }: { sql: string; connectionConfig: ConnectionConfig } = await req.json();
    if (!sql || !connectionConfig) {
      return NextResponse.json({ error: "sql and connectionConfig are required" }, { status: 400 });
    }

    const dialect = connectionConfig.dialect ?? "postgresql";
    let explainText = "";

    await withClient(connectionConfig, async (client) => {
      if (dialect === "mysql") {
        // Try MySQL 8.0+ FORMAT=TREE first, fall back to standard EXPLAIN
        try {
          const result = await client.query(`EXPLAIN FORMAT=TREE ${sql}`);
          explainText = result.rows.map((r) => Object.values(r)[0] as string).join("\n");
        } catch {
          const result = await client.query(`EXPLAIN ${sql}`);
          explainText = result.rows.map((r) => JSON.stringify(r)).join("\n");
        }
      } else {
        const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`);
        explainText = result.rows.map((r) => Object.values(r)[0] as string).join("\n");
      }
    });

    const analysis = await analyzeQueryPlan(sql, explainText, dialect);
    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
