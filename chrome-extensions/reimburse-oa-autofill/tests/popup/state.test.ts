import { describe, expect, it } from "vitest";
import { canFill, initialPopupState, transition } from "../../src/popup/state";
import type { PageInspection, ReimbursementWorkbook } from "../../src/shared/types";

const workbook = {
  kind: "travel",
  header: { kind: "travel", expenseTotal: 90, taxTotal: 10, reimbursementTotal: 100 },
  trips: [{}],
  expenses: [{}],
} as ReimbursementWorkbook;
const page: PageInspection = {
  supported: true,
  kind: "travel",
  requestNumber: "JSBX1",
  readonlyFields: {},
  tripHasData: false,
  expenseHasData: false,
};

describe("popup state", () => {
  it("moves through parse, inspection, filling, and completion", () => {
    let state = transition(initialPopupState(), { type: "PARSED", fileName: "09-终稿-OA差旅报销明细.xlsx", workbook, issues: [] });
    state = transition(state, { type: "PAGE_INSPECTED", page });
    expect(canFill(state)).toBe(true);
    state = transition(state, { type: "FILLING" });
    expect(state.status).toBe("filling");
    state = transition(state, { type: "COMPLETED", result: { ok: true, fields: [], totals: { excel: [], oa: [], match: true } } });
    expect(state.status).toBe("completed");
  });

  it("requires choices independently only for tables with existing data", () => {
    let state = transition(initialPopupState(), { type: "PARSED", fileName: "x.xlsx", workbook, issues: [] });
    state = transition(state, { type: "PAGE_INSPECTED", page: { ...page, tripHasData: true } });
    expect(canFill(state)).toBe(false);
    state = transition(state, { type: "SET_MODE", table: "trips", mode: "append" });
    expect(canFill(state)).toBe(true);
  });

  it("disables fill for validation errors or unsupported pages", () => {
    let state = transition(initialPopupState(), {
      type: "PARSED", fileName: "x.xlsx", workbook,
      issues: [{ level: "error", field: "金额", message: "错误" }],
    });
    state = transition(state, { type: "PAGE_INSPECTED", page });
    expect(canFill(state)).toBe(false);
    state = transition(state, { type: "PARSED", fileName: "x.xlsx", workbook, issues: [] });
    state = transition(state, { type: "PAGE_INSPECTED", page: { ...page, supported: false } });
    expect(canFill(state)).toBe(false);
  });
});
