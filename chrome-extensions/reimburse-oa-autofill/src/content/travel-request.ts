export interface TravelRequestCandidate { row: HTMLTableRowElement; date: string }
export type TravelRequestChoice =
  | { status: "selected"; candidate: TravelRequestCandidate }
  | { status: "missing" | "ambiguous" };

function dateKey(value: string): number | undefined {
  const match = value.match(/(\d{4})\s*(?:-|\/|年)\s*(\d{1,2})\s*(?:-|\/|月)\s*(\d{1,2})\s*日?/);
  if (!match) return undefined;
  const key = Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
  return Number.isFinite(key) ? key : undefined;
}

export function chooseNearestPriorCandidate(baseDate: string, candidates: TravelRequestCandidate[]): TravelRequestChoice {
  const base = dateKey(baseDate);
  if (!base) return { status: "missing" };
  const eligible = candidates.map((candidate) => ({ candidate, key: dateKey(candidate.date) }))
    .filter((item): item is { candidate: TravelRequestCandidate; key: number } => item.key !== undefined && item.key < base);
  if (!eligible.length) return { status: "missing" };
  const nearest = Math.max(...eligible.map((item) => item.key));
  const matches = eligible.filter((item) => item.key === nearest);
  return matches.length === 1 ? { status: "selected", candidate: matches[0].candidate } : { status: "ambiguous" };
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

export async function selectTravelRequest(doc: Document, departureDate: string): Promise<{ status: "selected" | "missing" | "ambiguous"; label?: string; applicationDate?: string }> {
  const span = doc.getElementById("field13685span");
  const button = span?.querySelector<HTMLElement>("button");
  if (!button) throw new Error("未找到出差申请记录搜索按钮。");
  button.click();
  const rows = await waitForRows(doc);
  const candidates = rows.flatMap((row) => {
    const text = row.textContent?.trim() ?? "";
    const match = text.match(/\d{4}\s*(?:-|\/|年)\s*\d{1,2}\s*(?:-|\/|月)\s*\d{1,2}\s*日?/);
    return match ? [{ row, date: match[0] }] : [];
  });
  const choice = chooseNearestPriorCandidate(departureDate, candidates);
  if (choice.status === "selected") {
    const cell = choice.candidate.row.querySelector<HTMLElement>("td");
    if (!cell) throw new Error("出差申请记录候选行缺少选择单元格。");
    cell.click();
    cell.click();
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: doc.defaultView }));
    const field = doc.getElementById("field13685");
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (field instanceof HTMLInputElement && field.value) {
        return {
          status: "selected",
          label: choice.candidate.row.querySelector("td")?.getAttribute("stsdata")?.trim(),
          applicationDate: choice.candidate.date.replace(/年|月/g, "-").replace(/日/g, "").replace(/\//g, "-"),
        };
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
