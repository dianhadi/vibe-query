import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIAdapter } from "./types";

export class GeminiAdapter implements AIAdapter {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model = "gemini-2.0-flash") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async generateSQL(systemPrompt: string, userPrompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    if (!text) throw new Error("No text response from Gemini");

    return text.trim();
  }
}
