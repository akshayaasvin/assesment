import * as XLSX from "xlsx";

export interface ResultExportRow {
  Name: string;
  Email: string;
  Phone: string;
  College: string;
  District: string;
  Department: string;
  Role: string;
  Assessment: string;
  "Started At": string;
  "Submitted At": string;
  Score: number;
  "Total Marks": number;
  "Percentage": number;
  Status: string;
  Violations: number;
}

function sheetFrom(rows: ResultExportRow[]) {
  return XLSX.utils.json_to_sheet(rows);
}

export function downloadResultsCsv(rows: ResultExportRow[], filename = "assessment-results.csv") {
  const sheet = sheetFrom(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadResultsXlsx(rows: ResultExportRow[], filename = "assessment-results.xlsx") {
  const sheet = sheetFrom(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Results");
  XLSX.writeFile(workbook, filename);
}
