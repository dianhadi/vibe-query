import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db/client";
import { executeSelect, executeSelectPaginated } from "@/lib/db/execute";
import { ConnectionConfig } from "@/types";

export async function POST(req: NextRequest) {
  let body: { sql: string; connectionConfig: ConnectionConfig; page?: number; pageSize?: number; dbSchema?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { sql, connectionConfig, page, pageSize, dbSchema } = body;
  if (!sql || !connectionConfig) {
    return NextResponse.json({ error: "sql and connectionConfig are required" }, { status: 400 });
  }

  try {
    const result =
      page !== undefined && pageSize !== undefined
        ? await withClient(connectionConfig, (client) =>
            executeSelectPaginated(client, sql, page, pageSize), dbSchema
          )
        : await withClient(connectionConfig, (client) => executeSelect(client, sql), dbSchema);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
