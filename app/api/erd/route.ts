import { NextRequest, NextResponse } from "next/server";
import { generateERD } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { schema, dbSchema } = await req.json();
    if (!schema) {
      return NextResponse.json({ error: "schema is required" }, { status: 400 });
    }
    const mermaid = await generateERD(schema, dbSchema ?? "public");
    return NextResponse.json({ mermaid });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate ERD";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
