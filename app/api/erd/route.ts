import { NextRequest, NextResponse } from "next/server";
import { generateERD } from "@/lib/ai";
import { Dialect } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { schema, dbSchema, dialect }: { schema: unknown; dbSchema?: string; dialect?: Dialect } = await req.json();
    if (!schema) {
      return NextResponse.json({ error: "schema is required" }, { status: 400 });
    }
    const mermaid = await generateERD(schema as Parameters<typeof generateERD>[0], dbSchema ?? "public", dialect ?? "postgresql");
    return NextResponse.json({ mermaid });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate ERD";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
