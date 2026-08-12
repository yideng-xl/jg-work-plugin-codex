import * as XLSX from "xlsx";
import type {
  ExpenseRow,
  HeaderData,
  ReimbursementKind,
  ReimbursementWorkbook,
  TripRow,
} from "../shared/types";

type Cell = string | number | boolean | Date | null | undefined;
type Matrix = Cell[][];

const TRIP_HEADERS = ["序号", "出发日期", "出发时间", "出发地", "到达日期", "到达时间", "目的地", "住宿天数"];
const TRAVEL_EXPENSE_HEADERS = ["序号", "费用分类", "行程", "报销金额", "增值税专票税额", "费用金额", "费用备注"];
const GENERAL_EXPENSE_HEADERS = ["序号", "费用分类", "费用发生日期", "报销金额", "增值税专票税额", "费用金额", "备注"];

function text(value: Cell): string {
  return value == null ? "" : String(value).trim();
}

function money(value: Cell): number {
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function optionalText(value: Cell): string | undefined {
  const result = text(value);
  return result || undefined;
}

function normalizedDate(value: Cell): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return text(value).replace(/[/.]/g, "-").replace(/^([0-9]{4})-([0-9])-/, "$1-0$2-").replace(/-([0-9])$/, "-0$1");
}

function normalizedTime(value: Cell): string {
  const result = text(value);
  return /^\d:\d{2}$/.test(result) ? `0${result}` : result;
}

function rowMatches(row: Cell[], headers: string[]): boolean {
  return headers.every((header, index) => text(row[index]) === header);
}

function findHeaderRow(rows: Matrix, headers: string[]): number {
  return rows.findIndex((row) => rowMatches(row, headers));
}

function findValue(rows: Matrix, label: string): Cell {
  for (const row of rows) {
    const index = row.findIndex((cell) => text(cell) === label);
    if (index >= 0) return row[index + 1];
  }
  return undefined;
}

function detectKind(sheetName: string, rows: Matrix): ReimbursementKind {
  const signature = `${sheetName} ${rows.slice(0, 2).flat().map(text).join(" ")}`;
  if (signature.includes("差旅报销明细")) return "travel";
  if (signature.includes("报销金额明细")) return "general";
  throw new Error("不支持的报销终稿 Excel 格式");
}

function parseHeader(rows: Matrix, kind: ReimbursementKind): HeaderData {
  return {
    title: optionalText(findValue(rows, "标题")),
    applicant: optionalText(findValue(rows, "申请人")),
    fillDate: optionalText(findValue(rows, "填报日期")),
    area: optionalText(findValue(rows, "费用大区")),
    department: optionalText(findValue(rows, "费用部门")),
    kind,
    region: optionalText(findValue(rows, "费用地区")),
    category: optionalText(findValue(rows, "报销分类")),
    contract: optionalText(findValue(rows, "销售合同")),
    reason: optionalText(findValue(rows, "报销事由")),
    travelDays: kind === "travel" ? money(findValue(rows, "出差天数")) : undefined,
    workDays: kind === "travel" ? money(findValue(rows, "实际工作天数")) : undefined,
    travelRequest: optionalText(findValue(rows, "出差申请记录")),
    paymentDate: optionalText(findValue(rows, "报销付款日期")),
    expenseTotal: money(findValue(rows, "费用合计")),
    taxTotal: money(findValue(rows, "增值税专票税额合计")),
    reimbursementTotal: money(findValue(rows, "报销总金额")),
  };
}

function parseTrips(rows: Matrix): TripRow[] {
  const start = findHeaderRow(rows, TRIP_HEADERS);
  if (start < 0) return [];
  const result: TripRow[] = [];
  for (const row of rows.slice(start + 1)) {
    if (!text(row[0]) || text(row[0]) === "合计" || !/^\d+$/.test(text(row[0]))) break;
    result.push({
      departureDate: normalizedDate(row[1]),
      departureTime: normalizedTime(row[2]),
      from: text(row[3]),
      arrivalDate: normalizedDate(row[4]),
      arrivalTime: normalizedTime(row[5]),
      to: text(row[6]),
      lodgingDays: money(row[7]),
    });
  }
  return result;
}

function parseExpenses(rows: Matrix, kind: ReimbursementKind): ExpenseRow[] {
  const headers = kind === "travel" ? TRAVEL_EXPENSE_HEADERS : GENERAL_EXPENSE_HEADERS;
  const start = findHeaderRow(rows, headers);
  if (start < 0) return [];
  const result: ExpenseRow[] = [];
  for (const row of rows.slice(start + 1)) {
    if (text(row[0]) === "合计") break;
    if (!/^\d+$/.test(text(row[0]))) continue;
    result.push({
      category: text(row[1]),
      ...(kind === "travel" ? { tripRefs: optionalText(row[2]) } : { incurredDate: normalizedDate(row[2]) }),
      reimbursementAmount: money(row[3]),
      taxAmount: money(row[4]),
      expenseAmount: money(row[5]),
      note: optionalText(row[6]),
    });
  }
  return result;
}

export function parseWorkbook(buffer: ArrayBuffer): ReimbursementWorkbook {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel 中没有工作表");
  const rows = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
  });
  const kind = detectKind(sheetName, rows);
  return {
    kind,
    header: parseHeader(rows, kind),
    trips: kind === "travel" ? parseTrips(rows) : [],
    expenses: parseExpenses(rows, kind),
  };
}
