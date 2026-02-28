import * as XLSX from "xlsx";
import { ParsedData } from "./csv";

export interface SheetData {
  sheetName: string;
  data: ParsedData;
}

function sheetToData(sheet: XLSX.WorkSheet): ParsedData {

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

export function parseExcel(buffer: Buffer): ParsedData {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  return sheetToData(workbook.Sheets[sheetName]);
}

export function parseExcelAllSheets(buffer: Buffer): SheetData[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((sheetName) => ({
    sheetName,
    data: sheetToData(workbook.Sheets[sheetName]),
  }));
}
