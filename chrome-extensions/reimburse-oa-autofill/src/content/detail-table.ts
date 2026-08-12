import type { DetailMode, ExpenseRow, ReimbursementKind, TripRow } from "../shared/types";
import { fieldValueMatches, setOaFieldValue } from "./oa-field-api";
import { OA_TABLES } from "./page-contract";
import { selectExactDialogValue } from "./search-dialog";

function dataRows(table: Element): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tr")).filter((row) =>
    Boolean(row.querySelector('input[id^="field"], textarea[id^="field"]')),
  );
}

function rowHasData(row: HTMLTableRowElement): boolean {
  return Array.from(row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
    .some((control) => {
      if (!control.value.trim()) return false;
      if (control.type === "hidden") return /^field(?:9747|9748|9750|9751|9758)_\d+$/.test(control.id);
      return !["checkbox", "radio", "button"].includes(control.type);
    });
}

function findAction(table: Element, label: string): HTMLElement {
  let scope: Element | null = table.parentElement;
  while (scope) {
    const action = Array.from(scope.querySelectorAll<HTMLElement>("button, a, [role='button'], img, [title]"))
      .find((element) => element.textContent?.trim() === label
        || element.getAttribute("title")?.trim() === label
        || element.getAttribute("aria-label")?.trim() === label
        || element.getAttribute("alt")?.trim() === label);
    if (action) return action;
    scope = scope.parentElement;
  }
  throw new Error(`未找到明细表的‘${label}’控件。`);
}

async function waitForRowCount(table: Element, previous: number, shouldIncrease: boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const current = dataRows(table).length;
    if (shouldIncrease ? current > previous : current < previous || (previous > 0 && current === 1 && !rowHasData(dataRows(table)[0]))) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("等待 OA 明细行变化超时。");
}

async function clearRows(table: Element): Promise<void> {
  const rows = dataRows(table);
  if (!rows.some(rowHasData)) return;
  for (const row of rows) {
    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (checkbox) checkbox.click();
  }
  const before = rows.length;
  findAction(table, "删除").click();
  await waitForRowCount(table, before, false);
}

async function acquireRows(
  table: Element,
  count: number,
  reusableIndexes: Set<string> = new Set(),
): Promise<HTMLTableRowElement[]> {
  const result = dataRows(table)
    .filter((row) => reusableIndexes.has(rowIndex(row)))
    .slice(0, count);
  const initialBlank = dataRows(table).find((row) => !rowHasData(row));
  if (initialBlank && !result.includes(initialBlank) && !dataRows(table).some(rowHasData) && count > 0) {
    result.push(initialBlank);
  }

  while (result.length < count) {
    const before = dataRows(table).length;
    findAction(table, "添加").click();
    await waitForRowCount(table, before, true);
    const rows = dataRows(table);
    const added = rows.find((row) => !result.includes(row) && !rowHasData(row));
    if (!added) throw new Error("OA 添加明细行后未找到新行。");
    result.push(added);
  }
  return result;
}

function rowIndex(row: HTMLTableRowElement): string {
  const index = Array.from(row.querySelectorAll<HTMLElement>('[id^="field"][id*="_"]'))
    .map((field) => field.id.match(/_(\d+)$/)?.[1])
    .find((value): value is string => value !== undefined);
  if (!index) throw new Error("OA 明细行缺少稳定行号。");
  return index;
}

export function tripRowIndexes(doc: Document): Set<string> {
  const table = doc.getElementById(OA_TABLES.trips);
  if (!table) return new Set();
  return new Set(dataRows(table).filter(rowHasData).map(rowIndex));
}

export async function waitForLinkedTripRows(doc: Document, before: Set<string>): Promise<Set<string>> {
  const table = doc.getElementById(OA_TABLES.trips);
  if (!table) throw new Error("当前 OA 页面没有行程明细表。");
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const indexes = dataRows(table)
      .filter((row) => rowHasData(row) && !before.has(rowIndex(row)))
      .map(rowIndex);
    if (indexes.length) return new Set(indexes);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("选择出差申请后未生成行程明细。");
}

async function setField(doc: Document, id: string, value: string): Promise<void> {
  await setOaFieldValue(doc, id, value);
}

function verifyField(doc: Document, id: string, value: string): void {
  const field = doc.getElementById(id);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
    || !fieldValueMatches(field.value, value)) {
    throw new Error(`OA 字段 ${id} 未保留‘${value}’。`);
  }
}

async function waitForVisiblePanel(doc: Document, panelSelector: string): Promise<HTMLElement> {
  const find = () => Array.from(doc.querySelectorAll<HTMLElement>(panelSelector))
    .filter((panel) => !panel.hasAttribute("hidden") && panel.getAttribute("aria-hidden") !== "true")
    .at(-1);
  const current = find();
  if (current) return current;
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const panel = find();
      if (!panel) return;
      clearTimeout(timeout);
      observer.disconnect();
      resolve(panel);
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error("OA 日期或时间选择器未打开。"));
    }, 5000);
    observer.observe(doc.body, { childList: true, subtree: true });
  });
}

