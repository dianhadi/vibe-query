export function buildSystemPrompt(schemaText: string, pageSize?: number): string {
  const paginationRule = pageSize
    ? `- For SELECT queries where the user wants all or many rows (no specific count mentioned), always add \`LIMIT ${pageSize}\` at the end`
    : "";

  return `You are a SQL expert assistant for a PostgreSQL database.
The user will describe what they want in natural language.
Your job is to generate a single, correct SQL statement.

Rules:
- Only output valid PostgreSQL SQL
- No markdown, no explanation — just the SQL
- Use the schema provided to reference correct table and column names
- If the user's request is ambiguous, make a reasonable assumption
- For mutating queries, be conservative and precise
${paginationRule}

Current schema:
${schemaText}`;
}
