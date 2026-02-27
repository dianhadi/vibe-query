import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db/client";
import { analyzeQueryPlan } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { sql, connectionConfig } = await req.json();
    if (!sql || !connectionConfig) {
      return NextResponse.json({ error: "sql and connectionConfig are required" }, { status: 400 });
    }

    // Run EXPLAIN ANALYZE and collect the text output
    let explainText: string;
    await withClient(connectionConfig, async (client) => {
      const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`);
      explainText = result.rows.map((r: Record<string, string>) => Object.values(r)[0]).join("\n");
    });

    const analysis = await analyzeQueryPlan(sql, explainText!);
    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
