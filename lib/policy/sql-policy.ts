import { QueryType } from "@/types";
import { classifyQueryType } from "@/lib/db/execute";

export type SQLPolicyDecision =
  | { action: "allow"; queryType: "SELECT" }
  | { action: "preview_required"; queryType: "INSERT" | "UPDATE" | "DELETE" }
  | { action: "typed_confirm_required"; queryType: "DDL" }
  | { action: "refuse"; reason: string };

function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n\r]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

function leadingKeyword(sql: string): string {
  return stripComments(sql).replace(/^\(+\s*/, "").match(/^[a-zA-Z]+/)?.[0].toUpperCase() ?? "";
}

export function hasMultipleStatements(sql: string): boolean {
  const cleaned = stripComments(sql);
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    const prev = cleaned[i - 1];

    if (char === "'" && !inDoubleQuote && !inBacktick && prev !== "\\") inSingleQuote = !inSingleQuote;
    if (char === "\"" && !inSingleQuote && !inBacktick && prev !== "\\") inDoubleQuote = !inDoubleQuote;
    if (char === "`" && !inSingleQuote && !inDoubleQuote) inBacktick = !inBacktick;

    if (char === ";" && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const rest = cleaned.slice(i + 1).trim();
      if (rest.length > 0) return true;
    }
  }

  return false;
}

export function getSQLExecutionPolicy(sql: string): SQLPolicyDecision {
  if (!sql.trim()) return { action: "refuse", reason: "SQL is required." };
  if (hasMultipleStatements(sql)) {
    return { action: "refuse", reason: "Multiple SQL statements are not allowed. Run one statement at a time." };
  }

  const keyword = leadingKeyword(sql);
  if (!["SELECT", "WITH", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "CREATE", "ALTER", "DROP"].includes(keyword)) {
    return { action: "refuse", reason: `Unsupported SQL statement: ${keyword || "unknown"}.` };
  }

  if (keyword === "WITH") {
    if (/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/i.test(stripComments(sql))) {
      return { action: "refuse", reason: "Mutating statements inside CTEs are not allowed." };
    }
    return { action: "allow", queryType: "SELECT" };
  }

  const queryType = classifyQueryType(sql);
  switch (queryType) {
    case "SELECT":
      return { action: "allow", queryType };
    case "INSERT":
    case "UPDATE":
    case "DELETE":
      return { action: "preview_required", queryType };
    case "DDL":
      return { action: "typed_confirm_required", queryType };
    default: {
      const exhaustive: never = queryType;
      return { action: "refuse", reason: `Unsupported query type: ${exhaustive as QueryType}` };
    }
  }
}

export function canPreviewMutation(sql: string): { allowed: true } | { allowed: false; reason: string } {
  const policy = getSQLExecutionPolicy(sql);
  if (policy.action === "preview_required") return { allowed: true };
  if (policy.action === "typed_confirm_required") {
    return { allowed: false, reason: "DDL statements require explicit confirmation and cannot be previewed." };
  }
  if (policy.action === "allow") {
    return { allowed: false, reason: "SELECT statements do not use mutation preview." };
  }
  return { allowed: false, reason: policy.reason };
}

export function canCommitMutation(sql: string): { allowed: true; queryType: Exclude<QueryType, "SELECT"> } | { allowed: false; reason: string } {
  const policy = getSQLExecutionPolicy(sql);
  if (policy.action === "preview_required" || policy.action === "typed_confirm_required") {
    return { allowed: true, queryType: policy.queryType };
  }
  if (policy.action === "allow") {
    return { allowed: false, reason: "SELECT statements cannot be committed as mutations." };
  }
  return { allowed: false, reason: policy.reason };
}
