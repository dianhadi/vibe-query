export type AIContextKind =
  | "schema"
  | "schema_profile"
  | "sql"
  | "db_error"
  | "explain"
  | "tool_observation"
  | "raw_rows"
  | "credentials"
  | "file_rows";

export function canSendToAI(kind: AIContextKind): { allowed: true } | { allowed: false; reason: string } {
  switch (kind) {
    case "schema":
    case "schema_profile":
    case "sql":
    case "db_error":
    case "explain":
    case "tool_observation":
      return { allowed: true };
    case "raw_rows":
      return { allowed: false, reason: "Raw query result rows must not be sent to AI." };
    case "credentials":
      return { allowed: false, reason: "Connection credentials must not be sent to AI." };
    case "file_rows":
      return { allowed: false, reason: "Raw imported file rows must not be sent to AI." };
  }
}

export function assertCanSendToAI(kind: AIContextKind): void {
  const decision = canSendToAI(kind);
  if (!decision.allowed) throw new Error(decision.reason);
}
