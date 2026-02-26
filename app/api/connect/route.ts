import { NextRequest, NextResponse } from "next/server";
import { createPool } from "@/lib/db/client";
import { introspectSchema, listSchemas } from "@/lib/db/introspect";
import { ConnectionConfig } from "@/types";

export async function POST(req: NextRequest) {
  let config: ConnectionConfig;
  try {
    config = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const pool = createPool(config);
  let client;
  try {
    client = await pool.connect();
    const [schema, dbSchemas] = await Promise.all([
      introspectSchema(client, "public"),
      listSchemas(client),
    ]);
    return NextResponse.json({ success: true, schema, dbSchemas });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  } finally {
    client?.release();
    await pool.end();
  }
}
