import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db/client";
import { classifyQueryType, executeMutation, executeMutationPreview } from "@/lib/db/execute";
import { ConnectionConfig } from "@/types";

export async function POST(req: NextRequest) {
  let body: { sql: string; connectionConfig: ConnectionConfig; confirmed: boolean; dbSchema?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { sql, connectionConfig, confirmed, dbSchema } = body;
  if (!sql || !connectionConfig) {
    return NextResponse.json({ error: "sql and connectionConfig are required" }, { status: 400 });
  }

  try {
    const queryType = classifyQueryType(sql);
    if (!confirmed && queryType === "DDL") {
      return NextResponse.json({ error: "DDL statements require explicit confirmation and cannot be previewed." }, { status: 400 });
    }

    if (!confirmed) {
      const preview = await withClient(connectionConfig, (client) =>
        executeMutationPreview(client, sql), dbSchema
      );
      return NextResponse.json({ preview });
    } else {
      const result = await withClient(connectionConfig, (client) =>
        executeMutation(client, sql), dbSchema
      );
      return NextResponse.json({ result });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
