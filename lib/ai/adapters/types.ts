export interface AIAdapter {
  generateSQL(systemPrompt: string, userPrompt: string): Promise<string>;
}
