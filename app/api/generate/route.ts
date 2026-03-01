import { NextRequest, NextResponse } from "next/server";
import { generateSQL } from "@/lib/ai";
import { classifyQueryType } from "@/lib/db/execute";
import { Schema, Dialect } from "@/types";

export async function POST(req: NextRequest) {
  let body: { prompt: string; schema: Schema; pageSize?: number; dbSchema?: string; dialect?: Dialect };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompt, schema, pageSize, dbSchema, dialect } = body;
  if (!prompt || !schema) {
    return NextResponse.json({ error: "prompt and schema are required" }, { status: 400 });
  }

  try {
    const sql = await generateSQL(prompt, schema, pageSize, dbSchema ?? "public", dialect ?? "postgresql");
    const queryType = classifyQueryType(sql);
    return NextResponse.json({ sql, queryType });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
