import type { PageInspection, ReimbursementKind } from "../shared/types";

export const OA_FIELDS = {
  title: "requestname",
  requestNumber: "field9766",
  applicant: "field9768",
  fillDate: "field9767",
  area: "field9770",
  department: "field9769",
  kind: "field9772",
  region: "field9771",
  category: "field9773",
  contract: "field10236",
  reason: "field9778",
  travelDays: "field10238",
  workDays: "field10239",
  expenseTotal: "field9779",
  taxTotal: "field9780",
  reimbursementTotal: "field9781",
  travelRequest: "field13685",
  paymentDate: "field9782",
} as const;

export const OA_TABLES = {
  trips: "oTable0",
  expenses: "oTable1",
} as const;

function pageText(doc: Document): string {
  return doc.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function fieldValue(doc: Document, id: string): string {
  const field = doc.getElementById(id);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return field.value.trim();
  }
  return field?.textContent?.trim() ?? "";
}

function valueBesideLabel(doc: Document, label: string): string {
  for (const row of Array.from(doc.querySelectorAll<HTMLTableRowElement>("tr"))) {
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>(":scope > th, :scope > td"));
    const labelIndex = cells.findIndex((cell) => cell.textContent?.trim() === label);
    if (labelIndex >= 0) {
      return cells[labelIndex + 1]?.textContent?.trim() ?? "";
    }
  }
  return "";
}

function tableHasData(table: Element | null): boolean {
  if (!table) return false;

  return Array.from(table.querySelectorAll("tr")).some((row) => {
    if (row.textContent?.includes("合计")) return false;

    return Array.from(row.querySelectorAll("input, textarea, select")).some((control) => {
      if (control instanceof HTMLInputElement) {
        if (["hidden", "button", "submit", "reset", "checkbox", "radio"].includes(control.type)) return false;
        return control.value.trim() !== "";
      }
      if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
        return control.value.trim() !== "";
      }
      return false;
    });
  });
}

function detectKind(doc: Document): ReimbursementKind | undefined {
  const value = valueBesideLabel(doc, "报销类型") || fieldValue(doc, OA_FIELDS.kind);
  if (value.includes("差旅")) return "travel";
  if (value.includes("通用") || value.includes("其他")) return "general";
  return undefined;
}

export function inspectPage(doc: Document): PageInspection {
  const text = pageText(doc);
  const requestNumber = valueBesideLabel(doc, "报销单号");
  const expenseTable = doc.getElementById(OA_TABLES.expenses);
  const tripTable = doc.getElementById(OA_TABLES.trips);
  const supported = text.includes("技术报销")
    && text.includes("报销单号")
    && Boolean(requestNumber)
    && Boolean(doc.getElementById(OA_FIELDS.title) || doc.getElementById(OA_FIELDS.requestNumber))
    && Boolean(expenseTable);

  const labels: Partial<Record<keyof typeof OA_FIELDS, string>> = {
    title: "标题", requestNumber: "报销单号", applicant: "申请人", fillDate: "填报日期",
    area: "费用大区", department: "费用部门", kind: "报销类型", region: "费用地区",
    category: "报销分类", contract: "销售合同", reason: "报销事由", travelDays: "出差天数",
    workDays: "实际工作天数", expenseTotal: "费用合计", taxTotal: "增值税专票税额合计",
    reimbursementTotal: "报销总金额", travelRequest: "出差申请记录", paymentDate: "报销付款日期",
  };
  const readonlyFields = Object.fromEntries(Object.entries(OA_FIELDS).map(([name, id]) => {
    const label = labels[name as keyof typeof OA_FIELDS];
    return [name, label ? valueBesideLabel(doc, label) : fieldValue(doc, id)];
  }));

  if (!supported) {
    return {
      supported: false,
      reason: "请在已生成报销单号的‘处理 - 技术报销’页面运行。",
      readonlyFields,
      tripHasData: false,
      expenseHasData: false,
    };
  }

  const kind = detectKind(doc);
  return {
    supported: Boolean(kind),
    reason: kind ? undefined : "无法识别页面中的报销类型。",
    kind,
    requestNumber,
    readonlyFields,
    tripHasData: tableHasData(tripTable),
    expenseHasData: tableHasData(expenseTable),
  };
}
