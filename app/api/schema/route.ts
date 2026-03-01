import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db/client";
import { introspectSchema } from "@/lib/db/introspect";
import { ConnectionConfig } from "@/types";

export async function POST(req: NextRequest) {
  let body: { connectionConfig: ConnectionConfig; schemaName: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { connectionConfig, schemaName } = body;
  if (!connectionConfig || !schemaName) {
    return NextResponse.json({ error: "connectionConfig and schemaName are required" }, { status: 400 });
  }

  try {
    const dialect = connectionConfig.dialect ?? "postgresql";
    const schema = await withClient(connectionConfig, (client) =>
      introspectSchema(client, schemaName, dialect)
    );
    return NextResponse.json({ schema });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
