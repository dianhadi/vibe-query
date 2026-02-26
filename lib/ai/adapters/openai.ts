import OpenAI from "openai";
import { AIAdapter } from "./types";

// Works for OpenAI and any OpenAI-compatible API (Groq, OpenRouter, LM Studio, etc.)
export class OpenAIAdapter implements AIAdapter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o", baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.model = model;
  }

  async generateSQL(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("No text response from OpenAI");

    return text.trim();
  }
}
