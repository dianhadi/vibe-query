import Papa from "papaparse";

export interface ParsedData {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCSV(content: string): ParsedData {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    trimHeaders: true,
  } as Papa.ParseConfig);

  if (result.errors.length > 0) {
    throw new Error(`CSV parse error: ${result.errors[0].message}`);
  }

  const headers = result.meta.fields ?? [];
  return { headers, rows: result.data };
}
