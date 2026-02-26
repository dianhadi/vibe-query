import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db/client";
import { executeSelect } from "@/lib/db/execute";
import { ConnectionConfig } from "@/types";

export async function POST(req: NextRequest) {
  let body: { sql: string; connectionConfig: ConnectionConfig };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { sql, connectionConfig } = body;
  if (!sql || !connectionConfig) {
    return NextResponse.json({ error: "sql and connectionConfig are required" }, { status: 400 });
  }

  try {
    const result = await withClient(connectionConfig, (client) => executeSelect(client, sql));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
