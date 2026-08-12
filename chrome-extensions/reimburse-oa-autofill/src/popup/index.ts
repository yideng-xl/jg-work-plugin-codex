import { parseWorkbook } from "../excel/parse-workbook";
import { validateWorkbook } from "../excel/validate-workbook";
import type { DetailMode, ExtensionMessage, FillResult } from "../shared/types";
import {
  canFill,
  initialPopupState,
  resolvedModes,
  transition,
  type PopupAction,
  type PopupState,
} from "./state";

const SUPPORTED_FILES = new Set([
  "09-终稿-OA差旅报销明细.xlsx",
  "09-终稿-OA报销金额明细.xlsx",
]);

export function completionMessage(kind: "travel" | "general", result: FillResult): string | undefined {
  if (!result.ok) return undefined;
  if (kind === "general") return "OA 已填写完成，请检查后手动提交。插件未保存或提交报销单。";
  const request = result.fields.find((field) => field.field === "travelRequest");
  return request?.status === "filled"
    ? `OA 已填写完成。出差申请记录申请日期：${request.message || "未识别"}，请检查是否正确。插件未保存或提交报销单。`
    : "OA 明细已填写，请手动选择并检查出差申请记录。插件未保存或提交报销单。";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function money(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "--";
}

function modeChoice(table: "trips" | "expenses", selected?: DetailMode): string {
  const labels: Array<[DetailMode, string]> = [["overwrite", "覆盖"], ["append", "只新增"], ["cancel", "取消"]];
  return `<fieldset class="mode" data-table="${table}"><legend>${table === "trips" ? "行程明细已有数据" : "费用明细已有数据"}</legend>
    ${labels.map(([value, label]) => `<label><input type="radio" name="${table}-mode" value="${value}" ${selected === value ? "checked" : ""}>${label}</label>`).join("")}
  </fieldset>`;
}

function resultHtml(result?: FillResult): string {
  if (!result) return "";
  const rows = result.fields.filter((field) => field.status === "error")
    .map((field) => `<li class="error">${escapeHtml(field.field)}: ${escapeHtml(field.message)}</li>`).join("");
  const formatTotals = (values: number[]) => values.map(money).join(" / ");
  const requestDate = result.fields.find((field) => field.field === "travelRequest" && field.status === "filled")?.message;
  return `<section class="result"><h2>填写结果</h2>
    <p class="${result.ok ? "success" : "error"}">${result.ok ? "已填入，请在 OA 中检查。" : "填写未全部完成，请按下方信息检查。"}</p>
    ${rows ? `<ul>${rows}</ul>` : ""}
    ${requestDate ? `<p>出差申请日期：${escapeHtml(requestDate)}</p>` : ""}
    <p>Excel: ${formatTotals(result.totals.excel)}</p><p>OA: ${formatTotals(result.totals.oa)}</p>
  </section>`;
}

export function renderPopup(root: HTMLElement, state: PopupState): void {
  const workbook = state.workbook;
  const issues = state.issues.map((issue) =>
    `<li class="${issue.level}">${escapeHtml(issue.field)}: ${escapeHtml(issue.message)}</li>`,
  ).join("");
  const preview = workbook ? `<section class="card"><h2>文件预览</h2>
    <p class="filename">${escapeHtml(state.fileName)}</p>
    <dl><div><dt>类型</dt><dd>${workbook.kind === "travel" ? "差旅" : "通用"}</dd></div>
      <div><dt>申请人</dt><dd>${escapeHtml(workbook.header.applicant || "未填")}</dd></div>
      <div><dt>明细</dt><dd>行程 ${workbook.trips.length} 行 · 费用 ${workbook.expenses.length} 行</dd></div>
      <div><dt>金额</dt><dd>报销 ${money(workbook.header.reimbursementTotal)} · 税额 ${money(workbook.header.taxTotal)}</dd></div></dl>
    ${issues ? `<ul class="issues">${issues}</ul>` : ""}</section>` : "";
  const choices = workbook && state.page ? `
    ${workbook.kind === "travel" && state.page.tripHasData ? modeChoice("trips", state.modes.trips) : ""}
    ${state.page.expenseHasData ? modeChoice("expenses", state.modes.expenses) : ""}` : "";

  root.innerHTML = `<header><h1>OA 报销自动填写</h1><p>读取已确认的终稿 Excel，填入当前技术报销页。</p></header>
    <label class="file-picker">选择终稿 Excel<input id="workbook-file" type="file" accept=".xlsx"></label>
    ${preview}${state.page && !state.page.supported ? `<p class="error">${escapeHtml(state.page.reason)}</p>` : ""}
    ${choices}${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}${resultHtml(state.result)}
    <p class="safety">插件不上传附件，不会保存或提交报销单。</p>
    <button id="fill-button" class="primary" ${canFill(state) ? "" : "disabled"}>${state.status === "filling" ? "正在填写…" : "填入 OA"}</button>`;
}

async function activeTabMessage(message: ExtensionMessage): Promise<unknown> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("未找到当前 OA 页签。");
  return chrome.tabs.sendMessage(tab.id, message);
}

function boot(root: HTMLElement): void {
  let state = initialPopupState();
  let buffer: ArrayBuffer | undefined;

  const update = (action: PopupAction) => {
    state = transition(state, action);
    draw();
  };
  const draw = () => {
    renderPopup(root, state);
    root.querySelector<HTMLInputElement>("#workbook-file")?.addEventListener("change", async (event) => {
      const file = (event.currentTarget as HTMLInputElement).files?.[0];
      buffer = undefined;
      if (!file) return;
      if (!SUPPORTED_FILES.has(file.name)) {
        update({ type: "FAILED", error: "请选择 09-终稿-OA差旅报销明细.xlsx 或 09-终稿-OA报销金额明细.xlsx。" });
        return;
      }
      try {
        buffer = await file.arrayBuffer();
        const workbook = parseWorkbook(buffer);
        update({ type: "PARSED", fileName: file.name, workbook, issues: validateWorkbook(workbook) });
        const page = await activeTabMessage({ type: "INSPECT_PAGE" });
        update({ type: "PAGE_INSPECTED", page: page as PopupState["page"] & object });
      } catch (error) {
        update({ type: "FAILED", error: error instanceof Error ? error.message : String(error) });
      }
    });
    for (const radio of Array.from(root.querySelectorAll<HTMLInputElement>('.mode input[type="radio"]'))) {
      radio.addEventListener("change", () => update({
        type: "SET_MODE",
        table: radio.name.startsWith("trips") ? "trips" : "expenses",
        mode: radio.value as DetailMode,
      }));
    }
    root.querySelector<HTMLButtonElement>("#fill-button")?.addEventListener("click", async () => {
      if (!state.workbook || !canFill(state)) return;
      const workbook = state.workbook;
      const modes = resolvedModes(state);
      update({ type: "FILLING" });
      try {
        const result = await activeTabMessage({ type: "FILL_PAGE", workbook, modes });
        update({ type: "COMPLETED", result: result as FillResult });
        const message = completionMessage(workbook.kind, result as FillResult);
        if (message) window.alert(message);
      } catch (error) {
        update({ type: "FAILED", error: error instanceof Error ? error.message : String(error) });
      }
    });
  };

  window.addEventListener("pagehide", () => { buffer = undefined; });
  draw();
}

const root = document.getElementById("app");
if (root) boot(root);
document.documentElement.dataset.extensionReady = "true";
