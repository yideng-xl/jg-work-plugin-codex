import type { TravelRequestSelection } from "../shared/types";

export function readPlannedTrips(doc: Document): NonNullable<TravelRequestSelection["plannedTrips"]> {
  const table = doc.getElementById("oTable1");
  if (!table) return [];
  const rows = Array.from(table.querySelectorAll("tr"));
  const cells = (row: Element) => Array.from(row.querySelectorAll(":scope > th, :scope > td"));
  const labels = ["出发日期", "出发地", "回程日期", "目的地", "事由"];
  const head = rows.findIndex(row => labels.every(label => cells(row).some(c => c.textContent?.trim() === label)));
  if (head < 0) return [];
  const indexes = labels.map(label => cells(rows[head]).findIndex(c => c.textContent?.trim() === label));
  return rows.slice(head + 1).flatMap(row => {
    const cols = cells(row);
    const values = indexes.map(i => cols[i]?.textContent?.replace(/\s+/g, " ").trim() || "");
    if (!values.some(Boolean)) return [];
    return [{ departureDate: values[0], from: values[1], returnDate: values[2], to: values[3], reason: values[4] }];
  });
}

export async function loadSelectedTravelPlan(doc: Document, request: TravelRequestSelection): Promise<void> {
  const id = (doc.getElementById("field13685") as HTMLInputElement | null)?.value;
  if (!id || !/^\d+$/.test(id) || !request.code) return;
  const frame = doc.createElement("iframe");
  frame.hidden = true;
  frame.title = "所选出差申请计划行程";
  frame.src = `${doc.location.origin}/spa/cube/index.html#/main/cube/card?type=0&modeId=131&formId=-351&billid=${encodeURIComponent(id)}`;
  doc.body.append(frame);
  try {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const detail = frame.contentDocument;
      if (detail?.body?.textContent?.includes(request.code)) {
        const trips = readPlannedTrips(detail);
        if (trips.length) { request.plannedTrips = trips; return; }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally { frame.remove(); }
}
