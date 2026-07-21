import { NextRequest, NextResponse } from "next/server";
import { generateDataQualityPlan } from "@/lib/ai";
import { Dialect, Schema } from "@/types";

export async function POST(req: NextRequest) {
  let body: { schema: Schema; dbSchema?: string; dialect?: Dialect };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { schema, dbSchema, dialect } = body;
  if (!schema) {
    return NextResponse.json({ error: "schema is required" }, { status: 400 });
  }

  try {
    const plan = await generateDataQualityPlan(schema, dbSchema ?? "public", dialect ?? "postgresql");
    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate data quality checks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
