import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./prompts";
import { Schema } from "@/types";
import { schemaToString } from "@/lib/db/introspect";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateSQL(prompt: string, schema: Schema): Promise<string> {
  const schemaText = schemaToString(schema);
  const systemPrompt = buildSystemPrompt(schemaText);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return textBlock.text.trim();
}
