import type {
  FieldResult,
  FillModes,
  FillResult,
  HeaderData,
  ReimbursementWorkbook,
} from "../shared/types";
import { applyExpenses, applyTrips, tripRowIndexes, waitForLinkedTripRows } from "./detail-table";
import { fieldValueMatches, setOaFieldValue } from "./oa-field-api";
import { inspectPage, OA_FIELDS } from "./page-contract";
import { selectTravelRequest } from "./travel-request";

const READONLY_FIELDS: Array<[keyof HeaderData, keyof typeof OA_FIELDS]> = [
  ["applicant", "applicant"],
  ["area", "area"],
  ["department", "department"],
  ["kind", "kind"],
  ["region", "region"],
  ["category", "category"],
  ["contract", "contract"],
];

const EDITABLE_FIELDS: Array<[keyof HeaderData, keyof typeof OA_FIELDS]> = [
  ["travelDays", "travelDays"],
  ["workDays", "workDays"],
  ["paymentDate", "paymentDate"],
];

function displayValue(key: keyof HeaderData, value: HeaderData[keyof HeaderData]): string {
  if (key === "kind") return value === "travel" ? "差旅" : "通用";
  return value === undefined || value === null ? "" : String(value).trim();
}

function fail(fields: FieldResult[], field: string, message: string, excel: number[] = []): FillResult {
  fields.push({ field, status: "error", message });
  return { ok: false, fields, totals: { excel, oa: [], match: false } };
}

function readNumber(doc: Document, id: string): number {
  const element = doc.getElementById(id);
  const raw = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element.value
    : element?.textContent ?? "";
  return Number(raw.replace(/,/g, "").trim());
}

function moneyMatches(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) =>
    Number.isFinite(right[index]) && Math.abs(value - right[index]) <= 0.01,
  );
}

async function waitForTotals(doc: Document): Promise<number[]> {
  const read = () => [
    readNumber(doc, OA_FIELDS.expenseTotal),
    readNumber(doc, OA_FIELDS.taxTotal),
    readNumber(doc, OA_FIELDS.reimbursementTotal),
  ];
  const deadline = Date.now() + 5000;
  let previous = read();
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const current = read();
    if (current.every((value, index) => value === previous[index])) {
      if (Date.now() - stableSince >= 300) return current;
    } else {
      previous = current;
      stableSince = Date.now();
    }
  }
  return previous;
}

export async function fillReimbursementPage(
  doc: Document,
  workbook: ReimbursementWorkbook,
  modes: FillModes,
): Promise<FillResult> {
  const fields: FieldResult[] = [];
  const excelTotals = [workbook.header.expenseTotal, workbook.header.taxTotal, workbook.header.reimbursementTotal];
  const inspection = inspectPage(doc);
  if (!inspection.supported) return fail(fields, "page", inspection.reason ?? "当前页面不支持填写。", excelTotals);
  if (inspection.kind !== workbook.kind) {
    return fail(fields, "kind", "Excel 报销类型与 OA 页面不一致。", excelTotals);
  }

  for (const [headerKey, fieldKey] of READONLY_FIELDS) {
    const expected = displayValue(headerKey, workbook.header[headerKey]);
    if (!expected) {
      fields.push({ field: fieldKey, status: "skipped" });
      continue;
    }
    const actual = inspection.readonlyFields[fieldKey]?.trim() ?? "";
    if (actual !== expected) {
      return fail(fields, fieldKey, `Excel 为‘${expected}’，OA 为‘${actual}’。`, excelTotals);
    }
    fields.push({ field: fieldKey, status: "verified" });
  }

  try {
    if (workbook.kind === "travel") {
      let linkedTripRows = new Set<string>();
      if (workbook.trips[0]?.departureDate) {
        const before = tripRowIndexes(doc);
        const request = await selectTravelRequest(doc, workbook.trips[0].departureDate);
        if (request.status === "selected") {
          linkedTripRows = await waitForLinkedTripRows(doc, before);
          fields.push({
            field: "travelRequest",
            status: "filled",
            message: request.applicationDate,
          });
        } else fields.push({
          field: "travelRequest",
          status: "skipped",
          message: request.status === "ambiguous" ? "最近日期有多条记录，请手动选择。" : "没有找到出发日前的记录，请手动选择。",
        });
      }
      await applyTrips(doc, workbook.trips, modes.trips, linkedTripRows);
      fields.push({ field: "trips", status: modes.trips === "cancel" ? "skipped" : "filled" });
    }
    await applyExpenses(doc, workbook.kind, workbook.expenses, modes.expenses);
    fields.push({ field: "expenses", status: modes.expenses === "cancel" ? "skipped" : "filled" });
  } catch (error) {
    return fail(fields, workbook.kind === "travel" && !fields.some((item) => item.field === "trips") ? "trips" : "expenses",
      error instanceof Error ? error.message : String(error), excelTotals);
  }

  for (const [headerKey, fieldKey] of EDITABLE_FIELDS) {
    const value = displayValue(headerKey, workbook.header[headerKey]);
    if (!value) {
      fields.push({ field: fieldKey, status: "skipped" });
      continue;
    }
    const element = doc.getElementById(OA_FIELDS[fieldKey]);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      return fail(fields, fieldKey, `未找到可填写的 OA 字段 ${OA_FIELDS[fieldKey]}。`, excelTotals);
    }
    if (element instanceof HTMLInputElement && element.type === "hidden") {
      fields.push({ field: fieldKey, status: "skipped", message: "当前 OA 页面不允许编辑该字段。" });
      continue;
    }
    try {
      await setOaFieldValue(doc, OA_FIELDS[fieldKey], value);
      if (!fieldValueMatches(element.value, value)) {
        throw new Error(`OA 字段 ${OA_FIELDS[fieldKey]} 未保留‘${value}’。`);
      }
      fields.push({ field: fieldKey, status: "filled" });
    } catch (error) {
      return fail(fields, fieldKey, error instanceof Error ? error.message : String(error), excelTotals);
    }
  }

  const oaTotals = await waitForTotals(doc);
  const match = moneyMatches(excelTotals, oaTotals);
  if (!match) fields.push({ field: "totals", status: "error", message: "Excel 与 OA 合计不一致。" });
  return { ok: match, fields, totals: { excel: excelTotals, oa: oaTotals, match } };
}
