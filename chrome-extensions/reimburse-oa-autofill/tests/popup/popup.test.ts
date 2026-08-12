import { describe, expect, it } from "vitest";
import { completionMessage, renderPopup } from "../../src/popup/index";
import type { PopupState } from "../../src/popup/state";

function state(): PopupState {
  return {
    status: "page-inspected",
    fileName: "09-终稿-OA差旅报销明细.xlsx",
    workbook: {
      kind: "travel",
      header: { kind: "travel", applicant: "测试用户", expenseTotal: 90, taxTotal: 10, reimbursementTotal: 100 },
      trips: [{ departureDate: "", departureTime: "", from: "", arrivalDate: "", arrivalTime: "", to: "", lodgingDays: 0 }],
      expenses: [{ category: "差旅费-交通费", reimbursementAmount: 100, taxAmount: 10, expenseAmount: 90 }],
    },
    issues: [{ level: "warning", field: "出差申请记录", message: "Excel 未提供" }],
    page: {
      supported: true, kind: "travel", requestNumber: "JSBX1", readonlyFields: {},
      tripHasData: true, expenseHasData: true,
    },
    modes: {},
  };
}

describe("renderPopup", () => {
  it("reminds travel users to check the selected request", () => {
    expect(completionMessage("travel", {
      ok: true, fields: [{ field: "travelRequest", status: "filled", message: "2026-07-29" }],
      totals: { excel: [], oa: [], match: true },
    })).toContain("申请日期：2026-07-29");
  });
  it("shows workbook preview and independent existing-data choices", () => {
    const root = document.createElement("main");
    renderPopup(root, state());
    expect(root.textContent).toContain("09-终稿-OA差旅报销明细.xlsx");
    expect(root.textContent).toContain("差旅");
    expect(root.textContent).toContain("测试用户");
    expect(root.textContent).toContain("行程 1 行");
    expect(root.textContent).toContain("费用 1 行");
    expect(root.textContent).toContain("报销 100.00");
    expect(root.querySelectorAll('[data-table="trips"] input[type="radio"]')).toHaveLength(3);
    expect(root.querySelectorAll('[data-table="expenses"] input[type="radio"]')).toHaveLength(3);
    expect((root.querySelector("#fill-button") as HTMLButtonElement).disabled).toBe(true);
    expect(root.textContent).toContain("插件不上传附件，不会保存或提交报销单。");
  });

  it("shows final totals and field errors", () => {
    const root = document.createElement("main");
    const completed = state();
    completed.status = "failed";
    completed.result = {
      ok: false,
      fields: [{ field: "applicant", status: "error", message: "姓名不一致" }],
      totals: { excel: [90, 10, 100], oa: [90, 9, 99], match: false },
    };
    renderPopup(root, completed);
    expect(root.textContent).toContain("姓名不一致");
    expect(root.textContent).toContain("Excel: 90.00 / 10.00 / 100.00");
    expect(root.textContent).toContain("OA: 90.00 / 9.00 / 99.00");
  });

  it("shows the selected travel-request date in the result", () => {
    const root = document.createElement("main");
    const completed = state();
    completed.status = "completed";
    completed.result = {
      ok: true,
      fields: [{ field: "travelRequest", status: "filled", message: "2026-07-29" }],
      totals: { excel: [90, 10, 100], oa: [90, 10, 100], match: true },
    };
    renderPopup(root, completed);
    expect(root.textContent).toContain("出差申请日期：2026-07-29");
  });
});
