import { beforeEach, describe, expect, it } from "vitest";
import { applyExpenses, applyTrips, tripRowIndexes, waitForLinkedTripRows } from "../../src/content/detail-table";
import type { ExpenseRow, TripRow } from "../../src/shared/types";

const trip: TripRow = {
  departureDate: "2099-01-10",
  departureTime: "08:00",
  from: "甲地",
  arrivalDate: "2099-01-10",
  arrivalTime: "10:00",
  to: "乙地",
  lodgingDays: 2,
};
const expense: ExpenseRow = {
  category: "差旅费-交通费",
  tripRefs: "12",
  incurredDate: "2099-01-10",
  reimbursementAmount: 400,
  taxAmount: 0,
  expenseAmount: 400,
  note: "测试备注",
};

function tripRow(index: number, existing = ""): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.dataset.rowIndex = String(index);
  row.innerHTML = `<td><input type="checkbox"></td>
    <td><input id="field15376_${index}" type="hidden" value="4"></td>
    <td><div class="field9747_${index}_swapDiv"><button class="picker-icon" data-picker="date" data-field="field9747_${index}"></button><input id="field9747_${index}" type="hidden" value="${existing}"></div></td>
    <td><div class="field9748_${index}_swapDiv"><button class="picker-icon" data-picker="time" data-field="field9748_${index}"></button><input id="field9748_${index}" type="hidden"></div></td>
    <td><input id="field9749_${index}"></td>
    <td><div class="field9750_${index}_swapDiv"><button class="picker-icon" data-picker="date" data-field="field9750_${index}"></button><input id="field9750_${index}" type="hidden"></div></td>
    <td><div class="field9751_${index}_swapDiv"><button class="picker-icon" data-picker="time" data-field="field9751_${index}"></button><input id="field9751_${index}" type="hidden"></div></td>
    <td><input id="field9752_${index}"></td><td><input id="field9753_${index}"></td>`;
  return row;
}

function expenseRow(index: number, existing = ""): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.dataset.rowIndex = String(index);
  row.innerHTML = `<td><input type="checkbox"></td>
    <td><span id="field9758_${index}span"></span><input id="field9758_${index}" type="hidden"><button data-search="field9758_${index}">搜索</button></td>
    <td><input id="field9754_${index}"></td><td><input id="field9755_${index}" value="${existing}"></td>
    <td><input id="field9756_${index}"></td><td><span id="field9757_${index}"></span></td>
    <td><textarea id="field9759_${index}"></textarea></td>`;
  return row;
}

function installTable(id: string, makeRow: (index: number, existing?: string) => HTMLTableRowElement, existing = ""): HTMLTableElement {
  const section = document.createElement("section");
  section.innerHTML = `<button data-action="add">添加</button><button data-action="delete">删除</button><table id="${id}"><tbody></tbody></table>`;
  const table = section.querySelector("table")!;
  table.tBodies[0].append(makeRow(0, existing));
  section.querySelector<HTMLElement>('[data-action="add"]')!.addEventListener("click", () => {
    const indexes = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr[data-row-index]"))
      .map((row) => Number(row.dataset.rowIndex));
    table.tBodies[0].append(makeRow(indexes.length ? Math.max(...indexes) + 1 : 0));
    wireSearchButtons(section);
    wirePickers(section);
  });
  section.querySelector<HTMLElement>('[data-action="delete"]')!.addEventListener("click", () => {
    for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tr[data-row-index]"))) {
      if (row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked) row.remove();
    }
    if (!table.querySelector("tr[data-row-index]")) table.tBodies[0].append(makeRow(0));
    wireSearchButtons(section);
    wirePickers(section);
  });
  document.body.append(section);
  wireSearchButtons(section);
  wirePickers(section);
  return table;
}

function wirePickers(root: ParentNode): void {
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-picker]:not([data-wired])"))) {
    button.dataset.wired = "true";
    button.addEventListener("click", () => {
      const panel = document.createElement("div");
      panel.className = button.dataset.picker === "date" ? "ant-calendar-picker-container" : "ant-time-picker-panel";
      if (button.dataset.picker === "date") {
        panel.innerHTML = '<table><tr><td title="2099-1-10">10</td><td title="2099-1-12">12</td></tr></table>';
        for (const day of Array.from(panel.querySelectorAll<HTMLElement>("td[title]"))) {
          day.addEventListener("click", () => {
            const [year, month, date] = day.getAttribute("title")!.split("-");
            (document.getElementById(button.dataset.field!) as HTMLInputElement).value = `${year}-${month.padStart(2, "0")}-${date.padStart(2, "0")}`;
            panel.remove();
          });
        }
      } else {
        panel.innerHTML = '<div class="ant-time-picker-panel-select"><li>08</li><li>10</li><li>13</li><li>15</li><li>19</li></div><div><span class="wea-time-panel-item">00</span><span class="wea-time-panel-item">12</span><span class="wea-time-panel-item">20</span><span class="wea-time-panel-item">30</span><span class="wea-time-panel-item">55</span></div>';
        let hour = "";
        for (const option of Array.from(panel.querySelectorAll<HTMLElement>("li"))) option.addEventListener("click", () => { hour = option.textContent!.trim(); });
        for (const option of Array.from(panel.querySelectorAll<HTMLElement>(".wea-time-panel-item"))) {
          option.addEventListener("click", () => {
            (document.getElementById(button.dataset.field!) as HTMLInputElement).value = `${hour}:${option.textContent!.trim()}`;
            panel.remove();
          });
        }
      }
      document.body.append(panel);
    });
  }
}