async function selectPickerValue(doc: Document, fieldId: string, kind: "date" | "time", value: string): Promise<void> {
  const deadline = Date.now() + 2000;
  let field: HTMLInputElement | null = null;
  let openButton: HTMLElement | null = null;
  while (Date.now() < deadline) {
    const candidate = doc.getElementById(fieldId);
    if (candidate?.tagName === "INPUT") {
      field = candidate as HTMLInputElement;
      openButton = field.parentElement?.querySelector<HTMLElement>(".picker-icon") ?? null;
      if (openButton) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!field || !openButton) throw new Error(`未找到 OA 选择器 ${fieldId}。`);
  openButton.click();
  const panel = await waitForVisiblePanel(doc, kind === "date" ? ".ant-calendar-picker-container" : ".ant-time-picker-panel");
  if (kind === "date") {
    const [year, month, date] = value.split("-");
    const title = `${Number(year)}-${Number(month)}-${Number(date)}`;
    const day = Array.from(panel.querySelectorAll<HTMLElement>("td[title]"))
      .find((cell) => cell.getAttribute("title") === title);
    if (!day) throw new Error(`OA 日历中未找到‘${value}’。`);
    day.click();
  } else {
    const [hour, minute] = value.split(":");
    const hourOption = Array.from(panel.querySelectorAll<HTMLElement>(".ant-time-picker-panel-select li"))
      .find((option) => option.textContent?.trim() === hour);
    const minuteOption = Array.from(panel.querySelectorAll<HTMLElement>(".wea-time-panel-item"))
      .find((option) => option.textContent?.trim() === minute);
    if (!hourOption || !minuteOption) throw new Error(`OA 时间选择器中未找到‘${value}’。`);
    hourOption.click();
    minuteOption.click();
  }

  const valueDeadline = Date.now() + 2000;
  while (Date.now() < valueDeadline) {
    if (field.value === value) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`OA 选择器 ${fieldId} 未写入‘${value}’。`);
}

async function prepare(
  table: Element,
  count: number,
  mode: DetailMode,
  reusableIndexes: Set<string> = new Set(),
): Promise<HTMLTableRowElement[]> {
  if (mode === "cancel" || count === 0) return [];
  if (mode === "overwrite") await clearRows(table);
  return acquireRows(table, count, reusableIndexes);
}

export async function applyTrips(
  doc: Document,
  rows: TripRow[],
  mode: DetailMode,
  reusableIndexes: Set<string> = new Set(),
): Promise<void> {
  if (mode === "cancel" || rows.length === 0) return;
  const table = doc.getElementById(OA_TABLES.trips);
  if (!table) throw new Error("当前 OA 页面没有行程明细表。");
  const targetRows = await prepare(table, rows.length, mode, reusableIndexes);

  const indexes = targetRows.map(rowIndex);
  for (const [position, trip] of rows.entries()) {
    const index = indexes[position];
    await selectPickerValue(doc, `field9747_${index}`, "date", trip.departureDate);
    await selectPickerValue(doc, `field9748_${index}`, "time", trip.departureTime);
    await selectPickerValue(doc, `field9750_${index}`, "date", trip.arrivalDate);
    await selectPickerValue(doc, `field9751_${index}`, "time", trip.arrivalTime);
  }
  for (const [position, trip] of rows.entries()) {
    const index = indexes[position];
    await setField(doc, `field9749_${index}`, trip.from);
    await setField(doc, `field9752_${index}`, trip.to);
    await setField(doc, `field9753_${index}`, String(trip.lodgingDays));
  }
  for (const [position, trip] of rows.entries()) {
    const index = indexes[position];
    verifyField(doc, `field9749_${index}`, trip.from);
    verifyField(doc, `field9752_${index}`, trip.to);
    verifyField(doc, `field9753_${index}`, String(trip.lodgingDays));
  }
}

export async function applyExpenses(
  doc: Document,
  kind: ReimbursementKind,
  rows: ExpenseRow[],
  mode: DetailMode,
): Promise<void> {
  if (mode === "cancel" || rows.length === 0) return;
  const table = doc.getElementById(OA_TABLES.expenses);
  if (!table) throw new Error("当前 OA 页面没有报销费用明细表。");
  const targetRows = await prepare(table, rows.length, mode);

  const indexes = targetRows.map(rowIndex);
  for (const [position, expense] of rows.entries()) {
    const targetRow = targetRows[position];
    const index = indexes[position];
    const categoryField = doc.getElementById(`field9758_${index}`);
    const openButton = categoryField?.parentElement?.querySelector<HTMLElement>("button, a, [role='button'], img");
    if (!openButton) throw new Error(`费用分类第 ${position + 1} 行没有搜索按钮。`);
    await selectExactDialogValue(openButton, kind === "travel" ? "费用分类（差旅）" : "费用分类（通用）", expense.category);
  }
  for (const [position, expense] of rows.entries()) {
    const index = indexes[position];
    await setField(doc, `field9754_${index}`, kind === "travel" ? expense.tripRefs ?? "" : expense.incurredDate ?? "");
    await setField(doc, `field9755_${index}`, String(expense.reimbursementAmount));
    await setField(doc, `field9756_${index}`, String(expense.taxAmount));
    if (expense.note !== undefined) await setField(doc, `field9759_${index}`, expense.note);
  }
  for (const [position, expense] of rows.entries()) {
    const index = indexes[position];
    verifyField(doc, `field9754_${index}`, kind === "travel" ? expense.tripRefs ?? "" : expense.incurredDate ?? "");
    verifyField(doc, `field9755_${index}`, String(expense.reimbursementAmount));
    verifyField(doc, `field9756_${index}`, String(expense.taxAmount));
    if (expense.note !== undefined) verifyField(doc, `field9759_${index}`, expense.note);
  }
}
