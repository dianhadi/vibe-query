export type Dialect = "postgresql" | "mysql";

export function quoteIdent(name: string, d: Dialect): string {
  if (d === "mysql") {
    return "`" + name.replace(/`/g, "``") + "`";
  }
  return '"' + name.replace(/"/g, '""') + '"';
}

export function mapImportType(type: string, d: Dialect): string {
  if (d !== "mysql") return type;
  switch (type.toUpperCase()) {
    case "SERIAL":            return "INT AUTO_INCREMENT";
    case "BIGSERIAL":         return "BIGINT AUTO_INCREMENT";
    case "JSONB":             return "JSON";
    case "TIMESTAMPTZ":       return "TIMESTAMP";
    case "DOUBLE PRECISION":  return "DOUBLE";
    case "UUID":              return "VARCHAR(36)";
    case "BYTEA":             return "BLOB";
    default:                  return type;
  }
}

/** Returns `$1`, `$2`, … for PostgreSQL or `?` for MySQL. */
export function placeholder(_i: number, d: Dialect): string {
  return d === "mysql" ? "?" : `$${_i}`;
}
