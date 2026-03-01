import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db/client";
import { introspectSchema, listSchemas } from "@/lib/db/introspect";
import { ConnectionConfig } from "@/types";

export async function POST(req: NextRequest) {
  let config: ConnectionConfig;
  try {
    config = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const dialect = config.dialect ?? "postgresql";
    const configWithDialect = { ...config, dialect };
    const { schema, dbSchemas } = await withClient(configWithDialect, async (client) => {
      const schemaName = dialect === "mysql" ? config.database : "public";
      const [schema, dbSchemas] = await Promise.all([
        introspectSchema(client, schemaName, dialect),
        listSchemas(client, dialect),
      ]);
      return { schema, dbSchemas };
    });
    return NextResponse.json({ success: true, schema, dbSchemas });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
