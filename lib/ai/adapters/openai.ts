import OpenAI from "openai";
import { AIAdapter } from "./types";
import { normalizeAIError } from "../errors";

// Works for OpenAI and any OpenAI-compatible API (Groq, OpenRouter, LM Studio, etc.)
export class OpenAIAdapter implements AIAdapter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o", baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.model = model;
  }

  private usesCompletionTokenParam(): boolean {
    return /^(gpt-5|o\d|o\d-|o\d\b)/i.test(this.model);
  }

  async generateSQL(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const tokenParams = this.usesCompletionTokenParam()
        ? { max_completion_tokens: 2048, reasoning_effort: "minimal" as const }
        : { max_tokens: 2048 };

      const response = await this.client.chat.completions.create({
        model: this.model,
        ...tokenParams,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("No text response from OpenAI");

      return text.trim();
    } catch (err) {
      throw normalizeAIError(err, "OpenAI");
    }
  }
}