function wireSearchButtons(root: ParentNode): void {
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-search]:not([data-wired])"))) {
    button.dataset.wired = "true";
    button.addEventListener("click", () => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.innerHTML = `<h2>费用分类（${document.body.dataset.kind === "general" ? "通用" : "差旅"}）</h2><table><tr><td>${expense.category}</td></tr></table>`;
      dialog.querySelector("tr")!.addEventListener("click", () => {
        const field = document.getElementById(button.dataset.search!) as HTMLInputElement;
        field.value = expense.category;
        dialog.remove();
      });
      document.body.append(dialog);
    });
  }
}

describe("detail table operations", () => {
  beforeEach(() => document.body.replaceChildren());

  it("cancel leaves trips unchanged", async () => {
    const table = installTable("oTable0", tripRow, "2026-01-01");
    const before = table.innerHTML;
    await applyTrips(document, [trip], "cancel");
    expect(table.innerHTML).toBe(before);
  });

  it("reuses a blank trip row and maps all trip fields", async () => {
    installTable("oTable0", tripRow);
    await applyTrips(document, [trip], "append");
    expect(document.querySelectorAll("#oTable0 tr[data-row-index]")).toHaveLength(1);
    expect((document.querySelector("#field9747_0") as HTMLInputElement).value).toBe("2099-01-10");
    expect((document.querySelector("#field9752_0") as HTMLInputElement).value).toBe("乙地");
    expect((document.querySelector("#field9753_0") as HTMLInputElement).value).toBe("2");
  });

  it("append keeps an existing trip and adds the Excel row", async () => {
    installTable("oTable0", tripRow, "2026-01-01");
    await applyTrips(document, [trip], "append");
    expect(document.querySelectorAll("#oTable0 tr[data-row-index]")).toHaveLength(2);
    expect((document.querySelector("#field9747_0") as HTMLInputElement).value).toBe("2026-01-01");
    expect((document.querySelector("#field9747_1") as HTMLInputElement).value).toBe("2099-01-10");
  });

  it("overwrite deletes existing trips before filling", async () => {
    installTable("oTable0", tripRow, "2026-01-01");
    await applyTrips(document, [trip], "overwrite");
    expect(document.querySelectorAll("#oTable0 tr[data-row-index]")).toHaveLength(1);
    expect((document.querySelector("#field9747_0") as HTMLInputElement).value).toBe("2099-01-10");
  });

  it("waits for a delayed linkage row and reuses it for the first Excel trip", async () => {
    const table = installTable("oTable0", tripRow);
    table.tBodies[0].replaceChildren();
    const before = tripRowIndexes(document);
    setTimeout(() => table.tBodies[0].append(tripRow(0, "2099-01-10")), 30);
    const linked = await waitForLinkedTripRows(document, before);
    await applyTrips(document, [trip, { ...trip, departureDate: "2099-01-12" }], "append", linked);
    expect(document.querySelectorAll("#oTable0 tr[data-row-index]")).toHaveLength(2);
    expect((document.querySelector("#field9747_0") as HTMLInputElement).value).toBe("2099-01-10");
    expect((document.querySelector("#field9747_1") as HTMLInputElement).value).toBe("2099-01-12");
  });

  it("maps travel expense fields and selects the exact category", async () => {
    document.body.dataset.kind = "travel";
    installTable("oTable1", expenseRow);
    await applyExpenses(document, "travel", [expense], "append");
    expect((document.querySelector("#field9758_0") as HTMLInputElement).value).toBe(expense.category);
    expect((document.querySelector("#field9754_0") as HTMLInputElement).value).toBe("12");
    expect((document.querySelector("#field9755_0") as HTMLInputElement).value).toBe("400");
    expect((document.querySelector("#field9756_0") as HTMLInputElement).value).toBe("0");
    expect((document.querySelector("#field9759_0") as HTMLTextAreaElement).value).toBe("测试备注");
  });

  it("maps the general expense date and overwrites existing rows", async () => {
    document.body.dataset.kind = "general";
    installTable("oTable1", expenseRow, "88.00");
    await applyExpenses(document, "general", [expense], "overwrite");
    expect(document.querySelectorAll("#oTable1 tr[data-row-index]")).toHaveLength(1);
    expect((document.querySelector("#field9754_0") as HTMLInputElement).value).toBe("2099-01-10");
    expect((document.querySelector("#field9755_0") as HTMLInputElement).value).toBe("400");
  });
});
