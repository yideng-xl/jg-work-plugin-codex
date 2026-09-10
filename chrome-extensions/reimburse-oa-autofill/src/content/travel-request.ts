import type { TravelRequestDetail, TravelRequestSelection } from "../shared/types";

export interface TravelRequestCandidate {
  row: HTMLTableRowElement;
  date: string;
  applicant: string;
  selection: TravelRequestSelection;
}
export type TravelRequestChoice =
  | { status: "selected"; candidate: TravelRequestCandidate }
  | { status: "missing" | "ambiguous" | "applicant-missing" };

function dateKey(value: string): number | undefined {
  const match = value.match(/(\d{4})\s*(?:-|\/|年)\s*(\d{1,2})\s*(?:-|\/|月)\s*(\d{1,2})\s*日?/);
  if (!match) return undefined;
  const key = Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
  return Number.isFinite(key) ? key : undefined;
}

function normalizedName(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

export function chooseNearestPriorCandidate(
  baseDate: string,
  applicant: string,
  candidates: TravelRequestCandidate[],
): TravelRequestChoice {
  const base = dateKey(baseDate);
  if (!base) return { status: "missing" };
  const expectedApplicant = normalizedName(applicant);
  if (!expectedApplicant) return { status: "applicant-missing" };
  const sameApplicant = candidates.filter((candidate) => normalizedName(candidate.applicant) === expectedApplicant);
  if (!sameApplicant.length) return { status: "applicant-missing" };
  const eligible = sameApplicant.map((candidate) => ({ candidate, key: dateKey(candidate.date) }))
    .filter((item): item is { candidate: TravelRequestCandidate; key: number } => item.key !== undefined && item.key < base);
  if (!eligible.length) return { status: "missing" };
  const nearest = Math.max(...eligible.map((item) => item.key));
  const matches = eligible.filter((item) => item.key === nearest);
  return matches.length === 1 ? { status: "selected", candidate: matches[0].candidate } : { status: "ambiguous" };
}

function directCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.querySelectorAll<HTMLTableCellElement>(":scope > th, :scope > td"));
}

function headerLabels(row: HTMLTableRowElement): string[] {
  const table = row.closest("table");
  if (!table) return [];
  // OA 固定表头位于独立 table，限定在同一个表格组件内查找。
  const scope = table.closest(".ant-table") ?? table;
  const rows = Array.from(scope.querySelectorAll<HTMLTableRowElement>("tr"));
  const rowIndex = rows.indexOf(row);
  const candidates = rows.slice(0, Math.max(0, rowIndex)).reverse();
  const header = candidates.find((candidate) => {
    const values = directCells(candidate).map((cell) => cell.textContent?.replace(/\s+/g, "").trim() ?? "");
    return values.some((value) => value.includes("申请日期")) && values.some((value) => value.includes("申请人"));
  });
  return header ? directCells(header).map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "") : [];
}

export function travelRequestCandidateFromRow(row: HTMLTableRowElement): TravelRequestCandidate | undefined {
  const cells = directCells(row);
  const headers = headerLabels(row);
  const details: TravelRequestDetail[] = cells.map((cell, index) => ({
    label: headers[index] || `第 ${index + 1} 列`,
    // 申请人的 stsdata 是链接 HTML；姓名使用已渲染的单元格文本。
    value: cell.textContent?.replace(/\s+/g, " ").trim() || cell.getAttribute("stsdata")?.trim() || "",
  })).filter((item) => item.value);
  const valueFor = (label: string) => details.find((item) => item.label.replace(/\s+/g, "").includes(label))?.value ?? "";
  const text = row.textContent?.trim() ?? "";
  const date = valueFor("申请日期") || text.match(/\d{4}\s*(?:-|\/|年)\s*\d{1,2}\s*(?:-|\/|月)\s*\d{1,2}\s*日?/)?.[0] || "";
  const applicant = valueFor("申请人");
  if (!date) return undefined;
  const code = cells[0]?.getAttribute("stsdata")?.trim() || valueFor("申请记录") || undefined;
  return {
    row,
    date,
    applicant,
    selection: {
      code,
      applicationDate: date.replace(/年|月/g, "-").replace(/日/g, "").replace(/\//g, "-"),
      applicant,
      details,
    },
  };
}

export function isTravelRequestRow(row: HTMLTableRowElement): boolean {
  const requestCode = row.querySelector("td")?.getAttribute("stsdata")?.trim() ?? "";
  const text = row.textContent?.trim() ?? "";
  return /^CCSQ\d+$/i.test(requestCode)
    && /\d{4}\s*(?:-|\/|年)\s*\d{1,2}\s*(?:-|\/|月)\s*\d{1,2}\s*日?/.test(text);
}

function candidateRows(doc: Document): HTMLTableRowElement[] {
  return Array.from(doc.querySelectorAll<HTMLTableRowElement>("tr")).filter((row) => {
    return isTravelRequestRow(row) && row.getClientRects().length > 0;
  });
}

async function waitForRows(doc: Document): Promise<HTMLTableRowElement[]> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = candidateRows(doc);
    if (rows.length) return rows;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("等待出差申请记录候选项超时。");
}

export async function selectTravelRequest(
  doc: Document,
  departureDate: string,
  applicant: string,
): Promise<{
  status: "selected" | "missing" | "ambiguous" | "applicant-missing";
  label?: string;
  applicationDate?: string;
  selection?: TravelRequestSelection;
}> {
  const span = doc.getElementById("field13685span");
  const button = span?.querySelector<HTMLElement>("button");
  if (!button) throw new Error("未找到出差申请记录搜索按钮。");
  button.click();
  const rows = await waitForRows(doc);
  const candidates = rows.flatMap((row) => {
    const candidate = travelRequestCandidateFromRow(row);
    return candidate ? [candidate] : [];
  });
  const choice = chooseNearestPriorCandidate(departureDate, applicant, candidates);
  if (choice.status === "selected") {
    const cell = choice.candidate.row.querySelector<HTMLElement>("td");
    if (!cell) throw new Error("出差申请记录候选行缺少选择单元格。");
    cell.click();
    const deadline = Date.now() + 2000;
    const fallbackAt = Date.now() + 750;
    let doubleClicked = false;
    while (Date.now() < deadline) {
      const field = doc.getElementById("field13685");
      const label = doc.getElementById("field13685span")?.textContent ?? "";
      const selectedCode = choice.candidate.selection.code;
      if (field instanceof HTMLInputElement && field.value
        && selectedCode && label.includes(selectedCode)
        && !choice.candidate.row.getClientRects().length) {
        return {
          status: "selected",
          label: choice.candidate.selection.code,
          applicationDate: choice.candidate.selection.applicationDate,
          selection: choice.candidate.selection,
        };
      }
      // 单击已经关闭弹窗时不再触发选择，避免 OA 重复执行行程联动。
      if (!doubleClicked && Date.now() >= fallbackAt && choice.candidate.row.getClientRects().length) {
        cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: doc.defaultView }));
        doubleClicked = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("出差申请记录点击后未写入 OA。" );
  }
  const cancel = Array.from(doc.querySelectorAll<HTMLElement>("button, a")).filter((item) => item.getClientRects().length > 0)
    .find((item) => item.textContent?.replace(/\s/g, "") === "取消");
  cancel?.click();
  return choice;
}
