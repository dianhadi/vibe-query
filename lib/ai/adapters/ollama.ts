import { AIAdapter } from "./types";
import { normalizeAIError } from "../errors";

// Ollama exposes an OpenAI-compatible /v1/chat/completions endpoint
// Uses fetch directly to avoid adding another dependency
export class OllamaAdapter implements AIAdapter {
  private baseURL: string;
  private model: string;

  constructor(model = "llama3.2", baseURL = "http://localhost:11434") {
    this.baseURL = baseURL;
    this.model = model;
  }

  async generateSQL(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const res = await fetch(`${this.baseURL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        const err = Object.assign(new Error(body || res.statusText), { status: res.status });
        throw err;
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("No text response from Ollama");

      return text.trim();
    } catch (err) {
      throw normalizeAIError(err, "Ollama");
    }
  }
}
