import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReimbursementWorkbook } from "../../src/shared/types";
import { fillReimbursementPage } from "../../src/content/oa-adapter";
import { makeOaDocument } from "../fixtures/oa-dom";

const operations: string[] = [];
vi.mock("../../src/content/detail-table", () => ({
  applyTrips: vi.fn(async () => { operations.push("trips"); }),
  applyExpenses: vi.fn(async () => { operations.push("expenses"); }),
  tripRowIndexes: vi.fn(() => new Set()),
  waitForLinkedTripRows: vi.fn(async () => {
    operations.push("wait-linked-trip");
    return new Set(["0"]);
  }),
}));
vi.mock("../../src/content/travel-request", () => ({
  selectTravelRequest: vi.fn(async () => ({ status: "selected", label: "2099-01-09 出差申请" })),
}));

function workbook(kind: "travel" | "general" = "travel"): ReimbursementWorkbook {
  return {
    kind,
    header: {
      kind,
      title: "测试报销",
      applicant: "测试用户",
      fillDate: "2099-01-15",
      area: "测试大区",
      department: "测试部门",
      region: "测试地区",
      reason: "测试出差",
      workDays: 3,
      travelRequest: "",
      expenseTotal: 90,
      taxTotal: 10,
      reimbursementTotal: 100,
    },
    trips: kind === "travel" ? [{
      departureDate: "2099-01-10", departureTime: "08:00", from: "甲地",
      arrivalDate: "2099-01-10", arrivalTime: "10:00", to: "乙地", lodgingDays: 1,
    }] : [],
    expenses: [{ category: "差旅费-交通费", reimbursementAmount: 100, taxAmount: 10, expenseAmount: 90 }],
  };
}

function setTotals(doc: Document): void {
  (doc.getElementById("field9779") as HTMLInputElement).value = "90.00";
  (doc.getElementById("field9780") as HTMLInputElement).value = "10.00";
  (doc.getElementById("field9781") as HTMLInputElement).value = "100.00";
}

describe("fillReimbursementPage", () => {
  beforeEach(() => operations.splice(0));

  it("stops unsupported and kind-mismatched pages before mutation", async () => {
    const unsupported = makeOaDocument({ includeTables: false, requestNumber: "" });
    expect((await fillReimbursementPage(unsupported, workbook(), { trips: "append", expenses: "append" })).ok).toBe(false);

    const generalPage = makeOaDocument({ kind: "general" });
    expect((await fillReimbursementPage(generalPage, workbook("travel"), { trips: "append", expenses: "append" })).ok).toBe(false);
    expect(operations).toEqual([]);
  });

  it("verifies readonly fields, skips blanks, and fills editable values", async () => {
    const doc = makeOaDocument();
    setTotals(doc);
    const data = workbook();
    data.header.title = "Excel 中的业务标题";
    data.header.reason = "Excel 中的另一个报销事由";
    data.header.fillDate = "2099-01-14";
    const result = await fillReimbursementPage(doc, data, { trips: "append", expenses: "append" });

    expect(result.ok).toBe(true);
    expect(result.fields.some((field) => field.field === "title")).toBe(false);
    expect(result.fields).toContainEqual(expect.objectContaining({ field: "travelRequest", status: "filled" }));
    expect(result.fields.some((field) => field.field === "reason")).toBe(false);
    expect(result.fields.some((field) => field.field === "fillDate")).toBe(false);
    expect((doc.getElementById("field10239") as HTMLInputElement).value).toBe("3");
    expect(operations).toEqual(["wait-linked-trip", "trips", "expenses"]);
    expect(result.totals.match).toBe(true);
  });

  it("general reimbursement skips trip operations", async () => {
    const doc = makeOaDocument({ kind: "general" });
    setTotals(doc);
    const data = workbook("general");
    data.header.kind = "general";
    const result = await fillReimbursementPage(doc, data, { trips: "append", expenses: "append" });
    expect(result.ok).toBe(true);
    expect(operations).toEqual(["expenses"]);
  });

  it("stops when a readonly value differs", async () => {
    const data = workbook();
    data.header.applicant = "另一个人";
    const result = await fillReimbursementPage(makeOaDocument(), data, { trips: "append", expenses: "append" });
    expect(result.ok).toBe(false);
    expect(result.fields).toContainEqual(expect.objectContaining({ field: "applicant", status: "error" }));
    expect(operations).toEqual([]);
  });
});
