import * as XLSX from "xlsx";
import { ParsedData } from "./csv";

export function parseExcel(buffer: Buffer): ParsedData {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  }) as string[][];

  if (!raw || raw.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = raw[0].map((h) => String(h).trim());
  const rows = raw.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = String(row[i] ?? "");
    });
    return obj;
  });

  return { headers, rows };
}
